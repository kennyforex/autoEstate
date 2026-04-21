import { BaseTool } from "./base.js";
import { shippingService } from "../../services/shipping.service.js";
import type { AgentContext, ToolResult } from "../types.js";

function buildShippingOptionsSummary(methods: Array<{ labelZh: string; labelEn: string; fee: number }>): string {
  if (methods.length === 0) return "No active shipping methods are configured.";
  const lines = methods.map((m) => {
    const label = m.labelZh?.trim() ? m.labelZh.trim() : m.labelEn;
    return `${label} — ${m.fee.toFixed(2)}`;
  });
  return `Shipping options (${methods.length}):\n${lines.join("\n")}`;
}

export class GetShippingOptionsTool extends BaseTool {
  readonly name = "get_shipping_options";
  readonly description =
    "List configured shipping methods and their prices (fees). " +
    "Use this before quoting shipping fees or selecting a shipping method for an order.";

  readonly parameters = {
    type: "object",
    properties: {
      includeInactive: {
        type: "boolean",
        description: "Include inactive shipping methods. Defaults to false.",
      },
    },
    required: [],
  };

  async execute(
    args: Record<string, unknown>,
    _context: AgentContext,
    _signal?: AbortSignal,
  ): Promise<ToolResult> {
    try {
      const includeInactive = args.includeInactive === true;
      const shippingMethods = await shippingService.list({ includeInactive });

      return {
        success: true,
        data: { shippingMethods },
        summary: buildShippingOptionsSummary(shippingMethods),
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        summary: `Failed to load shipping options: ${error.message}`,
      };
    }
  }
}

