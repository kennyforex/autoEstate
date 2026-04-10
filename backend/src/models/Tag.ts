import mongoose, { Schema, Document } from "mongoose";

export interface ITagDocument extends Document {
  _id: mongoose.Types.ObjectId;
  label: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

const tagSchema = new Schema<ITagDocument>(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    color: {
      type: String,
      required: true,
      default: "#3B82F6", // Default blue
    },
  },
  {
    timestamps: true,
  },
);

// Index for faster lookups
tagSchema.index({ label: 1 });

export const Tag =
  (mongoose.models.Tag as mongoose.Model<ITagDocument> | undefined) ??
  mongoose.model<ITagDocument>("Tag", tagSchema);
