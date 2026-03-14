import { Server } from "socket.io";
import { channelService } from "./channel.service.js";
import { messageService } from "./message.service.js";
import { profilePictureService } from "./profilePicture.service.js";
import { Contact, Conversation } from "../models/index.js";
import { extractPhoneFromJid, extractIdFromJid, parseMessageContent, detectCountryFromPhone } from "../utils/helpers.js";
import type {
  EvolutionWebhookPayload,
  EvolutionMessageData,
  EvolutionConnectionData,
  ServerToClientEvents,
  ClientToServerEvents,
} from "../types/index.js";

class WebhookService {
  private io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;
  private aiReplyHandler:
    | ((conversationId: string, message: any) => Promise<void>)
    | null = null;

  setIO(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.io = io;
    messageService.setIO(io);
  }

  setAIReplyHandler(
    handler: (conversationId: string, message: any) => Promise<void>,
  ): void {
    this.aiReplyHandler = handler;
  }

  /**
   * Process incoming webhook from Evolution API
   */
  async processWebhook(
    instanceName: string,
    payload: EvolutionWebhookPayload,
  ): Promise<void> {
    console.log(
      `Webhook received for instance ${instanceName}:`,
      payload.event,
    );

    // Log full payload for debugging
    // if (payload.event === "messages.upsert" || payload.event === "MESSAGES_UPSERT") {
    //   console.log("[Evolution Full Payload]", JSON.stringify(payload, null, 2));
    // }

    switch (payload.event) {
      case "MESSAGES_UPSERT":
      case "messages.upsert":
        await this.handleMessageUpsert(
          instanceName,
          payload.data as EvolutionMessageData,
        );
        break;

      case "CONNECTION_UPDATE":
      case "connection.update":
        await this.handleConnectionUpdate(
          instanceName,
          payload.data as EvolutionConnectionData,
        );
        break;

      case "QRCODE_UPDATED":
      case "qrcode.updated":
        await this.handleQRCodeUpdate(
          instanceName,
          payload.data as { base64?: string; code?: string },
        );
        break;

      default:
        console.log(`Unhandled webhook event: ${payload.event}`);
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessageUpsert(
    instanceName: string,
    data: EvolutionMessageData,
  ): Promise<void> {
    // Skip messages from self
    if (data.key?.fromMe) {
      return;
    }

    const channel = await channelService.findByInstanceName(instanceName);
    if (!channel) {
      console.error(`Channel not found for instance: ${instanceName}`);
      return;
    }

    // Log the raw data for debugging
    console.log(`[Webhook Debug] Raw remoteJid: ${data.key.remoteJid}`);
    console.log(`[Webhook Debug] senderPn: ${data.key.senderPn || 'not provided'}`);
    console.log(`[Webhook Debug] Push name: ${data.pushName}`);

    // Extract ID from remoteJid (this is the WhatsApp identifier for the conversation)
    const { type: remoteIdType, value: remoteIdValue } = extractIdFromJid(data.key.remoteJid);
    
    // Extract real phone number from senderPn if available (Android users)
    // senderPn is inside data.key, not directly on data
    let realPhoneNumber: string | undefined;
    if (data.key.senderPn) {
      const { type: senderType, value: senderValue } = extractIdFromJid(data.key.senderPn);
      if (senderType === "phone") {
        realPhoneNumber = senderValue;
      }
    }

    console.log(`[Webhook Debug] Remote ID type: ${remoteIdType}, value: ${remoteIdValue}`);
    console.log(`[Webhook Debug] Real phone number: ${realPhoneNumber || 'not available'}`);

    // Find contact - try by whatsappId first (for LID contacts), then by phoneNumber
    let contact = await Contact.findOne({
      $or: [
        { whatsappId: remoteIdValue, channelId: channel._id },
        { phoneNumber: remoteIdValue, channelId: channel._id },
        ...(realPhoneNumber ? [{ phoneNumber: realPhoneNumber, channelId: channel._id }] : []),
      ],
    });

    if (!contact) {
      // Create new contact
      const contactData: Record<string, unknown> = {
        name: data.pushName || realPhoneNumber || remoteIdValue,
        channelId: channel._id,
      };

      // Store the WhatsApp identifier (LID or phone) for messaging
      if (remoteIdType === "lid") {
        contactData.whatsappId = remoteIdValue;
      }

      // Store the real phone number if available
      if (realPhoneNumber) {
        contactData.phoneNumber = realPhoneNumber;
        // Detect country from phone number
        contactData.country = detectCountryFromPhone(realPhoneNumber);
      } else if (remoteIdType === "phone") {
        contactData.phoneNumber = remoteIdValue;
        // Detect country from phone number
        contactData.country = detectCountryFromPhone(remoteIdValue);
      }

      contact = new Contact(contactData);
      await contact.save();
      console.log(`[Webhook Debug] Created new contact: ${contact._id}`);

      // Fetch profile picture in background (non-blocking)
      profilePictureService.updateContactProfilePicture(
        contact._id.toString(),
        channel._id.toString()
      ).catch(err => console.error("[Webhook] Failed to fetch profile picture:", err));
    } else {
      // Update existing contact
      let needsUpdate = false;

      // Update name if changed
      if (data.pushName && contact.name !== data.pushName) {
        contact.name = data.pushName;
        needsUpdate = true;
      }

      // Update whatsappId if we have a LID and contact doesn't have it yet
      if (remoteIdType === "lid" && !contact.whatsappId) {
        contact.whatsappId = remoteIdValue;
        needsUpdate = true;
      }

      // Check if the current phoneNumber is actually a LID (14+ digits) that should be moved to whatsappId
      const currentPhoneIsLid = contact.phoneNumber && contact.phoneNumber.replace(/\D/g, '').length >= 14;
      if (currentPhoneIsLid && !contact.whatsappId) {
        // Move the LID from phoneNumber to whatsappId
        contact.whatsappId = contact.phoneNumber;
        contact.phoneNumber = undefined;
        needsUpdate = true;
        console.log(`[Webhook Debug] Moved LID from phoneNumber to whatsappId: ${contact.whatsappId}`);
      }

      // Update phoneNumber if we have the real phone and contact doesn't have a valid one yet
      if (realPhoneNumber && (!contact.phoneNumber || currentPhoneIsLid)) {
        contact.phoneNumber = realPhoneNumber;
        needsUpdate = true;
        console.log(`[Webhook Debug] Updated contact with real phone number: ${realPhoneNumber}`);
      }

      // Update country if not set and we have a phone number
      if (!contact.country) {
        const detectedCountry = detectCountryFromPhone(contact.phoneNumber);
        if (detectedCountry) {
          contact.country = detectedCountry;
          needsUpdate = true;
          console.log(`[Webhook Debug] Detected country: ${detectedCountry}`);
        }
      }

      if (needsUpdate) {
        await contact.save();
      }

      // If contact doesn't have a profile picture, try to fetch it (non-blocking)
      if (!contact.avatar) {
        profilePictureService.updateContactProfilePicture(
          contact._id.toString(),
          channel._id.toString()
        ).catch(err => console.error("[Webhook] Failed to fetch profile picture:", err));
      }
    }

    // Find existing conversation regardless of status (get most recent)
    let conversation = await Conversation.findOne({
      contactId: contact._id,
      channelId: channel._id,
    }).sort({ lastMessageAt: -1 });

    let statusChanged = false;
    if (conversation) {
      // Handle status-based logic for returning customers
      if (conversation.status === 'resolved') {
        // Auto-reopen resolved conversations
        const oldStatus = conversation.status;
        conversation.status = 'open';
        conversation.resolvedAt = undefined;
        conversation.resolvedBy = null;
        conversation.isArchived = false; // Unarchive if archived
        await conversation.save();
        statusChanged = oldStatus !== conversation.status;
        console.log(`[Webhook] Reopened resolved conversation: ${conversation._id}`);
      } else if (conversation.status === 'open' && conversation.isArchived) {
        // Unarchive active conversations that were archived
        conversation.isArchived = false;
        await conversation.save();
        console.log(`[Webhook] Unarchived conversation: ${conversation._id}`);
      }
      // Spam conversations: do nothing special, stay in spam
      // needsAttention is preserved (user manually flagged it)
    } else {
      // Create new conversation
      conversation = new Conversation({
        contactId: contact._id,
        channelId: channel._id,
        status: "open",
        aiAutoReply: true, // Default to enabled
        aiHandling: false,
        needsAttention: false,
        isArchived: false,
        aiSignals: {
          slaRisk: false,
          priority: 0,
          sentiment: "neutral",
        },
      });
      await conversation.save();
      statusChanged = true; // New conversation is always "open"
    }

    // Parse message content
    const messageData = data.message
      ? parseMessageContent(data.message)
      : { content: "[Unknown message]", contentType: "text" };

    // Create message
    const message = await messageService.create({
      conversationId: conversation._id.toString(),
      channelId: channel._id.toString(),
      sender: "customer",
      content: messageData.content,
      contentType: messageData.contentType as
        | "text"
        | "image"
        | "audio"
        | "document"
        | "location",
      mediaUrl: messageData.mediaUrl,
      evolutionMessageId: data.key.id,
    });

    console.log(`Message created: ${message._id}`);

    // Emit conversation update - include status if it changed
    if (this.io) {
      const updateData: Record<string, unknown> = {
        _id: conversation._id.toString(),
        lastMessageAt: new Date(),
        unreadCount: (conversation.unreadCount || 0) + 1,
      };
      
      // Include status and related fields if status changed
      if (statusChanged) {
        updateData.status = conversation.status;
        updateData.resolvedAt = conversation.resolvedAt;
        updateData.resolvedBy = conversation.resolvedBy;
        updateData.isArchived = conversation.isArchived;
      }
      
      (
        this.io as unknown as { emit: (event: string, data: unknown) => void }
      ).emit("conversation:update", updateData);
    }

    // Trigger AI auto-reply if enabled
    if (this.aiReplyHandler && ["text", "image", "audio"].includes(messageData.contentType)) {
      try {
        await this.aiReplyHandler(
          conversation._id.toString(),
          message,
        );
      } catch (error) {
        console.error("AI auto-reply failed:", error);
      }
    }
  }

  /**
   * Handle connection status update
   */
  private async handleConnectionUpdate(
    instanceName: string,
    data: EvolutionConnectionData,
  ): Promise<void> {
    let status: "connected" | "disconnected" | "connecting";

    switch (data.state) {
      case "open":
        status = "connected";
        break;
      case "close":
        status = "disconnected";
        break;
      case "connecting":
        status = "connecting";
        break;
      default:
        status = "disconnected";
    }

    // Extract phone number from instance owner if available (format: "85291234567@s.whatsapp.net")
    let phoneNumber: string | undefined;
    if (data.instance?.owner) {
      phoneNumber = extractPhoneFromJid(data.instance.owner);
    }

    const channel = await channelService.updateConnectionStatus(
      instanceName,
      status,
      phoneNumber,
    );

    if (channel && this.io) {
      (
        this.io as unknown as { emit: (event: string, data: unknown) => void }
      ).emit("channel:status", {
        channelId: channel._id.toString(),
        status,
        phoneNumber: channel.phoneNumber,
      });
    }
  }

  /**
   * Handle QR code update
   */
  private async handleQRCodeUpdate(
    instanceName: string,
    data: { base64?: string; code?: string },
  ): Promise<void> {
    const qrCode = data.base64 || data.code;

    if (qrCode) {
      const channel = await channelService.updateQRCode(instanceName, qrCode);

      if (channel && this.io) {
        (
          this.io as unknown as { emit: (event: string, data: unknown) => void }
        ).emit("channel:status", {
          channelId: channel._id.toString(),
          status: "connecting",
        });
      }
    }
  }
}

export const webhookService = new WebhookService();
