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

// ── Citations (KB tool → agent result / steps) ──

export type AgentCitationBundle = Array<{
  position: number;
  references: Array<{
    file: { id: string; name: string };
    pages: number[];
  }>;
}>;

// ── Agent Step / Trace ──

export interface AgentStep {
  thought: string;
  action?: { tool: string; args: Record<string, unknown> };
  observation?: string;
  /** Populated when a tool (e.g. knowledge_base) returns structured citations */
  citations?: AgentCitationBundle;
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

/** Department roster entry for prompts (manager + staff). */
export interface AgentTeamMemberInfo {
  staffId: string;
  displayName: string;
  roleTitle: string;
  responsibilitiesSnippet: string;
  skillSlugs: string[];
  isManager: boolean;
}

export interface AgentAssistantInfo {
  id: string;
  name: string;
  /** Department label */
  departmentName?: string;
  /** Speaking name of the manager (user-facing channel) */
  managerName?: string;
  managerNickname?: string;
  primaryLanguage: AssistantLanguage;
  tone: AssistantTone;
  instructions?: string;
  model: string;
  pineconeAssistantName: string;
  /** Populated when assistant has staff roster (department mode). */
  teamRoster?: AgentTeamMemberInfo[];
}

export interface SkillStepDef {
  id: string;
  label: string;
  collects?: string;
}

export interface AgentSkillInfo {
  name: string;
  slug: string;
  description: string;
  triggerHints: string[];

  hasReferences: boolean;
  hasExamples: boolean;
  availableScripts: string[];

  storagePath: string;

  steps?: SkillStepDef[];

  instructions?: string;
  requiredTools?: string[];
  reminderDelay?: number;
  maxReminders?: number;
  /** Staff member who owns this skill in the department */
  ownerDisplayName?: string;
  ownerRoleTitle?: string;
  ownerResponsibilitiesSnippet?: string;
  /** MongoDB staff _id of the owner (for UI org chart, etc.) */
  ownerStaffId?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Goal Stack (multi-goal management) ──

export type GoalStatus = 'active' | 'suspended' | 'completed';

export interface SkillStepProgress {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed';
  collects?: string;
  collectedValue?: string;
}

export interface SkillGoal {
  id: string;
  skillSlug: string;
  status: GoalStatus;
  observations: Record<string, string>;
  steps?: SkillStepProgress[];
  createdAt: number;
  suspendedAt?: number;
  completedAt?: number;
}

export interface GoalStack {
  goals: SkillGoal[];
  activeGoalId: string | null;
}

// ── Structured Skill Execution Result ──

export interface SkillExecutionResult {
  type: 'response' | 'out_of_scope' | 'complete';
  content: string;
  observations?: Record<string, string>;
  unhandledIntent?: string;
  outOfScopeReason?: string;
}

// ── Router Decision ──

export type RouterDecision =
  | { action: 'force_skill'; slug: string; reason: string }
  | { action: 'suggest_skill'; slug: string }
  | {
      action: 'llm_decide';
      /** Soft routing: classifier picked a skill but confidence was below force threshold */
      hint?: { slug: string; reason: string; confidence: number };
    };

/** Shared Chromium session for multiple web_browser tool calls in one AgentEngine.run(). */
export interface PlaywrightRunSession {
  browser: import('playwright').Browser;
  context: import('playwright').BrowserContext;
  page: import('playwright').Page;
  openedAt: number;
}

/** In-memory only for one AgentEngine.run(); not persisted. */
export interface AgentContextEphemeral {
  playwright?: PlaywrightRunSession;
}

export interface AgentContext {
  conversationId: string;
  assistantId: string;
  channelId: string;
  userId?: string;
  contact: AgentContactInfo;
  assistant: AgentAssistantInfo;
  skills: AgentSkillInfo[];
  messageHistory: ChatMessage[];
  session?: AgentSessionData;
  markdownEnabled?: boolean;
  goalStack?: GoalStack;
  /** Per-run state (e.g. Playwright); isolated per chat — new object each AgentEngine.run(). */
  ephemeral?: AgentContextEphemeral;
  /** Set only while a skill sub-agent runs tools (so tools can read that skill's SKILL.md). */
  activeSkillSlug?: string;
  /**
   * Verbatim user message for this agent turn (includes `Image URL:` / `PDF URL:` from Playground or inbox).
   * The manager model often passes a short `userRequest` into `execute_skill` without attachment lines; skills merge this in.
   */
  lastUserTurnContent?: string;
  /** Set for a single `AgentEngine.run` when router returns a soft hint (not persisted). */
  routerHint?: { slug: string; reason: string; confidence: number };
}

// ── Agent Result ──

export interface AgentResult {
  type: 'final_answer' | 'clarification';
  content: string;
  /** Staff member whose skill produced this reply (playground org chart). */
  activeStaffId?: string;
  activeSkillSlug?: string;
  citations?: AgentCitationBundle;
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
  unhandledSkillSlugs: Set<string>;
  pendingPartialResult?: AgentResult;
  /** Last skill slug whose execute_skill completed successfully this turn (not out_of_scope). */
  lastResponsibleSkillSlug?: string;
}

export type BeforeToolCallHook = (ctx: BeforeToolCallContext) => Promise<
  | { block: true; reason: string }
  | { shortCircuit: true; result: AgentResult }
  | undefined
>;

export type AfterToolCallHook = (ctx: AfterToolCallContext) => Promise<
  | { shortCircuit: true; result: AgentResult }
  | { outOfScope: true; failedSkillSlug: string; reason: string }
  | { unhandledIntent: true; partialResult: AgentResult; intentDescription: string; sourceSkillSlug: string }
  | undefined
>;

// ── Agent Engine Config ──

export interface AgentEngineConfig {
  maxIterations: number;
  requestTimeout: number;
  temperature: number;
  maxTokens: number;
  maxHistoryTokens: number;
  /** When trimming history, keep at least this many messages (chronological tail priority). */
  minHistoryMessages: number;
  /** Truncate each tool result string appended to the LLM context beyond this length. */
  maxToolResultChars: number;
  llmMaxRetries: number;
  toolExecution: 'parallel' | 'sequential';
  beforeToolCall?: BeforeToolCallHook;
  afterToolCall?: AfterToolCallHook;
}
