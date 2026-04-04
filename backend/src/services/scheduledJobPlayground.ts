import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../types/index.js";

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

/**
 * Must be called after Socket.IO is created (same pattern as skill schedule).
 */
export function initScheduledJobPlaygroundIo(
  server: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  io = server;
}

/**
 * Push scheduled-job result into Assistant Playground chat (no WhatsApp / Evolution).
 */
export function emitScheduledJobResultToPlayground(
  assistantId: string,
  jobName: string,
  summary: string,
): { ok: boolean; detail: string } {
  if (!io) {
    return {
      ok: false,
      detail: "Socket.IO not initialized (server misconfiguration).",
    };
  }
  const room = `playground:${assistantId}`;
  const subscribers = io.sockets.adapter.rooms.get(room)?.size ?? 0;
  const content = `[Scheduled job: ${jobName}]\n\n${summary}`;
  io.to(room).emit("playground:message", {
    assistantId,
    content,
    skillSlug: "scheduled-job",
    kind: "scheduled_test",
    ts: Date.now(),
  });
  if (subscribers === 0) {
    return {
      ok: true,
      detail:
        "playground (no active Playground tab for this assistant — open AI Team → Playground to receive live pushes)",
    };
  }
  return { ok: true, detail: "playground" };
}
