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
  ToolResult,
  ChatMessage,
} from './types.js';

import { AgentEngine } from './engine.js';
import { createDefaultRegistry } from './tools/index.js';

const registry = createDefaultRegistry();
export const agentEngine = new AgentEngine(registry);
