import { Server } from "socket.io";
import { getEvolutionClient } from "../config/evolution.js";
import { Message, type IMessageDocument } from "../models/index.js";
import {
  isValidInternationalPhoneDigits,
  stripSkillMarkers,
} from "../utils/helpers.js";
import { Conversation } from "../models/index.js";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "../types/index.js";

export interface CreateMessageInput {
  conversationId: string;
  channelId: string;
  sender: "customer" | "agent" | "ai";
  senderUserId?: string;
  content: string;
  contentType?: "text" | "image" | "audio" | "document" | "location";
  mediaUrl?: string;
  evolutionMessageId?: string;
  aiGenerated?: boolean;
  citations?: Array<{
    position: number;
    references: Array<{
      file: { id: string; name: string };
      pages: number[];
    }>;
  }>;
}

class MessageService {
  private io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

  setIO(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.io = io;
  }

  /**
   * Create a new message
   */
  async create(input: CreateMessageInput): Promise<IMessageDocument> {
    const message = new Message({
      conversationId: input.conversationId,
      channelId: input.channelId,
      sender: input.sender,
      senderUserId: input.senderUserId,
      content: input.content,
      contentType: input.contentType || "text",
      mediaUrl: input.mediaUrl,
      evolutionMessageId: input.evolutionMessageId,
      aiGenerated: input.aiGenerated || false,
      citations: input.citations,
    });

    await message.save();

    // Update conversation's last message time, content, and unread count
    const incrementValue = input.sender === "customer" ? 1 : 0;
    await Conversation.findByIdAndUpdate(input.conversationId, {
      lastMessageAt: new Date(),
      lastMessageContent: input.content?.substring(0, 100),
      lastMessageSender: input.sender,
      $inc: { unreadCount: incrementValue },
    });

    // Emit real-time event
    this.emitNewMessage(message);

    return message;
  }

  /**
   * Get messages for a conversation
   */
  async findByConversation(
    conversationId: string,
    options?: {
      limit?: number;
      before?: Date;
    },
  ): Promise<IMessageDocument[]> {
    const query: Record<string, unknown> = { conversationId };

    if (options?.before) {
      query.createdAt = { $lt: options.before };
    }

    return Message.find(query)
      .sort({ createdAt: -1 })
      .limit(options?.limit || 50)
      .populate("senderUserId", "name avatar");
  }

  /**
   * Get message by ID
   */
  async findById(id: string): Promise<IMessageDocument | null> {
    return Message.findById(id).populate("senderUserId", "name avatar");
  }

  /**
   * Mark message as read
   */
  async markAsRead(id: string): Promise<IMessageDocument | null> {
    const message = await Message.findByIdAndUpdate(
      id,
      { readAt: new Date() },
      { new: true },
    );

    if (message) {
      // Emit update event
      this.emitMessageUpdate(message._id.toString(), {
        readAt: message.readAt,
      });
    }

    return message;
  }

  /**
   * Mark all messages in conversation as read
   */
  async markConversationAsRead(conversationId: string): Promise<number> {
    const result = await Message.updateMany(
      { conversationId, readAt: null },
      { readAt: new Date() },
    );

    // Reset unread count in conversation
    await Conversation.findByIdAndUpdate(conversationId, { unreadCount: 0 });

    return result.modifiedCount;
  }

  /**
   * Send message via Evolution API (WhatsApp)
   */
  async sendViaWhatsApp(
    instanceName: string,
    phoneNumber: string,
    content: string,
    contentType: "text" | "image" | "video" | "audio" | "document" = "text",
    mediaUrl?: string,
    fileName?: string,
  ): Promise<string | null> {
    try {
      const evolutionClient = getEvolutionClient();

      // Evolution `number`: E.164 digits for real phones, or `id@lid` for WhatsApp LIDs.
      // 13-digit LIDs were previously sent as bare digits (no @lid) because we only
      // suffixed @lid for length >= 14 — Evolution returns 400 for bare LID digits.
      let numberToSend: string;
      const cleanNumber = phoneNumber.replace(/\D/g, "");

      if (phoneNumber.includes("@lid")) {
        numberToSend = phoneNumber;
      } else if (isValidInternationalPhoneDigits(cleanNumber)) {
        numberToSend = cleanNumber;
      } else if (cleanNumber.length >= 13) {
        numberToSend = `${cleanNumber}@lid`;
      } else {
        numberToSend = cleanNumber;
      }

      const strippedContent = stripSkillMarkers(content).trim();
      const textForWhatsApp = strippedContent || " ";

      let response;

      switch (contentType) {
        case "text":
          response = await evolutionClient.post(
            `/message/sendText/${instanceName}`,
            {
              number: numberToSend,
              text: textForWhatsApp,
            },
          );
          break;

        case "image":
          // Check if it's a base64 data URL and extract just the base64 part
          let imageMedia = mediaUrl;
          let imageMimetype = "image/png";
          if (mediaUrl?.startsWith("data:")) {
            // Extract mimetype and base64 from data URL
            const match = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              imageMimetype = match[1];
              imageMedia = match[2]; // Just the base64 part
            }
          }

          response = await evolutionClient.post(
            `/message/sendMedia/${instanceName}`,
            {
              number: numberToSend,
              mediatype: "image",
              mimetype: imageMimetype,
              media: imageMedia,
              fileName: fileName || "image.png",
              caption:
                content === "[Image]" ? "" : strippedContent,
            },
          );
          break;

        case "video":
          // Check if it's a base64 data URL and extract just the base64 part
          let videoMedia = mediaUrl;
          let videoMimetype = "video/mp4";
          if (mediaUrl?.startsWith("data:")) {
            // Extract mimetype and base64 from data URL
            const match = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              videoMimetype = match[1];
              videoMedia = match[2]; // Just the base64 part
            }
          }

          // Check video size - Evolution API has ~10MB limit for base64
          const videoSizeBytes = videoMedia ? (videoMedia.length * 3) / 4 : 0; // base64 to bytes
          if (videoSizeBytes > 10 * 1024 * 1024) {
            throw new Error(
              "Video file is too large. Maximum size is 10MB for WhatsApp.",
            );
          }

          response = await evolutionClient.post(
            `/message/sendMedia/${instanceName}`,
            {
              number: numberToSend,
              mediatype: "video",
              mimetype: videoMimetype,
              media: videoMedia,
              fileName: fileName || "video.mp4",
              caption:
                content === "[Video]" ? "" : strippedContent,
            },
          );
          break;

        case "audio":
          response = await evolutionClient.post(
            `/message/sendWhatsAppAudio/${instanceName}`,
            {
              number: numberToSend,
              audio: mediaUrl,
            },
          );
          break;

        case "document":
          // Check if it's a base64 data URL and extract just the base64 part
          let docMedia = mediaUrl;
          let docMimetype = "application/pdf";
          if (mediaUrl?.startsWith("data:")) {
            // Extract mimetype and base64 from data URL
            const match = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              docMimetype = match[1];
              docMedia = match[2]; // Just the base64 part
            }
          }

          response = await evolutionClient.post(
            `/message/sendMedia/${instanceName}`,
            {
              number: numberToSend,
              mediatype: "document",
              mimetype: docMimetype,
              media: docMedia,
              fileName: fileName || "document.pdf",
              caption: strippedContent,
            },
          );
          break;

        default:
          response = await evolutionClient.post(
            `/message/sendText/${instanceName}`,
            {
              number: numberToSend,
              text: textForWhatsApp,
            },
          );
      }

      return response.data?.key?.id || null;
    } catch (error: unknown) {
      console.error("Failed to send message via WhatsApp:", error);
      const ax = error as {
        response?: {
          status?: number;
          data?: {
            message?: string | string[];
            response?: { message?: string | string[] };
          };
        };
      };
      const status = ax.response?.status;
      if (status === 404) {
        throw new Error(
          `Evolution API 404: WhatsApp instance "${instanceName}" was not found. ` +
            `Open your Evolution dashboard and confirm the instance name matches this channel in Channels (reconnect or copy the exact name).`,
        );
      }
      const data = ax.response?.data;
      const nestedMsg = data?.response?.message;
      const topMsg = data?.message;
      const msg =
        (typeof nestedMsg === "string"
          ? nestedMsg
          : Array.isArray(nestedMsg)
            ? nestedMsg.join(", ")
            : undefined) ??
        (typeof topMsg === "string"
          ? topMsg
          : Array.isArray(topMsg)
            ? topMsg.join(", ")
            : undefined);
      throw new Error(
        msg
          ? `Failed to send WhatsApp message (${status ?? "?"}): ${msg}`
          : "Failed to send message",
      );
    }
  }

  /**
   * Emit new message event
   */
  private emitNewMessage(message: IMessageDocument): void {
    const room = `conversation:${message.conversationId}`;
    console.log(`[Socket:Message] Emitting message:new to room ${room}, io=${this.io ? 'set' : 'null'}, messageId=${message._id}`);
    if (this.io) {
      // Plain object so Socket.IO always serializes `content` (Mongoose docs can omit fields in edge cases).
      const payload =
        typeof message.toJSON === "function"
          ? message.toJSON()
          : { ...message };
      (
        this.io.to(room) as unknown as {
          emit: (event: string, data: unknown) => void;
        }
      ).emit("message:new", payload);
      console.log(`[Socket:Message] Emitted message:new successfully`);
    } else {
      console.log(`[Socket:Message] WARNING: IO not set, cannot emit message:new`);
    }
  }

  /**
   * Emit message update event
   */
  private emitMessageUpdate(
    messageId: string,
    updates: Partial<IMessageDocument>,
  ): void {
    if (this.io) {
      // We need to get the conversation ID to emit to the right room
      // For simplicity, emit to all connected clients
      (
        this.io as unknown as { emit: (event: string, data: unknown) => void }
      ).emit("message:update", { _id: messageId, ...updates });
    }
  }
}

export const messageService = new MessageService();
