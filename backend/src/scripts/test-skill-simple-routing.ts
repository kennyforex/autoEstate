import assert from "node:assert/strict";
import { shouldBypassSimpleClassificationForGoalStack } from "../services/ai.service.js";
import { routeIntent } from "../agent/router.js";
import type { AgentContext, AgentSkillInfo, GoalStack } from "../agent/types.js";

function cakeSkill(): AgentSkillInfo {
  return {
    name: "Cake Booking",
    slug: "cake-booking",
    description: "Handles cake order booking workflow including flavors, quantities, pickup date, and add-ons.",
    triggerHints: ["訂蛋糕", "千層餅", "口味"],
    hasReferences: false,
    hasExamples: false,
    availableScripts: [],
    storagePath: "",
    requiredTools: [],
  };
}

function contextWithGoalStack(goalStack: GoalStack): AgentContext {
  return {
    conversationId: "conversation",
    channelId: "channel",
    contact: { id: "contact" },
    assistantId: "assistant",
    assistant: {
      id: "assistant",
      name: "Foodflow",
      primaryLanguage: "zh-TW",
      tone: "friendly",
      model: "test",
      pineconeAssistantName: "",
    },
    skills: [cakeSkill()],
    messageHistory: [
      { role: "user", content: "下星期一" },
      { role: "assistant", content: "講低想要邊款 + 幾多盒就 OK 😊" },
      { role: "user", content: "三號啊" },
    ],
    goalStack,
  };
}

async function main() {
  const activeGoalStack: GoalStack = {
    activeGoalId: "goal-1",
    goals: [
      {
        id: "goal-1",
        skillSlug: "cake-booking",
        status: "active",
        observations: {},
        createdAt: Date.now(),
      },
    ],
  };

  assert.equal(
    shouldBypassSimpleClassificationForGoalStack(activeGoalStack),
    true,
    "active skill goals must bypass the SIMPLE classifier",
  );

  assert.equal(
    shouldBypassSimpleClassificationForGoalStack({
      activeGoalId: null,
      goals: [
        {
          id: "goal-2",
          skillSlug: "cake-booking",
          status: "suspended",
          observations: {},
          createdAt: Date.now(),
          suspendedAt: Date.now(),
        },
      ],
    }),
    true,
    "suspended skill goals must bypass the SIMPLE classifier so the router can resume them",
  );

  assert.equal(
    shouldBypassSimpleClassificationForGoalStack({
      activeGoalId: null,
      goals: [
        {
          id: "goal-3",
          skillSlug: "cake-booking",
          status: "completed",
          observations: {},
          createdAt: Date.now(),
          completedAt: Date.now(),
        },
      ],
    }),
    false,
    "completed-only goal stacks can still use the SIMPLE classifier",
  );

  const decision = await routeIntent(contextWithGoalStack(activeGoalStack), "双朱古力");
  assert.deepEqual(
    decision,
    { action: "suggest_skill", slug: "cake-booking" },
    "persisted active skill goal must continue even when hidden skill markers were lost",
  );

  console.log("Skill simple routing regression tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
