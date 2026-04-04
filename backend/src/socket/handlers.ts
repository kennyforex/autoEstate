import { Server } from "socket.io";
import { messageService } from "../services/message.service.js";
import { conversationService } from "../services/conversation.service.js";
import { webhookService } from "../services/webhook.service.js";
import { aiService } from "../services/ai.service.js";
import { reminderService } from "../services/reminder.service.js";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "../types/index.js";

/**
 * Initialize all socket handlers and service connections
 */
export function initializeSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  // Set IO instance on all services that need it
  messageService.setIO(io);
  conversationService.setIO(io);
  webhookService.setIO(io);
  aiService.setIO(io);
  reminderService.setIO(io);

  // Restore pending reminders from DB
  reminderService.loadPendingOnBoot().catch(err =>
    console.error('[Reminder] Failed to load pending reminders on boot:', err.message),
  );

  // Set AI reply handler on webhook service
  webhookService.setAIReplyHandler(
    async (conversationId: string, message: any) => {
      await aiService.processMessage(conversationId, message);
    },
  );

  io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Subscribe to conversation updates
    socket.on("conversation:subscribe", (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
      console.log(
        `📥 Client ${socket.id} subscribed to conversation ${conversationId}`,
      );
    });

    // Unsubscribe from conversation updates
    socket.on("conversation:unsubscribe", (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(
        `📤 Client ${socket.id} unsubscribed from conversation ${conversationId}`,
      );
    });

    // Handle message read
    socket.on("message:read", async (messageId: string) => {
      try {
        await messageService.markAsRead(messageId);
        console.log(`👁️ Message ${messageId} marked as read by ${socket.id}`);
      } catch (error) {
        console.error("Error marking message as read:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });

    socket.on("playground:subscribe", (assistantId: string) => {
      const id = typeof assistantId === "string" ? assistantId.trim() : "";
      if (!id) return;
      socket.join(`playground:${id}`);
      console.log(`🎮 Client ${socket.id} subscribed to playground:${id}`);
    });

    socket.on("playground:unsubscribe", (assistantId: string) => {
      const id = typeof assistantId === "string" ? assistantId.trim() : "";
      if (!id) return;
      socket.leave(`playground:${id}`);
      console.log(`🎮 Client ${socket.id} left playground:${id}`);
    });
  });

  console.log("✅ Socket.IO handlers initialized");
}

/**
 * Emit event to specific conversation room
 */
export function emitToConversation<K extends keyof ServerToClientEvents>(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  conversationId: string,
  event: K,
  ...args: Parameters<ServerToClientEvents[K]>
): void {
  io.to(`conversation:${conversationId}`).emit(event, ...args);
}

/**
 * Emit event to all connected clients
 */
export function emitToAll<K extends keyof ServerToClientEvents>(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  event: K,
  ...args: Parameters<ServerToClientEvents[K]>
): void {
  io.emit(event, ...args);
}
