import axios from 'axios';
import { BaseTool } from './base.js';
import { openRouterConfig } from '../../config/openrouter.js';
import { skillStorage } from '../../services/skillStorage.service.js';
import type { AgentContext, AgentSkillInfo, ToolResult, OpenAITool, SkillExecutionResult } from '../types.js';
import type { ToolRegistry } from './registry.js';

const DEFAULT_DESCRIPTION =
  'Execute a skill by its slug. No skills are currently available.';

const MAX_SKILL_INSTRUCTIONS = 4000;
const SCRIPT_TIMEOUT_MS = 30000;

export class SkillExecutionTool extends BaseTool {
  readonly name = 'execute_skill';
  readonly parameters = {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'The slug identifier of the skill to execute',
      },
      userRequest: {
        type: 'string',
        description: 'The user request or arguments to pass to the skill',
      },
    },
    required: ['slug', 'userRequest'],
  };

  private skills: AgentSkillInfo[] = [];
  private parentRegistry?: ToolRegistry;
  private _dynamicDescription: string = DEFAULT_DESCRIPTION;

  get description(): string {
    return this._dynamicDescription;
  }

  setParentRegistry(registry: ToolRegistry): void {
    this.parentRegistry = registry;
  }

  override setSkillContext(skills: AgentSkillInfo[]): void {
    this.skills = skills;

    if (skills.length === 0) {
      this._dynamicDescription = DEFAULT_DESCRIPTION;
      return;
    }

    const listing = skills
      .map((s) => {
        const extras: string[] = [];
        if (s.hasReferences) extras.push('reference');
        if (s.hasExamples) extras.push('examples');
        if (s.availableScripts.length > 0) extras.push(`scripts:${s.availableScripts.length}`);
        const extraStr = extras.length > 0 ? ` [${extras.join(', ')}]` : '';
        return `  - "${s.slug}": ${s.description}${extraStr}`;
      })
      .join('\n');

    this._dynamicDescription =
      'MANDATORY: Execute an installed skill by slug. You MUST call this tool instead of answering directly ' +
      'when the user\'s message matches any skill\'s trigger words or purpose.\n\n' +
      'Available skills (call with the slug):\n' + listing;
  }

  override toOpenAITool(): OpenAITool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AgentContext,
    _signal?: AbortSignal,
  ): Promise<ToolResult> {
    const slug = args.slug as string;
    const userRequest = args.userRequest as string;

    if (!slug || !userRequest) {
      return {
        success: false,
        data: null,
        summary: 'Error: both "slug" and "userRequest" parameters are required.',
      };
    }

    const skill = context.skills.find((s) => s.slug === slug);
    if (!skill) {
      const available = context.skills.map((s) => s.slug).join(', ') || 'none';
      return {
        success: false,
        data: null,
        summary: `Skill "${slug}" not found. Available skills: ${available}`,
      };
    }

    console.log(`[SkillExecution] Running skill "${skill.name}" (${slug})`);

    try {
      const skillResult = await this.executeSkillWithScripts(skill, userRequest, context);
      return this.mapToToolResult(slug, skillResult);
    } catch (error: any) {
      console.error(`[SkillExecution] Skill "${slug}" failed:`, error.message);
      return {
        success: false,
        data: null,
        summary: `Skill "${slug}" execution failed: ${error.message}`,
      };
    }
  }

  private mapToToolResult(slug: string, result: SkillExecutionResult): ToolResult {
    if (result.type === 'out_of_scope') {
      return {
        success: true,
        data: { skill: slug, outOfScope: true, reason: result.outOfScopeReason },
        summary: result.content,
      };
    }
    return {
      success: true,
      data: {
        skill: slug,
        output: result.content,
        completed: result.type === 'complete',
        observations: result.observations || {},
        ...(result.unhandledIntent ? { unhandledIntent: result.unhandledIntent } : {}),
      },
      summary: result.content,
    };
  }

  private async executeSkillWithScripts(
    skill: AgentSkillInfo,
    userRequest: string,
    context: AgentContext,
  ): Promise<SkillExecutionResult> {
    // 1. Load instructions on-demand from storage (or use legacy embedded)
    let instructions: string;
    if (skill.storagePath) {
      try {
        instructions = await skillStorage.loadSkillMd(skill.storagePath);
      } catch {
        instructions = skill.instructions || '';
      }
    } else {
      instructions = skill.instructions || '';
    }

    if (!instructions) {
      throw new Error(`No instructions found for skill "${skill.name}"`);
    }

    // Strip YAML frontmatter if present
    instructions = instructions.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();

    if (instructions.length > MAX_SKILL_INSTRUCTIONS) {
      instructions = instructions.substring(0, MAX_SKILL_INSTRUCTIONS) + '...';
    }

    // 2. Analyze conversation history to build a progress summary
    const progressSummary = this.buildProgressSummary(context);

    // 3. Build system prompt with instructions + conversation awareness
    let systemPrompt =
      `You are executing the "${skill.name}" skill.\n\n` +
      `## Skill Instructions\n${instructions}\n\n`;

    // Add reference/examples/scripts availability
    if (skill.hasReferences) {
      systemPrompt += '\n[Additional reference material available. Use "LOAD_REFERENCE" to access it.]\n';
    }
    if (skill.hasExamples) {
      systemPrompt += '\n[Usage examples available. Use "LOAD_EXAMPLES" to see them.]\n';
    }
    if (skill.availableScripts.length > 0) {
      systemPrompt += '\n## Available Scripts\n';
      systemPrompt += 'You can execute these scripts during skill execution:\n';
      for (const scriptName of skill.availableScripts) {
        systemPrompt += `- ${scriptName}\n`;
      }
      systemPrompt += '\nTo run a script, output exactly:\n';
      systemPrompt += 'EXECUTE_SCRIPT:scriptname\nARG:arg1_value\nEND_SCRIPT\n';
      systemPrompt += '\nThe script output will be provided as the next message.\n';
    }

    // Describe available tools (if any are passed through)
    if (skill.requiredTools && skill.requiredTools.length > 0 && this.parentRegistry) {
      const toolNames = skill.requiredTools.filter(t => t !== 'execute_skill' && t !== 'ask_clarification');
      if (toolNames.length > 0) {
        systemPrompt += '\n## Available Tools\n';
        systemPrompt += 'You have access to the following tools via function calling. Use them when needed:\n';
        for (const toolName of toolNames) {
          const tool = this.parentRegistry.get(toolName);
          if (tool) {
            systemPrompt += `- **${tool.name}**: ${tool.description}\n`;
          }
        }
        systemPrompt += '\nCall these tools naturally as function calls. Results will be provided automatically.\n';
      }
    }

    // Add context
    systemPrompt += '\n## Context\n';
    if (context.contact.name) {
      systemPrompt += `Customer name: ${context.contact.name}\n`;
    }

    // Observation bridge: inject observations from recently completed goals
    if (context.goalStack) {
      const completedGoals = context.goalStack.goals.filter(
        g => g.status === 'completed' && Object.keys(g.observations).length > 0,
      );
      if (completedGoals.length > 0) {
        systemPrompt += '\n## Information from previous interactions\n';
        systemPrompt += 'The customer already provided this information in earlier skill interactions:\n';
        for (const goal of completedGoals) {
          const skillName = context.skills.find(s => s.slug === goal.skillSlug)?.name || goal.skillSlug;
          systemPrompt += `\nFrom "${skillName}":\n`;
          for (const [key, value] of Object.entries(goal.observations)) {
            systemPrompt += `- ${key}: ${value}\n`;
          }
        }
        systemPrompt += '\nUse this information directly — do NOT re-ask for it.\n';
        systemPrompt +=
          'IMPORTANT: If the information above already satisfies ALL requirements of your workflow, ' +
          'skip directly to the final confirmation/summary step and output SKILL_COMPLETE. ' +
          'Do NOT re-walk steps that are already fulfilled.\n';
      }
    }

    // Enforce strict step-by-step behaviour with mandatory reasoning
    systemPrompt +=
      '\n## CRITICAL RULES — MANDATORY\n' +
      '1. You are continuing a multi-turn conversation. The full history is provided in the messages below.\n' +
      '2. Read EVERY message in the history. Extract ALL information already provided by the customer.\n' +
      '3. NEVER re-ask for information that was already given.\n' +
      '4. NEVER skip steps. Follow the EXACT step order defined in the instructions above.\n' +
      '5. Ask for ONLY ONE piece of missing information per response.\n' +
      '6. NEVER invent information the customer did not provide.\n' +
      '7. NEVER try to auto-retrieve or look up information not provided by the customer — just ASK for it.\n' +
      '8. When ALL required info is collected, provide a confirmation summary.\n' +
      '9. SCOPE RULES — NEVER fabricate answers for topics outside your defined scope.\n' +
      '   a) FULLY out of scope: The user\'s ENTIRE message is unrelated to your skill\'s purpose.\n' +
      '      → Respond with EXACTLY: OUT_OF_SCOPE: <brief reason>\n' +
      '   b) MIXED intent: The user\'s message contains BOTH something you can handle AND a request for a DIFFERENT type of service/action.\n' +
      '      → Process the part within YOUR skill\'s purpose.\n' +
      '      → Write your normal response for the handled part.\n' +
      '      → ONLY if the other part requires a genuinely DIFFERENT skill (e.g., booking vs pricing), ' +
      'add on a new line: UNHANDLED_INTENT: <describe the OTHER action the user wants>\n' +
      '   IMPORTANT: Do NOT signal UNHANDLED_INTENT for requests that ARE your skill\'s purpose. ' +
      'If the user asks about pricing and you ARE the pricing skill, handle it — do NOT flag it as unhandled.\n';

    systemPrompt +=
      '\n## MANDATORY RESPONSE FORMAT\n' +
      'Before writing your customer-facing response, you MUST first output a reasoning block wrapped in <think>...</think> tags.\n' +
      'Inside <think>, list:\n' +
      '- What information has been collected so far (with values)\n' +
      '- Which step you are currently on\n' +
      '- What is the NEXT missing item in step order\n' +
      'Then, OUTSIDE the <think> tags, write your response to the customer.\n' +
      'The <think> block will be stripped before showing the response to the customer.\n\n' +
      '## SKILL COMPLETION\n' +
      'When your workflow is fully complete (all steps done, final summary given), ' +
      'add SKILL_COMPLETE on its own line at the very end of your response.\n' +
      'Also add a SKILL_OBSERVATIONS block listing key facts collected, like:\n' +
      'SKILL_OBSERVATIONS\n' +
      'vehicle: SUV\n' +
      'service: basic wash\n' +
      'price: HKD 200\n' +
      'END_OBSERVATIONS\n' +
      'SKILL_COMPLETE\n' +
      'Only output SKILL_COMPLETE when the skill\'s purpose is fully fulfilled.\n';

    // Add the collected-info analysis
    if (progressSummary) {
      systemPrompt += `\n## Conversation so far\n${progressSummary}\n`;
    }

    // 4. Build messages: system + conversation history + current message
    const messages: Array<any> = [
      { role: 'system', content: systemPrompt },
    ];

    // Inject conversation history so the sub-LLM has full context
    // Filter out meta-responses from the main agent that announce skill usage
    const recentHistory = context.messageHistory.slice(-12);
    for (const msg of recentHistory) {
      const content = msg.content || '';
      // Skip empty or main-agent wrapper messages
      if (!content.trim()) continue;
      if (msg.role === 'assistant' && /execute_skill|I'll use the|hold on while I process|Booking skill|skill tool/i.test(content)) {
        continue;
      }
      // Strip skill continuation markers from history
      const cleaned = content.replace(/\n?<!-- skill:\S+?(?::complete\s+\{.*?\})? -->/g, '');
      messages.push({ role: msg.role, content: cleaned as string });
    }

    // Add the current user request as the latest message
    messages.push({ role: 'user', content: userRequest });

    // Debug: log the messages being sent to sub-LLM
    console.log(`[SkillTool] Sub-LLM message count: ${messages.length}`);
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const preview = m.content.substring(0, 80).replace(/\n/g, ' ');
      console.log(`[SkillTool]   msg[${i}] role=${m.role}: ${preview}...`);
    }

    // 4. Resolve tools available for this skill
    const skillTools = this.resolveSkillTools(skill, context);
    if (skillTools.length > 0) {
      console.log(`[SkillTool] Passing ${skillTools.length} tool(s) to sub-LLM: ${skillTools.map(t => t.function.name).join(', ')}`);
    }

    // 5. Conversation loop with script execution and tool calling
    let iterations = 0;
    const maxIterations = 8;

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.callSkillLLM(messages, skillTools.length > 0 ? skillTools : undefined);
      const assistantMsg = response.choices?.[0]?.message;
      const content = assistantMsg?.content || '';
      const toolCalls = assistantMsg?.tool_calls;

      // ── Handle OpenAI-style tool calls from sub-LLM ──
      if (toolCalls && toolCalls.length > 0) {
        console.log(`[SkillTool] Sub-LLM requested ${toolCalls.length} tool call(s)`);
        messages.push({
          role: 'assistant',
          content: content || null,
          tool_calls: toolCalls,
        });

        for (const tc of toolCalls) {
          const toolName = tc.function.name;
          let toolArgs: Record<string, unknown>;
          try {
            toolArgs = JSON.parse(tc.function.arguments);
          } catch {
            messages.push({ role: 'tool', content: `Invalid arguments for tool "${toolName}"`, tool_call_id: tc.id });
            continue;
          }

          const tool = this.parentRegistry?.get(toolName);
          if (!tool) {
            messages.push({ role: 'tool', content: `Tool "${toolName}" not found`, tool_call_id: tc.id });
            continue;
          }

          console.log(`[SkillTool] Executing tool "${toolName}" with args: ${JSON.stringify(toolArgs).substring(0, 200)}`);
          try {
            const toolResult = await tool.execute(toolArgs, context);
            console.log(`[SkillTool] Tool "${toolName}" result (${toolResult.success ? 'ok' : 'fail'}): ${toolResult.summary.substring(0, 150)}`);
            messages.push({
              role: 'tool',
              content: toolResult.summary,
              tool_call_id: tc.id,
            });
          } catch (error: any) {
            console.error(`[SkillTool] Tool "${toolName}" threw:`, error.message);
            messages.push({
              role: 'tool',
              content: `Tool "${toolName}" failed: ${error.message}`,
              tool_call_id: tc.id,
            });
          }
        }
        continue;
      }

      const oosMatch = content.match(/OUT_OF_SCOPE:\s*(.+)/);
      if (oosMatch) {
        const reason = oosMatch[1].trim();
        console.log(`[SkillTool] Skill "${skill.slug}" signalled OUT_OF_SCOPE: ${reason}`);
        return { type: 'out_of_scope', content: `OUT_OF_SCOPE: ${reason}`, outOfScopeReason: reason };
      }

      // ── Handle text-marker commands (legacy: scripts, reference, examples) ──

      // Check for LOAD_REFERENCE marker
      if (content.includes('LOAD_REFERENCE') && skill.hasReferences && skill.storagePath) {
        const reference = await skillStorage.loadReference(skill.storagePath);
        if (reference) {
          messages.push({ role: 'assistant', content });
          messages.push({ role: 'user', content: `Reference material:\n\n${reference}` });
          continue;
        }
      }

      // Check for LOAD_EXAMPLES marker
      if (content.includes('LOAD_EXAMPLES') && skill.hasExamples && skill.storagePath) {
        const examples = await skillStorage.listExamples(skill.storagePath);
        const exampleContents = await Promise.all(
          examples.map(async (ex) => {
            const content = await skillStorage.loadExample(skill.storagePath, ex);
            return `## ${ex}\n${content}`;
          }),
        );
        messages.push({ role: 'assistant', content });
        messages.push({ role: 'user', content: `Examples:\n\n${exampleContents.join('\n\n')}` });
        continue;
      }

      // Check for script execution marker
      const scriptMatch = content.match(/EXECUTE_SCRIPT:(\S+)/);
      if (scriptMatch && skill.storagePath) {
        const scriptName = scriptMatch[1];
        const args = this.extractScriptArgs(content);

        console.log(`[SkillExecution] Executing script "${scriptName}" with args:`, args);

        try {
          const result = await skillStorage.executeScript(
            skill.storagePath,
            scriptName,
            args,
            SCRIPT_TIMEOUT_MS,
          );

          console.log(`[SkillExecution] Script "${scriptName}" exit=${result.exitCode} stdout=${result.stdout.substring(0, 200)}`);
          if (result.stderr) console.log(`[SkillExecution] Script stderr: ${result.stderr.substring(0, 200)}`);

          const scriptOutput =
            `Script "${scriptName}" executed successfully.\n` +
            `Output:\n${result.stdout || '(no output)'}\n` +
            (result.stderr ? `Warnings: ${result.stderr}\n` : '') +
            `Exit code: ${result.exitCode}`;

          messages.push({ role: 'assistant', content });
          messages.push({ role: 'user', content: scriptOutput });
          continue;
        } catch (error: any) {
          messages.push({ role: 'assistant', content });
          messages.push({
            role: 'user',
            content: `Script "${scriptName}" failed: ${error.message}`,
          });
          continue;
        }
      }

      const isComplete = content.includes('SKILL_COMPLETE');

      const observations: Record<string, string> = {};
      const obsMatch = content.match(/SKILL_OBSERVATIONS\n([\s\S]*?)\nEND_OBSERVATIONS/);
      if (obsMatch) {
        const lines = obsMatch[1].trim().split('\n');
        for (const line of lines) {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0) {
            observations[line.substring(0, colonIdx).trim()] = line.substring(colonIdx + 1).trim();
          }
        }
      }

      const unhandledMatch = content.match(/UNHANDLED_INTENT:\s*(.+)/);
      const unhandledIntent = unhandledMatch ? unhandledMatch[1].trim() : undefined;
      if (unhandledIntent) {
        console.log(`[SkillTool] Skill "${skill.slug}" signalled UNHANDLED_INTENT: ${unhandledIntent}`);
      }

      const cleaned = content
        .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
        .replace(/SKILL_OBSERVATIONS\n[\s\S]*?\nEND_OBSERVATIONS\s*/g, '')
        .replace(/SKILL_COMPLETE\s*/g, '')
        .replace(/UNHANDLED_INTENT:\s*.+/g, '')
        .trim();

      if (isComplete) {
        console.log(`[SkillTool] Skill COMPLETED. Observations: ${JSON.stringify(observations)}`);
      }
      console.log(`[SkillTool] Final response (${cleaned.length} chars): ${cleaned.substring(0, 100)}...`);

      return {
        type: isComplete ? 'complete' : 'response',
        content: cleaned,
        observations: Object.keys(observations).length > 0 ? observations : undefined,
        unhandledIntent,
      };
    }

    return { type: 'response', content: 'Skill execution reached maximum iterations. Please try a more specific request.' };
  }

  /**
   * Resolve which tools from the parent registry this skill is allowed to use.
   * Excludes execute_skill (no recursion) and ask_clarification (skill handles its own flow).
   */
  private resolveSkillTools(skill: AgentSkillInfo, context: AgentContext): OpenAITool[] {
    if (!this.parentRegistry || !skill.requiredTools || skill.requiredTools.length === 0) {
      return [];
    }

    const excludedTools = new Set(['execute_skill', 'ask_clarification']);
    const tools: OpenAITool[] = [];

    for (const toolName of skill.requiredTools) {
      if (excludedTools.has(toolName)) continue;
      const tool = this.parentRegistry.get(toolName);
      if (tool) {
        tools.push(tool.toOpenAITool());
      } else {
        console.warn(`[SkillTool] Skill "${skill.slug}" requested tool "${toolName}" but it's not in the registry`);
      }
    }

    return tools;
  }

  /**
   * Build a clear conversation transcript for the sub-LLM.
   */
  private buildProgressSummary(context: AgentContext): string {
    const history = context.messageHistory;
    if (history.length === 0) return '';

    const recent = history.slice(-12);
    const exchanges: string[] = [];

    for (const msg of recent) {
      const content = msg.content || '';
      if (!content.trim()) continue;

      // Skip main agent wrapper messages
      if (msg.role === 'assistant' && (
        content.includes('execute_skill') ||
        content.includes('I\'ll use the') ||
        content.includes('hold on while I process')
      )) {
        continue;
      }

      const role = msg.role === 'user' ? 'CUSTOMER' : 'YOU (assistant)';
      exchanges.push(`${role}: ${content}`);
    }

    if (exchanges.length === 0) return '';

    return 'Conversation transcript:\n' + exchanges.join('\n');
  }

  private async callSkillLLM(
    messages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }>,
    tools?: OpenAITool[],
  ): Promise<any> {
    const body: any = {
      model: openRouterConfig.models.agent,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await axios.post(
      `${openRouterConfig.baseUrl}/chat/completions`,
      body,
      {
        headers: {
          Authorization: `Bearer ${openRouterConfig.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://autoestate.ai',
          'X-Title': 'AutoEstate Skill Execution',
        },
        timeout: 30_000,
      },
    );

    return response.data;
  }

  private extractScriptArgs(content: string): string[] {
    const args: string[] = [];
    const lines = content.split('\n');
    let inScript = false;

    for (const line of lines) {
      if (line.startsWith('EXECUTE_SCRIPT:')) {
        inScript = true;
        continue;
      }
      if (line === 'END_SCRIPT') {
        break;
      }
      if (inScript && line.startsWith('ARG:')) {
        args.push(line.substring(4).trim());
      }
    }

    return args;
  }
}
