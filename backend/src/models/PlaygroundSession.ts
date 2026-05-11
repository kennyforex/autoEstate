import mongoose, { Schema, Document } from "mongoose";

export type PlaygroundMessageRole = "user" | "assistant";

export interface IPlaygroundMessage {
  role: PlaygroundMessageRole;
  content: string;
  contentType?: "text" | "image" | "audio" | "document";
  mediaUrl?: string;
  mediaDescription?: string;
  createdAt: Date;
}

export interface IPlaygroundSessionDocument extends Document {
  _id: mongoose.Types.ObjectId;
  assistantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  messages: IPlaygroundMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const playgroundMessageSchema = new Schema<IPlaygroundMessage>(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      enum: ["text", "image", "audio", "document"],
      default: "text",
    },
    mediaUrl: {
      type: String,
    },
    mediaDescription: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const playgroundSessionSchema = new Schema<IPlaygroundSessionDocument>(
  {
    assistantId: {
      type: Schema.Types.ObjectId,
      ref: "Assistant",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    messages: {
      type: [playgroundMessageSchema],
      default: [],
    },
  },
  { timestamps: true },
);

playgroundSessionSchema.index({ assistantId: 1, userId: 1 }, { unique: true });
playgroundSessionSchema.index({ updatedAt: -1 });

export const PlaygroundSession =
  mongoose.model<IPlaygroundSessionDocument>(
    "PlaygroundSession",
    playgroundSessionSchema,
  );
