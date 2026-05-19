import mongoose, { Schema, Document } from "mongoose";

export interface IAISignals {
  confidence?: number;
  sentiment?: "positive" | "neutral" | "negative";
  slaRisk: boolean;
  priority: number;
}

export interface IDismissedInsights {
  negativeSentiment?: boolean;
  slaRisk?: boolean;
  priority?: boolean;
}

export interface ILastModerationMatch {
  categoryId: string;
  categoryName: string;
  at: Date;
}

export interface IConversationDocument extends Document {
  _id: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  channelId: mongoose.Types.ObjectId;
  subject?: string;
  status: "open" | "resolved" | "spam";
  category?: string;
  assignedTo?: mongoose.Types.ObjectId;
  aiAutoReply: boolean;
  aiHandling: boolean;
  aiSignals: IAISignals;
  dismissedInsights?: IDismissedInsights;
  moderationAlertsSent?: string[];
  lastModerationMatch?: ILastModerationMatch;
  needsAttention: boolean;
  isArchived: boolean;
  tags: mongoose.Types.ObjectId[];
  lastMessageAt?: Date;
  lastMessageContent?: string;
  lastMessageSender?: "customer" | "agent" | "ai";
  resolvedAt?: Date;
  resolvedBy?: "ai" | "human" | null;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const aiSignalsSchema = new Schema<IAISignals>(
  {
    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },
    sentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
      default: "neutral",
    },
    slaRisk: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
  },
  { _id: false },
);

const conversationSchema = new Schema<IConversationDocument>(
  {
    contactId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
    channelId: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
    },
    subject: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["open", "resolved", "spam"],
      default: "open",
    },
    category: {
      type: String,
      trim: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    aiAutoReply: {
      type: Boolean,
      default: true,
    },
    aiHandling: {
      type: Boolean,
      default: false,
    },
    aiSignals: {
      type: aiSignalsSchema,
      default: () => ({ slaRisk: false, priority: 0 }),
    },
    dismissedInsights: {
      type: {
        negativeSentiment: { type: Boolean, default: false },
        slaRisk: { type: Boolean, default: false },
        priority: { type: Boolean, default: false },
      },
      default: () => ({ negativeSentiment: false, slaRisk: false, priority: false }),
      _id: false,
    },
    moderationAlertsSent: {
      type: [String],
      default: () => [],
    },
    lastModerationMatch: {
      type: {
        categoryId: { type: String, required: true },
        categoryName: { type: String, required: true },
        at: { type: Date, required: true },
      },
      required: false,
      _id: false,
    },
    needsAttention: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    tags: [
      {
        type: Schema.Types.ObjectId,
        ref: "Tag",
      },
    ],
    lastMessageAt: {
      type: Date,
    },
    lastMessageContent: {
      type: String,
      trim: true,
    },
    lastMessageSender: {
      type: String,
      enum: ["customer", "agent", "ai"],
    },
    resolvedAt: {
      type: Date,
    },
    resolvedBy: {
      type: String,
      enum: ["ai", "human", null],
      default: null,
    },
    unreadCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient querying
conversationSchema.index({ status: 1 });
conversationSchema.index({ channelId: 1 });
conversationSchema.index({ contactId: 1 });
conversationSchema.index({ assignedTo: 1 });
conversationSchema.index({ aiHandling: 1 });
conversationSchema.index({ "aiSignals.sentiment": 1 });
conversationSchema.index({ "aiSignals.slaRisk": 1 });
conversationSchema.index({ "aiSignals.priority": -1 });
conversationSchema.index({ needsAttention: 1 });
conversationSchema.index({ isArchived: 1 });
conversationSchema.index({ tags: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ createdAt: -1 });

// Compound index for inbox filtering
conversationSchema.index({ status: 1, lastMessageAt: -1 });
conversationSchema.index({ channelId: 1, status: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model<IConversationDocument>(
  "Conversation",
  conversationSchema,
);
