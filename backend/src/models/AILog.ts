import mongoose, { Schema, Document } from "mongoose";

export interface ITokens {
  input?: number;
  output?: number;
  total?: number;
}

export type AIModelSource = "D" | "O";

/** `model` on Document is Mongoose's model() — omit so we can store LLM model id on `model`. */
export interface IAILogDocument extends Omit<Document, "model"> {
  _id: mongoose.Types.ObjectId;
  type:
    | "classification"
    | "simple_reply"
    | "complex_reply"
    | "media_analysis"
    | "decision"
    | "tool_calling"
    | "error"
    | "info";
  level: "info" | "warn" | "error";
  conversationId?: mongoose.Types.ObjectId;
  messageId?: mongoose.Types.ObjectId;
  channelId?: mongoose.Types.ObjectId;
  assistantId?: mongoose.Types.ObjectId;
  model?: string;
  modelSource?: AIModelSource;
  input?: string;
  output?: string;
  duration?: number;
  tokens?: ITokens;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const tokensSchema = new Schema<ITokens>(
  {
    input: { type: Number },
    output: { type: Number },
    total: { type: Number },
  },
  { _id: false },
);

const aiLogSchema = new Schema<IAILogDocument>(
  {
    type: {
      type: String,
      enum: [
        "classification",
        "simple_reply",
        "complex_reply",
        "media_analysis",
        "decision",
        "tool_calling",
        "error",
        "info",
      ],
      required: true,
    },
    level: {
      type: String,
      enum: ["info", "warn", "error"],
      required: true,
      default: "info",
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    channelId: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
    },
    assistantId: {
      type: Schema.Types.ObjectId,
      ref: "Assistant",
    },
    model: {
      type: String,
    },
    modelSource: {
      type: String,
      enum: ["D", "O"],
    },
    input: {
      type: String,
    },
    output: {
      type: String,
    },
    duration: {
      type: Number,
    },
    tokens: {
      type: tokensSchema,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// Indexes for performance
aiLogSchema.index({ createdAt: -1 }); // Time-based queries (newest first)
aiLogSchema.index({ conversationId: 1, createdAt: -1 }); // Conversation logs
aiLogSchema.index({ type: 1 }); // Filter by type
aiLogSchema.index({ level: 1 }); // Filter by level
aiLogSchema.index({ channelId: 1 }); // Channel-specific logs

// TTL index - auto-delete logs after 30 days (2592000 seconds)
aiLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export const AILog = mongoose.model<IAILogDocument>("AILog", aiLogSchema);
