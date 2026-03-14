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

// ── Agent Engine Config ──

export interface AgentEngineConfig {
  maxIterations: number;
  requestTimeout: number;
  temperature: number;
  maxTokens: number;
}
