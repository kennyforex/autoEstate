import { BaseTool } from "./base.js";
import { orderService } from "../../services/order.service.js";
import type { AgentContext, ToolResult } from "../types.js";

export class SearchOrdersTool extends BaseTool {
  readonly name = "search_orders";
  readonly description =
    "Search internal orders stored in the system. " +
    "Use this to find orders by order number, customer name, phone, email, status, or date ranges.";

  readonly parameters = {
    type: "object",
    properties: {
      search: { type: "string", description: "Search text (order number / customer fields)." },
      status: { type: "string", enum: ["open", "completed", "cancelled"] },
      paymentStatus: { type: "string", enum: ["unpaid", "paid"] },
      fulfillmentStatus: { type: "string", enum: ["unfulfilled", "fulfilled"] },
      tagId: { type: "string", description: "Optional tag id to filter." },
      createdFrom: { type: "string", description: "ISO-8601 start for createdAt." },
      createdTo: { type: "string", description: "ISO-8601 end for createdAt." },
      deliveryFrom: { type: "string", description: "ISO-8601 start for deliveryDate." },
      deliveryTo: { type: "string", description: "ISO-8601 end for deliveryDate." },
      limit: { type: "number", description: "Max results (default 10)." },
      offset: { type: "number", description: "Offset (default 0)." },
      sortBy: { type: "string", description: "Sort field: createdAt, deliveryDate, total, orderNumber." },
      sortOrder: { type: "string", enum: ["asc", "desc"] },
    },
    required: [],
  };

  async execute(
    args: Record<string, unknown>,
    _context: AgentContext,
    _signal?: AbortSignal,
  ): Promise<ToolResult> {
    try {
      const limit =
        typeof args.limit === "number" && Number.isFinite(args.limit) ? args.limit : 10;
      const offset =
        typeof args.offset === "number" && Number.isFinite(args.offset) ? args.offset : 0;

      const result = await orderService.list({
        search: typeof args.search === "string" ? args.search : undefined,
        status: typeof args.status === "string" ? args.status : undefined,
        paymentStatus: typeof args.paymentStatus === "string" ? args.paymentStatus : undefined,
        fulfillmentStatus:
          typeof args.fulfillmentStatus === "string" ? args.fulfillmentStatus : undefined,
        tagId: typeof args.tagId === "string" ? args.tagId : undefined,
        createdFrom: typeof args.createdFrom === "string" ? args.createdFrom : undefined,
        createdTo: typeof args.createdTo === "string" ? args.createdTo : undefined,
        deliveryFrom: typeof args.deliveryFrom === "string" ? args.deliveryFrom : undefined,
        deliveryTo: typeof args.deliveryTo === "string" ? args.deliveryTo : undefined,
        sortBy: typeof args.sortBy === "string" ? args.sortBy : undefined,
        sortOrder:
          args.sortOrder === "asc" || args.sortOrder === "desc"
            ? (args.sortOrder as "asc" | "desc")
            : undefined,
        limit: Math.min(50, Math.max(1, Math.floor(limit))),
        offset: Math.max(0, Math.floor(offset)),
      });

      const rows = result.orders.map((o) => ({
        id: o._id.toString(),
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        total: o.total,
        currency: o.currency,
        clientName: o.clientName,
        phoneNumber: o.phoneNumber,
        deliveryDate: o.deliveryDate,
        createdAt: o.createdAt,
      }));

      const summary =
        rows.length === 0
          ? "No orders matched this search."
          : `Found ${rows.length} order(s). Top result: ${rows[0].orderNumber}.`;

      return {
        success: true,
        data: { orders: rows, total: result.total, limit, offset },
        summary,
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        summary: `Failed to search orders: ${error.message}`,
      };
    }
  }
}

