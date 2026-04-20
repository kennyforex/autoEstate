export type PriceByGroup = Record<string, number | undefined>;
export type ProductOptionPricingMode = "absolute" | "delta";

export interface QuoteOptionValue {
  id: string;
  label: string;
  priceByGroup?: PriceByGroup;
}

export interface QuoteOptionGroup {
  pricingMode?: ProductOptionPricingMode;
  values: QuoteOptionValue[];
}

export interface QuoteProduct {
  basePriceByGroup?: PriceByGroup;
  optionGroups?: QuoteOptionGroup[];
}

export interface ProductQuoteBreakdownItem {
  valueId: string;
  label: string;
  amount: number;
  pricingMode: ProductOptionPricingMode;
}

export interface ProductQuoteResult {
  total: number;
  breakdown: ProductQuoteBreakdownItem[];
}

export function resolvePriceByClientGroup(
  priceByGroup: PriceByGroup | undefined,
  clientGroupSlug: string,
  defaultGroupSlug: string,
): number {
  if (!priceByGroup) return 0;

  const directPrice = priceByGroup[clientGroupSlug];
  if (typeof directPrice === "number") return directPrice;

  const defaultPrice = priceByGroup[defaultGroupSlug];
  if (typeof defaultPrice === "number") return defaultPrice;

  return 0;
}

export function calculateProductQuote(
  product: QuoteProduct,
  selectedValueIds: string[],
  clientGroupSlug: string,
  defaultGroupSlug: string,
): ProductQuoteResult {
  const basePrice = resolvePriceByClientGroup(
    product.basePriceByGroup,
    clientGroupSlug,
    defaultGroupSlug,
  );
  let deltaTotal = 0;
  let absoluteTotal = 0;
  let hasAbsoluteSelection = false;

  const breakdown: ProductQuoteBreakdownItem[] = [];

  for (const group of product.optionGroups ?? []) {
    for (const value of group.values) {
      if (!selectedValueIds.includes(value.id)) continue;

      const pricingMode = group.pricingMode ?? "delta";
      const amount = resolvePriceByClientGroup(
        value.priceByGroup,
        clientGroupSlug,
        defaultGroupSlug,
      );

      if (pricingMode === "absolute") {
        absoluteTotal += amount;
        hasAbsoluteSelection = true;
      } else {
        deltaTotal += amount;
      }

      breakdown.push({
        valueId: value.id,
        label: value.label,
        amount,
        pricingMode,
      });
    }
  }

  return {
    total: (hasAbsoluteSelection ? absoluteTotal : basePrice) + deltaTotal,
    breakdown,
  };
}
