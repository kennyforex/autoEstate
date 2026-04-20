import mongoose, { Schema, Document } from "mongoose";

export type ProductOptionSelectionType = "single" | "multiple";
export type ProductOptionPricingMode = "absolute" | "delta";

export interface IProductPriceMap {
  [groupSlug: string]: number | undefined;
}

export interface IProductOptionValue {
  id: string;
  label: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  displayOrder: number;
  priceByGroup: IProductPriceMap;
}

export interface IProductOptionGroup {
  id: string;
  name: string;
  selectionType: ProductOptionSelectionType;
  pricingMode: ProductOptionPricingMode;
  required: boolean;
  displayOrder: number;
  values: IProductOptionValue[];
}

export interface IProductDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  category?: string;
  description?: string;
  currency: string;
  isActive: boolean;
  displayOrder: number;
  basePriceByGroup: IProductPriceMap;
  optionGroups: IProductOptionGroup[];
  createdAt: Date;
  updatedAt: Date;
}

const productOptionValueSchema = new Schema<IProductOptionValue>(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    priceByGroup: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { _id: false },
);

const productOptionGroupSchema = new Schema<IProductOptionGroup>(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    selectionType: {
      type: String,
      enum: ["single", "multiple"],
      default: "single",
    },
    pricingMode: {
      type: String,
      enum: ["absolute", "delta"],
      default: "delta",
    },
    required: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    values: {
      type: [productOptionValueSchema],
      default: [],
    },
  },
  { _id: false },
);

const productSchema = new Schema<IProductDocument>(
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
    category: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "HKD",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    basePriceByGroup: {
      type: Map,
      of: Number,
      default: {},
    },
    optionGroups: {
      type: [productOptionGroupSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

productSchema.index({ category: 1, isActive: 1, displayOrder: 1, name: 1 });
productSchema.index({ name: 1 });

export const Product =
  (mongoose.models.Product as mongoose.Model<IProductDocument> | undefined) ??
  mongoose.model<IProductDocument>("Product", productSchema);
