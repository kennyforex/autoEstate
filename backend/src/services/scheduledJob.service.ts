import type { Document } from "mongoose";
import { CronExpressionParser } from "cron-parser";
import { Channel } from "../models/Channel.js";
import {
  ScheduledJob,
  type IScheduledJobDocument,
} from "../models/ScheduledJob.js";
import { ScheduledJobRun } from "../models/ScheduledJobRun.js";

export function getEffectiveCronExpression(
  job: Pick<
    IScheduledJobDocument,
    "scheduleKind" | "intervalMinutes" | "cronExpression"
  >,
): string {
  if (job.scheduleKind === "interval") {
    const m = job.intervalMinutes ?? 30;
    const n = Math.min(59, Math.max(1, Math.floor(m)));
    return `*/${n} * * * *`;
  }
  const c = (job.cronExpression || "").trim();
  return c || "0 * * * *";
}

/** cron-parser v5 expects 6 fields (incl. seconds); node-cron uses 5 — prepend second field. */
function normalizeCronExpr(expr: string): string {
  const t = expr.trim();
  const n = t.split(/\s+/).length;
  if (n === 5) return `0 ${t}`;
  return t;
}

export function computeNextRunAt(expr: string, tz: string): Date | undefined {
  try {
    const normalized = normalizeCronExpr(expr);
    const parsed = CronExpressionParser.parse(normalized, {
      tz: tz?.trim() || "UTC",
    });
    return parsed.next().toDate();
  } catch {
    return undefined;
  }
}

export async function refreshJobNextRunAt(
  job: Document & IScheduledJobDocument,
): Promise<void> {
  if (!job.enabled) {
    job.nextRunAt = undefined;
    return;
  }
  const expr = getEffectiveCronExpression(job);
  const tz = (job.timezone || "UTC").trim();
  job.nextRunAt = computeNextRunAt(expr, tz);
}

export interface ListJobsFilters {
  userId: string;
  assistantId?: string;
  enabled?: boolean;
  search?: string;
}

export async function listJobs(filters: ListJobsFilters) {
  const q: Record<string, unknown> = { createdBy: filters.userId };
  if (filters.assistantId) {
    q.assistantId = filters.assistantId;
  }
  if (filters.enabled !== undefined) {
    q.enabled = filters.enabled;
  }
  if (filters.search?.trim()) {
    const rx = new RegExp(
      filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    q.$or = [{ name: rx }, { description: rx }];
  }
  return ScheduledJob.find(q).sort({ updatedAt: -1 }).lean();
}

export async function getJobForUser(jobId: string, userId: string) {
  return ScheduledJob.findOne({
    _id: jobId,
    createdBy: userId,
  });
}

export async function listRuns(
  jobId: string,
  userId: string,
  opts?: { limit?: number; offset?: number },
) {
  const job = await getJobForUser(jobId, userId);
  if (!job) return null;
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  const [runs, total] = await Promise.all([
    ScheduledJobRun.find({ jobId: job._id })
      .sort({ startedAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    ScheduledJobRun.countDocuments({ jobId: job._id }),
  ]);
  return { runs, total };
}

/**
 * Resolve WhatsApp channel for delivery. "last" = most recently updated channel for assistant.
 */
export async function resolveChannelForJob(job: IScheduledJobDocument) {
  const assistantId = job.assistantId;
  if (job.channelSelection === "specific" && job.channelId) {
    const ch = await Channel.findOne({
      _id: job.channelId,
      assistantId,
    }).lean();
    return ch;
  }
  const last = await Channel.find({ assistantId })
    .sort({ updatedAt: -1 })
    .limit(1)
    .lean();
  return last[0] ?? null;
}

export function statsForUserJobs(jobs: Array<{ enabled: boolean; nextRunAt?: Date }>) {
  const enabledCount = jobs.filter((j) => j.enabled).length;
  let minNext: Date | undefined;
  for (const j of jobs) {
    if (!j.enabled || !j.nextRunAt) continue;
    if (!minNext || j.nextRunAt < minNext) minNext = j.nextRunAt;
  }
  return {
    enabledCount,
    total: jobs.length,
    nextWakeAt: minNext,
  };
}
