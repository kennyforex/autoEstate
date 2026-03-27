import mongoose, { Schema, Document } from 'mongoose';

export interface ISkillStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed';
  collects?: string;
  collectedValue?: string;
}

export interface IGoal {
  id: string;
  skillSlug: string;
  status: 'active' | 'suspended' | 'completed';
  steps: ISkillStep[];
  observations: Record<string, string>;
  createdAt: Date;
  suspendedAt?: Date;
  completedAt?: Date;
}

export interface IConversationStateDocument extends Document {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  activeGoalId: string | null;
  goals: IGoal[];
  createdAt: Date;
  updatedAt: Date;
}

const skillStepSchema = new Schema<ISkillStep>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'completed'],
      default: 'pending',
    },
    collects: { type: String },
    collectedValue: { type: String },
  },
  { _id: false },
);

const goalSchema = new Schema<IGoal>(
  {
    id: { type: String, required: true },
    skillSlug: { type: String, required: true },
    status: {
      type: String,
      enum: ['active', 'suspended', 'completed'],
      default: 'active',
    },
    steps: { type: [skillStepSchema], default: [] },
    observations: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    suspendedAt: { type: Date },
    completedAt: { type: Date },
  },
  { _id: false },
);

const conversationStateSchema = new Schema<IConversationStateDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    activeGoalId: { type: String, default: null },
    goals: { type: [goalSchema], default: [] },
  },
  { timestamps: true },
);

conversationStateSchema.index({ conversationId: 1 }, { unique: true });

export const ConversationState = mongoose.model<IConversationStateDocument>(
  'ConversationState',
  conversationStateSchema,
);
