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
import { conversationStateService } from '../services/conversationState.service.js';
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

const afterToolCall: AfterToolCallHook = async ({ toolName, result, context, loopState }) => {
  if (toolName === 'execute_skill' && result.success && result.summary) {
    const data = result.data as any;
    const convId = context.conversationId;
    const isPlayground = convId === 'playground';

    if (data?.outOfScope) {
      console.log(`[Agent] Skill "${data.skill}" returned OUT_OF_SCOPE: ${data.reason}`);
      return { outOfScope: true as const, failedSkillSlug: data.skill as string, reason: data.reason as string };
    }

    const slug = data?.skill || '';
    const isComplete = data?.completed || false;
    const observations = data?.observations || {};
    const unhandledIntent = data?.unhandledIntent as string | undefined;

    // Persist goal state to DB (skip for playground)
    if (slug && !isPlayground) {
      try {
        if (isComplete) {
          const updated = await conversationStateService.completeGoal(convId, slug, observations);
          context.goalStack = updated;
          console.log(`[Agent] Goal "${slug}" completed — persisted to DB`);
        } else {
          const skill = context.skills.find((s) => s.slug === slug);
          const updated = await conversationStateService.activateGoal(convId, slug, skill?.steps);
          context.goalStack = updated;
          if (Object.keys(observations).length > 0) {
            await conversationStateService.updateStepProgress(convId, slug, observations);
          }
          console.log(`[Agent] Goal "${slug}" active — persisted to DB`);
        }
      } catch (err: any) {
        console.error(`[Agent] Failed to persist goal state: ${err.message}`);
      }
    }

    // Keep markers in message content for backward compatibility
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
