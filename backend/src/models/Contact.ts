import mongoose, { Schema, Document } from "mongoose";

export interface IContactDocument extends Document {
  _id: mongoose.Types.ObjectId;
  phoneNumber?: string;
  whatsappId?: string;
  name?: string;
  email?: string;
  company?: string;
  avatar?: string;
  country?: string; // ISO 3166-1 alpha-2 country code (e.g., "US", "TW", "CN")
  channelId: mongoose.Types.ObjectId;
  clientGroupId?: mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<IContactDocument>(
  {
    phoneNumber: {
      type: String,
      required: false,
    },
    whatsappId: {
      type: String,
    },
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    company: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
    },
    country: {
      type: String,
      uppercase: true,
      trim: true,
    },
    channelId: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
    },
    clientGroupId: {
      type: Schema.Types.ObjectId,
      ref: "ClientGroup",
      required: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for phone/whatsappId + channel (unique contact per channel)
// Using sparse: true to allow null values while maintaining uniqueness for non-null values
contactSchema.index({ phoneNumber: 1, channelId: 1 }, { unique: true, sparse: true });
contactSchema.index({ whatsappId: 1, channelId: 1 }, { unique: true, sparse: true });
contactSchema.index({ channelId: 1 });
contactSchema.index({ clientGroupId: 1 });

// Text index for full-text search on name, email, company, phoneNumber
contactSchema.index(
  { name: "text", email: "text", company: "text", phoneNumber: "text" },
  { weights: { name: 10, email: 5, company: 3, phoneNumber: 2 } }
);

// Regular indexes for sorting and filtering
contactSchema.index({ createdAt: -1 });
contactSchema.index({ name: 1 });

export const Contact = mongoose.model<IContactDocument>(
  "Contact",
  contactSchema,
);
