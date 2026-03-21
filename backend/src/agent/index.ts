export { AgentEngine } from './engine.js';
export { buildAgentContext, buildPlaygroundContext } from './context.js';
export { buildSystemPrompt } from './prompt.js';
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
    const slug = data?.skill || '';
    const isComplete = data?.completed || false;
    const observations = data?.observations || {};

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
