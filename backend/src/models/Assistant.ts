import mongoose, { Schema, Document } from "mongoose";

export type VideoProcessingStatus =
  | "pending"
  | "analyzing"
  | "completed"
  | "failed";

export interface IVideoMetadata {
  originalSize?: number; // bytes
  format?: string; // e.g., "mp4"
  filename?: string;
}

export interface IAssistantFile {
  fileId: string;
  name: string;
  size?: number;
  uploadedAt: Date;
  // Folder path for organization (FFCS only, not synced to Pinecone)
  folder?: string;
  // Video-specific fields
  isVideo?: boolean;
  videoPath?: string;
  processedAt?: Date;
  processingStatus?: VideoProcessingStatus;
  videoMetadata?: IVideoMetadata;
  errorMessage?: string;
}

export type AssistantLanguage = "zh-TW" | "zh-CN" | "en" | "auto";
export type AssistantTone = "professional" | "friendly" | "casual" | "formal" | "empathetic";

/** Department member: manager (exactly one, non-deletable) or recruited staff */
export interface IStaffMember {
  _id: mongoose.Types.ObjectId;
  displayName: string;
  roleTitle: string;
  responsibilities: string;
  skillIds: mongoose.Types.ObjectId[];
  isManager: boolean;
  nickname?: string;
  avatarPreset?: string;
  avatarUrl?: string;
}

export interface IAssistantDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  /** 部門名 — primary label for lists; kept in sync with legacy `name` */
  departmentName?: string;
  /** 經理名 — persona for the manager node */
  managerName?: string;
  managerNickname?: string;
  managerAvatarPreset?: string;
  managerAvatarUrl?: string;
  pineconeAssistantName: string;
  primaryLanguage: AssistantLanguage;
  tone: AssistantTone;
  instructions?: string;
  aiModel: "gpt-4o" | "gpt-4.1" | "claude-3-7-sonnet";
  status: "active" | "inactive";
  metadata?: Record<string, unknown>;
  files: IAssistantFile[];
  folders: string[];
  /** Denormalized union of all staff.skillIds — rebuilt when staff skills change */
  skills: mongoose.Types.ObjectId[];
  /** Department roster: one manager + optional employees */
  staff: IStaffMember[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const videoMetadataSchema = new Schema<IVideoMetadata>(
  {
    originalSize: { type: Number },
    format: { type: String },
    filename: { type: String },
  },
  { _id: false },
);

const assistantFileSchema = new Schema<IAssistantFile>(
  {
    fileId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    // Folder path for organization (FFCS only, not synced to Pinecone)
    folder: {
      type: String,
    },
    // Video-specific fields
    isVideo: {
      type: Boolean,
      default: false,
    },
    videoPath: {
      type: String,
    },
    processedAt: {
      type: Date,
    },
    processingStatus: {
      type: String,
      enum: ["pending", "analyzing", "completed", "failed"],
    },
    videoMetadata: {
      type: videoMetadataSchema,
    },
    errorMessage: {
      type: String,
    },
  },
  { _id: false },
);

const staffMemberSchema = new Schema<IStaffMember>(
  {
    displayName: { type: String, required: true, trim: true },
    roleTitle: { type: String, default: "", trim: true },
    responsibilities: { type: String, default: "" },
    skillIds: [{ type: Schema.Types.ObjectId, ref: "Skill" }],
    isManager: { type: Boolean, default: false },
    nickname: { type: String, trim: true },
    avatarPreset: { type: String, trim: true },
    avatarUrl: { type: String, trim: true },
  },
  { _id: true },
);

const assistantSchema = new Schema<IAssistantDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    departmentName: {
      type: String,
      trim: true,
    },
    managerName: {
      type: String,
      trim: true,
    },
    managerNickname: { type: String, trim: true },
    managerAvatarPreset: { type: String, trim: true },
    managerAvatarUrl: { type: String, trim: true },
    pineconeAssistantName: {
      type: String,
      required: true,
      unique: true,
    },
    primaryLanguage: {
      type: String,
      enum: ["zh-TW", "zh-CN", "en", "auto"],
      default: "auto",
    },
    tone: {
      type: String,
      enum: ["professional", "friendly", "casual", "formal", "empathetic"],
      default: "professional",
    },
    instructions: {
      type: String,
    },
    aiModel: {
      type: String,
      enum: ["gpt-4o", "gpt-4.1", "claude-3-7-sonnet"],
      default: "gpt-4o",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    files: {
      type: [assistantFileSchema],
      default: [],
    },
    folders: {
      type: [String],
      default: [],
    },
    skills: {
      type: [{ type: Schema.Types.ObjectId, ref: "Skill" }],
      default: [],
    },
    staff: {
      type: [staffMemberSchema],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
assistantSchema.index({ name: 1 });
assistantSchema.index({ status: 1 });
assistantSchema.index({ createdBy: 1 });

export const Assistant = mongoose.model<IAssistantDocument>(
  "Assistant",
  assistantSchema,
);
