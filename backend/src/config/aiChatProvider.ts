import axios, { type AxiosRequestConfig } from 'axios';
import { openRouterHeaders } from './httpAttribution.js';
import { openRouterConfig } from './openrouter.js';
import type { OpenAITool, OpenRouterMessage, OpenRouterResponse } from '../agent/types.js';

export type AiChatProvider = 'openrouter' | 'deepseek';
export type AiChatProviderSymbol = 'D' | 'O';
export type AiChatUseCase = 'agent' | 'skill' | 'router' | 'fast';

export interface ChatCompletionRequest {
  useCase: AiChatUseCase;
  title: string;
  messages: OpenRouterMessage[];
  tools?: OpenAITool[];
  toolChoice?: 'auto' | { type: 'function'; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  signal?: AbortSignal;
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function normalizedProvider(): AiChatProvider {
  const raw = process.env.AI_CHAT_PROVIDER?.trim().toLowerCase();
  return raw === 'deepseek' ? 'deepseek' : 'openrouter';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export const aiChatProvider = {
  get provider(): AiChatProvider {
    return normalizedProvider();
  },

  get isDeepSeek(): boolean {
    return this.provider === 'deepseek';
  },

  sourceSymbol(): AiChatProviderSymbol {
    return this.isDeepSeek ? 'D' : 'O';
  },

  model(useCase: AiChatUseCase): string {
    if (this.isDeepSeek) {
      if (useCase === 'router') {
        return process.env.DEEPSEEK_ROUTER_MODEL?.trim() || 'deepseek-v4-pro';
      }
      if (useCase === 'fast') {
        return (
          process.env.DEEPSEEK_FAST_MODEL?.trim() ||
          process.env.DEEPSEEK_ROUTER_MODEL?.trim() ||
          'deepseek-v4-pro'
        );
      }
      return process.env.DEEPSEEK_AGENT_MODEL?.trim() || 'deepseek-v4-pro';
    }

    if (useCase === 'router') {
      return process.env.OPENROUTER_ROUTER_MODEL?.trim() || 'deepseek/deepseek-chat';
    }
    if (useCase === 'fast') {
      return openRouterConfig.models.fast;
    }
    return openRouterConfig.models.agent;
  },

  requireApiKey(): string {
    const key = this.isDeepSeek
      ? process.env.DEEPSEEK_API_KEY?.trim()
      : openRouterConfig.apiKey?.trim();
    if (!key) {
      const envName = this.isDeepSeek ? 'DEEPSEEK_API_KEY' : 'OPENROUTER_API_KEY';
      throw new Error(
        `${envName} is missing/blank. Add it to backend/.env (or export it) and restart the backend.`,
      );
    }
    return key;
  },

  baseUrl(): string {
    if (this.isDeepSeek) {
      return trimTrailingSlash(process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com');
    }
    return trimTrailingSlash(openRouterConfig.baseUrl);
  },

  headers(title: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.requireApiKey()}`,
      'Content-Type': 'application/json',
    };
    if (!this.isDeepSeek) {
      Object.assign(headers, openRouterHeaders(title));
    }
    return headers;
  },

  thinkingOptions(useCase: AiChatUseCase, hasTools: boolean): Record<string, unknown> {
    if (!this.isDeepSeek) return {};
    if (hasTools) {
      return { thinking: { type: 'disabled' } };
    }

    const enabled =
      useCase === 'agent' || useCase === 'skill'
        ? envFlag('DEEPSEEK_AGENT_THINKING_ENABLED', true)
        : envFlag('DEEPSEEK_ROUTER_THINKING_ENABLED', false);
    if (!enabled) {
      return { thinking: { type: 'disabled' } };
    }

    const rawEffort =
      useCase === 'agent' || useCase === 'skill'
        ? process.env.DEEPSEEK_AGENT_REASONING_EFFORT
        : process.env.DEEPSEEK_ROUTER_REASONING_EFFORT;
    const effort = rawEffort?.trim() === 'max' ? 'max' : 'high';
    return {
      thinking: { type: 'enabled' },
      reasoning_effort: effort,
    };
  },
};

export async function createChatCompletion(
  request: ChatCompletionRequest,
): Promise<OpenRouterResponse> {
  const model = aiChatProvider.model(request.useCase);
  const hasTools = Boolean(request.tools?.length);
  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
    ...(hasTools ? { tools: request.tools } : {}),
    ...(hasTools && request.toolChoice ? { tool_choice: request.toolChoice } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
    ...aiChatProvider.thinkingOptions(request.useCase, hasTools),
  };

  const axiosConfig: AxiosRequestConfig = {
    headers: aiChatProvider.headers(request.title),
    timeout: request.timeout,
    signal: request.signal,
  };

  const response = await axios.post(
    `${aiChatProvider.baseUrl()}/chat/completions`,
    body,
    axiosConfig,
  );
  return response.data as OpenRouterResponse;
}
