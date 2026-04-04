import cron from "node-cron";
import { ScheduledJob } from "../models/ScheduledJob.js";
import {
  getEffectiveCronExpression,
  computeNextRunAt,
} from "./scheduledJob.service.js";
import { runScheduledJob } from "./scheduledJob.runner.js";

const cronTasks: ReturnType<typeof cron.schedule>[] = [];

function clearTasks(): void {
  for (const c of cronTasks) {
    c.stop();
  }
  cronTasks.length = 0;
}

/**
 * Register in-process cron when SCHEDULED_JOBS_ENABLED=true (default true if unset for dev).
 */
export function initScheduledJobScheduler(): void {
  clearTasks();

  const enabled =
    process.env.SCHEDULED_JOBS_ENABLED !== "false" &&
    process.env.SCHEDULED_JOBS_ENABLED !== "0";
  if (!enabled) {
    console.log(
      "[ScheduledJob] Scheduler off (set SCHEDULED_JOBS_ENABLED=true to enable)",
    );
    return;
  }

  reloadScheduledJobSchedules().catch((e: unknown) =>
    console.error(
      "[ScheduledJob] Initial load failed:",
      e instanceof Error ? e.message : e,
    ),
  );
}

export async function reloadScheduledJobSchedules(): Promise<void> {
  clearTasks();

  const enabled =
    process.env.SCHEDULED_JOBS_ENABLED !== "false" &&
    process.env.SCHEDULED_JOBS_ENABLED !== "0";
  if (!enabled) return;

  const jobs = await ScheduledJob.find({ enabled: true }).exec();
  for (const job of jobs) {
    const expr = getEffectiveCronExpression(job);
    if (!cron.validate(expr)) {
      console.warn(
        `[ScheduledJob] Invalid cron for job ${job.name} (${job._id}): "${expr}" — skip`,
      );
      continue;
    }
    const tz = (job.timezone || "UTC").trim();
    job.nextRunAt = computeNextRunAt(expr, tz);
    await job.save();

    const id = job._id.toString();
    const task = cron.schedule(
      expr,
      () => {
        void runScheduledJob(id, "schedule").catch((e: unknown) =>
          console.error(
            `[ScheduledJob] Run failed for ${id}:`,
            e instanceof Error ? e.message : e,
          ),
        );
      },
      { timezone: tz },
    );
    cronTasks.push(task);
    console.log(
      `[ScheduledJob] Registered "${expr}" (${tz}) → job ${job.name} (${id})`,
    );
  }
}
