import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../types/index.js";
import { ScheduledJob } from "../models/ScheduledJob.js";
import {
  listJobs,
  getJobForUser,
  listRuns,
  statsForUserJobs,
  refreshJobNextRunAt,
} from "../services/scheduledJob.service.js";
import { reloadScheduledJobSchedules } from "../services/scheduledJob.scheduler.js";
import {
  runScheduledJobByUser,
  runScheduledJob,
} from "../services/scheduledJob.runner.js";

export async function listScheduledJobs(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const assistantId = req.query.assistantId as string | undefined;
    const enabled =
      req.query.enabled === "true"
        ? true
        : req.query.enabled === "false"
          ? false
          : undefined;
    const search = req.query.search as string | undefined;
    const jobs = await listJobs({
      userId,
      assistantId,
      enabled,
      search,
    });
    const stats = statsForUserJobs(
      jobs as Array<{ enabled: boolean; nextRunAt?: Date }>,
    );
    res.json({ jobs, stats });
  } catch (e) {
    next(e);
  }
}

export async function getScheduledJob(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const job = await getJobForUser(req.params.id, userId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ job });
  } catch (e) {
    next(e);
  }
}

export async function createScheduledJob(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const job = await ScheduledJob.create({
      name: body.name,
      description: body.description ?? "",
      enabled: body.enabled !== false,
      assistantId: body.assistantId,
      scheduleKind: body.scheduleKind ?? "interval",
      intervalMinutes: body.intervalMinutes ?? 30,
      cronExpression: body.cronExpression ?? "",
      timezone: body.timezone ?? "Asia/Hong_Kong",
      sessionMode: body.sessionMode ?? "isolated",
      wakeMode: body.wakeMode ?? "next_heartbeat",
      taskPrompt: body.taskPrompt,
      timeoutSeconds: body.timeoutSeconds,
      resultDelivery: body.resultDelivery ?? "announce",
      channelSelection: body.channelSelection ?? "last",
      channelId: body.channelId || undefined,
      recipientOverride: body.recipientOverride || undefined,
      createdBy: userId,
    });
    await refreshJobNextRunAt(job);
    await job.save();
    await reloadScheduledJobSchedules();

    const wake = job.wakeMode === "now";
    if (wake) {
      void runScheduledJob(job._id.toString(), "wake_on_save").catch(
        console.error,
      );
    }

    res.status(201).json({ job });
  } catch (e) {
    next(e);
  }
}

export async function updateScheduledJob(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const job = await getJobForUser(req.params.id, userId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const fields = [
      "name",
      "description",
      "enabled",
      "assistantId",
      "scheduleKind",
      "intervalMinutes",
      "cronExpression",
      "timezone",
      "sessionMode",
      "wakeMode",
      "taskPrompt",
      "timeoutSeconds",
      "resultDelivery",
      "channelSelection",
      "channelId",
      "recipientOverride",
    ] as const;
    for (const f of fields) {
      if (body[f] !== undefined) {
        (job as unknown as Record<string, unknown>)[f] = body[f];
      }
    }
    if (body.channelSelection === "last" || body.channelSelection === "playground") {
      job.set("channelId", undefined);
    }
    await refreshJobNextRunAt(job);
    await job.save();
    await reloadScheduledJobSchedules();

    if (body.wakeMode === "now") {
      void runScheduledJob(job._id.toString(), "wake_on_save").catch(
        console.error,
      );
    }

    res.json({ job });
  } catch (e) {
    next(e);
  }
}

export async function deleteScheduledJob(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const job = await getJobForUser(req.params.id, userId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    await job.deleteOne();
    await reloadScheduledJobSchedules();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function cloneScheduledJob(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const src = await getJobForUser(req.params.id, userId);
    if (!src) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const job = await ScheduledJob.create({
      name: `${src.name} (copy)`,
      description: src.description ?? "",
      enabled: false,
      assistantId: src.assistantId,
      scheduleKind: src.scheduleKind,
      intervalMinutes: src.intervalMinutes,
      cronExpression: src.cronExpression ?? "",
      timezone: src.timezone,
      sessionMode: src.sessionMode,
      wakeMode: src.wakeMode,
      taskPrompt: src.taskPrompt,
      timeoutSeconds: src.timeoutSeconds,
      resultDelivery: src.resultDelivery,
      channelSelection: src.channelSelection,
      channelId: src.channelId,
      recipientOverride: src.recipientOverride,
      createdBy: userId,
    });
    await refreshJobNextRunAt(job);
    await job.save();
    await reloadScheduledJobSchedules();
    res.status(201).json({ job });
  } catch (e) {
    next(e);
  }
}

export async function runJobNow(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const ifDue = req.body?.ifDue === true;
    const result = await runScheduledJobByUser(
      req.params.id,
      userId,
      "manual",
      { ifDue },
    );
    if (result.error === "Job not found") {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function listScheduledJobRuns(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const limit = parseInt(String(req.query.limit || "50"), 10);
    const offset = parseInt(String(req.query.offset || "0"), 10);
    const data = await listRuns(req.params.id, userId, { limit, offset });
    if (!data) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(data);
  } catch (e) {
    next(e);
  }
}
