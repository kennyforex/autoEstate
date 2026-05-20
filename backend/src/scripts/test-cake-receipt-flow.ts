import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { selectManagerToolsForContext } from "../agent/engine.js";
import { createDefaultRegistry } from "../agent/tools/index.js";
import { UpdateOrderPaymentTool, normalizePaymentProofInput } from "../agent/tools/updateOrderPayment.tool.js";
import type { AgentContext, RouterDecision } from "../agent/types.js";

function makeContextWithCakeSkill(): AgentContext {
  return {
    conversationId: "64f000000000000000000001",
    assistantId: "64f000000000000000000002",
    channelId: "64f000000000000000000003",
    source: "playground",
    contact: { id: "64f000000000000000000004", name: "Kenny" },
    assistant: {
      id: "64f000000000000000000002",
      name: "Cake Team",
      primaryLanguage: "auto",
      tone: "friendly",
      model: "gpt-4.1",
      pineconeAssistantName: "cake-team",
    },
    skills: [
      {
        name: "Cake Booking",
        slug: "cake-booking",
        description: "Handles cake orders and payment receipts.",
        triggerHints: ["cake", "receipt"],
        hasReferences: false,
        hasExamples: false,
        availableScripts: [],
        storagePath: "",
        requiredTools: ["document_data_capture"],
      },
    ],
    messageHistory: [],
  };
}

function testManagerToolScope() {
  const registry = createDefaultRegistry();
  const context = makeContextWithCakeSkill();
  const decision: RouterDecision = { action: "force_skill", slug: "cake-booking", reason: "receipt upload" };

  const toolNames = selectManagerToolsForContext(registry, context, decision)
    .map((tool) => tool.function.name)
    .sort();

  assert.deepEqual(toolNames, ["ask_clarification", "execute_skill"]);
  assert.equal(toolNames.includes("media_analysis"), false);
  assert.equal(toolNames.includes("google_sheets"), false);
  assert.equal(toolNames.includes("document_data_capture"), false);
}

function testPaymentToolShape() {
  const tool = new UpdateOrderPaymentTool();
  const paymentStatus = tool.parameters.properties.paymentStatus as { enum: string[] };

  assert.deepEqual(paymentStatus.enum, ["verifying"]);
  assert.equal(tool.parameters.required.includes("receiptUrl"), true);
  assert.ok(tool.parameters.properties.messageId);
}

function testPaymentProofNormalization() {
  const proof = normalizePaymentProofInput({
    receiptUrl: " http://localhost:3002/uploads/agent-chat/receipt.jpg ",
    receiptFileName: " receipt.jpg ",
    extracted: { amount: 210, currency: "HKD", reference: "ORD-1" },
    reviewNotes: " Matches order total. ",
  });

  assert.equal(proof.receiptUrl, "http://localhost:3002/uploads/agent-chat/receipt.jpg");
  assert.equal(proof.receiptFileName, "receipt.jpg");
  assert.deepEqual(proof.extracted, { amount: 210, currency: "HKD", reference: "ORD-1" });
  assert.equal(proof.reviewNotes, "Matches order total.");
  assert.ok(proof.checkedAt instanceof Date);
}

function testCakeSkillDoesNotRequireGoogleSheets() {
  const skillMd = readFileSync(path.join(process.cwd(), "skills/cake-booking/SKILL.md"), "utf-8");

  assert.equal(skillMd.includes("google_sheets"), false);
  assert.equal(skillMd.includes("試算表"), false);
}

testManagerToolScope();
testPaymentToolShape();
testPaymentProofNormalization();
testCakeSkillDoesNotRequireGoogleSheets();

console.log("Cake receipt flow checks passed.");
