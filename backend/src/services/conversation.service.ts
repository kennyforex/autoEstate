import { Server } from "socket.io";
import {
  Conversation,
  Tag,
  type IConversationDocument,
} from "../models/index.js";
import { Message, AILog, AgentSession } from "../models/index.js";
import { Contact } from "../models/index.js";
import { ConversationState } from "../models/ConversationState.js";
import { ScheduledReminder } from "../models/ScheduledReminder.js";
import { reminderService } from "./reminder.service.js";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "../types/index.js";

export interface ConversationFilters {
  status?: "open" | "resolved" | "spam";
  channelId?: string;
  assignedTo?: string;
  aiHandling?: boolean;
  aiAutoReply?: boolean;
  sentiment?: "positive" | "neutral" | "negative";
  slaRisk?: boolean;
  priority?: boolean;
  needsAttention?: boolean;
  isArchived?: boolean;
  tagId?: string;
  search?: string;
}

export interface ConversationListOptions {
  limit?: number;
  offset?: number;
  sortBy?: "lastMessageAt" | "createdAt" | "priority";
  sortOrder?: "asc" | "desc";
}

export interface InboxCounts {
  all: number;
  aiHandling: number;
  manual: number;
  needAttention: number;
  assignedToMe: number;
  resolvedByAI: number;
  spam: number;
  archived: number;
  tags: Array<{
    _id: string;
    label: string;
    color: string;
    count: number;
  }>;
}

export interface AIInsightsCounts {
  aiPriority: number;
  negativeSentiment: number;
  slaRisk: number;
}

class ConversationService {
  private io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

  setIO(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.io = io;
  }

  /**
   * Get conversations with filters
   */
  async findAll(
    filters: ConversationFilters = {},
    options: ConversationListOptions = {},
  ): Promise<{ conversations: IConversationDocument[]; total: number }> {
    const query: Record<string, unknown> = {};

    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.channelId) {
      query.channelId = filters.channelId;
    }
    if (filters.assignedTo) {
      query.assignedTo = filters.assignedTo;
    }
    if (filters.aiHandling !== undefined) {
      query.aiHandling = filters.aiHandling;
    }
    if (filters.aiAutoReply !== undefined) {
      query.aiAutoReply = filters.aiAutoReply;
    }
    if (filters.sentiment) {
      query["aiSignals.sentiment"] = filters.sentiment;
    }
    if (filters.slaRisk !== undefined) {
      query["aiSignals.slaRisk"] = filters.slaRisk;
    }
    if (filters.priority) {
      query["aiSignals.priority"] = { $gte: 7 };
    }
    if (filters.needsAttention !== undefined) {
      query.needsAttention = filters.needsAttention;
    }
    if (filters.isArchived !== undefined) {
      query.isArchived = filters.isArchived;
    }
    if (filters.tagId) {
      query.tags = filters.tagId;
    }

    // Search by contact name, phoneNumber, whatsappId, or subject
    if (filters.search) {
      const contacts = await Contact.find({
        $or: [
          { name: { $regex: filters.search, $options: "i" } },
          { phoneNumber: { $regex: filters.search, $options: "i" } },
          { whatsappId: { $regex: filters.search, $options: "i" } },
        ],
      }).select("_id");

      const contactIds = contacts.map((c) => c._id);
      query.$or = [
        { contactId: { $in: contactIds } },
        { subject: { $regex: filters.search, $options: "i" } },
      ];
    }

    const sortField = options.sortBy || "lastMessageAt";
    const sortOrder = options.sortOrder === "asc" ? 1 : -1;

    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .populate("contactId", "name phoneNumber whatsappId avatar")
        .populate({
          path: "channelId",
          select: "name type assistantId",
          populate: {
            path: "assistantId",
            select: "name",
          },
        })
        .populate("assignedTo", "name avatar")
        .populate("tags")
        .sort({ [sortField]: sortOrder })
        .skip(options.offset || 0)
        .limit(options.limit || 50),
      Conversation.countDocuments(query),
    ]);

    return { conversations, total };
  }

  /**
   * Get conversation by ID with messages
   */
  async findById(
    id: string,
    includeMessages: boolean = true,
  ): Promise<{
    conversation: IConversationDocument | null;
    messages: unknown[];
  }> {
    const conversation = await Conversation.findById(id)
      .populate("contactId", "name phoneNumber whatsappId email company avatar")
      .populate({
        path: "channelId",
        select: "name type evolutionInstanceName assistantId",
        populate: {
          path: "assistantId",
          select: "name",
        },
      })
      .populate("assignedTo", "name avatar")
      .populate("tags");

    if (!conversation) {
      return { conversation: null, messages: [] };
    }

    let messages: unknown[] = [];
    if (includeMessages) {
      const rawMessages = await Message.find({ conversationId: id })
        .populate("senderUserId", "name avatar")
        .sort({ createdAt: -1 })
        .limit(200);
      // Reverse to restore chronological (oldest→newest) order
      messages = rawMessages.reverse();
    }

    return { conversation, messages };
  }

  /**
   * Update conversation
   */
  async update(
    id: string,
    updates: Partial<{
      status: "open" | "resolved" | "spam";
      assignedTo: string | null;
      category: string;
      subject: string;
      aiAutoReply: boolean;
      needsAttention: boolean;
      isArchived: boolean;
      resolvedBy: "ai" | "human" | null;
      tags: string[];
    }>,
  ): Promise<IConversationDocument | null> {
    const updateData: Record<string, unknown> = {};

    if (updates.status !== undefined) {
      updateData.status = updates.status;
      if (updates.status === "resolved") {
        updateData.resolvedAt = new Date();
        // Auto-detect resolvedBy based on lastMessageSender if not explicitly provided
        if (updates.resolvedBy !== undefined) {
          updateData.resolvedBy = updates.resolvedBy;
        } else {
          // Check who sent the last message to determine if AI or human resolved
          const existingConversation =
            await Conversation.findById(id).select("lastMessageSender");
          console.log(
            `[RESOLVE] Conversation ${id}: lastMessageSender="${existingConversation?.lastMessageSender}", resolvedBy will be "${existingConversation?.lastMessageSender === "ai" ? "ai" : "human"}"`,
          );
          if (existingConversation?.lastMessageSender === "ai") {
            updateData.resolvedBy = "ai";
          } else {
            updateData.resolvedBy = "human";
          }
        }
      } else if (updates.status === "open") {
        // Clear resolution data when reopening
        updateData.resolvedAt = undefined;
        updateData.resolvedBy = null;
      }
    }
    if (updates.assignedTo !== undefined) {
      updateData.assignedTo = updates.assignedTo || undefined;
    }
    if (updates.category !== undefined) {
      updateData.category = updates.category;
    }
    if (updates.subject !== undefined) {
      updateData.subject = updates.subject;
    }
    if (updates.aiAutoReply !== undefined) {
      updateData.aiAutoReply = updates.aiAutoReply;
    }
    if (updates.needsAttention !== undefined) {
      updateData.needsAttention = updates.needsAttention;
    }
    if (updates.isArchived !== undefined) {
      updateData.isArchived = updates.isArchived;
    }
    if (updates.tags !== undefined) {
      updateData.tags = updates.tags;
    }

    const conversation = await Conversation.findByIdAndUpdate(id, updateData, {
      new: true,
    })
      .populate("contactId", "name phoneNumber whatsappId avatar")
      .populate({
        path: "channelId",
        select: "name type assistantId",
        populate: {
          path: "assistantId",
          select: "name",
        },
      })
      .populate("assignedTo", "name avatar")
      .populate("tags");

    if (conversation && this.io) {
      (
        this.io as unknown as { emit: (event: string, data: unknown) => void }
      ).emit("conversation:update", {
        _id: conversation._id.toString(),
        ...updateData,
      });
    }

    return conversation;
  }

  /**
   * Toggle AI auto-reply for conversation
   */
  async toggleAIAutoReply(
    id: string,
    enabled: boolean,
  ): Promise<IConversationDocument | null> {
    return this.update(id, { aiAutoReply: enabled });
  }

  /**
   * Record which moderation category matched on this conversation.
   */
  async recordModerationMatch(
    id: string,
    payload: { categoryId: string; categoryName: string },
  ): Promise<IConversationDocument | null> {
    return Conversation.findByIdAndUpdate(
      id,
      {
        lastModerationMatch: {
          categoryId: payload.categoryId,
          categoryName: payload.categoryName,
          at: new Date(),
        },
      },
      { new: true },
    );
  }

  /**
   * Mark a one-time manager alert as sent for this category on this conversation.
   */
  async markModerationAlertSent(
    id: string,
    categoryId: string,
  ): Promise<IConversationDocument | null> {
    return Conversation.findByIdAndUpdate(
      id,
      { $addToSet: { moderationAlertsSent: categoryId } },
      { new: true },
    );
  }

  /**
   * Update AI signals for conversation
   */
  async updateAISignals(
    id: string,
    signals: Partial<{
      confidence: number;
      sentiment: "positive" | "neutral" | "negative";
      slaRisk: boolean;
      priority: number;
    }>,
  ): Promise<IConversationDocument | null> {
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return null;
    }

    conversation.aiSignals = { ...conversation.aiSignals, ...signals };
    await conversation.save();

    if (this.io) {
      (
        this.io as unknown as { emit: (event: string, data: unknown) => void }
      ).emit("conversation:update", {
        _id: conversation._id.toString(),
        aiSignals: conversation.aiSignals,
      });
    }

    return conversation;
  }

  /**
   * Set conversation as being handled by AI
   */
  async setAIHandling(
    id: string,
    handling: boolean,
  ): Promise<IConversationDocument | null> {
    const conversation = await Conversation.findByIdAndUpdate(
      id,
      { aiHandling: handling },
      { new: true },
    );

    if (conversation && this.io) {
      (
        this.io as unknown as { emit: (event: string, data: unknown) => void }
      ).emit("conversation:update", {
        _id: conversation._id.toString(),
        aiHandling: handling,
      });
    }

    return conversation;
  }

  /**
   * Get inbox counts for sidebar
   */
  async getInboxCounts(
    userId?: string,
    channelId?: string,
  ): Promise<InboxCounts> {
    // Base filter for channel
    const channelFilter = channelId ? { channelId } : {};

    const [
      all,
      aiHandling,
      manual,
      needAttention,
      assignedToMe,
      resolvedByAI,
      spam,
      archived,
      tags,
    ] = await Promise.all([
      Conversation.countDocuments({
        ...channelFilter,
        status: "open",
        isArchived: { $ne: true },
      }),
      Conversation.countDocuments({
        ...channelFilter,
        status: "open",
        aiAutoReply: true,
        isArchived: { $ne: true },
      }),
      Conversation.countDocuments({
        ...channelFilter,
        status: "open",
        aiAutoReply: false,
        isArchived: { $ne: true },
      }),
      // Use manual needsAttention flag instead of AI-derived signals
      Conversation.countDocuments({
        ...channelFilter,
        status: "open",
        needsAttention: true,
        isArchived: { $ne: true },
      }),
      userId
        ? Conversation.countDocuments({
            ...channelFilter,
            status: "open",
            assignedTo: userId,
            isArchived: { $ne: true },
          })
        : 0,
      Conversation.countDocuments({
        ...channelFilter,
        status: "resolved",
        isArchived: { $ne: true },
      }),
      Conversation.countDocuments({
        ...channelFilter,
        status: "spam",
        isArchived: { $ne: true },
      }),
      Conversation.countDocuments({ ...channelFilter, isArchived: true }),
      // Get counts for each tag
      (async () => {
        const allTags = await Tag.find().sort({ label: 1 });
        const tagCounts = await Promise.all(
          allTags.map(async (tag) => {
            const count = await Conversation.countDocuments({
              ...channelFilter,
              tags: tag._id,
              isArchived: { $ne: true },
            });
            return {
              _id: tag._id.toString(),
              label: tag.label,
              color: tag.color,
              count,
            };
          }),
        );
        return tagCounts;
      })(),
    ]);

    return {
      all,
      aiHandling,
      manual,
      needAttention,
      assignedToMe,
      resolvedByAI,
      spam,
      archived,
      tags,
    };
  }

  /**
   * Get AI insights counts (excluding dismissed insights)
   */
  async getAIInsightsCounts(channelId?: string): Promise<AIInsightsCounts> {
    // Base filter for channel
    const channelFilter = channelId ? { channelId } : {};

    const [aiPriority, negativeSentiment, slaRisk] = await Promise.all([
      Conversation.countDocuments({
        ...channelFilter,
        status: "open",
        "aiSignals.priority": { $gte: 7 },
        $or: [
          { "dismissedInsights.priority": { $ne: true } },
          { dismissedInsights: { $exists: false } },
        ],
      }),
      Conversation.countDocuments({
        ...channelFilter,
        status: "open",
        "aiSignals.sentiment": "negative",
        $or: [
          { "dismissedInsights.negativeSentiment": { $ne: true } },
          { dismissedInsights: { $exists: false } },
        ],
      }),
      Conversation.countDocuments({
        ...channelFilter,
        status: "open",
        "aiSignals.slaRisk": true,
        $or: [
          { "dismissedInsights.slaRisk": { $ne: true } },
          { dismissedInsights: { $exists: false } },
        ],
      }),
    ]);

    return { aiPriority, negativeSentiment, slaRisk };
  }

  /**
   * Dismiss an AI insight for a conversation
   */
  async dismissInsight(
    conversationId: string,
    insightType: "negativeSentiment" | "slaRisk" | "priority",
  ): Promise<IConversationDocument | null> {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return null;
    }

    // Initialize dismissedInsights if it doesn't exist
    if (!conversation.dismissedInsights) {
      conversation.dismissedInsights = {
        negativeSentiment: false,
        slaRisk: false,
        priority: false,
      };
    }

    // Set the specific insight as dismissed
    conversation.dismissedInsights[insightType] = true;

    await conversation.save();

    // Emit socket event if available
    if (this.io) {
      (
        this.io as unknown as { emit: (event: string, data: unknown) => void }
      ).emit("conversation:update", {
        _id: conversation._id.toString(),
        dismissedInsights: conversation.dismissedInsights,
      });
    }

    return conversation;
  }

  /**
   * Permanently remove a conversation and all dependent records (messages,
   * skill state, reminders, agent sessions, AI logs). Next inbound message
   * for the same contact/channel creates a new conversation document.
   */
  async deleteById(id: string): Promise<boolean> {
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return false;
    }

    const convObjId = conversation._id;

    await reminderService.cancelForConversation(id);

    await Promise.all([
      Message.deleteMany({ conversationId: convObjId }),
      ConversationState.deleteMany({ conversationId: convObjId }),
      ScheduledReminder.deleteMany({ conversationId: convObjId }),
      AgentSession.deleteMany({ conversationId: convObjId }),
      AILog.deleteMany({ conversationId: convObjId }),
    ]);

    await Conversation.findByIdAndDelete(id);

    if (this.io) {
      (
        this.io as unknown as { emit: (event: string, data: unknown) => void }
      ).emit("conversation:deleted", { _id: id });
    }

    return true;
  }
}

export const conversationService = new ConversationService();
