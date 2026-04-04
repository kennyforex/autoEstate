import mongoose, { Schema, Document } from "mongoose";

export type ScheduledJobRunStatus =
  | "running"
  | "success"
  | "failed"
  | "skipped";

export interface IScheduledJobRunDocument extends Document {
  _id: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  trigger: "manual" | "schedule" | "wake_on_save";
  startedAt: Date;
  finishedAt?: Date;
  status: ScheduledJobRunStatus;
  error?: string;
  summarySnippet?: string;
  deliveryStatus?: "sent" | "skipped" | "failed";
  deliveryDetail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const scheduledJobRunSchema = new Schema<IScheduledJobRunDocument>(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "ScheduledJob",
      required: true,
    },
    trigger: {
      type: String,
      enum: ["manual", "schedule", "wake_on_save"],
      required: true,
    },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    status: {
      type: String,
      enum: ["running", "success", "failed", "skipped"],
      required: true,
    },
    error: { type: String },
    summarySnippet: { type: String },
    deliveryStatus: {
      type: String,
      enum: ["sent", "skipped", "failed"],
    },
    deliveryDetail: { type: String },
  },
  { timestamps: true },
);

scheduledJobRunSchema.index({ jobId: 1, startedAt: -1 });

export const ScheduledJobRun = mongoose.model<IScheduledJobRunDocument>(
  "ScheduledJobRun",
  scheduledJobRunSchema,
);
