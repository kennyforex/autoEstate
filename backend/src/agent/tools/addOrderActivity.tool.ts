import { BaseTool } from "./base.js";
import { orderService } from "../../services/order.service.js";
import type { AgentContext, ToolResult } from "../types.js";

function normalizeText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

export class AddOrderActivityTool extends BaseTool {
  readonly name = "add_order_activity";
  readonly description =
    "Append a system activity entry to an existing internal order (visible in order activity / 訂單動態). " +
    "Use to log skill milestones, payment or receipt steps, or other audit notes without editing order fields.";

  readonly parameters = {
    type: "object",
    properties: {
      orderId: {
        type: "string",
        description: "MongoDB order id. Provide either orderId or orderNumber.",
      },
      orderNumber: {
        type: "string",
        description: "Human order number, e.g. ORD-20260516-XXXX. Provide either orderId or orderNumber.",
      },
      message: {
        type: "string",
        description: "Activity message shown in the order activity log.",
      },
    },
    required: ["message"],
  };

  async execute(
    args: Record<string, unknown>,
    context: AgentContext,
    _signal?: AbortSignal,
  ): Promise<ToolResult> {
    try {
      const orderId = normalizeText(args.orderId);
      const orderNumber = normalizeText(args.orderNumber);
      const message = normalizeText(args.message);

      if (!orderId && !orderNumber) {
        return {
          success: false,
          data: null,
          summary: "add_order_activity requires orderId or orderNumber.",
        };
      }

      if (!message) {
        return {
          success: false,
          data: null,
          summary: "add_order_activity requires a non-empty message.",
        };
      }

      const order = await orderService.addActivity({
        orderId,
        orderNumber,
        message,
        kind: "system",
        createdByUserId: context.userId,
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
          activityCount: order.activity.length,
        },
        summary: `Added activity to order ${order.orderNumber}.`,
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        summary: `Failed to add order activity: ${error.message}`,
      };
    }
  }
}
