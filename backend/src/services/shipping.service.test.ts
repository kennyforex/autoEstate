import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeShippingLabel, shippingService } from "./shipping.service.js";

describe("shipping.service", () => {
  describe("normalizeShippingLabel", () => {
    it("normalizes emoji and punctuation differences for delivery labels", () => {
      assert.equal(
        normalizeShippingLabel("代call車🚚送貨運費到付"),
        normalizeShippingLabel("代call車送貨（運費到付）"),
      );
    });
  });

  describe("resolveShipping", () => {
    it("does not pick a configured method when fuzzy text is ambiguous", async () => {
      const originalList = shippingService.list.bind(shippingService);
      shippingService.list = async () => [
        {
          id: "ship-1",
          labelZh: "代call車送貨（運費到付）",
          labelEn: "Call car delivery",
          fee: 0,
          sortOrder: 1,
          isActive: true,
        },
        {
          id: "ship-2",
          labelZh: "本地送貨",
          labelEn: "Local delivery",
          fee: 80,
          sortOrder: 2,
          isActive: true,
        },
      ];
      try {
        const resolved = await shippingService.resolveShipping({ shippingMethod: "送貨" });
        assert.equal(resolved.kind, "custom");
        assert.equal(resolved.normalizedLabel, "送貨");
      } finally {
        shippingService.list = originalList;
      }
    });
  });
});
