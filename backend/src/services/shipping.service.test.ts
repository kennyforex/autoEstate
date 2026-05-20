import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeShippingLabel } from "./shipping.service.js";

describe("shipping.service", () => {
  describe("normalizeShippingLabel", () => {
    it("normalizes emoji and punctuation differences for delivery labels", () => {
      assert.equal(
        normalizeShippingLabel("代call車🚚送貨運費到付"),
        normalizeShippingLabel("代call車送貨（運費到付）"),
      );
    });
  });
});
