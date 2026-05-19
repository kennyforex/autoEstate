import { BaseTool } from "./base.js";
import { orderService } from "../../services/order.service.js";
import { shippingService } from "../../services/shipping.service.js";
import { normalizeHongKongDateTimeInput } from "../../utils/hongKongDate.js";
import type { AgentContext, ToolResult } from "../types.js";

export class CreateOrderTool extends BaseTool {
  readonly name = "create_order";
  readonly description =
    "Create an internal order in the system (MongoDB). " +
    "Use this when an order is confirmed and should be stored inside the app. " +
    "If contactId is not provided, the current contact is used automatically.";

  readonly parameters = {
    type: "object",
    properties: {
      contactId: {
        type: "string",
        description: "Optional contact id. Defaults to the current conversation contact.",
      },
      clientName: { type: "string", description: "Customer name override." },
      phoneNumber: { type: "string", description: "Customer phone override." },
      email: { type: "string", description: "Customer email override." },
      shippingAddress: { type: "string", description: "Shipping address." },
      shippingMethodId: { type: "string", description: "Configured shipping method id." },
      shippingMethod: { type: "string", description: "Shipping method." },
      deliveryDate: {
        type: "string",
        description: "Optional delivery date/time in ISO-8601.",
      },
      status: { type: "string", enum: ["open", "completed", "cancelled"] },
      paymentStatus: { type: "string", enum: ["unpaid", "verifying", "paid"] },
      fulfillmentStatus: { type: "string", enum: ["unfulfilled", "fulfilled"] },
      currency: { type: "string", description: "Currency code, e.g. HKD." },
      items: {
        type: "array",
        description: "Line items for the order.",
        items: {
          type: "object",
          properties: {
            snapshot: {
              type: "object",
              properties: {
                productId: {
                  type: "string",
                  description:
                    "Parent product MongoDB id from get_product_menu (products[].id). " +
                    "Do NOT use variant ids (e.g. whole__original). If omitted, the server links by productName.",
                },
                productName: { type: "string" },
                variantLabel: { type: "string" },
                optionSummary: { type: "string" },
                sku: { type: "string" },
                imageUrl: { type: "string" },
              },
              required: ["productName"],
            },
            quantity: { type: "number", description: "Quantity (integer >= 1)." },
            unitPrice: { type: "number", description: "Unit price." },
            notes: { type: "string" },
          },
          required: ["snapshot", "quantity", "unitPrice"],
        },
      },
      discountTotal: { type: "number" },
      shippingFee: { type: "number" },
      taxTotal: { type: "number" },
      tagIds: { type: "array", items: { type: "string" } },
    },
    required: ["items"],
  };

  async execute(
    args: Record<string, unknown>,
    context: AgentContext,
    _signal?: AbortSignal,
  ): Promise<ToolResult> {
    try {
      const contactId =
        typeof args.contactId === "string" && args.contactId.trim()
          ? args.contactId.trim()
          : context.contact?.id;

      const resolvedShipping = await shippingService.resolveShipping({
        shippingMethodId: args.shippingMethodId,
        shippingMethod: args.shippingMethod,
        shippingFee: args.shippingFee,
        includeInactive: false,
      });

      const normalizedShippingMethod =
        resolvedShipping.kind === "configured"
          ? resolvedShipping.normalizedLabel
          : typeof args.shippingMethod === "string"
            ? args.shippingMethod
            : undefined;

      const normalizedShippingFee =
        typeof args.shippingFee === "number"
          ? args.shippingFee
          : resolvedShipping.kind === "configured"
            ? resolvedShipping.normalizedFee
            : undefined;

      const normalizedDeliveryDate =
        typeof args.deliveryDate === "string" && args.deliveryDate.trim()
          ? normalizeHongKongDateTimeInput(args.deliveryDate, { defaultTime: "11:00" })
          : undefined;

      const order = await orderService.create({
        source: "skill",
        contactId,
        clientName: typeof args.clientName === "string" ? args.clientName : undefined,
        phoneNumber:
          typeof args.phoneNumber === "string" ? args.phoneNumber : undefined,
        email: typeof args.email === "string" ? args.email : undefined,
        shippingAddress:
          typeof args.shippingAddress === "string" ? args.shippingAddress : undefined,
        shippingMethodId:
          typeof args.shippingMethodId === "string" ? args.shippingMethodId : undefined,
        shippingMethod: normalizedShippingMethod,
        deliveryDate: normalizedDeliveryDate,
        status:
          typeof args.status === "string"
            ? (args.status as "open" | "completed" | "cancelled")
            : undefined,
        paymentStatus:
          typeof args.paymentStatus === "string"
            ? (args.paymentStatus as "unpaid" | "verifying" | "paid")
            : undefined,
        fulfillmentStatus:
          typeof args.fulfillmentStatus === "string"
            ? (args.fulfillmentStatus as "unfulfilled" | "fulfilled")
            : undefined,
        currency: typeof args.currency === "string" ? args.currency : undefined,
        items: Array.isArray(args.items)
          ? (args.items as any[]).filter(Boolean)
          : [],
        discountTotal: typeof args.discountTotal === "number" ? args.discountTotal : undefined,
        shippingFee: normalizedShippingFee,
        taxTotal: typeof args.taxTotal === "number" ? args.taxTotal : undefined,
        tagIds: Array.isArray(args.tagIds)
          ? args.tagIds.filter((t): t is string => typeof t === "string")
          : undefined,
        createdByUserId: context.userId,
      });

      return {
        success: true,
        data: {
          id: order._id.toString(),
          orderNumber: order.orderNumber,
          total: order.total,
          currency: order.currency,
          status: order.status,
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
        },
        summary: `Created order ${order.orderNumber} (${order.currency} ${order.total})`,
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        summary: `Failed to create order: ${error.message}`,
      };
    }
  }
}

