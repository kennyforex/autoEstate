import assert from "node:assert/strict";
import mongoose from "mongoose";

import { OrderTag } from "../models/OrderTag.js";
import { Tag } from "../models/Tag.js";
import { orderService } from "../services/order.service.js";

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  assert.ok(MONGODB_URI, "MONGODB_URI is required for test-order-tags");
  await mongoose.connect(MONGODB_URI!);

  await OrderTag.deleteMany({ label: /^spec-order-tag-/i });

  const beta = await OrderTag.create({
    label: "spec-order-tag-beta",
    color: "#10B981",
  });
  const alpha = await OrderTag.create({
    label: "spec-order-tag-alpha",
    color: "#3B82F6",
  });

  const sorted = await OrderTag.find({
    _id: { $in: [alpha._id, beta._id] },
  }).sort({ label: 1 });
  assert.deepEqual(
    sorted.map((tag) => tag.label),
    ["spec-order-tag-alpha", "spec-order-tag-beta"],
  );

  const updated = await OrderTag.findByIdAndUpdate(
    alpha._id,
    { label: "spec-order-tag-alpha-2", color: "#F59E0B" },
    { new: true },
  );
  assert.equal(updated?.label, "spec-order-tag-alpha-2");
  assert.equal(updated?.color, "#F59E0B");

  const sharedChatTag = await Tag.create({
    label: "spec-chat-tag-do-not-use",
    color: "#EF4444",
  });

  const orderTag = await OrderTag.create({
    label: "spec-order-tag-in-use",
    color: "#8B5CF6",
  });

  const order = await orderService.create({
    source: "manual",
    clientName: "Spec Customer",
    items: [
      {
        snapshot: { productName: "Spec Product" },
        quantity: 1,
        unitPrice: 88,
      },
    ],
    tagIds: [String(orderTag._id), String(sharedChatTag._id)],
  });

  assert.deepEqual(order.tagIds.map(String), [String(orderTag._id)]);

  const inUse = await mongoose.connection.collection("orders").findOne({ _id: order._id });
  assert.ok(inUse, "Expected order record to exist");

  const orderTagDeleteCheck = await mongoose.connection
    .collection("orders")
    .countDocuments({ tagIds: orderTag._id });
  assert.equal(orderTagDeleteCheck, 1);

  await mongoose.connection.collection("orders").deleteMany({
    clientName: "Spec Customer",
  });
  await Tag.deleteMany({ label: "spec-chat-tag-do-not-use" });
  await OrderTag.deleteMany({
    label: {
      $in: ["spec-order-tag-in-use", "spec-order-tag-alpha-2", "spec-order-tag-beta"],
    },
  });

  await mongoose.disconnect();
  console.log("Order tag CRUD smoke checks passed.");
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
