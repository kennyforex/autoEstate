import mongoose, { Schema, Document } from "mongoose";

export type ProductOptionSelectionType = "single" | "multiple";
export type ProductOptionPricingMode = "absolute" | "delta";

export interface IProductPriceMap {
  [groupSlug: string]: number | undefined;
}

export interface IProductVariant {
  /** Stable id for this variant combination (unique within product). */
  id: string;
  /** Selected option value ids, in option group order. */
  optionValueIds: string[];
  /** Human-friendly label, e.g. "Large / Blue". */
  label: string;
  /** Variant is orderable / shown in table. */
  isActive: boolean;
  displayOrder: number;
  /** Price per client group for this exact variant combination. */
  priceByGroup: IProductPriceMap;
  /** Optional stock signal for operators (not used by quoting yet). */
  onHand?: number;
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
  /** Public or same-origin image URLs (e.g. /uploads/...) */
  images: string[];
  /** Which image URL is the primary / cover; must match an entry in `images` when set. */
  primaryImageUrl?: string;
  /** Variant combinations for table-first editing. */
  variants: IProductVariant[];
  basePriceByGroup: IProductPriceMap;
  optionGroups: IProductOptionGroup[];
  createdAt: Date;
  updatedAt: Date;
}

const productVariantSchema = new Schema<IProductVariant>(
  {
    id: { type: String, required: true, trim: true },
    optionValueIds: { type: [String], default: [] },
    label: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    priceByGroup: {
      type: Map,
      of: Number,
      default: {},
    },
    onHand: { type: Number },
  },
  { _id: false },
);

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
    images: {
      type: [String],
      default: [],
    },
    primaryImageUrl: {
      type: String,
      trim: true,
    },
    variants: {
      type: [productVariantSchema],
      default: [],
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
