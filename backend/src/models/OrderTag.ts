import mongoose, { Document, Schema } from "mongoose";

export interface IOrderTagDocument extends Document {
  _id: mongoose.Types.ObjectId;
  label: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderTagSchema = new Schema<IOrderTagDocument>(
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
      default: "#3B82F6",
    },
  },
  { timestamps: true },
);

orderTagSchema.index({ label: 1 });

export const OrderTag =
  (mongoose.models.OrderTag as mongoose.Model<IOrderTagDocument> | undefined) ??
  mongoose.model<IOrderTagDocument>("OrderTag", orderTagSchema);
