/**
 * Smoke test for add_order_activity agent tool and orderService.addActivity.
 *
 * Usage (from backend/):
 *   npx tsx src/scripts/test-add-order-activity.ts
 *
 * Optional env:
 *   ORDER_ACTIVITY_TEST_ORDER_NUMBER  Use existing order instead of creating one
 */
import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { AddOrderActivityTool } from "../agent/tools/addOrderActivity.tool.js";
import { Order } from "../models/index.js";
import { orderService } from "../services/order.service.js";
import type { AgentContext } from "../agent/types.js";

const MONGODB_URI = process.env.MONGODB_URI;
const SPEC_CLIENT = "spec-add-order-activity-client";
const SPEC_MESSAGE = `[spec] add_order_activity test ${new Date().toISOString()}`;

function minimalContext(): AgentContext {
  return {
    conversationId: "script-test",
    assistantId: "script-test-assistant",
    channelId: "script-test",
    source: "playground",
    userId: "script-test-user",
    contact: { id: "507f1f77bcf86cd799439099", name: "Spec" },
    assistant: {
      id: "script-test-assistant",
      name: "Script Test",
      primaryLanguage: "en",
      tone: "professional",
      model: "stub",
      pineconeAssistantName: "stub",
    },
    skills: [],
    messageHistory: [],
  };
}

async function cleanupSpecOrders(): Promise<void> {
  await Order.deleteMany({ clientName: SPEC_CLIENT });
}

async function createSpecOrder() {
  return orderService.create({
    source: "manual",
    clientName: SPEC_CLIENT,
    items: [
      {
        snapshot: { productName: "Spec Activity Product" },
        quantity: 1,
        unitPrice: 1,
      },
    ],
  });
}

async function run(): Promise<void> {
  assert.ok(MONGODB_URI, "MONGODB_URI is required");
  await mongoose.connect(MONGODB_URI!);

  const tool = new AddOrderActivityTool();
  const ctx = minimalContext();
  let order = null as Awaited<ReturnType<typeof createSpecOrder>> | null;
  let createdForTest = false;

  try {
    const existingNumber = process.env.ORDER_ACTIVITY_TEST_ORDER_NUMBER?.trim();
    if (existingNumber) {
      order = await orderService.getByOrderNumber(existingNumber);
      assert.ok(order, `Order not found: ${existingNumber}`);
      console.log(`Using existing order ${order.orderNumber}`);
    } else {
      await cleanupSpecOrders();
      order = await createSpecOrder();
      createdForTest = true;
      console.log(`Created spec order ${order.orderNumber}`);
    }

    const beforeCount = order.activity.length;

    const missingIdResult = await tool.execute({ message: "should fail" }, ctx);
    assert.equal(missingIdResult.success, false);
    assert.match(missingIdResult.summary, /orderId or orderNumber/i);

    const missingOrderResult = await tool.execute(
      { orderNumber: "ORD-NONEXISTENT-000000", message: "x" },
      ctx,
    );
    assert.equal(missingOrderResult.success, false);
    assert.match(missingOrderResult.summary, /not found/i);

    const byNumber = await tool.execute(
      { orderNumber: order.orderNumber, message: SPEC_MESSAGE },
      ctx,
    );
    console.log("byNumber:", JSON.stringify(byNumber, null, 2));
    assert.equal(byNumber.success, true);
    assert.equal((byNumber.data as { orderNumber?: string })?.orderNumber, order.orderNumber);

    const reloaded = await orderService.getById(order._id.toString());
    assert.ok(reloaded);
    const added = reloaded.activity.find((a) => a.message === SPEC_MESSAGE);
    assert.ok(added, "Expected activity entry with spec message");
    assert.equal(added.kind, "system");
    assert.equal(reloaded.activity.length, beforeCount + 1);

    const byIdMessage = `${SPEC_MESSAGE} (by id)`;
    const byId = await tool.execute(
      { orderId: order._id.toString(), message: byIdMessage },
      ctx,
    );
    console.log("byId:", JSON.stringify(byId, null, 2));
    assert.equal(byId.success, true);

    const reloaded2 = await orderService.getById(order._id.toString());
    assert.ok(reloaded2?.activity.some((a) => a.message === byIdMessage && a.kind === "system"));

    console.log("");
    console.log("PASS add_order_activity — system entries appended to order activity.");
  } finally {
    if (createdForTest) {
      await cleanupSpecOrders();
      console.log("Cleaned up spec test order(s).");
    }
    await mongoose.disconnect();
  }
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
