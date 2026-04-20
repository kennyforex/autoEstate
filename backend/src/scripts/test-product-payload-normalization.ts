import assert from "node:assert/strict";

import { normalizeProductPayload } from "../utils/productPayload.js";

function runProductPayloadNormalizationTests() {
  const payload = normalizeProductPayload({
    name: "Matcha Cake",
    optionGroups: [
      {
        name: "Size",
        values: [
          { label: "  " },
          { label: "  Large  ", isDefault: true },
        ],
      },
      {
        name: "  ",
        values: [{ label: "" }],
      },
    ],
  });

  assert.equal(payload.optionGroups.length, 1);
  assert.equal(payload.optionGroups[0].name, "Size");
  assert.equal(payload.optionGroups[0].values.length, 1);
  assert.equal(payload.optionGroups[0].values[0].label, "Large");
  assert.equal(payload.optionGroups[0].values[0].isDefault, true);

  console.log("Product payload normalization checks passed.");
}

runProductPayloadNormalizationTests();
