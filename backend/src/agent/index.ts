export { AgentEngine } from './engine.js';
export { buildAgentContext, buildPlaygroundContext } from './context.js';
export { buildSystemPrompt } from './prompt.js';
export { routeIntent } from './router.js';
export { createDefaultRegistry, ToolRegistry, BaseTool } from './tools/index.js';
export type {
  AgentContext,
  AgentResult,
  AgentStep,
  AgentSessionData,
  AgentEngineConfig,
  AgentEvent,
  AgentEventCallback,
  ToolResult,
  ChatMessage,
  SkillGoal,
  GoalStack,
  GoalStatus,
  SkillExecutionResult,
  RouterDecision,
} from './types.js';

import { AgentEngine } from './engine.js';
import { createDefaultRegistry } from './tools/index.js';
import type {
  AgentResult,
  AgentSessionData,
  BeforeToolCallHook,
  AfterToolCallHook,
} from './types.js';

const registry = createDefaultRegistry();

const beforeToolCall: BeforeToolCallHook = async ({ toolName, args, context, loopState }) => {
  if (toolName === 'ask_clarification') {
    const question = (args.question as string) || 'Could you please provide more details?';
    const session: AgentSessionData = {
      conversationId: context.conversationId,
      assistantId: context.assistantId,
      status: 'awaiting_clarification',
      originalMessage: loopState.userMessage,
      steps: loopState.steps,
      messages: loopState.messages,
      pendingClarification: question,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };

    console.log(`[Agent] Clarification requested: "${question.substring(0, 100)}"`);
    const result: AgentResult = {
      type: 'clarification',
      content: question,
      session,
      steps: loopState.steps,
      model: loopState.model,
      usage: loopState.usage,
    };
    return { shortCircuit: true as const, result };
  }
  return undefined;
};

const afterToolCall: AfterToolCallHook = async ({ toolName, result, loopState }) => {
  if (toolName === 'execute_skill' && result.success && result.summary) {
    const data = result.data as any;

    // OUT_OF_SCOPE: skill cannot handle this request — let engine re-route
    if (data?.outOfScope) {
      console.log(`[Agent] Skill "${data.skill}" returned OUT_OF_SCOPE: ${data.reason}`);
      return { outOfScope: true as const, failedSkillSlug: data.skill as string, reason: data.reason as string };
    }

    const slug = data?.skill || '';
    const isComplete = data?.completed || false;
    const observations = data?.observations || {};
    const unhandledIntent = data?.unhandledIntent as string | undefined;

    let marker = '';
    if (slug) {
      if (isComplete) {
        const obsJson = JSON.stringify(observations);
        marker = `\n<!-- skill:${slug}:complete ${obsJson} -->`;
        console.log(`[Agent] Skill "${slug}" COMPLETED — observations: ${obsJson}`);
      } else {
        marker = `\n<!-- skill:${slug} -->`;
      }
    }

    // UNHANDLED_INTENT: skill processed its part but user also asked something outside scope
    if (unhandledIntent) {
      console.log(`[Agent] Skill "${slug}" has UNHANDLED_INTENT: ${unhandledIntent}`);
      const partialResult: AgentResult = {
        type: 'final_answer',
        content: result.summary + marker,
        steps: loopState.steps,
        model: loopState.model,
        usage: loopState.usage,
      };
      return {
        unhandledIntent: true as const,
        partialResult,
        intentDescription: unhandledIntent,
        sourceSkillSlug: slug,
      };
    }

    console.log(`[Agent] Skill returned response — short-circuiting to final answer`);
    const agentResult: AgentResult = {
      type: 'final_answer',
      content: result.summary + marker,
      steps: loopState.steps,
      model: loopState.model,
      usage: loopState.usage,
    };
    return { shortCircuit: true as const, result: agentResult };
  }
  return undefined;
};

export const agentEngine = new AgentEngine(registry, {
  beforeToolCall,
  afterToolCall,
});
