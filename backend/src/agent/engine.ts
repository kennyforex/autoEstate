import axios from 'axios';
import { openRouterConfig } from '../config/openrouter.js';
import { buildSystemPrompt } from './prompt.js';
import type { ToolRegistry } from './tools/registry.js';
import type {
  AgentContext,
  AgentResult,
  AgentStep,
  AgentEngineConfig,
  AgentEventCallback,
  AgentLoopState,
  OpenRouterMessage,
  OpenRouterResponse,
  OpenRouterToolCall,
  OpenAITool,
  ToolResult,
  ChatMessage,
  SkillGoal,
  GoalStack,
} from './types.js';


const DEFAULT_CONFIG: AgentEngineConfig = {
  maxIterations: 10,
  requestTimeout: 60_000,
  temperature: 0.3,
  maxTokens: 4096,
  maxHistoryTokens: 6000,
  llmMaxRetries: 3,
  toolExecution: 'parallel',
};

export class AgentEngine {
  private registry: ToolRegistry;
  private config: AgentEngineConfig;

  constructor(registry: ToolRegistry, config?: Partial<AgentEngineConfig>) {
    this.registry = registry;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async run(
    userMessage: string,
    context: AgentContext,
    onEvent?: AgentEventCallback,
    signal?: AbortSignal,
  ): Promise<AgentResult> {
    const steps: AgentStep[] = [];
    const model = openRouterConfig.models.agent;

    console.log(`[Agent] Context has ${context.skills.length} skill(s): ${context.skills.map(s => s.slug).join(', ') || 'none'}`);
    this.registry.updateSkillContext(context.skills);

    // Build goal stack from conversation history markers
    context.goalStack = this.buildGoalStack(context);
    console.log(`[Agent] Goal stack: ${JSON.stringify(context.goalStack.goals.map(g => `${g.skillSlug}(${g.status})`))}`);

    const tools = this.registry.toOpenAIFormat();
    const startTime = Date.now();
    const totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    const messages = this.buildMessages(userMessage, context);

    const skillDetection = this.detectForcedSkill(userMessage, context);
    const forcedSkillSlug = skillDetection?.slug || null;
    const shouldForceSkill = !!skillDetection;
    if (skillDetection) {
      console.log(`[Agent] Skill detected: ${skillDetection.slug} (${skillDetection.type}) — forcing tool_choice`);
    }

    onEvent?.({ type: 'agent_start' });

    const makeResult = (partial: Omit<AgentResult, 'steps' | 'model' | 'usage'>): AgentResult => {
      const result: AgentResult = { ...partial, steps, model, usage: totalUsage };
      onEvent?.({ type: 'agent_end', result });
      return result;
    };

    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      if (signal?.aborted) {
        return makeResult({ type: 'final_answer', content: '' });
      }

      onEvent?.({ type: 'turn_start', iteration });
      console.log(`[Agent] Iteration ${iteration + 1}/${this.config.maxIterations} (model=${model})`);

      const toolChoice = (iteration === 0 && shouldForceSkill)
        ? { type: 'function' as const, function: { name: 'execute_skill' } }
        : 'auto' as const;
      const response = await this.callLLM(messages, tools, model, toolChoice, signal);
      const assistantMsg = response.choices[0].message;

      if (response.usage) {
        totalUsage.prompt_tokens += response.usage.prompt_tokens;
        totalUsage.completion_tokens += response.usage.completion_tokens;
        totalUsage.total_tokens += response.usage.total_tokens;
      }

      // ── Final Answer: no tool calls ──
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        // Fallback: if we hard-forced a skill but the LLM ignored tool_choice, manually invoke it
        if (iteration === 0 && shouldForceSkill && forcedSkillSlug) {
          console.log(`[Agent] LLM ignored tool_choice — manually invoking execute_skill(${forcedSkillSlug})`);
          const syntheticToolCall = {
            id: `forced-${Date.now()}`,
            type: 'function' as const,
            function: {
              name: 'execute_skill',
              arguments: JSON.stringify({ slug: forcedSkillSlug, userRequest: userMessage }),
            },
          };
          assistantMsg.tool_calls = [syntheticToolCall];
          assistantMsg.content = assistantMsg.content || null;
        } else {
          steps.push({ thought: assistantMsg.content || '', timestamp: new Date() });
          console.log(`[Agent] Final answer after ${iteration + 1} iteration(s) (${Date.now() - startTime}ms)`);
          onEvent?.({ type: 'turn_end', iteration });
          return makeResult({
            type: 'final_answer',
            content: assistantMsg.content || '',
            citations: this.extractCitations(steps),
          });
        }
      }

      // ── Tool Calls ──
      messages.push({
        role: 'assistant',
        content: assistantMsg.content,
        tool_calls: assistantMsg.tool_calls,
      });

      if (assistantMsg.content) {
        onEvent?.({ type: 'thinking', content: assistantMsg.content });
      }

      const loopState: AgentLoopState = {
        steps,
        messages,
        userMessage,
        model,
        usage: totalUsage,
      };

      const shortCircuitResult = await this.executeToolCalls(
        assistantMsg.tool_calls,
        context,
        loopState,
        iteration,
        onEvent,
        signal,
      );

      onEvent?.({ type: 'turn_end', iteration });

      if (shortCircuitResult) {
        return makeResult(shortCircuitResult);
      }
    }

    // ── Max iterations reached ──
    console.warn(`[Agent] Max iterations (${this.config.maxIterations}) reached for conversation ${context.conversationId}`);
    return makeResult({
      type: 'final_answer',
      content:
        'I apologize, but I was unable to fully resolve your request. ' +
        'Let me connect you with a team member for assistance.',
    });
  }

  // ── Tool Execution Pipeline ──

  private async executeToolCalls(
    toolCalls: OpenRouterToolCall[],
    context: AgentContext,
    loopState: AgentLoopState,
    iteration: number,
    onEvent?: AgentEventCallback,
    signal?: AbortSignal,
  ): Promise<Omit<AgentResult, 'steps' | 'model' | 'usage'> | null> {
    const { steps, messages } = loopState;

    // Phase 1: Validate args and resolve tools
    interface ValidatedCall {
      toolCall: OpenRouterToolCall;
      toolName: string;
      args: Record<string, unknown>;
      tool: NonNullable<ReturnType<ToolRegistry['get']>>;
    }
    const validated: ValidatedCall[] = [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;

      // Parse arguments
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e: any) {
        const errorMsg = `Invalid JSON arguments for tool "${toolName}": ${e.message}`;
        messages.push({ role: 'tool', content: errorMsg, tool_call_id: toolCall.id });
        steps.push({ thought: `Arg parse failed for ${toolName}`, observation: errorMsg, timestamp: new Date() });
        onEvent?.({ type: 'tool_error', toolName, error: errorMsg });
        continue;
      }

      // Resolve tool
      const tool = this.registry.get(toolName);
      if (!tool) {
        const errorMsg = `Unknown tool "${toolName}". Available tools: ${this.registry.names().join(', ')}`;
        messages.push({ role: 'tool', content: errorMsg, tool_call_id: toolCall.id });
        steps.push({ thought: `Unknown tool: ${toolName}`, observation: errorMsg, timestamp: new Date() });
        onEvent?.({ type: 'tool_error', toolName, error: errorMsg });
        continue;
      }

      // Validate required parameters
      const required = (tool.parameters as any)?.required as string[] | undefined;
      if (required?.length) {
        const missing = required.filter((key) => !(key in args));
        if (missing.length > 0) {
          const errorMsg = `Missing required parameters for "${toolName}": ${missing.join(', ')}`;
          messages.push({ role: 'tool', content: errorMsg, tool_call_id: toolCall.id });
          steps.push({ thought: `Validation failed for ${toolName}`, observation: errorMsg, timestamp: new Date() });
          onEvent?.({ type: 'tool_error', toolName, error: errorMsg });
          continue;
        }
      }

      validated.push({ toolCall, toolName, args, tool });
    }

    if (validated.length === 0) return null;

    // Phase 2: beforeToolCall hooks (sequential — order matters for short-circuit)
    const approved: ValidatedCall[] = [];
    for (const entry of validated) {
      if (this.config.beforeToolCall) {
        const hookResult = await this.config.beforeToolCall({
          toolName: entry.toolName,
          args: entry.args,
          context,
          loopState,
        });
        if (hookResult && 'shortCircuit' in hookResult) {
          return hookResult.result;
        }
        if (hookResult && 'block' in hookResult) {
          const errorMsg = `Tool "${entry.toolName}" blocked: ${hookResult.reason}`;
          messages.push({ role: 'tool', content: errorMsg, tool_call_id: entry.toolCall.id });
          steps.push({ thought: `Blocked: ${entry.toolName}`, observation: errorMsg, timestamp: new Date() });
          onEvent?.({ type: 'tool_error', toolName: entry.toolName, error: errorMsg });
          continue;
        }
      }
      approved.push(entry);
    }

    if (approved.length === 0) return null;

    // Phase 3: Execute tools
    interface ExecutionResult {
      entry: ValidatedCall;
      result?: ToolResult;
      error?: string;
    }
    let execResults: ExecutionResult[];

    if (this.config.toolExecution === 'parallel' && approved.length > 1) {
      const settled = await Promise.allSettled(
        approved.map(async (entry) => {
          if (signal?.aborted) throw new Error('Aborted');
          onEvent?.({ type: 'tool_start', toolName: entry.toolName, args: entry.args });
          console.log(`[Agent] Tool call: ${entry.toolName}(${JSON.stringify(entry.args).substring(0, 200)})`);
          const result = await entry.tool.execute(entry.args, context, signal);
          return { entry, result };
        }),
      );

      execResults = settled.map((s, i) => {
        if (s.status === 'fulfilled') return s.value;
        return { entry: approved[i], error: (s.reason as Error).message };
      });
    } else {
      execResults = [];
      for (const entry of approved) {
        if (signal?.aborted) {
          execResults.push({ entry, error: 'Aborted' });
          break;
        }
        onEvent?.({ type: 'tool_start', toolName: entry.toolName, args: entry.args });
        console.log(`[Agent] Tool call: ${entry.toolName}(${JSON.stringify(entry.args).substring(0, 200)})`);
        try {
          const result = await entry.tool.execute(entry.args, context, signal);
          execResults.push({ entry, result });
        } catch (error: any) {
          execResults.push({ entry, error: error.message });
        }
      }
    }

    // Phase 4: Collect results in original order and run afterToolCall hooks
    for (const exec of execResults) {
      const { entry, result, error } = exec;

      if (error || !result) {
        const errorMsg = `Error: Tool "${entry.toolName}" failed: ${error || 'unknown error'}. Try a different approach.`;
        messages.push({ role: 'tool', content: errorMsg, tool_call_id: entry.toolCall.id });
        steps.push({
          thought: `Tool ${entry.toolName} failed`,
          observation: `Error: ${error}`,
          timestamp: new Date(),
        });
        onEvent?.({ type: 'tool_error', toolName: entry.toolName, error: error || 'unknown error' });
        console.error(`[Agent] Tool "${entry.toolName}" threw:`, error);
        continue;
      }

      steps.push({
        thought: `Observed result from ${entry.toolName}`,
        observation: result.summary.substring(0, 2000),
        timestamp: new Date(),
      });
      onEvent?.({ type: 'tool_end', toolName: entry.toolName, result });
      console.log(`[Agent] Tool "${entry.toolName}" result (${result.success ? 'ok' : 'fail'}): ${result.summary.substring(0, 150)}`);

      // afterToolCall hook
      if (this.config.afterToolCall) {
        const hookResult = await this.config.afterToolCall({
          toolName: entry.toolName,
          result,
          context,
          loopState,
        });
        if (hookResult && 'shortCircuit' in hookResult) {
          messages.push({ role: 'tool', content: result.summary, tool_call_id: entry.toolCall.id });
          return hookResult.result;
        }
      }

      messages.push({
        role: 'tool',
        content: result.summary,
        tool_call_id: entry.toolCall.id,
      });
    }

    return null;
  }

  // ── Private helpers ──

  private buildMessages(userMessage: string, context: AgentContext): OpenRouterMessage[] {
    const systemPrompt = buildSystemPrompt(context);
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (context.session && context.session.messages.length > 0) {
      const savedMessages = context.session.messages.filter((m) => m.role !== 'system');
      messages.push(...savedMessages);
      messages.push({ role: 'user', content: userMessage });
    } else {
      const trimmed = this.trimHistoryToTokenBudget(context.messageHistory);
      for (const msg of trimmed) {
        messages.push({ role: msg.role, content: msg.content });
      }
      messages.push({ role: 'user', content: userMessage });
    }

    return messages;
  }

  private trimHistoryToTokenBudget(history: ChatMessage[]): ChatMessage[] {
    const budget = this.config.maxHistoryTokens;
    let msgs = [...history];

    const estimateTokens = (list: ChatMessage[]) =>
      list.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);

    while (estimateTokens(msgs) > budget && msgs.length > 2) {
      msgs = msgs.slice(1);
    }

    return msgs;
  }

  private detectForcedSkill(
    userMessage: string,
    context: AgentContext,
  ): { slug: string; type: 'trigger' | 'continuation' | 'resume' } | null {
    if (context.skills.length === 0) return null;

    const msgLower = userMessage.toLowerCase();
    const goalStack = context.goalStack;

    // 1. Check trigger word match first — explicit intent overrides continuation
    for (const skill of context.skills) {
      const hints = skill.triggerHints || [];
      for (const hint of hints) {
        if (hint && msgLower.includes(hint.toLowerCase())) {
          console.log(`[Agent] Trigger match: "${hint}" from skill "${skill.slug}"`);
          return { slug: skill.slug, type: 'trigger' };
        }
      }
    }

    // 2. Check if the last skill just completed and there are suspended goals to resume
    if (goalStack) {
      const lastAssistantMsg = context.messageHistory
        .filter(m => m.role === 'assistant')
        .slice(-1)[0];

      if (lastAssistantMsg?.content?.includes(':complete')) {
        // Find which skill just completed
        const completedMatch = lastAssistantMsg.content.match(/<!-- skill:(\S+?):complete\s+(\{.*?\}) -->/);
        const completedSlug = completedMatch?.[1];
        let completedObs: Record<string, string> = {};
        if (completedMatch?.[2]) {
          try { completedObs = JSON.parse(completedMatch[2]); } catch { /* ignore */ }
        }

        const suspended = goalStack.goals.filter(g => g.status === 'suspended');
        if (suspended.length > 0) {
          const toResume = suspended[0];

          // Same-skill auto-completion: if the completed skill is the same as the
          // suspended one, the suspended goal is already achieved — skip it
          if (completedSlug && toResume.skillSlug === completedSlug) {
            console.log(`[Agent] Suspended goal "${toResume.skillSlug}" is same skill as completed — auto-completing`);
            toResume.status = 'completed';
            toResume.observations = { ...toResume.observations, ...completedObs };
            toResume.completedAt = Date.now();
            // Check next suspended goal
            const nextSuspended = goalStack.goals.filter(g => g.status === 'suspended');
            if (nextSuspended.length > 0) {
              console.log(`[Agent] Moving to next suspended goal: "${nextSuspended[0].skillSlug}"`);
              return { slug: nextSuspended[0].skillSlug, type: 'resume' };
            }
            return null; // All goals resolved
          }

          console.log(`[Agent] Previous skill completed — resuming suspended goal "${toResume.skillSlug}"`);
          return { slug: toResume.skillSlug, type: 'resume' };
        }
      }
    }

    // 3. Fall back to multi-turn continuation (soft — LLM can override)
    const recent = context.messageHistory.slice(-4);
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i];
      if (msg.role === 'assistant' && msg.content) {
        // Skip completed skill markers
        const completeMatch = msg.content.match(/<!-- skill:(\S+?):complete/);
        if (completeMatch) {
          console.log(`[Agent] Last skill "${completeMatch[1]}" was completed — no continuation`);
          break;
        }
        const skillMatch = msg.content.match(/<!-- skill:(\S+) -->/);
        if (skillMatch) {
          console.log(`[Agent] Multi-turn continuation available — last response from skill "${skillMatch[1]}"`);
          return { slug: skillMatch[1], type: 'continuation' };
        }
        break;
      }
    }

    return null;
  }

  /**
   * Parse conversation history markers to reconstruct the goal stack.
   * Markers: <!-- skill:slug --> (in-progress) or <!-- skill:slug:complete obs_json --> (completed)
   */
  private buildGoalStack(context: AgentContext): GoalStack {
    const goals: SkillGoal[] = [];
    const seen = new Map<string, SkillGoal>();
    let counter = 0;

    for (const msg of context.messageHistory) {
      if (msg.role !== 'assistant') continue;

      // Match enhanced markers: <!-- skill:slug --> or <!-- skill:slug:complete {...} -->
      const markers = msg.content.matchAll(/<!-- skill:(\S+?)(?::complete\s+(\{.*?\}))? -->/g);
      for (const m of markers) {
        const slug = m[1];
        const isComplete = !!m[2];
        let observations: Record<string, string> = {};
        if (m[2]) {
          try { observations = JSON.parse(m[2]); } catch { /* ignore */ }
        }

        if (seen.has(slug)) {
          const existing = seen.get(slug)!;
          if (isComplete) {
            existing.status = 'completed';
            existing.observations = { ...existing.observations, ...observations };
            existing.completedAt = Date.now();
          }
        } else {
          const goal: SkillGoal = {
            id: `goal-${++counter}`,
            skillSlug: slug,
            status: isComplete ? 'completed' : 'active',
            observations,
            createdAt: Date.now(),
            ...(isComplete ? { completedAt: Date.now() } : {}),
          };
          goals.push(goal);
          seen.set(slug, goal);
        }
      }
    }

    // Determine active goal — the most recent non-completed goal
    // If a new skill triggered, old active goals become suspended
    const activeGoals = goals.filter(g => g.status === 'active');
    let activeGoalId: string | null = null;

    if (activeGoals.length > 1) {
      // Multiple active = the latest one is truly active; rest are suspended
      for (let i = 0; i < activeGoals.length - 1; i++) {
        activeGoals[i].status = 'suspended';
        activeGoals[i].suspendedAt = Date.now();
      }
      activeGoalId = activeGoals[activeGoals.length - 1].id;
    } else if (activeGoals.length === 1) {
      activeGoalId = activeGoals[0].id;
    }

    return { goals, activeGoalId };
  }

  private async callLLM(
    messages: OpenRouterMessage[],
    tools: OpenAITool[],
    model: string,
    toolChoice: 'auto' | { type: 'function'; function: { name: string } } = 'auto',
    signal?: AbortSignal,
  ): Promise<OpenRouterResponse> {
    const maxRetries = this.config.llmMaxRetries;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (signal?.aborted) {
        throw new Error('Agent aborted');
      }

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
            signal,
          },
        );
        return response.data;
      } catch (error: any) {
        const status = error.response?.status;
        const isRetryable = !status || status === 429 || status >= 500;

        if (!isRetryable || attempt === maxRetries - 1) {
          console.error(`[Agent] LLM call failed (${model}):`, status, JSON.stringify(error.response?.data || error.message));
          throw error;
        }

        const delayMs = Math.min(1000 * 2 ** attempt, 10000);
        console.warn(`[Agent] LLM call failed (status=${status}), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    throw new Error('Unreachable');
  }

  private extractCitations(steps: AgentStep[]): AgentResult['citations'] {
    const citations: AgentResult['citations'] = [];
    for (const step of steps) {
      if (!step.action || step.action.tool !== 'knowledge_base') continue;
      if (!step.observation) continue;
    }
    return citations.length > 0 ? citations : undefined;
  }
}
