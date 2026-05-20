import type {
  Order,
  OrderFulfillmentStatus,
  OrderItemSnapshot,
  OrderPaymentStatus,
  OrderStatus,
} from "../lib/types";

type DraftOrderInput = Partial<
  Pick<
    Order,
    | "clientName"
    | "phoneNumber"
    | "email"
    | "shippingAddress"
    | "shippingMethodId"
    | "shippingMethod"
    | "deliveryDate"
    | "status"
    | "paymentStatus"
    | "fulfillmentStatus"
    | "currency"
    | "discountTotal"
    | "shippingFee"
    | "taxTotal"
    | "tagIds"
  >
>;

type DraftOrderItemInput = {
  snapshot: OrderItemSnapshot;
  quantity: number;
  unitPrice: number;
  notes?: string;
};

export type OrderFormPayload = Pick<
  Order,
  | "status"
  | "paymentStatus"
  | "fulfillmentStatus"
  | "currency"
  | "discountTotal"
  | "shippingFee"
  | "taxTotal"
  | "tagIds"
> & {
  clientName?: string;
  phoneNumber?: string;
  email?: string;
  shippingAddress?: string;
  shippingMethodId?: string;
  shippingMethod?: string;
  deliveryDate?: string;
  items: Array<{
    snapshot: OrderItemSnapshot;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
};

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalOrBlank(value: unknown, mode: "create" | "update"): string | undefined {
  const normalized = optionalText(value);
  if (normalized) return normalized;
  return mode === "update" && typeof value === "string" ? "" : undefined;
}

function optionalSnapshot(snapshot: OrderItemSnapshot, mode: "create" | "update"): OrderItemSnapshot {
  return {
    ...(optionalOrBlank(snapshot.productId, mode) !== undefined
      ? { productId: optionalOrBlank(snapshot.productId, mode) }
      : {}),
    ...(optionalOrBlank(snapshot.variantId, mode) !== undefined
      ? { variantId: optionalOrBlank(snapshot.variantId, mode) }
      : {}),
    productName: snapshot.productName,
    ...(optionalOrBlank(snapshot.variantLabel, mode) !== undefined
      ? { variantLabel: optionalOrBlank(snapshot.variantLabel, mode) }
      : {}),
    ...(optionalOrBlank(snapshot.optionSummary, mode) !== undefined
      ? { optionSummary: optionalOrBlank(snapshot.optionSummary, mode) }
      : {}),
    ...(optionalOrBlank(snapshot.sku, mode) !== undefined
      ? { sku: optionalOrBlank(snapshot.sku, mode) }
      : {}),
    ...(optionalOrBlank(snapshot.imageUrl, mode) !== undefined
      ? { imageUrl: optionalOrBlank(snapshot.imageUrl, mode) }
      : {}),
  };
}

export function buildOrderPayload(args: {
  draft: DraftOrderInput;
  items: DraftOrderItemInput[];
  mode?: "create" | "update";
}): OrderFormPayload {
  const { draft, items, mode = "create" } = args;

  return {
    ...(optionalOrBlank(draft.clientName, mode) !== undefined
      ? { clientName: optionalOrBlank(draft.clientName, mode) }
      : {}),
    ...(optionalOrBlank(draft.phoneNumber, mode) !== undefined
      ? { phoneNumber: optionalOrBlank(draft.phoneNumber, mode) }
      : {}),
    ...(optionalOrBlank(draft.email, mode) !== undefined
      ? { email: optionalOrBlank(draft.email, mode) }
      : {}),
    ...(optionalOrBlank(draft.shippingAddress, mode) !== undefined
      ? { shippingAddress: optionalOrBlank(draft.shippingAddress, mode) }
      : {}),
    ...(optionalOrBlank(draft.shippingMethodId, mode) !== undefined
      ? { shippingMethodId: optionalOrBlank(draft.shippingMethodId, mode) }
      : {}),
    ...(optionalOrBlank(draft.shippingMethod, mode) !== undefined
      ? { shippingMethod: optionalOrBlank(draft.shippingMethod, mode) }
      : {}),
    ...(optionalOrBlank(draft.deliveryDate, mode) !== undefined
      ? { deliveryDate: optionalOrBlank(draft.deliveryDate, mode) }
      : {}),
    status: (draft.status || "open") as OrderStatus,
    paymentStatus: (draft.paymentStatus || "unpaid") as OrderPaymentStatus,
    fulfillmentStatus: (draft.fulfillmentStatus || "unfulfilled") as OrderFulfillmentStatus,
    currency: String(draft.currency || "HKD"),
    items: items.map((it) => ({
      snapshot: optionalSnapshot(it.snapshot, mode),
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      notes: optionalText(it.notes),
    })),
    discountTotal: Number(draft.discountTotal || 0),
    shippingFee: Number(draft.shippingFee || 0),
    taxTotal: Number(draft.taxTotal || 0),
    tagIds: (draft.tagIds || []) as string[],
  };
}
