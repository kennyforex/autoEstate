import { isValidObjectId } from "mongoose";
import { Order, Contact, Tag, type IOrderDocument } from "../models/index.js";

export interface OrderListParams {
  search?: string;
  status?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  tagId?: string;
  createdFrom?: string;
  createdTo?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
  limit: number;
  offset: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface OrderItemInput {
  snapshot: {
    productId?: string;
    productName: string;
    variantLabel?: string;
    optionSummary?: string;
    sku?: string;
    imageUrl?: string;
  };
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface CreateOrderInput {
  source: "manual" | "skill";

  contactId?: string;
  clientName?: string;
  phoneNumber?: string;
  email?: string;

  shippingAddress?: string;
  shippingMethod?: string;
  deliveryDate?: string;

  status?: "open" | "completed" | "cancelled";
  paymentStatus?: "unpaid" | "paid";
  fulfillmentStatus?: "unfulfilled" | "fulfilled";

  currency?: string;
  items: OrderItemInput[];
  discountTotal?: number;
  shippingFee?: number;
  taxTotal?: number;

  tagIds?: string[];

  createdByUserId?: string;
}

export interface UpdateOrderInput
  extends Omit<CreateOrderInput, "source" | "items" | "createdByUserId"> {
  items?: OrderItemInput[];
}

function clampMoney(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.round(v * 100) / 100;
}

function computeLineTotal(quantity: number, unitPrice: number): number {
  return clampMoney(quantity * unitPrice);
}

function computeTotals(args: {
  items: Array<{ quantity: number; unitPrice: number }>;
  discountTotal?: number;
  shippingFee?: number;
  taxTotal?: number;
}): { subtotal: number; discountTotal: number; shippingFee: number; taxTotal: number; total: number } {
  const subtotal = clampMoney(
    args.items.reduce((sum, item) => sum + computeLineTotal(item.quantity, item.unitPrice), 0),
  );
  const discountTotal = clampMoney(args.discountTotal);
  const shippingFee = clampMoney(args.shippingFee);
  const taxTotal = clampMoney(args.taxTotal);
  const total = clampMoney(subtotal - discountTotal + shippingFee + taxTotal);
  return { subtotal, discountTotal, shippingFee, taxTotal, total };
}

async function generateUniqueOrderNumber(): Promise<string> {
  // Stable-ish human readable id; avoid external counters for now.
  // Example: ORD-20260421-7H3K2P
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const orderNumber = `ORD-${y}${m}${d}-${suffix}`;
    const exists = await Order.exists({ orderNumber });
    if (!exists) return orderNumber;
  }
  // Fallback: include time
  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}

function parseDateRange(from?: string, to?: string): Record<string, Date> | undefined {
  const out: Record<string, Date> = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) out.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) out.$lte = d;
  }
  return Object.keys(out).length ? out : undefined;
}

class OrderService {
  async list(params: OrderListParams): Promise<{ orders: IOrderDocument[]; total: number }> {
    const query: Record<string, unknown> = {};

    if (params.status) query.status = params.status;
    if (params.paymentStatus) query.paymentStatus = params.paymentStatus;
    if (params.fulfillmentStatus) query.fulfillmentStatus = params.fulfillmentStatus;

    if (params.tagId && isValidObjectId(params.tagId)) {
      query.tagIds = params.tagId;
    }

    const createdRange = parseDateRange(params.createdFrom, params.createdTo);
    if (createdRange) query.createdAt = createdRange;

    const deliveryRange = parseDateRange(params.deliveryFrom, params.deliveryTo);
    if (deliveryRange) query.deliveryDate = deliveryRange;

    const search = params.search?.trim();
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { orderNumber: { $regex: escaped, $options: "i" } },
        { clientName: { $regex: escaped, $options: "i" } },
        { phoneNumber: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }

    const total = await Order.countDocuments(query);

    const sortBy = params.sortBy?.trim() || "createdAt";
    const sortDir = params.sortOrder === "asc" ? 1 : -1;
    const sort: Record<string, 1 | -1> = {};
    switch (sortBy) {
      case "deliveryDate":
      case "total":
      case "orderNumber":
      case "createdAt":
        sort[sortBy] = sortDir;
        break;
      default:
        sort.createdAt = -1;
        break;
    }
    if (!("createdAt" in sort)) sort.createdAt = -1;

    const orders = await Order.find(query)
      .sort(sort)
      .skip(Math.max(0, params.offset))
      .limit(Math.min(100, Math.max(1, params.limit)))
      .lean(false);

    return { orders, total };
  }

  async getById(id: string): Promise<IOrderDocument | null> {
    if (!isValidObjectId(id)) return null;
    return Order.findById(id);
  }

  async create(input: CreateOrderInput): Promise<IOrderDocument> {
    const orderNumber = await generateUniqueOrderNumber();

    let contact = null;
    if (input.contactId && isValidObjectId(input.contactId)) {
      contact = await Contact.findById(input.contactId).lean();
    }

    const items = (input.items || []).map((item) => ({
      snapshot: {
        productId:
          item.snapshot.productId && isValidObjectId(item.snapshot.productId)
            ? item.snapshot.productId
            : undefined,
        productName: item.snapshot.productName,
        variantLabel: item.snapshot.variantLabel,
        optionSummary: item.snapshot.optionSummary,
        sku: item.snapshot.sku,
        imageUrl: item.snapshot.imageUrl,
      },
      quantity: item.quantity,
      unitPrice: clampMoney(item.unitPrice),
      lineTotal: computeLineTotal(item.quantity, clampMoney(item.unitPrice)),
      notes: item.notes,
    }));

    const totals = computeTotals({
      items: items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice })),
      discountTotal: input.discountTotal,
      shippingFee: input.shippingFee,
      taxTotal: input.taxTotal,
    });

    const tagIds = Array.isArray(input.tagIds)
      ? input.tagIds.filter((id) => isValidObjectId(id))
      : [];

    // Ensure tags exist (ignore missing)
    const existingTags = tagIds.length ? await Tag.find({ _id: { $in: tagIds } }).select("_id") : [];
    const existingTagIds = existingTags.map((t) => t._id);

    const activity = [
      {
        kind: "system" as const,
        message: `Order created (${input.source})`,
        createdAt: new Date(),
        createdByUserId: input.createdByUserId,
      },
    ];

    const doc = await Order.create({
      orderNumber,
      source: input.source,
      contactId: contact?._id,
      clientName: input.clientName ?? contact?.name ?? undefined,
      phoneNumber: input.phoneNumber ?? contact?.phoneNumber ?? undefined,
      email: input.email ?? contact?.email ?? undefined,
      shippingAddress: input.shippingAddress,
      shippingMethod: input.shippingMethod,
      deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
      status: input.status ?? "open",
      paymentStatus: input.paymentStatus ?? "unpaid",
      fulfillmentStatus: input.fulfillmentStatus ?? "unfulfilled",
      currency: (input.currency || "HKD").toUpperCase(),
      items,
      ...totals,
      tagIds: existingTagIds,
      activity,
    });

    return doc;
  }

  async update(id: string, input: UpdateOrderInput): Promise<IOrderDocument | null> {
    const order = await this.getById(id);
    if (!order) return null;

    if (input.contactId && isValidObjectId(input.contactId)) {
      order.contactId = input.contactId as unknown as never;
    }
    if (typeof input.clientName === "string") order.clientName = input.clientName;
    if (typeof input.phoneNumber === "string") order.phoneNumber = input.phoneNumber;
    if (typeof input.email === "string") order.email = input.email;

    if (typeof input.shippingAddress === "string") order.shippingAddress = input.shippingAddress;
    if (typeof input.shippingMethod === "string") order.shippingMethod = input.shippingMethod;
    if (typeof input.deliveryDate === "string") {
      order.deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : undefined;
    }

    if (input.status) order.status = input.status;
    if (input.paymentStatus) order.paymentStatus = input.paymentStatus;
    if (input.fulfillmentStatus) order.fulfillmentStatus = input.fulfillmentStatus;

    if (typeof input.currency === "string" && input.currency.trim()) {
      order.currency = input.currency.trim().toUpperCase();
    }

    if (Array.isArray(input.items)) {
      order.items = input.items.map((item) => ({
        snapshot: {
          productId:
            item.snapshot.productId && isValidObjectId(item.snapshot.productId)
              ? (item.snapshot.productId as unknown as never)
              : undefined,
          productName: item.snapshot.productName,
          variantLabel: item.snapshot.variantLabel,
          optionSummary: item.snapshot.optionSummary,
          sku: item.snapshot.sku,
          imageUrl: item.snapshot.imageUrl,
        },
        quantity: item.quantity,
        unitPrice: clampMoney(item.unitPrice),
        lineTotal: computeLineTotal(item.quantity, clampMoney(item.unitPrice)),
        notes: item.notes,
      })) as unknown as never;
    }

    const totals = computeTotals({
      items: order.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice })),
      discountTotal: input.discountTotal ?? order.discountTotal,
      shippingFee: input.shippingFee ?? order.shippingFee,
      taxTotal: input.taxTotal ?? order.taxTotal,
    });

    order.discountTotal = totals.discountTotal;
    order.shippingFee = totals.shippingFee;
    order.taxTotal = totals.taxTotal;
    order.subtotal = totals.subtotal;
    order.total = totals.total;

    if (Array.isArray(input.tagIds)) {
      const tagIds = input.tagIds.filter((tid) => isValidObjectId(tid));
      const existingTags = tagIds.length ? await Tag.find({ _id: { $in: tagIds } }).select("_id") : [];
      order.tagIds = existingTags.map((t) => t._id) as unknown as never;
    }

    order.activity.push({
      kind: "system",
      message: "Order updated",
      createdAt: new Date(),
    });

    await order.save();
    return order;
  }

  async addActivity(input: {
    orderId: string;
    message: string;
    kind?: "note" | "system";
    createdByUserId?: string;
  }): Promise<IOrderDocument | null> {
    const order = await this.getById(input.orderId);
    if (!order) return null;
    order.activity.push({
      kind: input.kind ?? "note",
      message: input.message,
      createdAt: new Date(),
      createdByUserId: input.createdByUserId,
    });
    await order.save();
    return order;
  }
}

export const orderService = new OrderService();

