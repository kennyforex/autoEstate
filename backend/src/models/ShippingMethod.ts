import mongoose, { Document, Schema } from "mongoose";

export interface IShippingMethodDocument extends Document {
  _id: mongoose.Types.ObjectId;
  labelZh: string;
  labelEn: string;
  fee: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const shippingMethodSchema = new Schema<IShippingMethodDocument>(
  {
    labelZh: {
      type: String,
      required: true,
      trim: true,
    },
    labelEn: {
      type: String,
      required: true,
      trim: true,
      default: "",
    },
    fee: {
      type: Number,
      default: 0,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

shippingMethodSchema.index({ sortOrder: 1, labelZh: 1 });

export const ShippingMethod =
  (mongoose.models.ShippingMethod as mongoose.Model<IShippingMethodDocument> | undefined) ??
  mongoose.model<IShippingMethodDocument>("ShippingMethod", shippingMethodSchema);
