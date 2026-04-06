import mongoose, { Schema, Document } from "mongoose";

export interface ICompanyDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  logo?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  timezone?: string;
  /** SMTP for team invite emails */
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  emailFrom?: string;
  appUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<ICompanyDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    logo: {
      type: String,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      default: "Asia/Hong_Kong",
    },
    smtpHost: { type: String, trim: true },
    smtpPort: { type: Number, default: 587 },
    smtpUser: { type: String, trim: true },
    smtpPass: { type: String },
    emailFrom: { type: String, trim: true },
    appUrl: { type: String, trim: true },
  },
  {
    timestamps: true,
  },
);

// Never send smtpPass to client; expose whether it's set
companySchema.set("toJSON", {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    obj.smtpPasswordSet = !!obj.smtpPass;
    delete obj.smtpPass;
    return obj;
  },
});

export const Company = mongoose.model<ICompanyDocument>("Company", companySchema);
