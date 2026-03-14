import axios from 'axios';
import { openRouterConfig } from '../config/openrouter.js';
import { buildSystemPrompt } from './prompt.js';
import type { ToolRegistry } from './tools/registry.js';
import type {
  AgentContext,
  AgentResult,
  AgentStep,
  AgentSessionData,
  AgentEngineConfig,
  OpenRouterMessage,
  OpenRouterResponse,
  OpenAITool,
  ToolResult,
} from './types.js';


const DEFAULT_CONFIG: AgentEngineConfig = {
  maxIterations: 10,
  requestTimeout: 60_000,
  temperature: 0.3,
  maxTokens: 4096,
};

export interface AgentProgressCallback {
  (step: {
    number: number;
    total: number;
    thought: string;
    action?: {
      tool: string;
      args: Record<string, unknown>;
    };
    observation?: string;
  }): void;
}

export class AgentEngine {
  private registry: ToolRegistry;
  private config: AgentEngineConfig;

  constructor(registry: ToolRegistry, config?: Partial<AgentEngineConfig>) {
    this.registry = registry;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main entry point — runs the ReAct loop until a final answer or clarification.
   */
  async run(
    userMessage: string,
    context: AgentContext,
    onProgress?: AgentProgressCallback,
  ): Promise<AgentResult> {
    const steps: AgentStep[] = [];
    const model = openRouterConfig.models.agent;

    // Broadcast available skills so context-aware tools (e.g. execute_skill)
    // can build dynamic descriptions before we serialise the tool list.
    console.log(`[Agent] Context has ${context.skills.length} skill(s): ${context.skills.map(s => s.slug).join(', ') || 'none'}`);
    this.registry.updateSkillContext(context.skills);

    const tools = this.registry.toOpenAIFormat();
    const startTime = Date.now();
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    const messages = this.buildMessages(userMessage, context);

    // Check if the user message matches any skill trigger hints
    const shouldForceSkill = this.shouldForceSkillExecution(userMessage, context);
    if (shouldForceSkill) {
      console.log(`[Agent] Skill trigger match detected — forcing execute_skill on first call`);
    }

    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      console.log(`[Agent] Iteration ${iteration + 1}/${this.config.maxIterations} (model=${model})`);

      // Force skill execution on first iteration if trigger hints match
      const toolChoice = (iteration === 0 && shouldForceSkill)
        ? { type: 'function' as const, function: { name: 'execute_skill' } }
        : 'auto' as const;
      const response = await this.callLLM(messages, tools, model, toolChoice);
      const choice = response.choices[0];
      const assistantMsg = choice.message;

      if (response.usage) {
        totalUsage.prompt_tokens += response.usage.prompt_tokens;
        totalUsage.completion_tokens += response.usage.completion_tokens;
        totalUsage.total_tokens += response.usage.total_tokens;
      }

      // ── Final Answer: no tool calls ──
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        steps.push({ thought: assistantMsg.content || '', timestamp: new Date() });
        console.log(`[Agent] Final answer after ${iteration + 1} iteration(s) (${Date.now() - startTime}ms)`);

        return {
          type: 'final_answer',
          content: assistantMsg.content || '',
          citations: this.extractCitations(steps),
          steps,
          model,
          usage: totalUsage,
        };
      }

      // ── Tool Calls ──
      messages.push({
        role: 'assistant',
        content: assistantMsg.content,
        tool_calls: assistantMsg.tool_calls,
      });

      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          toolArgs = {};
        }

        steps.push({
          thought: assistantMsg.content || `Calling ${toolName}`,
          action: { tool: toolName, args: toolArgs },
          timestamp: new Date(),
        });

        // Emit progress for tool call start
        if (onProgress) {
          onProgress({
            number: iteration + 1,
            total: this.config.maxIterations,
            thought: assistantMsg.content || `Calling ${toolName}`,
            action: { tool: toolName, args: toolArgs },
          });
        }

        console.log(`[Agent] Tool call: ${toolName}(${JSON.stringify(toolArgs).substring(0, 200)})`);

        // ── Special case: clarification ──
        if (toolName === 'ask_clarification') {
          const question = (toolArgs.question as string) || 'Could you please provide more details?';
          const session: AgentSessionData = {
            conversationId: context.conversationId,
            assistantId: context.assistantId,
            status: 'awaiting_clarification',
            originalMessage: userMessage,
            steps,
            messages,
            pendingClarification: question,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          };

          console.log(`[Agent] Clarification requested: "${question.substring(0, 100)}"`);
          return {
            type: 'clarification',
            content: question,
            session,
            steps,
            model,
            usage: totalUsage,
          };
        }

        // ── Execute tool ──
        const tool = this.registry.get(toolName);
        if (!tool) {
          const errorMsg = `Unknown tool "${toolName}". Available tools: ${this.registry.names().join(', ')}`;
          messages.push({ role: 'tool', content: errorMsg, tool_call_id: toolCall.id });
          steps.push({ thought: `Unknown tool: ${toolName}`, observation: errorMsg, timestamp: new Date() });
          continue;
        }

        try {
          const result = await tool.execute(toolArgs, context);

          steps.push({
            thought: `Observed result from ${toolName}`,
            observation: result.summary.substring(0, 2000),
            timestamp: new Date(),
          });

          // Emit progress for tool result
          if (onProgress) {
            onProgress({
              number: iteration + 1,
              total: this.config.maxIterations,
              thought: `Observed result from ${toolName}`,
              action: { tool: toolName, args: toolArgs },
              observation: result.summary.substring(0, 500),
            });
          }

          console.log(`[Agent] Tool "${toolName}" result (${result.success ? 'ok' : 'fail'}): ${result.summary.substring(0, 150)}`);

          // Skills manage their own multi-turn flow. When execute_skill
          // returns, its output IS the final response — relay it directly
          // to the user instead of letting the main LLM re-interpret it.
          if (toolName === 'execute_skill' && result.success && result.summary) {
            console.log(`[Agent] Skill returned response — short-circuiting to final answer`);
            return {
              type: 'final_answer',
              content: result.summary,
              citations: this.extractCitations(steps),
              steps,
              model,
              usage: totalUsage,
            };
          }

          messages.push({
            role: 'tool',
            content: result.summary,
            tool_call_id: toolCall.id,
          });
        } catch (error: any) {
          const errorMsg = `Error: Tool "${toolName}" failed: ${error.message}. Try a different approach.`;
          messages.push({ role: 'tool', content: errorMsg, tool_call_id: toolCall.id });
          steps.push({
            thought: `Tool ${toolName} failed`,
            observation: `Error: ${error.message}`,
            timestamp: new Date(),
          });

          // Emit progress for tool error
          if (onProgress) {
            onProgress({
              number: iteration + 1,
              total: this.config.maxIterations,
              thought: `Tool ${toolName} failed`,
              action: { tool: toolName, args: toolArgs },
              observation: `Error: ${error.message}`,
            });
          }

          console.error(`[Agent] Tool "${toolName}" threw:`, error.message);
        }
      }
    }

    // ── Max iterations reached ──
    console.warn(`[Agent] Max iterations (${this.config.maxIterations}) reached for conversation ${context.conversationId}`);
    return {
      type: 'final_answer',
      content:
        'I apologize, but I was unable to fully resolve your request. ' +
        'Let me connect you with a team member for assistance.',
      steps,
      model,
      usage: totalUsage,
    };
  }

  // ── Private helpers ──

  private buildMessages(userMessage: string, context: AgentContext): OpenRouterMessage[] {
    const systemPrompt = buildSystemPrompt(context);
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (context.session && context.session.messages.length > 0) {
      // Resuming from a saved session: restore saved messages (skip system — we rebuilt it)
      const savedMessages = context.session.messages.filter((m) => m.role !== 'system');
      messages.push(...savedMessages);
      messages.push({ role: 'user', content: userMessage });
    } else {
      // Fresh session: inject conversation history then the new message
      for (const msg of context.messageHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
      messages.push({ role: 'user', content: userMessage });
    }

    return messages;
  }

  /**
   * Check if the user message contains any trigger hints from bound skills.
   * If so, force the agent to call execute_skill instead of answering directly.
   */
  private shouldForceSkillExecution(userMessage: string, context: AgentContext): boolean {
    if (context.skills.length === 0) return false;

    const msgLower = userMessage.toLowerCase();

    for (const skill of context.skills) {
      const hints = skill.triggerHints || [];
      for (const hint of hints) {
        if (hint && msgLower.includes(hint.toLowerCase())) {
          console.log(`[Agent] Trigger match: "${hint}" from skill "${skill.slug}"`);
          return true;
        }
      }
    }

    return false;
  }

  private async callLLM(
    messages: OpenRouterMessage[],
    tools: OpenAITool[],
    model: string,
    toolChoice: 'auto' | { type: 'function'; function: { name: string } } = 'auto',
  ): Promise<OpenRouterResponse> {
    try {
      const response = await axios.post(
        `${openRouterConfig.baseUrl}/chat/completions`,
        {
          model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? toolChoice : undefined,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        },
        {
          headers: {
            Authorization: `Bearer ${openRouterConfig.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://autoestate.ai',
            'X-Title': 'AutoEstate AI Agent',
          },
          timeout: this.config.requestTimeout,
        },
      );
      return response.data;
    } catch (error: any) {
      console.error(`[Agent] LLM call failed (${model}):`, error.response?.status, JSON.stringify(error.response?.data || error.message));
      throw error;
    }
  }

  private extractCitations(steps: AgentStep[]): AgentResult['citations'] {
    const citations: AgentResult['citations'] = [];
    for (const step of steps) {
      if (!step.action || step.action.tool !== 'knowledge_base') continue;
      if (!step.observation) continue;
      // Citations are embedded in the knowledge_base tool result data;
      // we only surface the citation count marker here for traceability.
      // The actual structured citations come from the tool's data field
      // and are already included in the final response text.
    }
    return citations.length > 0 ? citations : undefined;
  }
}
