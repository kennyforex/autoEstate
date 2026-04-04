import mongoose, { Schema, Document } from "mongoose";

export type ScheduledJobScheduleKind = "interval" | "cron";
export type ScheduledJobSessionMode = "isolated" | "main";
export type ScheduledJobWakeMode = "now" | "next_heartbeat";
export type ScheduledJobResultDelivery = "announce" | "none";
export type ScheduledJobChannelSelection = "last" | "specific" | "playground";

export interface IScheduledJobDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  enabled: boolean;
  assistantId: mongoose.Types.ObjectId;
  scheduleKind: ScheduledJobScheduleKind;
  intervalMinutes?: number;
  cronExpression?: string;
  timezone: string;
  sessionMode: ScheduledJobSessionMode;
  wakeMode: ScheduledJobWakeMode;
  taskPrompt: string;
  timeoutSeconds?: number;
  resultDelivery: ScheduledJobResultDelivery;
  channelSelection: ScheduledJobChannelSelection;
  channelId?: mongoose.Types.ObjectId;
  recipientOverride?: string;
  lastRunAt?: Date;
  nextRunAt?: Date;
  lastStatus?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const scheduledJobSchema = new Schema<IScheduledJobDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    assistantId: {
      type: Schema.Types.ObjectId,
      ref: "Assistant",
      required: true,
    },
    scheduleKind: {
      type: String,
      enum: ["interval", "cron"],
      required: true,
    },
    intervalMinutes: {
      type: Number,
      min: 1,
      max: 24 * 60,
    },
    cronExpression: {
      type: String,
      trim: true,
      default: "",
    },
    timezone: {
      type: String,
      trim: true,
      default: "Asia/Hong_Kong",
    },
    sessionMode: {
      type: String,
      enum: ["isolated", "main"],
      default: "isolated",
    },
    wakeMode: {
      type: String,
      enum: ["now", "next_heartbeat"],
      default: "next_heartbeat",
    },
    taskPrompt: {
      type: String,
      required: true,
      trim: true,
    },
    timeoutSeconds: {
      type: Number,
      min: 1,
      max: 3600,
    },
    resultDelivery: {
      type: String,
      enum: ["announce", "none"],
      default: "announce",
    },
    channelSelection: {
      type: String,
      enum: ["last", "specific", "playground"],
      default: "last",
    },
    channelId: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
    },
    recipientOverride: {
      type: String,
      trim: true,
    },
    lastRunAt: { type: Date },
    nextRunAt: { type: Date },
    lastStatus: { type: String, trim: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

scheduledJobSchema.index({ createdBy: 1, enabled: 1 });
scheduledJobSchema.index({ assistantId: 1 });
scheduledJobSchema.index({ createdBy: 1, name: 1 });

export const ScheduledJob = mongoose.model<IScheduledJobDocument>(
  "ScheduledJob",
  scheduledJobSchema,
);
