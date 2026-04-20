import mongoose, { Schema, Document } from "mongoose";

export interface IClientGroupDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const clientGroupSchema = new Schema<IClientGroupDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

clientGroupSchema.index({ name: 1 }, { unique: true });
clientGroupSchema.index({ sortOrder: 1, name: 1 });

export const ClientGroup =
  (mongoose.models.ClientGroup as mongoose.Model<IClientGroupDocument> | undefined) ??
  mongoose.model<IClientGroupDocument>("ClientGroup", clientGroupSchema);
