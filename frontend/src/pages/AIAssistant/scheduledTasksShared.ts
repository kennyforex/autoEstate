import type { Assistant, Channel, ScheduledJob } from "../../lib/types";

export type ScheduledTaskFormState = Partial<ScheduledJob> & {
  name: string;
  taskPrompt: string;
};

export function assistantIdOfChannel(ch: Channel): string | undefined {
  const a = ch.assistantId;
  if (!a) return undefined;
  return typeof a === "string" ? a : a._id;
}

export function assistantLabel(assistants: Assistant[], id: string): string {
  const a = assistants.find((x) => x._id === id);
  return a?.departmentName || a?.name || id;
}

export function scheduleSummary(job: ScheduledJob): string {
  if (job.scheduleKind === "interval") {
    return `*/${job.intervalMinutes ?? 30} * * * *`;
  }
  return (job.cronExpression || "0 * * * *").trim();
}

export function defaultScheduledTaskForm(): ScheduledTaskFormState {
  return {
    name: "",
    description: "",
    enabled: true,
    assistantId: "",
    scheduleKind: "interval",
    intervalMinutes: 30,
    cronExpression: "0 8 * * *",
    timezone: "Asia/Hong_Kong",
    sessionMode: "isolated",
    wakeMode: "next_heartbeat",
    taskPrompt: "",
    timeoutSeconds: undefined,
    resultDelivery: "announce",
    channelSelection: "last",
    channelId: undefined,
    recipientOverride: "",
  };
}

export function jobToForm(job: ScheduledJob): ScheduledTaskFormState {
  return {
    name: job.name,
    description: job.description ?? "",
    enabled: job.enabled,
    assistantId: job.assistantId,
    scheduleKind: job.scheduleKind,
    intervalMinutes: job.intervalMinutes ?? 30,
    cronExpression: job.cronExpression ?? "0 8 * * *",
    timezone: job.timezone || "Asia/Hong_Kong",
    sessionMode: job.sessionMode,
    wakeMode: job.wakeMode,
    taskPrompt: job.taskPrompt,
    timeoutSeconds: job.timeoutSeconds,
    resultDelivery: job.resultDelivery,
    channelSelection: job.channelSelection,
    channelId: job.channelId,
    recipientOverride: job.recipientOverride ?? "",
  };
}
