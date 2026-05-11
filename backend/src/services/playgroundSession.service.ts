import { Types } from "mongoose";
import {
  AgentSession,
  PlaygroundSession,
  type IPlaygroundMessage,
  type IPlaygroundSessionDocument,
} from "../models/index.js";
import { ConversationState } from "../models/ConversationState.js";
import type { ChatMessage } from "../agent/types.js";

export type PlaygroundAppendMessageInput = {
  role: "user" | "assistant";
  content: string;
  contentType?: IPlaygroundMessage["contentType"];
  mediaUrl?: string;
  mediaDescription?: string;
};

class PlaygroundSessionService {
  async findOrCreate(
    assistantId: string,
    userId: string,
  ): Promise<IPlaygroundSessionDocument> {
    const assistantObjId = new Types.ObjectId(assistantId);
    const userObjId = new Types.ObjectId(userId);

    const existing = await PlaygroundSession.findOne({
      assistantId: assistantObjId,
      userId: userObjId,
    });
    if (existing) return existing;

    try {
      return await PlaygroundSession.create({
        assistantId: assistantObjId,
        userId: userObjId,
        messages: [],
      });
    } catch (error: unknown) {
      const duplicateKey = (error as { code?: number })?.code === 11000;
      if (!duplicateKey) throw error;

      const raced = await PlaygroundSession.findOne({
        assistantId: assistantObjId,
        userId: userObjId,
      });
      if (!raced) throw error;
      return raced;
    }
  }

  async listMessages(
    assistantId: string,
    userId: string,
  ): Promise<IPlaygroundMessage[]> {
    const session = await this.findOrCreate(assistantId, userId);
    return [...session.messages].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  async appendMessage(
    sessionId: string,
    input: PlaygroundAppendMessageInput,
  ): Promise<void> {
    await PlaygroundSession.findByIdAndUpdate(sessionId, {
      $push: {
        messages: {
          role: input.role,
          content: input.content,
          contentType: input.contentType ?? "text",
          mediaUrl: input.mediaUrl,
          mediaDescription: input.mediaDescription,
          createdAt: new Date(),
        },
      },
    });
  }

  async buildMessageHistory(
    sessionId: string,
    limit = 15,
  ): Promise<ChatMessage[]> {
    const session = await PlaygroundSession.findById(sessionId).lean();
    if (!session) return [];

    return [...session.messages]
      .filter((msg) => msg.content?.trim().length > 0 || msg.mediaDescription || msg.mediaUrl)
      .slice(-limit)
      .map((msg) => ({
        role: msg.role,
        content: this.messageContentForAgent(msg),
      }));
  }

  async clear(assistantId: string, userId: string): Promise<void> {
    const session = await this.findOrCreate(assistantId, userId);
    const sessionId = session._id;

    await Promise.all([
      PlaygroundSession.updateOne({ _id: sessionId }, { $set: { messages: [] } }),
      ConversationState.deleteMany({ conversationId: sessionId }),
      AgentSession.deleteMany({ conversationId: sessionId }),
    ]);
  }

  formatForApi(message: IPlaygroundMessage): ChatMessage {
    return {
      role: message.role,
      content: message.content,
    };
  }

  private messageContentForAgent(message: IPlaygroundMessage): string {
    if (message.mediaUrl || message.mediaDescription) {
      if (message.contentType === "image") {
        const hasCaption = message.content && message.content !== "[Image]";
        const caption = hasCaption ? ` User's message: "${message.content}"` : "";
        const mediaInfo = message.mediaUrl ? ` Image URL: ${message.mediaUrl}` : "";
        const descriptionInfo = message.mediaDescription
          ? ` Image description: ${message.mediaDescription}`
          : "";
        return `The user shared an image.${caption}${mediaInfo}${descriptionInfo}`;
      }

      if (message.contentType === "audio") {
        const mediaInfo = message.mediaUrl ? ` Audio URL: ${message.mediaUrl}` : "";
        const transcriptionInfo = message.mediaDescription
          ? ` Transcription: ${message.mediaDescription}`
          : "";
        return `The user sent an audio message.${mediaInfo}${transcriptionInfo}`;
      }
    }

    return message.content;
  }
}

export const playgroundSessionService = new PlaygroundSessionService();
