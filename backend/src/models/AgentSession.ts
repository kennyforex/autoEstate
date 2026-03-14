import mongoose, { Schema, Document } from 'mongoose';

export interface IAgentStepDocument {
  thought: string;
  action?: { tool: string; args: Record<string, unknown> };
  observation?: string;
  timestamp: Date;
}

export interface IAgentSessionDocument extends Document {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  assistantId: mongoose.Types.ObjectId;
  status: 'active' | 'awaiting_clarification' | 'completed';
  originalMessage: string;
  steps: IAgentStepDocument[];
  messages: any[];
  pendingClarification?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const agentStepSchema = new Schema<IAgentStepDocument>(
  {
    thought: { type: String, required: true },
    action: {
      type: {
        tool: { type: String, required: true },
        args: { type: Schema.Types.Mixed, default: {} },
      },
      default: undefined,
    },
    observation: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const agentSessionSchema = new Schema<IAgentSessionDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    assistantId: {
      type: Schema.Types.ObjectId,
      ref: 'Assistant',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'awaiting_clarification', 'completed'],
      required: true,
      default: 'active',
    },
    originalMessage: {
      type: String,
      required: true,
    },
    steps: {
      type: [agentStepSchema],
      default: [],
    },
    messages: {
      type: Schema.Types.Mixed,
      default: [],
    },
    pendingClarification: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Find pending sessions for a conversation quickly
agentSessionSchema.index({ conversationId: 1, status: 1 });

// Auto-delete expired sessions (TTL index on expiresAt)
agentSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AgentSession = mongoose.model<IAgentSessionDocument>(
  'AgentSession',
  agentSessionSchema,
);
