import { Server } from "socket.io";
import axios from "axios";
import { assistantService } from "./assistant.service.js";
import { channelService } from "./channel.service.js";
import { conversationService } from "./conversation.service.js";
import { messageService, type CreateMessageInput } from "./message.service.js";
import { aiLogger } from "./aiLogger.service.js";
import { Conversation, Channel, Contact, Message, Assistant } from "../models/index.js";
import { AgentSession } from "../models/AgentSession.js";
import { delay, recipientJidForEvolutionSend } from "../utils/helpers.js";
import {
  extractHttpsImageUrls,
  scrubImageUrlsFromText,
  fetchHttpsImageAsDataUrl,
  fileNameForImageUrl,
  FetchImageError,
} from "../utils/whatsappOutboundImages.js";
import { openRouterHeaders } from "../config/httpAttribution.js";
import { openRouterConfig } from "../config/openrouter.js";
import { aiChatProvider, createChatCompletion } from "../config/aiChatProvider.js";
import { getEvolutionClient } from "../config/evolution.js";
import { agentEngine } from "../agent/index.js";
import { buildAgentContext } from "../agent/context.js";
import { reminderService } from "./reminder.service.js";
import {
  AudioTranscriptionError,
  audioTranscriptionFailureMessage,
  normalizeAudioMimetype,
  transcribeAudioWithFallback,
} from "./audioTranscription.service.js";
import type { AgentEvent } from "../agent/types.js";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  IMessage,
} from "../types/index.js";

/**
 * Queue to handle sequential message processing per conversation
 */
class ConversationQueue {
  private queues: Map<string, Promise<void>> = new Map();

  /**
   * Add a task to the queue for a specific conversation
   */
  async enqueue(
    conversationId: string,
    task: () => Promise<void>,
  ): Promise<void> {
    const currentQueue = this.queues.get(conversationId) || Promise.resolve();

    const nextTask = currentQueue.then(async () => {
      try {
        await task();
      } catch (error) {
        console.error(
          `[Queue] Error processing task for conversation ${conversationId}:`,
          error,
        );
      }
    });

    this.queues.set(conversationId, nextTask);

    // Clean up the map when the task is done and no other tasks are pending
    nextTask.finally(() => {
      if (this.queues.get(conversationId) === nextTask) {
        this.queues.delete(conversationId);
      }
    });

    return nextTask;
  }
}

class AIService {
  private io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;
  private queue = new ConversationQueue();

  setIO(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.io = io;
  }

  /**
   * Emit AI status event to the conversation room
   */
  private emitAIStatus(
    conversationId: string,
    status:
      | "analyzing_image"
      | "analyzing_audio"
      | "image_analyzed"
      | "thinking"
      | "agent_step"
      | "done",
    result?: string,
    step?: {
      number: number;
      total: number;
      thought: string;
      action?: {
        tool: string;
        args: Record<string, unknown>;
      };
      observation?: string;
    },
  ): void {
    if (this.io) {
      console.log(
        `[AI:STATUS] Emitting status "${status}" for conversation ${conversationId}${step ? ` (step ${step.number}/${step.total})` : ''}`,
      );
      (
        this.io.to(`conversation:${conversationId}`) as unknown as {
          emit: (event: string, data: unknown) => void;
        }
      ).emit("ai:status", {
        conversationId,
        status,
        result,
        step,
      });
    }
  }

  private createAgentEventHandler(conversationId: string): (event: AgentEvent) => void {
    return (event: AgentEvent) => {
      switch (event.type) {
        case 'tool_start':
          this.emitAIStatus(conversationId, "agent_step", undefined, {
            number: event.iteration + 1,
            total: event.maxIterations,
            thought: `Calling ${event.toolName}`,
            action: { tool: event.toolName, args: event.args },
          });
          break;
        case 'tool_end':
          this.emitAIStatus(conversationId, "agent_step", undefined, {
            number: event.iteration + 1,
            total: event.maxIterations,
            thought: `Observed result from ${event.toolName}`,
            action: { tool: event.toolName, args: {} },
            observation: event.result.summary.substring(0, 500),
          });
          break;
        case 'tool_error':
          this.emitAIStatus(conversationId, "agent_step", undefined, {
            number: event.iteration + 1,
            total: event.maxIterations,
            thought: `Tool ${event.toolName} failed`,
            action: { tool: event.toolName, args: {} },
            observation: `Error: ${event.error}`,
          });
          break;
        case 'thinking':
          this.emitAIStatus(conversationId, "thinking", event.content);
          break;
      }
    };
  }

  /**
   * Send AI reply on WhatsApp: optional text plus native image messages for HTTPS image URLs.
   */
  private async sendWhatsAppAIContent(params: {
    conversationId: string;
    channel: {
      evolutionInstanceName: string;
      _id: { toString(): string };
    };
    senderId: string;
    aiResponseContent: string;
    citations: CreateMessageInput["citations"];
  }): Promise<void> {
    const {
      conversationId,
      channel,
      senderId,
      aiResponseContent,
      citations,
    } = params;

    const imageUrls = extractHttpsImageUrls(aiResponseContent);
    const textBody = scrubImageUrlsFromText(aiResponseContent, imageUrls);

    console.log(
      `[AI:SEND] Outbound: ${imageUrls.length} image URL(s), scrubbed text length=${textBody.length}`,
    );

    if (imageUrls.length === 0) {
      const evolutionMessageId = await messageService.sendViaWhatsApp(
        channel.evolutionInstanceName,
        senderId,
        aiResponseContent,
        "text",
      );
      const savedMessage = await messageService.create({
        conversationId,
        channelId: channel._id.toString(),
        sender: "ai",
        content: aiResponseContent,
        contentType: "text",
        evolutionMessageId: evolutionMessageId || undefined,
        aiGenerated: true,
        citations,
      });
      console.log(
        `[AI:SEND] WhatsApp text sent, evolutionMessageId: ${evolutionMessageId || "none"}`,
      );
      console.log(`[AI:SAVE] AI message saved to DB: ${savedMessage._id}`);
      return;
    }

    const evolutionTextId = await messageService.sendViaWhatsApp(
      channel.evolutionInstanceName,
      senderId,
      textBody,
      "text",
    );
    const savedText = await messageService.create({
      conversationId,
      channelId: channel._id.toString(),
      sender: "ai",
      content: textBody,
      contentType: "text",
      evolutionMessageId: evolutionTextId || undefined,
      aiGenerated: true,
      citations,
    });
    console.log(
      `[AI:SEND] WhatsApp text sent (URLs stripped for separate images), evolutionMessageId: ${evolutionTextId || "none"}`,
    );
    console.log(`[AI:SAVE] AI text message saved to DB: ${savedText._id}`);

    for (const url of imageUrls) {
      try {
        const { dataUrl, mime } = await fetchHttpsImageAsDataUrl(url);
        const fileName = fileNameForImageUrl(url, mime);
        const evolutionMessageId = await messageService.sendViaWhatsApp(
          channel.evolutionInstanceName,
          senderId,
          "[Image]",
          "image",
          dataUrl,
          fileName,
        );
        const savedImg = await messageService.create({
          conversationId,
          channelId: channel._id.toString(),
          sender: "ai",
          content: "[Image]",
          contentType: "image",
          mediaUrl: url,
          evolutionMessageId: evolutionMessageId || undefined,
          aiGenerated: true,
        });
        console.log(
          `[AI:SEND] WhatsApp image sent, evolutionMessageId: ${evolutionMessageId || "none"}`,
        );
        console.log(`[AI:SAVE] AI image message saved to DB: ${savedImg._id}`);
      } catch (e: unknown) {
        const detail =
          e instanceof FetchImageError
            ? `${e.code}: ${e.message}`
            : e instanceof Error
              ? e.message
              : String(e);
        console.warn(
          `[AI:SEND] Skipping image URL (${detail}): ${url.slice(0, 120)}`,
        );
      }
    }
  }

  /**
   * Fetch base64 media from Evolution API
   * WhatsApp media URLs are encrypted and require decryption via Evolution API
   */
  private async fetchMediaBase64(
    messageId: string,
    conversationId: string,
  ): Promise<{ base64: string; mimetype: string } | null> {
    try {
      // Find the message to get evolutionMessageId and channelId
      const message = await Message.findById(messageId);
      if (!message || !message.evolutionMessageId) {
        console.log(
          `[AI:Media] Message ${messageId} not found or has no evolutionMessageId`,
        );
        return null;
      }

      // Get the conversation to find the contact
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        console.log(`[AI:Media] Conversation ${conversationId} not found`);
        return null;
      }

      // Get the contact to find the phone number (remoteJid)
      const contact = await Contact.findById(conversation.contactId);
      if (!contact) {
        console.log(
          `[AI:Media] Contact not found for conversation ${conversationId}`,
        );
        return null;
      }

      // Get the channel to find the Evolution instance name
      const channel = await Channel.findById(message.channelId);
      if (!channel || !channel.evolutionInstanceName) {
        console.log(
          `[AI:Media] Channel not found or has no evolutionInstanceName`,
        );
        return null;
      }

      // Construct the remoteJid - prefer whatsappId (LID) for LID contacts
      const senderId = contact.whatsappId || contact.phoneNumber;
      if (!senderId) {
        console.log(`[AI:Media] Contact has no phone number or WhatsApp ID`);
        return null;
      }

      // If contact has whatsappId, it's a LID contact - use @lid suffix
      // Otherwise use @s.whatsapp.net for regular phone numbers
      const remoteJid = contact.whatsappId
        ? `${contact.whatsappId}@lid`
        : `${senderId}@s.whatsapp.net`;

      const requestPayload = {
        message: {
          key: {
            remoteJid,
            fromMe: false,
            id: message.evolutionMessageId,
          },
        },
      };

      console.log(
        `[AI:Media] Fetching base64 for message ${message.evolutionMessageId} from ${remoteJid}`,
      );
      console.log(
        `[AI:Media] Request payload:`,
        JSON.stringify(requestPayload, null, 2),
      );

      // Use Evolution API to get the base64 media (with 30s timeout)
      const evolutionClient = getEvolutionClient();
      const response = await evolutionClient.post(
        `/chat/getBase64FromMediaMessage/${channel.evolutionInstanceName}`,
        requestPayload,
        { timeout: 30000 },
      );

      console.log(
        `[AI:Media] Evolution API response status: ${response.status}`,
      );
      const { base64, mimetype } = response.data;

      if (!base64) {
        console.log(
          `[AI:Media] No base64 returned from Evolution API. Response data:`,
          JSON.stringify(response.data, null, 2),
        );
        return null;
      }

      console.log(
        `[AI:Media] Successfully fetched base64 (${base64.length} chars), mimetype: ${mimetype}`,
      );
      return { base64, mimetype: mimetype || "audio/ogg" };
    } catch (error: any) {
      console.error(`[AI:Media] Failed to fetch base64 from Evolution API`);
      console.error(`[AI:Media] Error status:`, error.response?.status);
      console.error(
        `[AI:Media] Error data:`,
        JSON.stringify(error.response?.data, null, 2),
      );
      console.error(`[AI:Media] Error message:`, error.message);
      return null;
    }
  }

  /**
   * Analyze media content (image/audio) using OpenRouter
   */
  private async analyzeMedia(
    contentType: "image" | "audio",
    mediaUrl: string,
    conversationId?: string,
    messageId?: string,
  ): Promise<string> {
    const startTime = Date.now();

    if (!openRouterConfig.apiKey) {
      aiLogger.logError({
        conversationId,
        error: "OpenRouter API key not configured",
        context: "analyzeMedia",
      });
      return "[Media analysis failed: API key missing]";
    }

    try {
      if (contentType === "image") {
        const model = openRouterConfig.models.vision;
        const prompt =
          "Describe this image in detail. If it is a sticker or a simple thank you image, mention that.";

        // Fetch the actual base64 media from Evolution API
        // WhatsApp media URLs are encrypted and can't be accessed directly
        let imageDataUrl = mediaUrl;

        if (messageId && conversationId) {
          const mediaData = await this.fetchMediaBase64(
            messageId,
            conversationId,
          );
          if (mediaData) {
            imageDataUrl = `data:${mediaData.mimetype};base64,${mediaData.base64}`;
            console.log(`[AI:Media] Using base64 data URL for image analysis`);
          } else {
            console.log(
              `[AI:Media] Failed to fetch base64, falling back to URL (may fail)`,
            );
          }
        }

        const content = [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ];
        const requestBody: any = {
          model,
          messages: [{ role: "user", content }],
        };

        console.log(
          `[AI:Media] Calling OpenRouter with model=${model}, contentType=${contentType}`,
        );

        const response = await axios.post(
          `${openRouterConfig.baseUrl}/chat/completions`,
          requestBody,
          {
            headers: {
              Authorization: `Bearer ${openRouterConfig.apiKey}`,
              "Content-Type": "application/json",
              ...openRouterHeaders("Foodflow AI"),
            },
          },
        );

        console.log(
          `[AI:Media] OpenRouter response status: ${response.status}`,
        );

        const result =
          response.data.choices[0].message.content ||
          "[No description generated]";
        const duration = Date.now() - startTime;

        aiLogger.logMediaAnalysis({
          conversationId,
          messageId,
          mediaType: contentType,
          mediaUrl,
          result,
          duration,
          model,
          modelSource: "O",
        });

        return result;
      }

      const prompt = `Transcribe this audio message accurately.
The speaker is most likely using Hong Kong Cantonese with a mix of english Terms (廣東話/spoken form).
IMPORTANT RULES:
- Output in Traditional Chinese characters (繁體字) only.
- Use natural spoken Cantonese vocabulary and grammar, NOT Mandarin.
- Use Cantonese-specific words: 唔係(not 不是), 咩(not 什麼), 嘅(not 的), 喺(not 在), 冇(not 沒有), 嗰個(not 那個), 而家(not 現在), 點解(not 為什麼), 做咩(not 做什麼), 係(not 是).
- Keep Cantonese particles: 啦, 喎, 囉, 咩, 呀, 嘛, 㗎, 喇, 吖.
- If the audio is clearly in English or Mandarin, transcribe in that language instead.
- Add punctuation. Keep filler words if audible.
- Return ONLY the transcription text, nothing else.`;

      // For audio, we MUST fetch base64 from Evolution API.
      // WhatsApp media URLs are encrypted and inaccessible to external services.
      let audioBase64: string | null = null;
      let audioMimetype = "audio/ogg";

      if (messageId && conversationId) {
        // Give WhatsApp/Evolution a moment to make the audio available
        console.log(
          `[AI:Media] Waiting 2s for audio to become available from WhatsApp servers...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Try up to 4 times with increasing delay (audio may take time to download/decrypt on WhatsApp servers)
        for (let attempt = 1; attempt <= 4; attempt++) {
          console.log(
            `[AI:Media] Attempt ${attempt}/4 to fetch base64 audio...`,
          );
          const mediaData = await this.fetchMediaBase64(
            messageId,
            conversationId,
          );
          if (mediaData) {
            audioBase64 = mediaData.base64;
            audioMimetype = normalizeAudioMimetype(
              mediaData.mimetype || "audio/ogg",
            );
            console.log(
              `[AI:Media] Got base64 audio on attempt ${attempt} (${audioMimetype}, ${audioBase64.length} chars)`,
            );
            break;
          }
          if (attempt < 4) {
            const delayMs = attempt * 3000; // 3s, 6s, 9s
            console.log(
              `[AI:Media] Attempt ${attempt} failed, retrying in ${delayMs}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          } else {
            console.error(
              `[AI:Media] All ${attempt} attempts failed to fetch audio base64`,
            );
          }
        }
      }

      if (!audioBase64) {
        console.error(
          `[AI:Media] All base64 fetch attempts failed for audio. Cannot transcribe.`,
        );
        return "[Audio transcription unavailable - could not retrieve audio data]";
      }

      const cleanBase64 = audioBase64.includes(",")
        ? audioBase64.split(",")[1]
        : audioBase64;
      const audioDataUrl = `data:${audioMimetype};base64,${cleanBase64}`;
      console.log(
        `[AI:Media] Sending audio as data URL (mimetype=${audioMimetype}, base64 length=${cleanBase64.length})`,
      );

      try {
        const transcription = await transcribeAudioWithFallback({
          audioDataUrl,
          audioMimetype,
          prompt,
          timeoutMs: 60_000,
          title: "Foodflow AI",
        });

        const duration = Date.now() - startTime;

        aiLogger.logInfo({
          conversationId,
          message: `Audio transcription fallback attempts: ${transcription.attempts.length}`,
          metadata: {
            messageId,
            attempts: transcription.attempts,
            selectedModel: transcription.model,
            selectedMethod: transcription.method,
          },
        });

        aiLogger.logMediaAnalysis({
          conversationId,
          messageId,
          mediaType: contentType,
          mediaUrl,
          result: transcription.text,
          duration,
          model: transcription.model,
          modelSource: "O",
        });

        return transcription.text;
      } catch (error: unknown) {
        const duration = Date.now() - startTime;
        const attempts =
          error instanceof AudioTranscriptionError ? error.attempts : [];
        const failureMessage = audioTranscriptionFailureMessage(attempts);

        aiLogger.logError({
          conversationId,
          error:
            error instanceof Error
              ? error
              : "Audio transcription fallback failed",
          context: "analyzeMedia (audio_fallback)",
          metadata: {
            duration,
            mediaUrl,
            messageId,
            attempts,
          },
        });

        return failureMessage;
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      aiLogger.logError({
        conversationId,
        error: error.response?.data?.error?.message || error.message,
        context: `analyzeMedia (${contentType})`,
        metadata: { duration, mediaUrl },
      });
      return `[Media analysis failed: ${error.message}]`;
    }
  }

  /**
   * Classify message as SIMPLE or COMPLEX
   */
  private async classifyMessage(
    content: string,
    conversationId?: string,
  ): Promise<"SIMPLE" | "COMPLEX"> {
    const startTime = Date.now();
    const model = aiChatProvider.model("fast");

    try {
      const response = await createChatCompletion({
        useCase: "fast",
        title: "Foodflow AI",
        messages: [
          {
            role: "system",
            content:
              "Classify the user message as 'SIMPLE' or 'COMPLEX'. \n'SIMPLE' includes: greetings (hi, hello), thank yous, stickers, emojis, or trivial confirmations. \n'COMPLEX' includes: questions, requests for information, complaints, or anything requiring a detailed answer. \nReply with ONLY the word 'SIMPLE' or 'COMPLEX'.",
          },
          { role: "user", content },
        ],
        maxTokens: 10,
      });

      const classification = response.choices[0].message.content
        ?.trim()
        .toUpperCase();
      const result = classification === "SIMPLE" ? "SIMPLE" : "COMPLEX";
      const duration = Date.now() - startTime;

      aiLogger.logClassification({
        conversationId,
        input: content,
        result,
        duration,
        model,
        modelSource: aiChatProvider.sourceSymbol(),
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      aiLogger.logError({
        conversationId,
        error: error.message,
        context: "classifyMessage",
        metadata: { duration },
      });
      return "COMPLEX"; // Default to complex to be safe
    }
  }

  /**
   * Generate a simple reply using a fast model.
   * Accepts an optional systemPrompt override to inject language/tone context.
   */
  private async generateSimpleReply(
    content: string,
    conversationId?: string,
    systemPrompt?: string,
  ): Promise<string> {
    const startTime = Date.now();
    const model = aiChatProvider.model("fast");

    const resolvedSystemPrompt =
      systemPrompt ||
      "You are a helpful customer support assistant. Provide a very brief, polite response to the user's simple message (greeting, thanks, etc.). Respond in the same language as the user. Reply in plain text only; do not use Markdown (no **, ###, ```, or bullet formatting).";

    try {
      const response = await createChatCompletion({
        useCase: "fast",
        title: "Foodflow AI",
        messages: [
          { role: "system", content: resolvedSystemPrompt },
          { role: "user", content },
        ],
      });

      const result =
        response.choices[0].message.content || "You're welcome!";
      const duration = Date.now() - startTime;
      const usage = response.usage;

      aiLogger.logSimpleReply({
        conversationId,
        input: content,
        output: result,
        duration,
        model,
        modelSource: aiChatProvider.sourceSymbol(),
        tokens: usage
          ? {
              input: usage.prompt_tokens,
              output: usage.completion_tokens,
              total: usage.total_tokens,
            }
          : undefined,
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      aiLogger.logError({
        conversationId,
        error: error.message,
        context: "generateSimpleReply",
        metadata: { duration },
      });
      return "You're welcome! How can I help you further?";
    }
  }

  /**
   * Build a system prompt from the assistant's language/tone/instructions.
   * Used as a fallback when Pinecone Assistant is unavailable.
   */
  private async buildAssistantSystemPrompt(assistantId: string): Promise<string> {
    try {
      const assistant = await Assistant.findById(assistantId);
      if (!assistant) return "You are a helpful customer support assistant. Respond in the same language as the user. Reply in plain text only.";

      const langLabels: Record<string, string> = {
        "zh-TW": "Traditional Chinese",
        "zh-CN": "Simplified Chinese",
        en: "English",
      };

      const parts: string[] = ["You are a helpful customer support assistant."];

      if (assistant.primaryLanguage && assistant.primaryLanguage !== "auto") {
        parts.push(`Respond in ${langLabels[assistant.primaryLanguage] || assistant.primaryLanguage}.`);
      } else {
        parts.push("Respond in the same language as the user.");
      }

      if (assistant.tone) {
        parts.push(`Use a ${assistant.tone} tone.`);
      }

      parts.push("Reply in plain text only. Do not use Markdown (no **, ###, ```, bullet lists, or other formatting).");

      if (assistant.instructions) {
        parts.push(assistant.instructions.substring(0, 2000));
      }

      return parts.join(" ");
    } catch {
      return "You are a helpful customer support assistant. Respond in the same language as the user. Reply in plain text only.";
    }
  }

  /**
   * Check if AI auto-reply should be triggered
   */
  async shouldAutoReply(conversationId: string): Promise<boolean> {
    const conversation =
      await Conversation.findById(conversationId).populate("channelId");
    if (!conversation) {
      aiLogger.logDecision({
        conversationId,
        decision: "NO_AUTO_REPLY",
        reason: "Conversation not found",
      });
      return false;
    }

    const channel = conversation.channelId as unknown as {
      _id: any;
      aiSettings: {
        enabled: boolean;
        autoReplyMode: "all" | "off" | "per_chat";
      };
      assistantId?: string;
    };

    // Check channel-level AI settings
    if (!channel?.aiSettings?.enabled) {
      aiLogger.logDecision({
        conversationId,
        channelId: channel?._id?.toString(),
        decision: "NO_AUTO_REPLY",
        reason: "Channel AI not enabled",
        metadata: { aiSettings: channel?.aiSettings },
      });
      return false;
    }

    if (!channel.assistantId) {
      aiLogger.logDecision({
        conversationId,
        channelId: channel?._id?.toString(),
        decision: "NO_AUTO_REPLY",
        reason: "No assistant ID configured",
      });
      return false;
    }

    // Check auto-reply mode
    let result = false;
    switch (channel.aiSettings.autoReplyMode) {
      case "off":
        result = false;
        break;
      case "all":
        result = true;
        break;
      case "per_chat":
        result = conversation.aiAutoReply;
        break;
      default:
        result = false;
    }

    aiLogger.logDecision({
      conversationId,
      channelId: channel?._id?.toString(),
      decision: result ? "AUTO_REPLY_ENABLED" : "AUTO_REPLY_DISABLED",
      reason: `Mode: ${channel.aiSettings.autoReplyMode}, Per-chat: ${conversation.aiAutoReply}`,
      metadata: {
        autoReplyMode: channel.aiSettings.autoReplyMode,
        conversationAiAutoReply: conversation.aiAutoReply,
        assistantId: channel.assistantId?.toString(),
      },
    });

    return result;
  }

  /**
   * Process incoming message and generate AI response
   */
  async processMessage(conversationId: string, message: any): Promise<void> {
    // Cancel any pending reminders the moment a user responds
    reminderService.cancelForConversation(conversationId).catch(() => {});

    const messageId = message._id.toString();
    const contentType = message.contentType;
    const content = message.content;
    const mediaUrl = message.mediaUrl;

    aiLogger.logInfo({
      conversationId,
      message: `Processing message ${messageId}`,
      metadata: {
        contentType,
        contentPreview: content?.substring(0, 50),
      },
    });

    // Enqueue the processing task to ensure sequential execution
    await this.queue.enqueue(conversationId, async () => {
      // Check if we should auto-reply
      const shouldReply = await this.shouldAutoReply(conversationId);
      if (!shouldReply) {
        return;
      }

      aiLogger.logInfo({
        conversationId,
        message: "Proceeding with AI response generation",
      });

      const conversation = await Conversation.findById(conversationId)
        .populate("channelId")
        .populate("contactId");

      if (!conversation) {
        return;
      }

      const channel = await Channel.findById(conversation.channelId);
      if (!channel || !channel.assistantId) {
        return;
      }

      const contact = await Contact.findById(conversation.contactId);
      if (!contact) {
        return;
      }

      try {
        // Set conversation as being handled by AI
        await conversationService.setAIHandling(conversationId, true);

        // Emit typing indicator
        if (this.io) {
          (
            this.io.to(`conversation:${conversationId}`) as unknown as {
              emit: (event: string, data: unknown) => void;
            }
          ).emit("ai:typing", {
            conversationId,
            isTyping: true,
          });
        }

        // 1. Analyze media if necessary
        let effectiveContent = content;
        let mediaDescription = "";
        if (contentType === "image" || contentType === "audio") {
          // Emit analyzing status based on content type
          this.emitAIStatus(
            conversationId,
            contentType === "audio" ? "analyzing_audio" : "analyzing_image",
          );

          const description = await this.analyzeMedia(
            contentType,
            mediaUrl,
            conversationId,
            messageId,
          );
          mediaDescription = description;

          // Update the message with the description
          await Message.findByIdAndUpdate(messageId, {
            mediaDescription: description,
          });

          // Emit image analyzed status with the result
          this.emitAIStatus(conversationId, "image_analyzed", description);

          // Build effective content with media description
          // Use clear text format so Pinecone understands this is a description, not an actual image
          if (contentType === "image") {
            const hasCaption = content && content !== "[Image]";
            const caption = hasCaption ? ` User's message: "${content}"` : "";
            effectiveContent = `The user shared an image.${caption} Image description: ${description}`;
            console.log(
              `[AI:CONTENT] Image with caption="${content}", hasCaption=${hasCaption}`,
            );
          } else {
            effectiveContent = `The user sent an audio message. Transcription: ${description}`;
          }
          console.log(
            `[AI:CONTENT] Effective content for Pinecone: ${effectiveContent.substring(0, 200)}...`,
          );
        }

        // Check for bad wording/profanity and use custom response if enabled
        const detectBadWording = channel.aiSettings.detectBadWording !== false; // Default to true
        const hasBadWording = this.detectBadWording(effectiveContent);

        let aiResponseContent = "";
        let citations: any[] = [];
        let classification: "SIMPLE" | "COMPLEX" = "COMPLEX";

        // Check for a pending agent session (clarification follow-up)
        const pendingSession = await AgentSession.findOne({
          conversationId,
          status: "awaiting_clarification",
        }).lean();

        if (pendingSession) {
          // Resume agent from saved session — skip classification
          aiLogger.logInfo({
            conversationId,
            message: "Resuming agent session from clarification",
          });
          this.emitAIStatus(conversationId, "thinking");

          const agentContext = await buildAgentContext(
            conversationId,
            channel._id.toString(),
            contact._id.toString(),
            channel.assistantId.toString(),
            {
              conversationId: pendingSession.conversationId.toString(),
              assistantId: pendingSession.assistantId.toString(),
              status: pendingSession.status,
              originalMessage: pendingSession.originalMessage,
              steps: pendingSession.steps as any,
              messages: pendingSession.messages as any,
              pendingClarification: pendingSession.pendingClarification,
              expiresAt: pendingSession.expiresAt,
            },
          );

          const onAgentEvent = this.createAgentEventHandler(conversationId);

          const clarificationStartTime = Date.now();
          const agentResult = await agentEngine.run(effectiveContent, agentContext, onAgentEvent);

          // Clean up old session
          await AgentSession.deleteOne({ _id: pendingSession._id });

          if (agentResult.type === "clarification" && agentResult.session) {
            await AgentSession.create(agentResult.session);
          }

          aiResponseContent = agentResult.content;
          citations = agentResult.citations || [];
          classification = "COMPLEX";

          const uResume = agentResult.usage;
          aiLogger.logComplexReply({
            conversationId,
            assistantId: channel.assistantId.toString(),
            input: effectiveContent,
            output: aiResponseContent,
            duration: Date.now() - clarificationStartTime,
            citations,
            model: agentResult.model,
            modelSource: aiChatProvider.sourceSymbol(),
            tokens: uResume
              ? {
                  input: uResume.prompt_tokens,
                  output: uResume.completion_tokens,
                  total: uResume.total_tokens,
                }
              : undefined,
          });
        } else if (detectBadWording && hasBadWording) {
          // Use custom bad wording response
          aiResponseContent =
            channel.aiSettings.badWordingResponse ||
            "We will help you as best as possible. Please let us know how we can assist you.";
          classification = "SIMPLE";

          aiLogger.logInfo({
            conversationId,
            message: "Bad wording detected, using custom response",
          });
        } else {
          // 2. Decision Layer: Classify message
          classification = await this.classifyMessage(
            effectiveContent,
            conversationId,
          );

          // Emit thinking status
          this.emitAIStatus(conversationId, "thinking");

          if (classification === "SIMPLE") {
            // 3a. Simple Reply — use assistant context so language/tone is correct
            const simpleSystemPrompt = await this.buildAssistantSystemPrompt(
              channel.assistantId.toString(),
            );
            aiResponseContent = await this.generateSimpleReply(
              effectiveContent,
              conversationId,
              simpleSystemPrompt,
            );
          } else {
            // 3b. Complex Reply — ReAct Agent Engine
            const complexStartTime = Date.now();

            if (channel.aiSettings.responseDelay > 0) {
              await delay(channel.aiSettings.responseDelay * 1000);
            }

            try {
              const agentContext = await buildAgentContext(
                conversationId,
                channel._id.toString(),
                contact._id.toString(),
                channel.assistantId.toString(),
              );

              const onAgentEvent = this.createAgentEventHandler(conversationId);

              const agentResult = await agentEngine.run(effectiveContent, agentContext, onAgentEvent);
              const complexDuration = Date.now() - complexStartTime;

              if (agentResult.type === "clarification" && agentResult.session) {
                // Agent needs clarification — save session and send the question
                await AgentSession.create(agentResult.session);
                aiResponseContent = agentResult.content;
              } else {
                aiResponseContent = agentResult.content;
                citations = agentResult.citations || [];
              }

              if (!aiResponseContent || !aiResponseContent.trim()) {
                console.warn("[AI:Agent] Agent returned empty response, using fallback");
                const fallbackSystemPrompt = await this.buildAssistantSystemPrompt(
                  channel.assistantId.toString(),
                );
                aiResponseContent = await this.generateSimpleReply(
                  effectiveContent,
                  conversationId,
                  fallbackSystemPrompt,
                );
              }

              const uAgent = agentResult.usage;
              aiLogger.logComplexReply({
                conversationId,
                assistantId: channel.assistantId.toString(),
                input: effectiveContent,
                output: aiResponseContent,
                duration: complexDuration,
                citations,
                model: agentResult.model,
                modelSource: aiChatProvider.sourceSymbol(),
                tokens: uAgent
                  ? {
                      input: uAgent.prompt_tokens,
                      output: uAgent.completion_tokens,
                      total: uAgent.total_tokens,
                    }
                  : undefined,
              });
            } catch (agentError: any) {
              console.error(
                "[AI:Agent] Agent engine failed, falling back to direct reply:",
                agentError.message,
              );
              aiLogger.logError({
                conversationId,
                error: agentError,
                context: "agentEngine_fallback",
              });
              try {
                const fallbackSystemPrompt = await this.buildAssistantSystemPrompt(
                  channel.assistantId.toString(),
                );
                aiResponseContent = await this.generateSimpleReply(
                  effectiveContent,
                  conversationId,
                  fallbackSystemPrompt,
                );
              } catch (fallbackError: any) {
                console.error(
                  "[AI:Agent] Direct reply fallback also failed:",
                  fallbackError.message,
                );
                aiResponseContent =
                  "Thank you for your message. We've received it and will get back to you shortly.";
              }
            }
          }
        }

        // Emit done status
        this.emitAIStatus(conversationId, "done");

        // Stop typing indicator
        if (this.io) {
          (
            this.io.to(`conversation:${conversationId}`) as unknown as {
              emit: (event: string, data: unknown) => void;
            }
          ).emit("ai:typing", {
            conversationId,
            isTyping: false,
          });
        }

        // Analyze sentiment from effective content
        const sentiment = this.analyzeSentiment(effectiveContent);

        // Update AI signals
        await conversationService.updateAISignals(conversationId, {
          confidence: classification === "SIMPLE" ? 0.95 : 0.85,
          sentiment,
          priority: sentiment === "negative" ? 7 : 3,
        });

        // Flag SLA risk on negative sentiment, but do NOT stop AI response.
        // AI continues responding until the per-chat AI toggle is explicitly switched off.
        if (
          sentiment === "negative" &&
          channel.aiSettings.escalateOnNegativeSentiment
        ) {
          await conversationService.updateAISignals(conversationId, {
            slaRisk: true,
            priority: 8,
          });
        }

        const contactFresh = await Contact.findById(contact._id)
          .select("phoneNumber whatsappId")
          .lean();
        const sendTarget = contactFresh ?? {
          phoneNumber: contact.phoneNumber,
          whatsappId: contact.whatsappId,
        };
        const senderId = recipientJidForEvolutionSend(sendTarget);
        if (!senderId) {
          aiLogger.logError({
            conversationId,
            error: "Contact has no phone number or WhatsApp ID",
            context: "processMessage",
          });
          await conversationService.setAIHandling(conversationId, false);
          return;
        }

        console.log(
          `[AI:SEND] contact=${contact._id} phoneNumber=${JSON.stringify(sendTarget.phoneNumber)} whatsappId=${JSON.stringify(sendTarget.whatsappId)} -> ${senderId}`,
        );
        console.log(
          `[AI:SEND] Sending AI response via WhatsApp to ${senderId}`,
        );
        await this.sendWhatsAppAIContent({
          conversationId,
          channel,
          senderId,
          aiResponseContent,
          citations,
        });

        // Update conversation
        await conversationService.setAIHandling(conversationId, false);
        console.log(
          `[AI:DONE] AI response flow completed for conversation ${conversationId}`,
        );
      } catch (error: any) {
        aiLogger.logError({
          conversationId,
          error: error,
          context: "processMessage",
        });

        // Stop typing indicator on error
        if (this.io) {
          (
            this.io.to(`conversation:${conversationId}`) as unknown as {
              emit: (event: string, data: unknown) => void;
            }
          ).emit("ai:typing", {
            conversationId,
            isTyping: false,
          });
        }

        await conversationService.setAIHandling(conversationId, false);
      }
    });
  }

  /**
   * Simple sentiment analysis (can be enhanced with ML)
   */
  private analyzeSentiment(text: string): "positive" | "neutral" | "negative" {
    const lowerText = text.toLowerCase();

    const negativeWords = [
      "angry",
      "frustrated",
      "terrible",
      "awful",
      "horrible",
      "worst",
      "hate",
      "disappointed",
      "unacceptable",
      "ridiculous",
      "stupid",
      "never",
      "problem",
      "issue",
      "bug",
      "broken",
      "not working",
      "cancel",
      "refund",
      "complaint",
      "unhappy",
      "upset",
      "annoyed",
      // Profanity and strong negative language
      "fuck",
      "fucking",
      "shit",
      "damn",
      "hell",
      "crap",
      "ass",
      "bitch",
      "bastard",
      "piss",
      "pissed",
    ];

    const positiveWords = [
      "thank",
      "thanks",
      "great",
      "awesome",
      "excellent",
      "amazing",
      "love",
      "wonderful",
      "perfect",
      "happy",
      "pleased",
      "satisfied",
      "helpful",
      "appreciate",
      "good",
      "best",
      "fantastic",
    ];

    let positiveScore = 0;
    let negativeScore = 0;

    for (const word of negativeWords) {
      if (lowerText.includes(word)) {
        negativeScore++;
      }
    }

    for (const word of positiveWords) {
      if (lowerText.includes(word)) {
        positiveScore++;
      }
    }

    // Strong negative words (profanity) trigger negative sentiment immediately
    const strongNegativeWords = [
      "fuck",
      "fucking",
      "shit",
      "damn",
      "hell",
      "crap",
      "ass",
      "bitch",
      "bastard",
      "piss",
      "pissed",
    ];
    const hasStrongNegative = strongNegativeWords.some((word) =>
      lowerText.includes(word),
    );

    if (
      hasStrongNegative ||
      (negativeScore > positiveScore && negativeScore >= 1)
    ) {
      return "negative";
    }

    if (positiveScore > negativeScore && positiveScore >= 1) {
      return "positive";
    }

    return "neutral";
  }

  /**
   * Detect bad wording/profanity in message (multi-language support)
   */
  private detectBadWording(text: string): boolean {
    const lowerText = text.toLowerCase();

    // English profanity
    const englishProfanity = [
      "fuck",
      "fucking",
      "fucked",
      "fucker",
      "shit",
      "shitting",
      "shitted",
      "damn",
      "damned",
      "dammit",
      "hell",
      "crap",
      "ass",
      "asshole",
      "bitch",
      "bastard",
      "piss",
      "pissed",
      "cunt",
      "dick",
      "cock",
      "pussy",
      "motherfucker",
      "motherfucking",
    ];

    // Chinese/Cantonese profanity (common ones)
    const chineseProfanity = [
      "屌",
      "屌你",
      "屌你老母",
      "屌你媽",
      "屌你媽咪",
      "操",
      "操你",
      "操你媽",
      "操你媽的",
      "死",
      "死開",
      "死仆街",
      "死全家",
      "冚家",
      "冚家鏟",
      "冚家富貴",
      "廢物",
      "廢柴",
      "垃圾",
      "白癡",
      "智障",
      "弱智",
    ];

    // Check English profanity
    for (const word of englishProfanity) {
      if (lowerText.includes(word)) {
        return true;
      }
    }

    // Check Chinese/Cantonese profanity (exact match in original text)
    for (const word of chineseProfanity) {
      if (text.includes(word)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate subject from first message
   */
  generateSubject(content: string): string {
    // Take first 50 characters or first sentence
    const firstSentence = content.split(/[.!?]/)[0];
    const subject = firstSentence.slice(0, 50);
    return subject + (firstSentence.length > 50 ? "..." : "");
  }
}

export const aiService = new AIService();
