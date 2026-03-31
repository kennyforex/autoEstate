import mongoose, { Schema, Document } from 'mongoose';

export interface ISkillStepDef {
  id: string;
  label: string;
  collects?: string;
}

export interface ISkillDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  triggerHints: string[];
  isBuiltIn: boolean;
  status: 'active' | 'inactive';

  hasReferences: boolean;
  hasExamples: boolean;
  scripts: string[];

  storagePath: string;

  requiredTools: string[];

  reminderDelay: number;
  maxReminders: number;

  steps: ISkillStepDef[];

  instructions?: string;

  /** Staff display name in org chart (optional) */
  nickname?: string;
  /** Job / role label for staff (e.g. 訂單客服), shown under nickname in UI */
  staffRole?: string;
  avatarPreset?: string;
  customAvatarUrl?: string;

  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const skillSchema = new Schema<ISkillDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: true,
    },
    triggerHints: {
      type: [String],
      default: [],
    },
    isBuiltIn: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },

    // Directory structure flags
    hasReferences: {
      type: Boolean,
      default: false,
    },
    hasExamples: {
      type: Boolean,
      default: false,
    },
    scripts: {
      type: [String],
      default: [],
    },

    // Storage location (optional for legacy skills without files)
    storagePath: {
      type: String,
      required: false,
      default: '',
    },

    requiredTools: {
      type: [String],
      default: [],
    },

    reminderDelay: {
      type: Number,
      default: 0,
    },

    maxReminders: {
      type: Number,
      default: 0,
    },

    steps: {
      type: [{
        id: { type: String, required: true },
        label: { type: String, required: true },
        collects: { type: String },
      }],
      default: [],
    },

    instructions: {
      type: String,
    },

    nickname: { type: String, trim: true },
    staffRole: { type: String, trim: true },
    avatarPreset: { type: String, trim: true },
    customAvatarUrl: { type: String, trim: true },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

skillSchema.index({ slug: 1 }, { unique: true });
skillSchema.index({ status: 1 });
skillSchema.index({ createdBy: 1 });

export const Skill = mongoose.model<ISkillDocument>('Skill', skillSchema);
