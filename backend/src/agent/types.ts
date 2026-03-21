import type { Types } from 'mongoose';
import type { AssistantLanguage, AssistantTone } from '../models/Assistant.js';

// ── OpenRouter API Types ──

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
}

export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenRouterChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: OpenRouterToolCall[];
  };
  finish_reason: string;
}

export interface OpenRouterResponse {
  id: string;
  choices: OpenRouterChoice[];
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface OpenAITool {
  type: 'function';
  function: OpenAIToolFunction;
}

// ── Tool Types ──

export interface ToolResult {
  success: boolean;
  data: unknown;
  summary: string;
}

// ── Agent Step / Trace ──

export interface AgentStep {
  thought: string;
  action?: { tool: string; args: Record<string, unknown> };
  observation?: string;
  timestamp: Date;
}

// ── Agent Session (persisted for clarification resumption) ──

export interface AgentSessionData {
  conversationId: string;
  assistantId: string;
  status: 'active' | 'awaiting_clarification' | 'completed';
  originalMessage: string;
  steps: AgentStep[];
  messages: OpenRouterMessage[];
  pendingClarification?: string;
  expiresAt: Date;
}

// ── Agent Context (built per invocation) ──

export interface AgentContactInfo {
  id: string;
  name?: string;
  phoneNumber?: string;
  whatsappId?: string;
  email?: string;
  company?: string;
}

export interface AgentAssistantInfo {
  id: string;
  name: string;
  primaryLanguage: AssistantLanguage;
  tone: AssistantTone;
  instructions?: string;
  model: string;
  pineconeAssistantName: string;
}

export interface AgentSkillInfo {
  // Metadata only (always loaded in context)
  name: string;
  slug: string;
  description: string;
  triggerHints: string[];

  // Content availability flags
  hasReferences: boolean;
  hasExamples: boolean;
  availableScripts: string[];

  // Storage location for on-demand content loading
  storagePath: string;

  // Legacy: backward compatibility
  instructions?: string;
  requiredTools?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Goal Stack (multi-goal management) ──

export type GoalStatus = 'active' | 'suspended' | 'completed';

export interface SkillGoal {
  id: string;
  skillSlug: string;
  status: GoalStatus;
  observations: Record<string, string>;
  createdAt: number;
  suspendedAt?: number;
  completedAt?: number;
}

export interface GoalStack {
  goals: SkillGoal[];
  activeGoalId: string | null;
}

export interface AgentContext {
  conversationId: string;
  assistantId: string;
  channelId: string;
  contact: AgentContactInfo;
  assistant: AgentAssistantInfo;
  skills: AgentSkillInfo[];
  messageHistory: ChatMessage[];
  session?: AgentSessionData;
  markdownEnabled?: boolean;
  goalStack?: GoalStack;
}

// ── Agent Result ──

export interface AgentResult {
  type: 'final_answer' | 'clarification';
  content: string;
  citations?: Array<{
    position: number;
    references: Array<{
      file: { id: string; name: string };
      pages: number[];
    }>;
  }>;
  session?: AgentSessionData;
  steps: AgentStep[];
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ── Agent Events ──

export type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; result: AgentResult }
  | { type: 'turn_start'; iteration: number }
  | { type: 'turn_end'; iteration: number }
  | { type: 'tool_start'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolName: string; result: ToolResult }
  | { type: 'tool_error'; toolName: string; error: string }
  | { type: 'thinking'; content: string };

export type AgentEventCallback = (event: AgentEvent) => void;

// ── Tool Hooks ──

export interface BeforeToolCallContext {
  toolName: string;
  args: Record<string, unknown>;
  context: AgentContext;
  loopState: AgentLoopState;
}

export interface AfterToolCallContext {
  toolName: string;
  result: ToolResult;
  context: AgentContext;
  loopState: AgentLoopState;
}

export interface AgentLoopState {
  steps: AgentStep[];
  messages: OpenRouterMessage[];
  userMessage: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export type BeforeToolCallHook = (ctx: BeforeToolCallContext) => Promise<
  | { block: true; reason: string }
  | { shortCircuit: true; result: AgentResult }
  | undefined
>;

export type AfterToolCallHook = (ctx: AfterToolCallContext) => Promise<
  | { shortCircuit: true; result: AgentResult }
  | undefined
>;

// ── Agent Engine Config ──

export interface AgentEngineConfig {
  maxIterations: number;
  requestTimeout: number;
  temperature: number;
  maxTokens: number;
  maxHistoryTokens: number;
  llmMaxRetries: number;
  toolExecution: 'parallel' | 'sequential';
  beforeToolCall?: BeforeToolCallHook;
  afterToolCall?: AfterToolCallHook;
}
