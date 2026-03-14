import { Response, NextFunction } from "express";
import { conversationService } from "../services/conversation.service.js";
import { messageService } from "../services/message.service.js";
import { channelService } from "../services/channel.service.js";
import { aiService } from "../services/ai.service.js";
import { Contact } from "../models/index.js";
import type { AuthRequest } from "../types/index.js";

export async function listConversations(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      status,
      channelId,
      assignedTo,
      aiHandling,
      aiAutoReply,
      sentiment,
      slaRisk,
      priority,
      needsAttention,
      isArchived,
      assignedToMe,
      tagId,
      search,
      limit,
      offset,
      sortBy,
      sortOrder,
    } = req.query;

    const { conversations, total } = await conversationService.findAll(
      {
        status: status as "open" | "resolved" | "spam" | undefined,
        channelId: channelId as string | undefined,
        assignedTo:
          assignedToMe === "true" && req.user?.userId
            ? req.user.userId
            : (assignedTo as string | undefined),
        aiHandling:
          aiHandling === "true"
            ? true
            : aiHandling === "false"
              ? false
              : undefined,
        aiAutoReply:
          aiAutoReply === "true"
            ? true
            : aiAutoReply === "false"
              ? false
              : undefined,
        sentiment: sentiment as "positive" | "neutral" | "negative" | undefined,
        slaRisk:
          slaRisk === "true" ? true : slaRisk === "false" ? false : undefined,
        priority: priority === "true" ? true : undefined,
        needsAttention:
          needsAttention === "true"
            ? true
            : needsAttention === "false"
              ? false
              : undefined,
        isArchived:
          isArchived === "true"
            ? true
            : isArchived === "false"
              ? false
              : undefined,
        tagId: tagId as string | undefined,
        search: search as string | undefined,
      },
      {
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        sortBy: sortBy as
          | "lastMessageAt"
          | "createdAt"
          | "priority"
          | undefined,
        sortOrder: sortOrder as "asc" | "desc" | undefined,
      },
    );

    res.json({ conversations, total });
  } catch (error) {
    next(error);
  }
}

export async function getConversation(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const includeMessages = req.query.messages !== "false";

    const { conversation, messages } = await conversationService.findById(
      id,
      includeMessages,
    );

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({ conversation, messages });
  } catch (error) {
    next(error);
  }
}

export async function updateConversation(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const {
      status,
      assignedTo,
      category,
      subject,
      needsAttention,
      isArchived,
      resolvedBy,
      tags,
    } = req.body;

    const conversation = await conversationService.update(id, {
      status,
      assignedTo,
      category,
      subject,
      needsAttention,
      isArchived,
      resolvedBy,
      tags,
    });

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({ conversation });
  } catch (error) {
    next(error);
  }
}

export async function toggleAIAutoReply(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    const conversation = await conversationService.toggleAIAutoReply(
      id,
      enabled,
    );

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({ conversation });
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { id } = req.params;
    const { content, contentType = "text", mediaUrl, fileName } = req.body;

    // Get conversation with channel info
    const { conversation } = await conversationService.findById(id, false);

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Get contact phone number
    // contactId might be populated object or just an ObjectId
    const contactId =
      typeof conversation.contactId === "object" && conversation.contactId._id
        ? conversation.contactId._id.toString()
        : conversation.contactId.toString();

    const contact = await Contact.findById(contactId);
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    // Get channel for Evolution instance name
    // channelId might be populated object or just an ObjectId
    const channelId =
      typeof conversation.channelId === "object" && conversation.channelId._id
        ? conversation.channelId._id.toString()
        : conversation.channelId.toString();

    const channel = await channelService.findById(channelId);
    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    // Get the WhatsApp identifier for sending messages
    // Prefer whatsappId (LID) if available, as that's the conversation identifier for LID contacts
    const senderId = contact.whatsappId || contact.phoneNumber;
    if (!senderId) {
      res
        .status(400)
        .json({ error: "Contact has no phone number or WhatsApp ID" });
      return;
    }

    // Send message via WhatsApp
    const evolutionMessageId = await messageService.sendViaWhatsApp(
      channel.evolutionInstanceName,
      senderId,
      content,
      contentType,
      mediaUrl,
      fileName,
    );

    // Create message in database
    const message = await messageService.create({
      conversationId: id,
      channelId: channel._id.toString(),
      sender: "agent",
      senderUserId: req.user.userId,
      content,
      contentType,
      mediaUrl,
      evolutionMessageId: evolutionMessageId || undefined,
    });

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
}

export async function getInboxCounts(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    const channelId = req.query.channelId as string | undefined;
    const counts = await conversationService.getInboxCounts(userId, channelId);
    res.json({ counts });
  } catch (error) {
    next(error);
  }
}

export async function getAIInsights(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const channelId = req.query.channelId as string | undefined;
    const insights = await conversationService.getAIInsightsCounts(channelId);
    res.json({ insights });
  } catch (error) {
    next(error);
  }
}

export async function dismissInsight(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { insightType } = req.body;

    if (!insightType || !["negativeSentiment", "slaRisk", "priority"].includes(insightType)) {
      res.status(400).json({ error: "Invalid insight type" });
      return;
    }

    const conversation = await conversationService.dismissInsight(
      id,
      insightType as "negativeSentiment" | "slaRisk" | "priority",
    );

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({ conversation });
  } catch (error) {
    next(error);
  }
}

export async function markAsRead(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const count = await messageService.markConversationAsRead(id);

    res.json({ markedCount: count });
  } catch (error) {
    next(error);
  }
}

/**
 * Diagnostic endpoint to check AI assistant status for a conversation
 */
export async function getAIDiagnostic(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const { conversation } = await conversationService.findById(id, false);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Get channel info
    const channelId =
      typeof conversation.channelId === "object" && conversation.channelId._id
        ? conversation.channelId._id.toString()
        : conversation.channelId.toString();

    const channel = await channelService.findById(channelId);
    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    // Check if AI should auto-reply
    const shouldReply = await aiService.shouldAutoReply(id);

    // Build diagnostic info
    const diagnostic = {
      conversationId: id,
      shouldAutoReply: shouldReply,
      conversation: {
        aiAutoReply: conversation.aiAutoReply,
        aiHandling: conversation.aiHandling,
        status: conversation.status,
      },
      channel: {
        _id: channel._id.toString(),
        name: channel.name,
        aiSettings: {
          enabled: channel.aiSettings?.enabled ?? false,
          autoReplyMode: channel.aiSettings?.autoReplyMode ?? "off",
          responseDelay: channel.aiSettings?.responseDelay ?? 0,
          escalateOnNegativeSentiment:
            channel.aiSettings?.escalateOnNegativeSentiment ?? false,
        },
        assistantId: channel.assistantId?.toString() ?? null,
        hasAssistant: !!channel.assistantId,
      },
      checks: {
        conversationExists: !!conversation,
        channelExists: !!channel,
        channelAiEnabled: channel.aiSettings?.enabled ?? false,
        hasAssistant: !!channel.assistantId,
        autoReplyModeCheck: (() => {
          const mode = channel.aiSettings?.autoReplyMode ?? "off";
          if (mode === "off") return false;
          if (mode === "all") return true;
          if (mode === "per_chat") return conversation.aiAutoReply;
          return false;
        })(),
      },
    };

    res.json({ diagnostic });
  } catch (error) {
    next(error);
  }
}
