import { BaseTool } from "./base.js";
import { orderService } from "../../services/order.service.js";
import { resolvePaymentProofReceiptUrl } from "../../services/whatsappMedia.service.js";
import type { AgentContext, ToolResult } from "../types.js";
import type { IOrderPaymentProof } from "../../models/index.js";

function normalizeText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

function normalizeRecord(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  return v as Record<string, unknown>;
}

export function normalizePaymentProofInput(args: Record<string, unknown>): IOrderPaymentProof {
  const receiptUrl = normalizeText(args.receiptUrl);
  if (!receiptUrl) {
    throw new Error("receiptUrl is required");
  }

  return {
    receiptUrl,
    receiptFileName: normalizeText(args.receiptFileName),
    extracted: normalizeRecord(args.extracted),
    reviewNotes: normalizeText(args.reviewNotes),
    checkedAt: new Date(),
  };
}

export class UpdateOrderPaymentTool extends BaseTool {
  readonly name = "update_order_payment";
  readonly description =
    "Attach a payment receipt/proof to an existing internal order and set payment status to verifying. " +
    "Use after document_data_capture processes a receipt. This tool never marks orders paid; staff review and mark paid in the UI. " +
    "For WhatsApp images, pass messageId from the customer message so the server saves a previewable receipt file.";

  readonly parameters = {
    type: "object",
    properties: {
      orderId: {
        type: "string",
        description: "MongoDB order id. Provide either orderId or orderNumber.",
      },
      orderNumber: {
        type: "string",
        description: "Human order number, e.g. ORD-20260511-TNGYKN. Provide either orderId or orderNumber.",
      },
      paymentStatus: {
        type: "string",
        enum: ["verifying"],
        description: "Must be verifying. Staff mark paid after review.",
      },
      receiptUrl: {
        type: "string",
        description:
          "Receipt image/PDF URL from the customer message (Image URL line), Drive link, or /uploads/ path. WhatsApp CDN URLs are persisted server-side when messageId is provided.",
      },
      messageId: {
        type: "string",
        description:
          "MongoDB Message id from the same customer message (Message ID line). Required to persist WhatsApp receipts for staff preview.",
      },
      receiptFileName: {
        type: "string",
        description: "Optional original/generated receipt filename.",
      },
      extracted: {
        type: "object",
        description: "Structured receipt data returned by document_data_capture.",
      },
      reviewNotes: {
        type: "string",
        description: "Short notes for mismatches or manual review, e.g. USD vs HKD.",
      },
    },
    required: ["paymentStatus", "receiptUrl"],
  };

  async execute(
    args: Record<string, unknown>,
    context: AgentContext,
    _signal?: AbortSignal,
  ): Promise<ToolResult> {
    try {
      const orderId = normalizeText(args.orderId);
      const orderNumber = normalizeText(args.orderNumber);
      if (!orderId && !orderNumber) {
        return {
          success: false,
          data: null,
          summary: "update_order_payment requires orderId or orderNumber.",
        };
      }

      if (args.paymentStatus !== "verifying") {
        return {
          success: false,
          data: null,
          summary: 'update_order_payment can only set paymentStatus to "verifying".',
        };
      }

      const existingOrder =
        orderId
          ? await orderService.getById(orderId)
          : orderNumber
            ? await orderService.getByOrderNumber(orderNumber)
            : null;
      const persistOrderNumber =
        existingOrder?.orderNumber ?? orderNumber ?? orderId ?? "order";

      let paymentProof = normalizePaymentProofInput(args);
      const resolved = await resolvePaymentProofReceiptUrl({
        receiptUrl: paymentProof.receiptUrl,
        receiptFileName: paymentProof.receiptFileName,
        messageId: normalizeText(args.messageId),
        orderNumber: persistOrderNumber,
      });
      paymentProof = {
        ...paymentProof,
        receiptUrl: resolved.receiptUrl,
        receiptFileName: resolved.receiptFileName,
      };

      const order = await orderService.updatePaymentByIdentifier({
        orderId,
        orderNumber,
        paymentStatus: "verifying",
        paymentProof,
        updatedByUserId: context.userId,
      });

      if (!order) {
        return {
          success: false,
          data: null,
          summary: `Order not found for ${orderId ? `id ${orderId}` : `number ${orderNumber}`}.`,
        };
      }

      return {
        success: true,
        data: {
          id: order._id.toString(),
          orderNumber: order.orderNumber,
          paymentStatus: order.paymentStatus,
          paymentProof: order.paymentProof,
        },
        summary: `Updated ${order.orderNumber} payment status to verifying and attached receipt proof.`,
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        summary: `Failed to update order payment: ${error.message}`,
      };
    }
  }
}
