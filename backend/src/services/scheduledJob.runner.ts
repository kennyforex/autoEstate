import mongoose from "mongoose";
import { agentEngine, buildPlaygroundContext } from "../agent/index.js";
import { Assistant } from "../models/Assistant.js";
import type { IScheduledJobDocument } from "../models/ScheduledJob.js";
import { ScheduledJob } from "../models/ScheduledJob.js";
import { ScheduledJobRun } from "../models/ScheduledJobRun.js";
import { messageService } from "./message.service.js";
import { emitScheduledJobResultToPlayground } from "./scheduledJobPlayground.js";
import {
  computeNextRunAt,
  getEffectiveCronExpression,
  resolveChannelForJob,
} from "./scheduledJob.service.js";

const SNIP = 1200;
const runningMutex = new Set<string>();

function trimSummary(text: string): string {
  const t = text.trim();
  if (t.length <= SNIP) return t;
  return `${t.slice(0, SNIP)}…`;
}

export interface RunScheduledJobOptions {
  ifDue?: boolean;
}

/**
 * If ifDue is true, skip when the job is not "due" yet (roughly nextRunAt in the past or within 1 min).
 */
function isDue(job: IScheduledJobDocument): boolean {
  if (!job.nextRunAt) return true;
  const now = Date.now();
  return job.nextRunAt.getTime() <= now + 60_000;
}

export async function runScheduledJob(
  jobId: string,
  trigger: "manual" | "schedule" | "wake_on_save",
  options?: RunScheduledJobOptions,
): Promise<{ ok: boolean; runId?: string; error?: string; skipped?: boolean }> {
  const job = await ScheduledJob.findById(jobId);
  if (!job) {
    return { ok: false, error: "Job not found" };
  }
  if (!job.enabled && trigger === "schedule") {
    return { ok: true, skipped: true };
  }

  if (runningMutex.has(jobId)) {
    return { ok: false, error: "Job is already running", skipped: true };
  }

  if (options?.ifDue && trigger !== "manual" && !isDue(job)) {
    return { ok: true, skipped: true };
  }

  runningMutex.add(jobId);

  const run = await ScheduledJobRun.create({
    jobId: job._id,
    trigger,
    startedAt: new Date(),
    status: "running",
  });
  const runId = run._id.toString();

  try {
    const assistant = await Assistant.findById(job.assistantId);
    if (!assistant) {
      throw new Error("Assistant not found");
    }

    const controller = new AbortController();
    const timeoutSec = job.timeoutSeconds;
    let to: ReturnType<typeof setTimeout> | undefined;
    if (timeoutSec && timeoutSec > 0) {
      to = setTimeout(() => controller.abort(), timeoutSec * 1000);
    }

    const context = await buildPlaygroundContext(
      job.assistantId.toString(),
      [],
    );

    const result = await agentEngine.run(
      job.taskPrompt,
      context,
      undefined,
      controller.signal,
    );
    if (to) clearTimeout(to);

    const content = result.content || "";
    const summary = trimSummary(content);

    let deliveryStatus: "sent" | "skipped" | "failed" | undefined;
    let deliveryDetail: string | undefined;

    if (job.resultDelivery === "announce") {
      if (job.channelSelection === "playground") {
        const pg = emitScheduledJobResultToPlayground(
          job.assistantId.toString(),
          job.name,
          summary,
        );
        deliveryStatus = pg.ok ? "sent" : "failed";
        deliveryDetail = pg.detail;
      } else {
        const channel = await resolveChannelForJob(job);
        if (!channel) {
          deliveryStatus = "failed";
          deliveryDetail =
            "No WhatsApp channel (bind a channel to this assistant or pick a specific channel).";
        } else {
          const recipient =
            (job.recipientOverride || "").trim() ||
            (channel.phoneNumber || "").trim();
          if (!recipient) {
            deliveryStatus = "failed";
            deliveryDetail =
              "No recipient: set To override or ensure the channel has phoneNumber.";
          } else {
            try {
              const mid = await messageService.sendViaWhatsApp(
                channel.evolutionInstanceName,
                recipient,
                summary,
                "text",
              );
              deliveryStatus = "sent";
              deliveryDetail = mid ? `evolution:${mid}` : "sent";
            } catch (e: unknown) {
              deliveryStatus = "failed";
              deliveryDetail =
                e instanceof Error ? e.message : String(e);
            }
          }
        }
      }
    } else {
      deliveryStatus = "skipped";
      deliveryDetail = "resultDelivery is none";
    }

    run.status = "success";
    run.finishedAt = new Date();
    run.summarySnippet = summary;
    run.deliveryStatus = deliveryStatus;
    run.deliveryDetail = deliveryDetail;
    await run.save();

    job.lastRunAt = run.finishedAt;
    job.lastStatus = run.status;
    const expr = getEffectiveCronExpression(job);
    job.nextRunAt = computeNextRunAt(expr, (job.timezone || "UTC").trim());
    await job.save();

    return { ok: true, runId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    run.status = "failed";
    run.finishedAt = new Date();
    run.error = msg;
    await run.save();

    job.lastRunAt = run.finishedAt;
    job.lastStatus = "failed";
    await job.save();

    return { ok: false, runId, error: msg };
  } finally {
    runningMutex.delete(jobId);
  }
}

export async function runScheduledJobByUser(
  jobId: string,
  userId: string,
  trigger: "manual" | "schedule" | "wake_on_save",
  options?: RunScheduledJobOptions,
) {
  const job = await ScheduledJob.findOne({
    _id: new mongoose.Types.ObjectId(jobId),
    createdBy: userId,
  });
  if (!job) {
    return { ok: false as const, error: "Job not found" };
  }
  return runScheduledJob(jobId, trigger, options);
}
