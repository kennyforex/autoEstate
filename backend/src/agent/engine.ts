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
  AgentCitationBundle,
} from './types.js';
import { disposePlaywrightSession } from './playwrightSession.js';
import { routeIntent } from './router.js';


const DEFAULT_CONFIG: AgentEngineConfig = {
  maxIterations: 10,
  requestTimeout: 60_000,
  temperature: 0.3,
  maxTokens: 4096,
  maxHistoryTokens: 6000,
  minHistoryMessages: 4,
  maxToolResultChars: 12_000,
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
    context.lastUserTurnContent = userMessage;
    context.ephemeral ??= {};
    this.registry.updateSkillContext(context.skills);

    // Use DB-backed goal stack if already loaded by context builder;
    // fall back to marker parsing for playground or migration from old conversations.
    if (!context.goalStack) {
      context.goalStack = this.buildGoalStack(context);
      console.log(`[Agent] Goal stack (from markers): ${JSON.stringify(context.goalStack.goals.map(g => `${g.skillSlug}(${g.status})`))}`);
    } else {
      console.log(`[Agent] Goal stack (from DB): ${JSON.stringify(context.goalStack.goals.map(g => `${g.skillSlug}(${g.status})`))}`);
    }

    const routerDecision = await routeIntent(context, userMessage);
    console.log(`[Agent] Router: ${JSON.stringify(routerDecision)}`);

    context.routerHint =
      routerDecision.action === 'llm_decide' && routerDecision.hint ? routerDecision.hint : undefined;

    const tools = this.registry.toOpenAIFormat();
    const startTime = Date.now();
    const totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    const messages = this.buildMessages(userMessage, context);

    onEvent?.({ type: 'agent_start' });

    try {
    let routingRetryUsed = false;
    const loopState: AgentLoopState = {
      steps,
      messages,
      userMessage,
      model,
      usage: totalUsage,
      unhandledSkillSlugs: new Set<string>(),
    };

    const makeResult = (partial: Omit<AgentResult, 'steps' | 'model' | 'usage'>): AgentResult => {
      const slug = loopState.lastResponsibleSkillSlug;
      const skillMeta = slug ? context.skills.find((s) => s.slug === slug) : undefined;
      const result: AgentResult = {
        ...partial,
        ...(slug
          ? {
              activeSkillSlug: slug,
              ...(skillMeta?.ownerStaffId ? { activeStaffId: skillMeta.ownerStaffId } : {}),
            }
          : {}),
        steps,
        model,
        usage: totalUsage,
      };
      onEvent?.({ type: 'agent_end', result });
      return result;
    };

    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      if (signal?.aborted) {
        return makeResult({ type: 'final_answer', content: '' });
      }

      onEvent?.({ type: 'turn_start', iteration });
      console.log(`[Agent] Iteration ${iteration + 1}/${this.config.maxIterations} (model=${model})`);

      const forceSkill = iteration === 0 && routerDecision.action === 'force_skill';
      const toolChoice = forceSkill
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
        if (routerDecision.action === 'force_skill' && iteration === 0) {
          console.log(`[Agent] Router forced skill "${routerDecision.slug}" — injecting execute_skill`);
          assistantMsg.tool_calls = [this.createSyntheticSkillCall(routerDecision.slug, userMessage)];
          assistantMsg.content = assistantMsg.content || null;
        }
        else if (routerDecision.action === 'suggest_skill' && !routingRetryUsed) {
          routingRetryUsed = true;
          console.log(`[Agent] Router suggests skill "${routerDecision.slug}" — injecting execute_skill`);
          assistantMsg.tool_calls = [this.createSyntheticSkillCall(routerDecision.slug, userMessage)];
          assistantMsg.content = assistantMsg.content || null;
        }
        // Guard: if the LLM answered directly with pricing but a skill with
        // scripts exists that should handle it, force the skill invocation.
        // Skip if a script-bearing skill already completed — the LLM is just
        // referencing a previously validated price, not fabricating.
        else if (
          !routingRetryUsed &&
          assistantMsg.content &&
          /(?:HKD|USD|\$)\s*\d+/i.test(assistantMsg.content) &&
          context.skills.some(s => s.availableScripts.length > 0) &&
          !context.goalStack?.goals.some(
            g => g.status === 'completed' &&
              context.skills.find(s => s.slug === g.skillSlug)?.availableScripts?.length
          )
        ) {
          routingRetryUsed = true;
          const scriptSkill = context.skills.find(s => s.availableScripts.length > 0)!;
          console.log(`[Agent] LLM fabricated pricing without using skill "${scriptSkill.slug}" — forcing execute_skill`);
          assistantMsg.tool_calls = [this.createSyntheticSkillCall(scriptSkill.slug, userMessage)];
          assistantMsg.content = assistantMsg.content || null;
        }
        else {
          steps.push({ thought: assistantMsg.content || '', timestamp: new Date() });
          console.log(`[Agent] Final answer after ${iteration + 1} iteration(s) (${Date.now() - startTime}ms)`);
          onEvent?.({ type: 'turn_end', iteration });
          let content = assistantMsg.content || '';
          if (loopState.pendingPartialResult) {
            content = loopState.pendingPartialResult.content + '\n\n' + content;
            loopState.pendingPartialResult = undefined;
            console.log(`[Agent] Combining partial response with direct answer`);
          }
          return makeResult({
            type: 'final_answer',
            content,
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
        if (loopState.pendingPartialResult) {
          // The follow-up skill fully handles the re-routed intent,
          // so drop the first skill's "I can't do this" partial response.
          loopState.pendingPartialResult = undefined;
          console.log(`[Agent] Dropping partial response — follow-up skill handled the intent`);
        }
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
    } finally {
      delete context.routerHint;
      await disposePlaywrightSession(context);
    }
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
        steps.push({
          thought: `Arg parse failed for ${toolName}`,
          action: { tool: toolName, args: {} },
          observation: errorMsg,
          timestamp: new Date(),
        });
        onEvent?.({ type: 'tool_error', toolName, error: errorMsg });
        continue;
      }

      // Resolve tool
      const tool = this.registry.get(toolName);
      if (!tool) {
        const errorMsg = `Unknown tool "${toolName}". Available tools: ${this.registry.names().join(', ')}`;
        messages.push({ role: 'tool', content: errorMsg, tool_call_id: toolCall.id });
        steps.push({
          thought: `Unknown tool: ${toolName}`,
          action: { tool: toolName, args: {} },
          observation: errorMsg,
          timestamp: new Date(),
        });
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
          steps.push({
            thought: `Validation failed for ${toolName}`,
            action: { tool: toolName, args },
            observation: errorMsg,
            timestamp: new Date(),
          });
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
          steps.push({
            thought: `Blocked: ${entry.toolName}`,
            action: { tool: entry.toolName, args: entry.args },
            observation: errorMsg,
            timestamp: new Date(),
          });
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

    const webBrowserInBatch = approved.some((e) => e.toolName === 'web_browser');
    if (this.config.toolExecution === 'parallel' && approved.length > 1 && !webBrowserInBatch) {
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
          action: { tool: entry.toolName, args: entry.args },
          observation: `Error: ${error}`,
          timestamp: new Date(),
        });
        onEvent?.({ type: 'tool_error', toolName: entry.toolName, error: error || 'unknown error' });
        console.error(`[Agent] Tool "${entry.toolName}" threw:`, error);
        continue;
      }

      const compactSummary = this.compactContentForContext(
        result.summary,
        this.config.maxToolResultChars,
      );
      const kbCitations = this.citationsFromKnowledgeToolResult(entry.toolName, result);

      steps.push({
        thought: `Observed result from ${entry.toolName}`,
        action: { tool: entry.toolName, args: entry.args },
        observation: compactSummary.substring(0, 2000),
        ...(kbCitations ? { citations: kbCitations } : {}),
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
          messages.push({
            role: 'tool',
            content: compactSummary,
            tool_call_id: entry.toolCall.id,
          });
          return hookResult.result;
        }
        if (hookResult && 'outOfScope' in hookResult) {
          // Skill couldn't handle the request — inject re-routing directive and let the loop continue
          const rerouteMsg =
            `The skill "${hookResult.failedSkillSlug}" cannot handle this request (reason: ${hookResult.reason}). ` +
            `You MUST now select a DIFFERENT skill that matches the user's intent. ` +
            `Do NOT re-use "${hookResult.failedSkillSlug}". Call execute_skill with the correct skill slug.`;
          messages.push({ role: 'tool', content: rerouteMsg, tool_call_id: entry.toolCall.id });
          steps.push({
            thought: `Skill "${hookResult.failedSkillSlug}" out of scope — re-routing`,
            action: { tool: entry.toolName, args: entry.args },
            observation: hookResult.reason,
            timestamp: new Date(),
          });
          console.log(`[Agent] OUT_OF_SCOPE from "${hookResult.failedSkillSlug}" — injecting re-route directive`);
          continue;
        }
        if (hookResult && 'unhandledIntent' in hookResult) {
          const sourceSlug = hookResult.sourceSkillSlug;

          // Ping-pong guard: if this skill already signalled UNHANDLED_INTENT, stop the loop
          if (loopState.unhandledSkillSlugs.has(sourceSlug)) {
            console.log(`[Agent] Ping-pong detected: "${sourceSlug}" signalled UNHANDLED_INTENT again — accepting response as-is`);
            messages.push({
              role: 'tool',
              content: compactSummary,
              tool_call_id: entry.toolCall.id,
            });
            return hookResult.partialResult;
          }

          loopState.unhandledSkillSlugs.add(sourceSlug);

          // Skill processed its part but user also asked something outside its scope.
          // 1. Record the skill's partial response as a tool result
          messages.push({
            role: 'tool',
            content: compactSummary,
            tool_call_id: entry.toolCall.id,
          });

          // 2. Store the partial response so the engine can emit it later
          loopState.pendingPartialResult = hookResult.partialResult;

          // 3. Inject directive to route the unhandled intent to a different skill
          const excludeList = Array.from(loopState.unhandledSkillSlugs).map(s => `"${s}"`).join(', ');
          messages.push({
            role: 'user',
            content:
              `[SYSTEM] The skill "${sourceSlug}" handled part of the user's message but detected ` +
              `an additional request it cannot fulfill: "${hookResult.intentDescription}"\n` +
              `You MUST now call execute_skill with a DIFFERENT skill that can handle this intent. ` +
              `Do NOT use any of these skills: ${excludeList}. ` +
              `Pass a natural rephrasing of the unhandled intent as the userRequest.`,
          });
          steps.push({
            thought: `Skill "${sourceSlug}" partial — routing unhandled intent`,
            action: { tool: entry.toolName, args: entry.args },
            observation: hookResult.intentDescription,
            timestamp: new Date(),
          });
          console.log(`[Agent] UNHANDLED_INTENT from "${sourceSlug}": "${hookResult.intentDescription}" — routing to another skill`);
          return null; // continue the main loop so LLM can route the unhandled intent
        }
      }

      messages.push({
        role: 'tool',
        content: compactSummary,
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
    const minKeep = this.config.minHistoryMessages;
    let msgs = [...history];

    const estimateTokens = (list: ChatMessage[]) =>
      list.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);

    if (estimateTokens(msgs) <= budget) return msgs;

    const originalLen = msgs.length;
    while (estimateTokens(msgs) > budget && msgs.length > minKeep) {
      msgs = msgs.slice(1);
    }

    const dropped = originalLen - msgs.length;
    if (dropped > 0 && msgs.length > 0) {
      const first = msgs[0];
      msgs = [
        {
          ...first,
          content: `[${dropped} earlier message(s) omitted for context length]\n\n${first.content}`,
        },
        ...msgs.slice(1),
      ];
    }

    while (estimateTokens(msgs) > budget && msgs.length > 2) {
      msgs = msgs.slice(1);
    }

    return msgs;
  }

  /** Keep tool outputs bounded so the chat context does not explode. */
  private compactContentForContext(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return (
      text.slice(0, maxChars) +
      `\n...[truncated ${text.length - maxChars} characters for context limit]`
    );
  }

  private citationsFromKnowledgeToolResult(
    toolName: string,
    result: ToolResult,
  ): AgentCitationBundle | undefined {
    if (toolName !== 'knowledge_base' || !result.success) return undefined;
    const data = result.data;
    if (!data || typeof data !== 'object') return undefined;
    const raw = (data as { citations?: unknown }).citations;
    if (!Array.isArray(raw) || raw.length === 0) return undefined;
    return raw as AgentCitationBundle;
  }

  private createSyntheticSkillCall(slug: string, userRequest: string): OpenRouterToolCall {
    return {
      id: `forced-${Date.now()}`,
      type: 'function' as const,
      function: {
        name: 'execute_skill',
        arguments: JSON.stringify({ slug, userRequest }),
      },
    };
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

    const payloadSize = JSON.stringify(messages).length;
    console.log(`[Agent] callLLM: ${messages.length} messages, ~${Math.round(payloadSize / 1024)}KB payload, model=${model}`);

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
        const data = response.data as OpenRouterResponse;
        if (!data?.choices?.[0]?.message) {
          const snippet = JSON.stringify(data ?? {}).slice(0, 1500);
          throw new Error(
            `OpenRouter returned no choices (model=${model}). Response: ${snippet}`,
          );
        }
        return data;
      } catch (error: any) {
        const status = error.response?.status;
        const errDetail = error.response?.data
          ? JSON.stringify(error.response.data)
          : `${error.code || error.name}: ${error.message}`;
        const isRetryable = !status || status === 429 || status >= 500;

        // tool_choice not supported by this model — fall back to 'auto' and retry immediately
        if (
          (status === 400 || status === 502) &&
          toolChoice !== 'auto' &&
          /tool_choice|thinking mode/i.test(errDetail)
        ) {
          console.warn(`[Agent] Model "${model}" rejected tool_choice — falling back to auto`);
          toolChoice = 'auto';
          continue;
        }

        if (!isRetryable || attempt === maxRetries - 1) {
          console.error(`[Agent] LLM call failed (${model}): status=${status} ${errDetail}`);
          throw error;
        }

        const delayMs = Math.min(1000 * 2 ** attempt, 10000);
        console.warn(`[Agent] LLM call failed (status=${status}, ${errDetail}), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    throw new Error('Unreachable');
  }

  private extractCitations(steps: AgentStep[]): AgentResult['citations'] {
    const merged: AgentCitationBundle = [];
    for (const step of steps) {
      if (step.citations?.length) merged.push(...step.citations);
    }
    return merged.length > 0 ? merged : undefined;
  }
}
