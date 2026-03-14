import mongoose, { Schema, Document } from "mongoose";

export interface ICitationReference {
  file: {
    id: string;
    name: string;
  };
  pages: number[];
}

export interface ICitation {
  position: number;
  references: ICitationReference[];
}

export interface IMessageDocument extends Document {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  channelId: mongoose.Types.ObjectId;
  sender: "customer" | "agent" | "ai";
  senderUserId?: mongoose.Types.ObjectId;
  content: string;
  contentType:
    | "text"
    | "image"
    | "audio"
    | "document"
    | "location"
    | "video"
    | "gif"
    | "sticker"
    | "contact"
    | "reaction";
  mediaUrl?: string;
  mediaDescription?: string;
  evolutionMessageId?: string;
  aiGenerated: boolean;
  citations?: ICitation[];
  readAt?: Date;
  createdAt: Date;
}

const citationReferenceSchema = new Schema<ICitationReference>(
  {
    file: {
      id: { type: String, required: true },
      name: { type: String, required: true },
    },
    pages: [Number],
  },
  { _id: false },
);

const citationSchema = new Schema<ICitation>(
  {
    position: { type: Number, required: true },
    references: [citationReferenceSchema],
  },
  { _id: false },
);

const messageSchema = new Schema<IMessageDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    channelId: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
    },
    sender: {
      type: String,
      enum: ["customer", "agent", "ai"],
      required: true,
    },
    senderUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    content: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      enum: [
        "text",
        "image",
        "audio",
        "document",
        "location",
        "video",
        "gif",
        "sticker",
        "contact",
        "reaction",
      ],
      default: "text",
    },
    mediaUrl: {
      type: String,
    },
    mediaDescription: {
      type: String,
    },
    evolutionMessageId: {
      type: String,
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
    citations: {
      type: [citationSchema],
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// Indexes
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ channelId: 1 });
messageSchema.index({ evolutionMessageId: 1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ createdAt: -1 });

export const Message = mongoose.model<IMessageDocument>(
  "Message",
  messageSchema,
);
