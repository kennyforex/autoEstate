import assert from "node:assert/strict";

import { buildMenuSummary } from "../agent/tools/getProductMenu.tool.js";
import { catalogService } from "../services/catalog.service.js";
import { normalizeNumberedMenuLineBreaks } from "../utils/assistantMessageFormatting.js";

function createFakeProduct() {
  return {
    _id: { toString: () => "product-cake" },
    name: "合桃千層餅",
    slug: "walnut-cake",
    category: "千層餅",
    description: "",
    currency: "HKD",
    isActive: true,
    displayOrder: 1,
    images: [],
    primaryImageUrl: undefined,
    basePriceByGroup: new Map([["basic", 0]]),
    variants: [
      {
        id: "half__original",
        optionValueIds: ["half", "original"],
        label: "半條 / 原味",
        isActive: true,
        displayOrder: 2,
        priceByGroup: new Map([["basic", 180]]),
      },
      {
        id: "whole__original",
        optionValueIds: ["whole", "original"],
        label: "原條 / 原味",
        isActive: true,
        displayOrder: 1,
        priceByGroup: new Map([["basic", 350]]),
      },
    ],
    optionGroups: [
      {
        id: "flavour",
        name: "Flavour",
        selectionType: "single",
        pricingMode: "delta",
        required: true,
        displayOrder: 2,
        values: [
          {
            id: "salted",
            label: "岩鹽焦糖味",
            isDefault: false,
            isActive: true,
            displayOrder: 2,
            priceByGroup: new Map([["basic", 30]]),
          },
          {
            id: "original",
            label: "原味",
            isDefault: true,
            isActive: true,
            displayOrder: 1,
            priceByGroup: new Map([["basic", 0]]),
          },
        ],
      },
      {
        id: "size",
        name: "Size",
        selectionType: "single",
        pricingMode: "absolute",
        required: true,
        displayOrder: 1,
        values: [
          {
            id: "square-14",
            label: "14x14cm正方形size",
            isDefault: false,
            isActive: true,
            displayOrder: 3,
            priceByGroup: new Map([["basic", 150]]),
          },
          {
            id: "half",
            label: "半條",
            isDefault: false,
            isActive: true,
            displayOrder: 2,
            priceByGroup: new Map([["basic", 180]]),
          },
          {
            id: "whole",
            label: "原條",
            isDefault: true,
            isActive: true,
            displayOrder: 1,
            priceByGroup: new Map([["basic", 350]]),
          },
        ],
      },
    ],
  };
}

function runProductMenuOutputTests() {
  const serializer = (catalogService as unknown as {
    serializeProductForClientGroup: (
      product: ReturnType<typeof createFakeProduct>,
      clientGroupSlug: string,
      defaultGroupSlug: string,
      includeInactive?: boolean,
    ) => any;
  }).serializeProductForClientGroup.bind(catalogService);

  const product = serializer(createFakeProduct(), "basic", "basic");

  assert.deepEqual(
    product.optionGroups.map((group: { id: string }) => group.id),
    ["size", "flavour"],
  );
  assert.deepEqual(
    product.optionGroups[0].values.map((value: { id: string }) => value.id),
    ["whole", "half", "square-14"],
  );
  assert.deepEqual(
    product.variants.map((variant: { id: string }) => variant.id),
    ["whole__original", "half__original"],
  );

  const summary = buildMenuSummary({
    clientGroup: { name: "Basic", usedFallback: false },
    products: [product],
    quote: null,
    quoteValidationErrors: [],
  });

  assert.match(summary, /1\. 合桃千層餅 \[千層餅\]/);
  assert.match(summary, /Option group 1: Size/);
  assert.match(summary, /1\. 原條 — HKD 350 \(id: whole\)/);
  assert.match(summary, /2\. 半條 — HKD 180 \(id: half\)/);
  assert.match(summary, /3\. 14x14cm正方形size — HKD 150 \(id: square-14\)/);
  assert.match(summary, /Variants \(exact final prices\):/);
  assert.match(summary, /1\. 原條 \/ 原味 — HKD 350 \(id: whole__original\)/);
  assert.match(summary, /Preserve line breaks when relaying this menu/i);
  assert.ok(
    summary.includes("1. 原條 — HKD 350 (id: whole)\n     2. 半條 — HKD 180 (id: half)"),
    "menu options should remain on separate lines",
  );

  const compressedReply =
    "❣️ 一盒原條合桃千層餅 25cm × 7cm（約 8 件） 1️⃣ 原味 → $350 2️⃣ 岩鹽焦糖味 → $380 3️⃣ 雙重朱古力味 → $380";
  assert.equal(
    normalizeNumberedMenuLineBreaks(compressedReply),
    "❣️ 一盒原條合桃千層餅 25cm × 7cm（約 8 件）\n1️⃣ 原味 → $350\n2️⃣ 岩鹽焦糖味 → $380\n3️⃣ 雙重朱古力味 → $380",
  );

  console.log("Product menu output checks passed.");
}

runProductMenuOutputTests();
