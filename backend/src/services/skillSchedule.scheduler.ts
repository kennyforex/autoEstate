import type { Server } from "socket.io";
import cron from "node-cron";
import { Skill } from "../models/Skill.js";
import { Assistant } from "../models/Assistant.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../types/index.js";

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;
/** Retained for reloadSkillSchedules without importing app (avoids circular deps). */
let ioRef: Server<ClientToServerEvents, ServerToClientEvents> | null = null;
const intervals: NodeJS.Timeout[] = [];
const cronTasks: ReturnType<typeof cron.schedule>[] = [];

function clearTimers(): void {
  for (const t of intervals) {
    clearInterval(t);
  }
  intervals.length = 0;
  for (const c of cronTasks) {
    c.stop();
  }
  cronTasks.length = 0;
}

function emitPlaygroundMessage(
  assistantId: string,
  content: string,
  skillSlug: string,
): void {
  if (!io) return;
  const room = `playground:${assistantId}`;
  const size = io.sockets.adapter.rooms.get(room)?.size ?? 0;
  if (size === 0) {
    if (process.env.SKILL_SCHEDULE_DEBUG === "true") {
      console.log(
        `[SkillSchedule] Skip push — no browser in ${room}. Open Assistant Playground for this assistant (logged in, socket connected).`,
      );
    }
    return;
  }
  io.to(room).emit("playground:message", {
    assistantId,
    content,
    skillSlug,
    kind: "scheduled_test" as const,
    ts: Date.now(),
  });
}

/**
 * Dev/test: fixed interval + assistant id from env (no LLM — socket push only).
 */
function startEnvTestMode(): boolean {
  const rawMs = process.env.SKILL_SCHEDULE_TEST_INTERVAL_MS?.trim();
  const assistantId = process.env.PLAYGROUND_SCHEDULE_TEST_ASSISTANT_ID?.trim();
  const skillSlug =
    process.env.PLAYGROUND_SCHEDULE_TEST_SKILL_SLUG?.trim() || "hello-cron-test";
  if (!rawMs || !assistantId) return false;

  const ms = parseInt(rawMs, 10);
  if (!Number.isFinite(ms) || ms < 1000) {
    console.warn(
      "[SkillSchedule] SKILL_SCHEDULE_TEST_INTERVAL_MS invalid; need >= 1000",
    );
    return false;
  }

  const id = setInterval(() => {
    emitPlaygroundMessage(
      assistantId,
      "Hello from scheduled skill (test)",
      skillSlug,
    );
  }, ms);
  intervals.push(id);
  console.log(
    `[SkillSchedule] Test interval every ${ms}ms → playground:${assistantId} (skill ${skillSlug})`,
  );
  return true;
}

async function startDbSchedules(): Promise<void> {
  const skills = await Skill.find({
    scheduleEnabled: true,
    status: "active",
  }).lean();

  if (skills.length === 0) {
    console.warn(
      "[SkillSchedule] No skills with scheduleEnabled=true. Edit the skill in Skill Library → Basic → Scheduled Playground ping, save, restart; or use env test vars (see log above).",
    );
    return;
  }

  for (const s of skills) {
    const doc = s as {
      _id: { toString(): string };
      slug: string;
      scheduleCron?: string;
    };
    const expr = (doc.scheduleCron || "").trim() || "0 * * * *";
    if (!cron.validate(expr)) {
      console.warn(
        `[SkillSchedule] Invalid scheduleCron for ${doc.slug}: "${expr}" — skip`,
      );
      continue;
    }

    const assistants = await Assistant.find({
      $or: [{ skills: doc._id }, { "staff.skillIds": doc._id }],
    })
      .select("_id")
      .lean();

    if (assistants.length === 0) {
      console.warn(
        `[SkillSchedule] Skill "${doc.slug}" has schedule on but is not bound to any assistant — bind it in the org chart, then restart.`,
      );
      continue;
    }

    for (const a of assistants) {
      const assistantId = (a as { _id: { toString(): string } })._id.toString();
      const task = cron.schedule(expr, () => {
        emitPlaygroundMessage(
          assistantId,
          `Scheduled ping (${doc.slug})`,
          doc.slug,
        );
      });
      cronTasks.push(task);
      console.log(
        `[SkillSchedule] Cron "${expr}" → playground:${assistantId} (${doc.slug})`,
      );
    }
  }
}

/**
 * Call from `server.listen` after Socket.IO is created. Pass the same `io` instance.
 */
export function initSkillScheduleScheduler(
  server: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  ioRef = server;
  io = server;
  clearTimers();

  if (process.env.SKILL_SCHEDULE_ENABLED !== "true") {
    console.log(
      "[SkillSchedule] Off (set SKILL_SCHEDULE_ENABLED=true to enable)",
    );
    return;
  }

  if (startEnvTestMode()) {
    return;
  }

  console.log(
    "[SkillSchedule] Env test mode not active. Add both SKILL_SCHEDULE_TEST_INTERVAL_MS (e.g. 15000) and PLAYGROUND_SCHEDULE_TEST_ASSISTANT_ID (Assistant _id from Playground URL), then restart. Otherwise skills need scheduleEnabled + scheduleCron in Skill Library.",
  );

  startDbSchedules().catch((e: unknown) =>
    console.error(
      "[SkillSchedule] DB schedules failed:",
      e instanceof Error ? e.message : e,
    ),
  );
}

export function reloadSkillSchedules(): void {
  if (process.env.SKILL_SCHEDULE_ENABLED !== "true") return;
  if (!ioRef) return;
  io = ioRef;
  clearTimers();
  if (startEnvTestMode()) return;
  startDbSchedules().catch((e: unknown) =>
    console.error(
      "[SkillSchedule] reload failed:",
      e instanceof Error ? e.message : e,
    ),
  );
}
