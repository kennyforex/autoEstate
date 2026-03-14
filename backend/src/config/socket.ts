import { Server } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "../types/index.js";

export function initializeSocket(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
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
    socket.on("message:read", (messageId: string) => {
      // This will be handled by the message service
      console.log(`👁️ Message ${messageId} marked as read by ${socket.id}`);
    });

    socket.on("disconnect", () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  console.log("✅ Socket.IO handlers initialized");
}

// Helper function to emit events
export function emitToConversation(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  conversationId: string,
  event: string,
  data: unknown,
): void {
  // Use type assertion for dynamic event emission
  (
    io.to(`conversation:${conversationId}`) as {
      emit: (event: string, data: unknown) => void;
    }
  ).emit(event, data);
}

export function emitToAll(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  event: string,
  data: unknown,
): void {
  // Use type assertion for dynamic event emission
  (io as unknown as { emit: (event: string, data: unknown) => void }).emit(
    event,
    data,
  );
}
