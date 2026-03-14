import mongoose, { Schema, Document } from "mongoose";

export interface IAISettings {
  enabled: boolean;
  autoReplyMode: "all" | "off" | "per_chat";
  responseDelay: number;
  escalateOnNegativeSentiment: boolean;
  detectBadWording?: boolean;
  badWordingResponse?: string;
}

export interface IBusinessProfile {
  name?: string;
  description?: string;
  profilePicture?: string;
}

export interface IChannelDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  type: "whatsapp";
  evolutionInstanceName: string;
  phoneNumber?: string;
  status: "connected" | "disconnected" | "connecting";
  qrCode?: string;
  assistantId?: mongoose.Types.ObjectId;
  aiSettings: IAISettings;
  businessProfile: IBusinessProfile;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const aiSettingsSchema = new Schema<IAISettings>(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    autoReplyMode: {
      type: String,
      enum: ["all", "off", "per_chat"],
      default: "off",
    },
    responseDelay: {
      type: Number,
      default: 2,
      min: 0,
      max: 30,
    },
    escalateOnNegativeSentiment: {
      type: Boolean,
      default: true,
    },
    detectBadWording: {
      type: Boolean,
      default: true,
    },
    badWordingResponse: {
      type: String,
      default: "We will help you as best as possible. Please let us know how we can assist you.",
      trim: true,
    },
  },
  { _id: false },
);

const businessProfileSchema = new Schema<IBusinessProfile>(
  {
    name: String,
    description: String,
    profilePicture: String,
  },
  { _id: false },
);

const channelSchema = new Schema<IChannelDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["whatsapp"],
      default: "whatsapp",
    },
    evolutionInstanceName: {
      type: String,
      required: true,
      unique: true,
    },
    phoneNumber: {
      type: String,
    },
    status: {
      type: String,
      enum: ["connected", "disconnected", "connecting"],
      default: "disconnected",
    },
    qrCode: {
      type: String,
    },
    assistantId: {
      type: Schema.Types.ObjectId,
      ref: "Assistant",
    },
    aiSettings: {
      type: aiSettingsSchema,
      default: () => ({}),
    },
    businessProfile: {
      type: businessProfileSchema,
      default: () => ({}),
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
channelSchema.index({ status: 1 });
channelSchema.index({ createdBy: 1 });
channelSchema.index({ evolutionInstanceName: 1 });

export const Channel = mongoose.model<IChannelDocument>(
  "Channel",
  channelSchema,
);
