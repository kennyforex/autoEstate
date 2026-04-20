import assert from "node:assert/strict";

import {
  calculateProductQuote,
  resolvePriceByClientGroup,
} from "../utils/catalogPricing.js";

function runCatalogPricingTests() {
  const basic = resolvePriceByClientGroup(
    { basic: 280, vip: 250 },
    "basic",
    "basic",
  );
  assert.equal(basic, 280);

  const fallbackToDefault = resolvePriceByClientGroup(
    { basic: 280 },
    "vip",
    "basic",
  );
  assert.equal(fallbackToDefault, 280);

  const quote = calculateProductQuote(
    {
      basePriceByGroup: { basic: 0, vip: 0 },
      optionGroups: [
        {
          pricingMode: "absolute",
          values: [
            { id: "size-6", label: "6 inch", priceByGroup: { basic: 280, vip: 250 } },
            { id: "size-8", label: "8 inch", priceByGroup: { basic: 380, vip: 340 } },
          ],
        },
        {
          pricingMode: "delta",
          values: [
            { id: "fruit", label: "Fresh fruit", priceByGroup: { basic: 80, vip: 60 } },
          ],
        },
      ],
    },
    ["size-8", "fruit"],
    "vip",
    "basic",
  );

  assert.equal(quote.total, 400);
  assert.deepEqual(quote.breakdown, [
    { valueId: "size-8", label: "8 inch", amount: 340, pricingMode: "absolute" },
    { valueId: "fruit", label: "Fresh fruit", amount: 60, pricingMode: "delta" },
  ]);

  console.log("Catalog pricing checks passed.");
}

runCatalogPricingTests();
