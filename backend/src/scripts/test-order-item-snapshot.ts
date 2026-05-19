import assert from "node:assert/strict";
import { Types } from "mongoose";
import { resolveOrderItemSnapshot } from "../utils/orderItemSnapshot.js";
import type { IProductDocument } from "../models/Product.js";

const productId = new Types.ObjectId();
const fakeProduct = {
  _id: productId,
  name: "合桃千層餅",
  images: ["/uploads/walnut.jpg"],
  primaryImageUrl: "/uploads/walnut.jpg",
  variants: [
    { id: "whole__original", label: "原條 / 原味", isActive: true },
    { id: "half__original", label: "半條 / 原味", isActive: true },
  ],
} as unknown as IProductDocument;

const products = [fakeProduct];

// Agent passes variant id as productId (v17.0 bug)
const fromVariantId = resolveOrderItemSnapshot(
  {
    productId: "whole__original",
    productName: "合桃千層餅",
    variantLabel: "原條 / 原味",
  },
  products,
);
assert.equal(fromVariantId.snapshot.productId, productId.toString());
assert.equal(fromVariantId.snapshot.variantLabel, "原條 / 原味");
assert.equal(fromVariantId.variantId, "whole__original");

// Name only (no productId)
const fromName = resolveOrderItemSnapshot(
  { productName: "合桃千層餅", variantLabel: "原條 / 原味" },
  products,
);
assert.equal(fromName.snapshot.productId, productId.toString());
assert.equal(fromName.variantId, "whole__original");

console.log("✅ order item snapshot resolution tests passed");
