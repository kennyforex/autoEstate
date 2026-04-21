import mongoose, { Schema, Document } from "mongoose";

export type OrderStatus = "open" | "completed" | "cancelled";
export type OrderPaymentStatus = "unpaid" | "paid";
export type OrderFulfillmentStatus = "unfulfilled" | "fulfilled";
export type OrderSource = "manual" | "skill";

export interface IOrderItemSnapshot {
  productId?: mongoose.Types.ObjectId;
  productName: string;
  variantLabel?: string;
  optionSummary?: string;
  sku?: string;
  imageUrl?: string;
}

export interface IOrderItem {
  snapshot: IOrderItemSnapshot;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes?: string;
}

export interface IOrderActivityEntry {
  kind: "system" | "note";
  message: string;
  createdAt: Date;
  createdByUserId?: string;
}

export interface IOrderDocument extends Document {
  _id: mongoose.Types.ObjectId;

  orderNumber: string;
  source: OrderSource;

  contactId?: mongoose.Types.ObjectId;
  clientName?: string;
  phoneNumber?: string;
  email?: string;

  shippingAddress?: string;
  shippingMethod?: string;
  deliveryDate?: Date;

  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: OrderFulfillmentStatus;

  currency: string;
  items: IOrderItem[];
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  taxTotal: number;
  total: number;

  tagIds: mongoose.Types.ObjectId[];
  activity: IOrderActivityEntry[];

  createdAt: Date;
  updatedAt: Date;
}

const orderItemSnapshotSchema = new Schema<IOrderItemSnapshot>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    productName: { type: String, required: true, trim: true },
    variantLabel: { type: String, trim: true },
    optionSummary: { type: String, trim: true },
    sku: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
  },
  { _id: false },
);

const orderItemSchema = new Schema<IOrderItem>(
  {
    snapshot: { type: orderItemSnapshotSchema, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

const orderActivityEntrySchema = new Schema<IOrderActivityEntry>(
  {
    kind: { type: String, enum: ["system", "note"], required: true },
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, required: true },
    createdByUserId: { type: String, trim: true },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrderDocument>(
  {
    orderNumber: { type: String, required: true, trim: true, unique: true },
    source: { type: String, enum: ["manual", "skill"], required: true },

    contactId: { type: Schema.Types.ObjectId, ref: "Contact" },
    clientName: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },

    shippingAddress: { type: String, trim: true },
    shippingMethod: { type: String, trim: true },
    deliveryDate: { type: Date },

    status: { type: String, enum: ["open", "completed", "cancelled"], default: "open" },
    paymentStatus: { type: String, enum: ["unpaid", "paid"], default: "unpaid" },
    fulfillmentStatus: { type: String, enum: ["unfulfilled", "fulfilled"], default: "unfulfilled" },

    currency: { type: String, trim: true, uppercase: true, default: "HKD" },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    tagIds: { type: [Schema.Types.ObjectId], ref: "Tag", default: [] },
    activity: { type: [orderActivityEntrySchema], default: [] },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ deliveryDate: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ fulfillmentStatus: 1, createdAt: -1 });
orderSchema.index({ contactId: 1, createdAt: -1 });
orderSchema.index({ clientName: 1 });
orderSchema.index({ phoneNumber: 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });

export const Order =
  (mongoose.models.Order as mongoose.Model<IOrderDocument> | undefined) ??
  mongoose.model<IOrderDocument>("Order", orderSchema);

