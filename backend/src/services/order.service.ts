import mongoose, { isValidObjectId } from "mongoose";
import {
  Order,
  Contact,
  OrderTag,
  type IOrderDocument,
  type IOrderPaymentProof,
  type OrderPaymentStatus,
} from "../models/index.js";
import { shippingService } from "./shipping.service.js";
import {
  loadProductsForSnapshotResolution,
  resolveOrderItemSnapshot,
  type OrderSnapshotInput,
} from "../utils/orderItemSnapshot.js";
import {
  formatHongKongDateOnly,
  normalizeHongKongDateTimeInput,
} from "../utils/hongKongDate.js";

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
    variantId?: string;
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
  shippingMethodId?: string;
  shippingMethod?: string;
  deliveryDate?: string;

  status?: "open" | "completed" | "cancelled";
  paymentStatus?: OrderPaymentStatus;
  paymentProof?: IOrderPaymentProof;
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

function normalizeText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

function formatMoney(amount: number, currency?: string): string {
  const c = typeof currency === "string" && currency.trim() ? currency.trim().toUpperCase() : "";
  const n = clampMoney(amount);
  return c ? `${c} ${n.toFixed(2)}` : n.toFixed(2);
}

function formatDateLike(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return undefined;
    return formatHongKongDateOnly(v);
  }
  if (typeof v === "string") {
    try {
      const d = new Date(normalizeHongKongDateTimeInput(v, { defaultTime: "00:00" }));
      if (Number.isNaN(d.getTime())) return normalizeText(v);
      return formatHongKongDateOnly(d);
    } catch {
      return normalizeText(v);
    }
  }
  return undefined;
}

function parseOrderDate(value: string, defaultTime = "00:00"): Date {
  const normalized = normalizeHongKongDateTimeInput(value, { defaultTime });
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid order date/time: ${value}`);
  }
  return d;
}

function toIdStrings(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id)).filter(Boolean);
}

function makeOrderUpdateSummary(args: {
  before: IOrderDocument;
  after: IOrderDocument;
  beforeTagIds: string[];
  afterTagIds: string[];
}): string | null {
  const parts: string[] = [];

  const addField = (label: string, beforeVal: unknown, afterVal: unknown) => {
    const b = normalizeText(beforeVal);
    const a = normalizeText(afterVal);
    if (b === a) return;
    parts.push(`${label} ${b ?? "—"} -> ${a ?? "—"}`);
  };

  const addEnumField = (label: string, beforeVal: unknown, afterVal: unknown) => {
    const b = (normalizeText(beforeVal) ?? String(beforeVal ?? "").trim()) || undefined;
    const a = (normalizeText(afterVal) ?? String(afterVal ?? "").trim()) || undefined;
    if (b === a) return;
    parts.push(`${label} ${b ?? "—"} -> ${a ?? "—"}`);
  };

  const addMoneyField = (label: string, beforeVal: unknown, afterVal: unknown, currency?: string) => {
    const b = clampMoney(beforeVal);
    const a = clampMoney(afterVal);
    if (b === a) return;
    parts.push(`${label} ${formatMoney(b, currency)} -> ${formatMoney(a, currency)}`);
  };

  const addDateField = (label: string, beforeVal: unknown, afterVal: unknown) => {
    const b = formatDateLike(beforeVal);
    const a = formatDateLike(afterVal);
    if (b === a) return;
    parts.push(`${label} ${b ?? "—"} -> ${a ?? "—"}`);
  };

  // Customer / contact
  addField("client name:", args.before.clientName, args.after.clientName);
  addField("phone:", args.before.phoneNumber, args.after.phoneNumber);
  addField("email:", args.before.email, args.after.email);
  addEnumField("contact id:", args.before.contactId ? String(args.before.contactId) : undefined, args.after.contactId ? String(args.after.contactId) : undefined);

  // Shipping
  addField("shipping address:", args.before.shippingAddress, args.after.shippingAddress);
  addField("shipping method:", args.before.shippingMethod, args.after.shippingMethod);
  addDateField("delivery date:", args.before.deliveryDate, args.after.deliveryDate);

  // Status
  addEnumField("status:", args.before.status, args.after.status);
  addEnumField("payment:", args.before.paymentStatus, args.after.paymentStatus);
  if (JSON.stringify(args.before.paymentProof ?? null) !== JSON.stringify(args.after.paymentProof ?? null)) {
    parts.push("payment proof updated");
  }
  addEnumField("fulfillment:", args.before.fulfillmentStatus, args.after.fulfillmentStatus);

  // Money
  const currency = args.after.currency || args.before.currency;
  addEnumField("currency:", args.before.currency, args.after.currency);
  addMoneyField("discount:", args.before.discountTotal, args.after.discountTotal, currency);
  addMoneyField("shipping fee:", args.before.shippingFee, args.after.shippingFee, currency);
  addMoneyField("tax:", args.before.taxTotal, args.after.taxTotal, currency);
  addMoneyField("subtotal:", args.before.subtotal, args.after.subtotal, currency);
  addMoneyField("total:", args.before.total, args.after.total, currency);

  // Tags
  {
    const beforeSet = new Set(args.beforeTagIds);
    const afterSet = new Set(args.afterTagIds);
    const added = args.afterTagIds.filter((id) => !beforeSet.has(id));
    const removed = args.beforeTagIds.filter((id) => !afterSet.has(id));
    if (added.length > 0) parts.push(`tags added: ${added.join(", ")}`);
    if (removed.length > 0) parts.push(`tags removed: ${removed.join(", ")}`);
  }

  // Items (best-effort matching)
  const itemKey = (it: IOrderDocument["items"][number] | undefined): string => {
    if (!it) return "";
    const productId = it.snapshot?.productId ? String(it.snapshot.productId) : "";
    const variantId = normalizeText(it.snapshot?.variantId) ?? "";
    const productName = normalizeText(it.snapshot?.productName) ?? "";
    const variantLabel = normalizeText(it.snapshot?.variantLabel) ?? "";
    const optionSummary = normalizeText(it.snapshot?.optionSummary) ?? "";
    const sku = normalizeText(it.snapshot?.sku) ?? "";
    const core = [productId, variantId, productName, variantLabel, optionSummary, sku].filter(Boolean).join("|");
    return core || JSON.stringify({ productName, variantId, variantLabel, optionSummary, sku });
  };

  const beforeItems = Array.isArray(args.before.items) ? args.before.items : [];
  const afterItems = Array.isArray(args.after.items) ? args.after.items : [];

  const beforeCounts = new Map<string, number>();
  const afterCounts = new Map<string, number>();
  for (const it of beforeItems) beforeCounts.set(itemKey(it), (beforeCounts.get(itemKey(it)) ?? 0) + 1);
  for (const it of afterItems) afterCounts.set(itemKey(it), (afterCounts.get(itemKey(it)) ?? 0) + 1);

  const addedKeys: string[] = [];
  const removedKeys: string[] = [];
  for (const [k, count] of afterCounts.entries()) {
    const beforeCount = beforeCounts.get(k) ?? 0;
    if (count > beforeCount) addedKeys.push(k);
  }
  for (const [k, count] of beforeCounts.entries()) {
    const afterCount = afterCounts.get(k) ?? 0;
    if (count > afterCount) removedKeys.push(k);
  }

  const displayNameForKey = (k: string): string => {
    const maybeName = k.split("|").find((p) => p && !/^[0-9a-f]{24}$/i.test(p));
    return maybeName || "item";
  };

  if (addedKeys.length > 0) parts.push(`items added: ${addedKeys.map(displayNameForKey).join(", ")}`);
  if (removedKeys.length > 0) parts.push(`items removed: ${removedKeys.map(displayNameForKey).join(", ")}`);

  // Per-row modifications (index-based; avoids misleading pairing in duplicates)
  const compareLen = Math.min(beforeItems.length, afterItems.length);
  for (let i = 0; i < compareLen; i += 1) {
    const b = beforeItems[i];
    const a = afterItems[i];
    const name = normalizeText(a?.snapshot?.productName) ?? normalizeText(b?.snapshot?.productName) ?? `item #${i + 1}`;

    if (itemKey(b) !== itemKey(a)) {
      parts.push(`item ${name}: changed`);
      continue;
    }

    const bQty = Number(b?.quantity ?? 0);
    const aQty = Number(a?.quantity ?? 0);
    if (bQty !== aQty) parts.push(`item ${name} qty ${bQty} -> ${aQty}`);

    const bPrice = clampMoney(b?.unitPrice);
    const aPrice = clampMoney(a?.unitPrice);
    if (bPrice !== aPrice) parts.push(`item ${name} unit price ${formatMoney(bPrice, currency)} -> ${formatMoney(aPrice, currency)}`);

    const bNotes = normalizeText(b?.notes);
    const aNotes = normalizeText(a?.notes);
    if (bNotes !== aNotes) parts.push(`item ${name} notes ${bNotes ?? "—"} -> ${aNotes ?? "—"}`);
  }

  if (parts.length === 0) return null;
  return `Order updated: ${parts.join("; ")}`;
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
    const d = parseOrderDate(from, "00:00");
    if (!Number.isNaN(d.getTime())) out.$gte = d;
  }
  if (to) {
    const d = parseOrderDate(to, "23:59");
    if (!Number.isNaN(d.getTime())) out.$lte = d;
  }
  return Object.keys(out).length ? out : undefined;
}

function toSnapshotInput(snapshot: {
  productId?: mongoose.Types.ObjectId | string;
  variantId?: string;
  productName: string;
  variantLabel?: string;
  optionSummary?: string;
  sku?: string;
  imageUrl?: string;
}): OrderSnapshotInput {
  const rawId = snapshot.productId;
  const productId =
    typeof rawId === "string"
      ? rawId
      : rawId
        ? rawId.toString()
        : undefined;
  return {
    productId,
    variantId: snapshot.variantId,
    productName: snapshot.productName,
    variantLabel: snapshot.variantLabel,
    optionSummary: snapshot.optionSummary,
    sku: snapshot.sku,
    imageUrl: snapshot.imageUrl,
  };
}

function logSnapshotResolution(before: OrderSnapshotInput, after: OrderSnapshotInput): void {
  const beforeId = before.productId?.trim() || "";
  const afterId = after.productId?.trim() || "";
  if (afterId && afterId !== beforeId) {
    console.log(
      `[OrderService] Linked item "${before.productName}" to product ${afterId}` +
        (beforeId && beforeId !== afterId ? ` (was ${beforeId})` : ""),
    );
  }
}

class OrderService {
  private async resolveItemsWithCatalog<T extends { snapshot: OrderSnapshotInput }>(
    items: T[],
  ): Promise<T[]> {
    if (!items.length) return items;
    const products = await loadProductsForSnapshotResolution();
    return items.map((item) => {
      const resolved = resolveOrderItemSnapshot(item.snapshot, products);
      logSnapshotResolution(item.snapshot, resolved.snapshot);
      return { ...item, snapshot: resolved.snapshot };
    });
  }

  private async hydrateOrderItemsForRead(order: IOrderDocument): Promise<void> {
    if (!order.items?.length) return;
    const products = await loadProductsForSnapshotResolution();
    for (const item of order.items) {
      const before = { ...item.snapshot };
      const resolved = resolveOrderItemSnapshot(toSnapshotInput(item.snapshot), products);
      if (resolved.snapshot.productId && isValidObjectId(resolved.snapshot.productId)) {
        item.snapshot.productId = new mongoose.Types.ObjectId(resolved.snapshot.productId);
      }
      if (resolved.snapshot.variantId) item.snapshot.variantId = resolved.snapshot.variantId;
      if (resolved.snapshot.productName) item.snapshot.productName = resolved.snapshot.productName;
      if (resolved.snapshot.variantLabel) item.snapshot.variantLabel = resolved.snapshot.variantLabel;
      if (resolved.snapshot.imageUrl && !before.imageUrl) {
        item.snapshot.imageUrl = resolved.snapshot.imageUrl;
      }
    }
  }

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
    const order = await Order.findById(id);
    if (!order) return null;
    await this.hydrateOrderItemsForRead(order);
    return order;
  }

  async getByOrderNumber(orderNumber: string): Promise<IOrderDocument | null> {
    const normalized = orderNumber.trim();
    if (!normalized) return null;
    return Order.findOne({ orderNumber: normalized });
  }

  async create(input: CreateOrderInput): Promise<IOrderDocument> {
    const orderNumber = await generateUniqueOrderNumber();

    let contact = null;
    if (input.contactId && isValidObjectId(input.contactId)) {
      contact = await Contact.findById(input.contactId).lean();
    }

    // Default shipping behavior for configured methods:
    // - If shippingMethod matches a configured method and shippingFee is omitted, auto-fill configured fee.
    // - Always normalize matched methods to the configured label.
    // - Preserve explicit custom overrides when shippingFee is provided.
    if (input.shippingMethodId || input.shippingMethod) {
      const resolved = await shippingService.resolveShipping({
        shippingMethodId: input.shippingMethodId,
        shippingMethod: input.shippingMethod,
        shippingFee: input.shippingFee,
        includeInactive: false,
      });
      if (resolved.kind === "configured") {
        input.shippingMethodId = resolved.method.id;
        input.shippingMethod = resolved.normalizedLabel;
        if (input.shippingFee === undefined) {
          input.shippingFee = resolved.normalizedFee;
        }
      }
    }

    const resolvedItems = await this.resolveItemsWithCatalog(input.items || []);
    const items = resolvedItems.map((item) => ({
      snapshot: {
        productId:
          item.snapshot.productId && isValidObjectId(item.snapshot.productId)
            ? item.snapshot.productId
            : undefined,
        variantId: item.snapshot.variantId,
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

    const existingTags = tagIds.length
      ? await OrderTag.find({ _id: { $in: tagIds } }).select("_id")
      : [];
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
      shippingMethodId:
        input.shippingMethodId && isValidObjectId(input.shippingMethodId)
          ? input.shippingMethodId
          : undefined,
      shippingMethod: input.shippingMethod,
      deliveryDate: input.deliveryDate ? parseOrderDate(input.deliveryDate) : undefined,
      status: input.status ?? "open",
      paymentStatus: input.paymentStatus ?? "unpaid",
      paymentProof: input.paymentProof,
      fulfillmentStatus: input.fulfillmentStatus ?? "unfulfilled",
      currency: (input.currency || "HKD").toUpperCase(),
      items,
      ...totals,
      tagIds: existingTagIds,
      activity,
    });

    return doc;
  }

  async update(
    id: string,
    input: UpdateOrderInput,
    args?: { updatedByUserId?: string },
  ): Promise<IOrderDocument | null> {
    const order = await this.getById(id);
    if (!order) return null;

    const before = order.toObject({ depopulate: true }) as unknown as IOrderDocument;
    const beforeTagIds = toIdStrings(order.tagIds);

    if (input.contactId && isValidObjectId(input.contactId)) {
      order.contactId = input.contactId as unknown as never;
    }
    if (typeof input.clientName === "string") order.clientName = input.clientName;
    if (typeof input.phoneNumber === "string") order.phoneNumber = input.phoneNumber;
    if (typeof input.email === "string") order.email = input.email;

    if (input.shippingMethodId || input.shippingMethod) {
      const resolved = await shippingService.resolveShipping({
        shippingMethodId: input.shippingMethodId,
        shippingMethod: input.shippingMethod,
        shippingFee: input.shippingFee,
        includeInactive: false,
      });
      if (resolved.kind === "configured") {
        input.shippingMethodId = resolved.method.id;
        input.shippingMethod = resolved.normalizedLabel;
        if (input.shippingFee === undefined) {
          input.shippingFee = resolved.normalizedFee;
        }
      }
    }

    if (typeof input.shippingAddress === "string") order.shippingAddress = input.shippingAddress;
    if (typeof input.shippingMethodId === "string") {
      order.shippingMethodId = input.shippingMethodId && isValidObjectId(input.shippingMethodId)
        ? (input.shippingMethodId as unknown as never)
        : undefined;
    }
    if (typeof input.shippingMethod === "string") order.shippingMethod = input.shippingMethod;
    if (typeof input.deliveryDate === "string") {
      order.deliveryDate = input.deliveryDate ? parseOrderDate(input.deliveryDate) : undefined;
    }

    if (input.status) order.status = input.status;
    if (input.paymentStatus) order.paymentStatus = input.paymentStatus;
    if (input.paymentProof) order.paymentProof = input.paymentProof as never;
    if (input.fulfillmentStatus) order.fulfillmentStatus = input.fulfillmentStatus;

    if (typeof input.currency === "string" && input.currency.trim()) {
      order.currency = input.currency.trim().toUpperCase();
    }

    if (Array.isArray(input.items)) {
      const resolvedItems = await this.resolveItemsWithCatalog(input.items);
      order.items = resolvedItems.map((item) => ({
        snapshot: {
          productId:
            item.snapshot.productId && isValidObjectId(item.snapshot.productId)
              ? (item.snapshot.productId as unknown as never)
              : undefined,
          variantId: item.snapshot.variantId,
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
      const existingTags = tagIds.length
        ? await OrderTag.find({ _id: { $in: tagIds } }).select("_id")
        : [];
      order.tagIds = existingTags.map((t) => t._id) as unknown as never;
    }

    const after = order.toObject({ depopulate: true }) as unknown as IOrderDocument;
    const afterTagIds = toIdStrings(order.tagIds);

    const message = makeOrderUpdateSummary({ before, after, beforeTagIds, afterTagIds });
    if (message) {
      order.activity.push({
        kind: "system",
        message,
        createdAt: new Date(),
        createdByUserId: args?.updatedByUserId,
      });
    }

    await order.save();
    return order;
  }

  async addActivity(input: {
    orderId?: string;
    orderNumber?: string;
    message: string;
    kind?: "note" | "system";
    createdByUserId?: string;
  }): Promise<IOrderDocument | null> {
    const order =
      input.orderId && isValidObjectId(input.orderId)
        ? await this.getById(input.orderId)
        : input.orderNumber
          ? await this.getByOrderNumber(input.orderNumber)
          : null;
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

  async updatePaymentByIdentifier(input: {
    orderId?: string;
    orderNumber?: string;
    paymentStatus: Extract<OrderPaymentStatus, "verifying">;
    paymentProof: IOrderPaymentProof;
    updatedByUserId?: string;
  }): Promise<IOrderDocument | null> {
    const order =
      input.orderId && isValidObjectId(input.orderId)
        ? await this.getById(input.orderId)
        : input.orderNumber
          ? await this.getByOrderNumber(input.orderNumber)
          : null;

    if (!order) return null;

    order.paymentStatus = input.paymentStatus;
    order.paymentProof = input.paymentProof as never;
    order.activity.push({
      kind: "system",
      message: `Payment proof received; payment status set to verifying (${input.paymentProof.receiptUrl})`,
      createdAt: new Date(),
      createdByUserId: input.updatedByUserId,
    });

    await order.save();
    return order;
  }
}

export const orderService = new OrderService();

