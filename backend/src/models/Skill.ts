import mongoose, { Schema, Document } from 'mongoose';

export interface ISkillDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  triggerHints: string[];
  isBuiltIn: boolean;
  status: 'active' | 'inactive';

  // Directory structure flags (for discovery without loading content)
  hasReferences: boolean;
  hasExamples: boolean;
  scripts: string[];

  // Storage location for on-demand content loading (empty string for legacy skills)
  storagePath: string;

  // Tools this skill can use from the main agent's registry
  requiredTools: string[];

  // Legacy: for backward compatibility during migration
  instructions?: string;

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

    // Legacy: backward compatibility
    instructions: {
      type: String,
    },

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
