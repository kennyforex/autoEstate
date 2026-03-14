import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export type UserStatus = "pending" | "active" | "inactive";

export interface IUserDocument extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  avatar?: string;
  role: "admin" | "agent" | "viewer";
  status: UserStatus;
  lastLoginAt?: Date;
  timezone?: string;
  language?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: {
      type: String,
    },
    role: {
      type: String,
      enum: ["admin", "agent", "viewer"],
      default: "agent",
    },
    status: {
      type: String,
      enum: ["pending", "active", "inactive"],
      default: "active",
    },
    lastLoginAt: {
      type: Date,
    },
    timezone: {
      type: String,
      default: "Asia/Hong_Kong",
    },
    language: {
      type: String,
      default: "en",
    },
  },
  {
    timestamps: true,
  },
);

// Index for email lookup
userSchema.index({ email: 1 });

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Remove sensitive fields from JSON output
userSchema.set("toJSON", {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.passwordHash;
    return obj;
  },
});

export const User = mongoose.model<IUserDocument>("User", userSchema);
