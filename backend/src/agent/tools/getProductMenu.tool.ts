import { BaseTool } from "./base.js";
import { catalogService } from "../../services/catalog.service.js";
import type { AgentContext, ToolResult } from "../types.js";

function formatCatalogPrice(currency: string, amount: number, pricingMode?: string): string {
  const prefix = pricingMode === "delta" && amount > 0 ? "+" : "";
  return `${prefix}${currency} ${amount}`;
}

export function buildMenuSummary(data: {
  clientGroup: { name: string; usedFallback: boolean };
  products: Array<{
    id?: string;
    name: string;
    category: string;
    currency: string;
    effectiveBasePrice: number;
    optionGroups: Array<{
      name: string;
      selectionType?: string;
      pricingMode: string;
      required?: boolean;
      values: Array<{ id: string; label: string; effectivePrice: number }>;
    }>;
    variants?: Array<{
      id: string;
      label: string;
      effectivePrice: number;
      isActive?: boolean;
      optionValueIds?: string[];
    }>;
  }>;
  quote: { total: number; currency: string } | null;
  quoteValidationErrors: string[];
}): string {
  if (data.products.length === 0) {
    return `No active products matched this request. Pricing group: ${data.clientGroup.name}.`;
  }

  const productLines = data.products.map((product, productIndex) => {
    const lines = [
      `${productIndex + 1}. ${product.name}${product.category ? ` [${product.category}]` : ""}`,
      `   Base price: ${formatCatalogPrice(product.currency, product.effectiveBasePrice)}`,
    ];

    if (product.optionGroups.length === 0) {
      lines.push("   Options: none");
    } else {
      lines.push("   Options:");
      product.optionGroups.forEach((group, groupIndex) => {
        const requiredLabel = group.required ? "required" : "optional";
        lines.push(
          `   Option group ${groupIndex + 1}: ${group.name} (${group.selectionType ?? "single"}, ${group.pricingMode}, ${requiredLabel})`,
        );

        if (group.values.length === 0) {
          lines.push("     No active values");
          return;
        }

        group.values.forEach((value, valueIndex) => {
          lines.push(
            `     ${valueIndex + 1}. ${value.label} — ${formatCatalogPrice(
              product.currency,
              value.effectivePrice,
              group.pricingMode,
            )} (id: ${value.id})`,
          );
        });
      });
    }

    const variants = product.variants ?? [];
    if (variants.length > 0) {
      lines.push("   Variants (exact final prices):");
      variants.forEach((variant, variantIndex) => {
        lines.push(
          `     ${variantIndex + 1}. ${variant.label} — ${formatCatalogPrice(
            product.currency,
            variant.effectivePrice,
          )} (id: ${variant.id})`,
        );
      });
    }

    return lines.join("\n");
  });

  const fallbackNote = data.clientGroup.usedFallback ? " (default fallback applied)" : "";
  const quoteLine = data.quote ? ` Calculated total: ${data.quote.currency} ${data.quote.total}.` : "";
  const validationLine =
    data.quoteValidationErrors.length > 0
      ? ` Quote unavailable: ${data.quoteValidationErrors.join("; ")}.`
      : "";

  return (
    `Menu for ${data.clientGroup.name}${fallbackNote}:\n` +
    `Assistant display rule: Preserve line breaks when relaying this menu. ` +
    `Each product, option, variant, and price must stay on its own separate line; ` +
    `do not combine numbered items into one paragraph.\n` +
    `${productLines.join("\n\n")}${quoteLine}${validationLine}`
  );
}

export class GetProductMenuTool extends BaseTool {
  readonly name = "get_product_menu";
  readonly description =
    "Fetch the structured product catalog and effective prices for the current contact's client group. " +
    "Use this before quoting menu prices, flavour options, sizes, or a final total.";

  readonly parameters = {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Optional category filter, for example Cake or Drinks.",
      },
      query: {
        type: "string",
        description: "Optional search text to narrow products by name or description.",
      },
      productId: {
        type: "string",
        description: "Optional product id when you want one specific product or a final quote.",
      },
      selectedOptionValueIds: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional selected option value ids. When provided together with productId, the tool returns a calculated total.",
      },
      includeInactive: {
        type: "boolean",
        description: "Include inactive products. Defaults to false.",
      },
    },
    required: [],
  };

  async execute(
    args: Record<string, unknown>,
    context: AgentContext,
    _signal?: AbortSignal,
  ): Promise<ToolResult> {
    try {
      const result = await catalogService.buildProductMenuForContact({
        contactId: context.contact.id,
        category: typeof args.category === "string" ? args.category : undefined,
        query: typeof args.query === "string" ? args.query : undefined,
        productId: typeof args.productId === "string" ? args.productId : undefined,
        includeInactive: args.includeInactive === true,
        selectedOptionValueIds: Array.isArray(args.selectedOptionValueIds)
          ? args.selectedOptionValueIds.filter(
              (value): value is string => typeof value === "string",
            )
          : undefined,
      });

      return {
        success: true,
        data: result,
        summary: buildMenuSummary(result),
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        summary: `Failed to load product menu: ${error.message}`,
      };
    }
  }
}
