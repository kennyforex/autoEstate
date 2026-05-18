import { BaseTool } from './base.js';
import { Channel, Contact, Conversation } from '../../models/index.js';
import { messageService } from '../../services/message.service.js';
import {
  detectCountryFromPhone,
  isValidInternationalPhoneDigits,
  recipientJidForEvolutionSend,
} from '../../utils/helpers.js';
import { phonesLikelyMatch } from '../../utils/phoneMatch.js';
import type { AgentContext, ToolResult } from '../types.js';

function isSendToolEnabled(): boolean {
  const v = process.env.WHATSAPP_SEND_TOOL_ENABLED?.trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

function maskRecipient(recipient: string): string {
  const digits = recipient.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `***${digits.slice(-4)}`;
}

function buildContactFieldsFromRecipient(recipient: string): {
  phoneNumber?: string;
  whatsappId?: string;
  name: string;
  country?: string;
} {
  const trimmed = recipient.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (trimmed.includes('@lid')) {
    const wid = digits || trimmed.split('@')[0];
    return { whatsappId: wid, name: wid || trimmed };
  }

  if (digits && isValidInternationalPhoneDigits(digits)) {
    return {
      phoneNumber: digits,
      name: digits,
      country: detectCountryFromPhone(digits),
    };
  }

  if (digits.length >= 13) {
    return { whatsappId: digits, name: digits };
  }

  return {
    phoneNumber: digits || trimmed,
    name: digits || trimmed,
    country: digits ? detectCountryFromPhone(digits) : undefined,
  };
}

async function resolveOrCreateContact(
  channelId: string,
  recipient: string,
): Promise<{ _id: { toString(): string }; phoneNumber?: string; whatsappId?: string }> {
  const contacts = await Contact.find({ channelId }).lean();
  const existing = contacts.find(
    (c) =>
      phonesLikelyMatch(recipient, c.phoneNumber) ||
      phonesLikelyMatch(recipient, c.whatsappId),
  );
  if (existing) return existing;

  const fields = buildContactFieldsFromRecipient(recipient);
  const contact = await Contact.create({
    channelId,
    name: fields.name,
    phoneNumber: fields.phoneNumber,
    whatsappId: fields.whatsappId,
    country: fields.country,
  });
  return contact;
}

async function resolveOrCreateConversation(
  contactId: string,
  channelId: string,
): Promise<{ _id: { toString(): string } }> {
  let conversation = await Conversation.findOne({ contactId, channelId });
  if (!conversation) {
    conversation = await Conversation.create({
      contactId,
      channelId,
      status: 'open',
      aiAutoReply: true,
      aiHandling: false,
      needsAttention: false,
      isArchived: false,
      aiSignals: { slaRisk: false, priority: 0, sentiment: 'neutral' },
    });
  }
  return conversation;
}

export class SendWhatsAppTool extends BaseTool {
  readonly name = 'send_whatsapp';
  readonly description =
    'Send a WhatsApp text or image message to a phone number or WhatsApp ID on the current channel. ' +
    'Use when a skill must proactively message someone (e.g. payment chase to a sheet phone, notify staff). ' +
    'Recipient must include country code for phone numbers. Requires skill permission in required_tools.';
  readonly parameters = {
    type: 'object',
    properties: {
      recipient: {
        type: 'string',
        description:
          'E.164 phone digits (with country code), or WhatsApp LID / digits@lid.',
      },
      message_type: {
        type: 'string',
        enum: ['text', 'image'],
        description: 'text (default) or image.',
      },
      text: {
        type: 'string',
        description: 'Message body for text, or optional caption for image.',
      },
      image_url: {
        type: 'string',
        description:
          'Public HTTPS URL or data:image/...;base64,... — required when message_type is image.',
      },
    },
    required: ['recipient'],
  };

  async execute(
    args: Record<string, unknown>,
    context: AgentContext,
    _signal?: AbortSignal,
  ): Promise<ToolResult> {
    const recipient = String(args.recipient ?? '').trim();
    const messageType = (args.message_type as string) || 'text';
    const text = args.text != null ? String(args.text) : '';
    const imageUrl = args.image_url != null ? String(args.image_url).trim() : '';

    if (!recipient) {
      return { success: false, data: null, summary: 'recipient is required.' };
    }

    if (messageType !== 'text' && messageType !== 'image') {
      return {
        success: false,
        data: null,
        summary: 'message_type must be "text" or "image".',
      };
    }

    if (messageType === 'image' && !imageUrl) {
      return {
        success: false,
        data: null,
        summary: 'image_url is required when message_type is image.',
      };
    }

    if (messageType === 'text' && !text.trim()) {
      return {
        success: false,
        data: null,
        summary: 'text is required when message_type is text.',
      };
    }

    if (context.source === 'playground') {
      return {
        success: true,
        data: {
          simulated: true,
          recipient: maskRecipient(recipient),
          message_type: messageType,
        },
        summary:
          `[Playground] Simulated WhatsApp ${messageType} to ${maskRecipient(recipient)} — no message sent.`,
      };
    }

    if (!isSendToolEnabled()) {
      return {
        success: false,
        data: null,
        summary:
          'send_whatsapp is disabled (WHATSAPP_SEND_TOOL_ENABLED=false on the server).',
      };
    }

    const channelId = context.channelId;
    if (!channelId || channelId === 'playground') {
      return {
        success: false,
        data: null,
        summary: 'No WhatsApp channel on this conversation.',
      };
    }

    try {
      const channel = await Channel.findById(channelId);
      if (!channel?.evolutionInstanceName) {
        return {
          success: false,
          data: null,
          summary: 'Channel not found or WhatsApp instance is not configured.',
        };
      }

      const contact = await resolveOrCreateContact(channelId, recipient);
      const recipientId =
        recipientJidForEvolutionSend(contact) ?? recipient.trim();

      const contentType = messageType === 'image' ? 'image' : 'text';
      const content =
        messageType === 'image'
          ? text.trim() || '[Image]'
          : text.trim();

      console.log(
        `[send_whatsapp] assistant=${context.assistantId} skill=${context.activeSkillSlug ?? 'none'} ` +
          `conversation=${context.conversationId} type=${messageType} to=${maskRecipient(recipient)}`,
      );

      const evolutionMessageId = await messageService.sendViaWhatsApp(
        channel.evolutionInstanceName,
        recipientId,
        content,
        contentType,
        messageType === 'image' ? imageUrl : undefined,
        messageType === 'image' ? 'image.png' : undefined,
      );

      const conversation = await resolveOrCreateConversation(
        contact._id.toString(),
        channelId,
      );

      const saved = await messageService.create({
        conversationId: conversation._id.toString(),
        channelId: channel._id.toString(),
        sender: 'ai',
        content,
        contentType: contentType === 'image' ? 'image' : 'text',
        mediaUrl: messageType === 'image' ? imageUrl : undefined,
        evolutionMessageId: evolutionMessageId || undefined,
        aiGenerated: true,
      });

      return {
        success: true,
        data: {
          evolutionMessageId,
          conversationId: conversation._id.toString(),
          contactId: contact._id.toString(),
          messageId: saved._id.toString(),
        },
        summary: `WhatsApp ${messageType} sent to ${maskRecipient(recipient)}.`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        data: null,
        summary: `Failed to send WhatsApp message: ${msg}`,
      };
    }
  }
}
