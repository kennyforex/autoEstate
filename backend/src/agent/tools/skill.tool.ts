import axios from 'axios';
import { BaseTool } from './base.js';
import { openRouterHeaders } from '../../config/httpAttribution.js';
import { openRouterConfig } from '../../config/openrouter.js';
import { skillStorage } from '../../services/skillStorage.service.js';
import type { AgentContext, AgentSkillInfo, ToolResult, OpenAITool, SkillExecutionResult } from '../types.js';
import {
  parseOrderSheetIdFromSkillMarkdown,
  parseOrderSheetTabFromSkillMarkdown,
  parsePaymentPendingFolderIdFromSkillMarkdown,
} from '../../utils/skillMdConfig.js';
import { stripSkillMarkers } from '../../utils/helpers.js';
import type { ToolRegistry } from './registry.js';

const DEFAULT_DESCRIPTION =
  'Execute a skill by its slug. No skills are currently available.';

const MAX_SKILL_INSTRUCTIONS = 4000;
const SCRIPT_TIMEOUT_MS = 30000;
/** Tool-heavy skills (e.g. receipt → capture + sheets + drive) need more than 8 LLM rounds. */
const SKILL_SUB_LLM_MAX_ITERATIONS = Math.min(
  24,
  Math.max(8, parseInt(process.env.SKILL_MAX_ITERATIONS || '16', 10) || 16),
);

/**
 * Manager often calls `execute_skill` with a short paraphrase; attachment lines stay only in the full turn.
 */
function mergeSkillUserRequestWithFullTurn(userRequest: string, fullTurn?: string): string {
  const u = userRequest.trim();
  const full = fullTurn?.trim() ?? '';
  if (!full) return u;
  const fullHasMedia = /Image URL:|PDF URL:/i.test(full);
  const uHasMedia = /Image URL:|PDF URL:/i.test(u);
  if (fullHasMedia && !uHasMedia) {
    return (
      `${u}\n\n` +
      `[Full customer message — includes file URL(s) for document_data_capture / google_drive; do not ask for the file again if present below]\n` +
      `${full}`
    );
  }
  return u;
}

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
    signal?: AbortSignal,
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
      const skillResult = await this.executeSkillWithScripts(skill, userRequest, context, signal);
      return this.mapToToolResult(slug, skillResult);
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error(`[SkillExecution] Skill "${slug}" failed:`, msg);
      return {
        success: false,
        data: null,
        summary: `Skill "${slug}" execution failed: ${msg}`,
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
    signal?: AbortSignal,
  ): Promise<SkillExecutionResult> {
    const prevActiveSlug = context.activeSkillSlug;
    context.activeSkillSlug = skill.slug;
    try {
      return await this.runSkillWithScriptsInner(skill, userRequest, context, signal);
    } finally {
      context.activeSkillSlug = prevActiveSlug;
    }
  }

  private async runSkillWithScriptsInner(
    skill: AgentSkillInfo,
    userRequest: string,
    context: AgentContext,
    signal?: AbortSignal,
  ): Promise<SkillExecutionResult> {
    // 1. Load SKILL.md from storage (file is source of truth; YAML may contain orderSheetId, etc.)
    let rawSkillMd: string;
    if (skill.storagePath) {
      try {
        rawSkillMd = await skillStorage.loadSkillMd(skill.storagePath);
      } catch {
        rawSkillMd = skill.instructions || '';
      }
    } else {
      rawSkillMd = skill.instructions || '';
    }

    if (!rawSkillMd?.trim()) {
      throw new Error(`No instructions found for skill "${skill.name}"`);
    }

    const sheetIdHint = parseOrderSheetIdFromSkillMarkdown(rawSkillMd);
    const sheetTabHint = parseOrderSheetTabFromSkillMarkdown(rawSkillMd);
    const paymentFolderIdHint = parsePaymentPendingFolderIdFromSkillMarkdown(rawSkillMd);

    // Strip YAML frontmatter for instruction body
    let instructions = rawSkillMd.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();

    if (instructions.length > MAX_SKILL_INSTRUCTIONS) {
      instructions = instructions.substring(0, MAX_SKILL_INSTRUCTIONS) + '...';
    }

    // 2. Analyze conversation history to build a progress summary
    const progressSummary = this.buildProgressSummary(context);

    // 3. Build system prompt with instructions + conversation awareness
    let systemPrompt =
      `You are executing the "${skill.name}" skill.\n\n` +
      `## Skill Instructions\n${instructions}\n\n`;

    if (sheetIdHint) {
      systemPrompt +=
        `\n## Google Sheet (from this skill's SKILL.md frontmatter)\n` +
        `Spreadsheet document ID for \`google_sheets\` **append_row** — omit \`spreadsheetId\` in the tool call: \`${sheetIdHint}\`\n`;
    }
    if (sheetTabHint) {
      systemPrompt +=
        `\nWorksheet **tab name** for \`google_sheets\` (\`read_range\`, \`append_row\`, \`update_row*\`): \`${sheetTabHint}\` — must match the tab where orders are stored.\n`;
    }
    if (paymentFolderIdHint) {
      systemPrompt +=
        `\n## Google Drive receipts (from this skill's SKILL.md frontmatter)\n` +
        `Parent folder ID for \`google_drive\` **upload** — omit \`parentFolderId\` (Pending folder): \`${paymentFolderIdHint}\`\n`;
    }

    // Add reference/examples/scripts availability
    if (skill.hasReferences && skill.storagePath) {
      try {
        const listed = await skillStorage.listReferenceDocuments(skill.storagePath);
        const labels = listed.files.map((f) =>
          f.legacy ? `${f.name} (legacy at skill root)` : f.name,
        );
        const fileHint =
          labels.length > 0
            ? `Reference files (on demand): ${labels.join(', ')}. `
            : 'Reference material available. ';
        systemPrompt +=
          `\n[${fileHint}Use LOAD_REFERENCE to load all documents (concatenated), or LOAD_REFERENCE:filename.md with the basename only for one file.]\n`;
      } catch {
        systemPrompt +=
          '\n[Reference material available. Use LOAD_REFERENCE or LOAD_REFERENCE:filename.md.]\n';
      }
    } else if (skill.hasReferences) {
      systemPrompt +=
        '\n[Reference material available. Use LOAD_REFERENCE or LOAD_REFERENCE:filename.md.]\n';
    }
    if (skill.hasExamples) {
      systemPrompt += '\n[Usage examples available. Use "LOAD_EXAMPLES" to see them.]\n';
    }
    if (skill.availableScripts.length > 0) {
      systemPrompt += '\n## Available Scripts — MANDATORY\n';
      systemPrompt += 'You MUST use these scripts for any calculations, pricing, or data lookups. ' +
        'NEVER compute, estimate, or fabricate results yourself — even if you saw similar results in earlier messages. ' +
        'Previous results are for that specific request only.\n';
      for (const scriptName of skill.availableScripts) {
        systemPrompt += `- ${scriptName}\n`;
      }
      systemPrompt += '\nTo run a script, output exactly:\n';
      systemPrompt += 'EXECUTE_SCRIPT:scriptname\nARG:arg1_value\nEND_SCRIPT\n';
      systemPrompt += '\nThe script output will be provided as the next message. Wait for it before quoting any numbers.\n';
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
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Hong_Kong',
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Hong_Kong',
      hour12: false,
    });
    systemPrompt += `Today is ${dateStr}, current time is ${timeStr} (Hong Kong Time).\n`;
    if (context.contact.name) {
      systemPrompt += `Customer name: ${context.contact.name}\n`;
    }
    if (skill.ownerDisplayName) {
      systemPrompt +=
        `Department role: you are acting as **${skill.ownerDisplayName}**` +
        (skill.ownerRoleTitle ? ` (${skill.ownerRoleTitle})` : '') +
        '. Produce output the manager can relay to the customer.\n';
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

    // Inject step progress checklist if available from DB-backed goal stack
    const activeGoal = context.goalStack?.goals.find(
      (g) => g.skillSlug === skill.slug && g.status === 'active',
    );
    if (activeGoal?.steps && activeGoal.steps.length > 0) {
      systemPrompt += '\n## Your Progress\n';
      systemPrompt += 'This checklist tracks what you have collected so far. Pick up from the NEXT incomplete step.\n';
      for (let i = 0; i < activeGoal.steps.length; i++) {
        const step = activeGoal.steps[i];
        const icon = step.status === 'completed' ? '[x]' : step.status === 'active' ? '[ ]' : '[ ]';
        const value = step.collectedValue ? ` → "${step.collectedValue}"` : '';
        const current = step.status === 'active' ? ' (YOU ARE HERE)' : '';
        systemPrompt += `- ${icon} Step ${i + 1}: ${step.label}${value}${current}\n`;
      }
      systemPrompt += '\nDo NOT re-ask for information already marked [x].\n';
    }

    systemPrompt +=
      '\n## RULES\n' +
      '1. You are continuing a multi-turn conversation. The full history is provided in the messages below.\n' +
      '2. NEVER re-ask for information that was already given or marked completed above.\n' +
      '3. Ask for ONLY ONE piece of missing information per response.\n' +
      '4. NEVER invent information the customer did not provide.\n' +
      '5. NEVER try to auto-retrieve or look up information not provided by the customer — just ASK for it.\n' +
      '6. When ALL required info is collected, provide a confirmation summary.\n' +
      '7. SCOPE RULES — NEVER fabricate answers for topics outside your defined scope.\n' +
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
      '\n## SKILL COMPLETION\n' +
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
      const cleaned = stripSkillMarkers(content);
      messages.push({ role: msg.role, content: cleaned as string });
    }

    // Latest user message: merge execute_skill args with full turn so Image URL / PDF URL are not lost
    const mergedUserRequest = mergeSkillUserRequestWithFullTurn(userRequest, context.lastUserTurnContent);
    messages.push({ role: 'user', content: mergedUserRequest });

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
    const maxIterations = SKILL_SUB_LLM_MAX_ITERATIONS;
    let scriptExecutedInLoop = false;
    let toolCalledInLoop = false;
    const calledToolNames = new Set<string>();

    while (iterations < maxIterations) {
      iterations++;

      if (signal?.aborted) {
        throw new Error(typeof signal.reason === 'string' ? signal.reason : 'Skill execution aborted');
      }

      console.log(
        `[SkillTool] Sub-LLM iteration ${iterations}/${maxIterations} start (skill=${skill.slug})`,
      );
      const response = await this.callSkillLLM(
        messages,
        skillTools.length > 0 ? skillTools : undefined,
        signal,
      );
      console.log(
        `[SkillTool] Sub-LLM iteration ${iterations}/${maxIterations} response received`,
      );
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
          toolCalledInLoop = true;
          calledToolNames.add(toolName);
          try {
            const toolResult = await tool.execute(toolArgs, context, signal);
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

      // Check for LOAD_REFERENCE marker (optional: LOAD_REFERENCE:filename.md)
      if (content.includes('LOAD_REFERENCE') && skill.hasReferences && skill.storagePath) {
        const loadMatch = content.match(/LOAD_REFERENCE(?::\s*(\S+))?/);
        const specific = loadMatch?.[1]?.replace(/^[`\*]+|[`\*]+$/g, '').trim();
        let reference: string | null = null;
        if (specific) {
          reference = await skillStorage.loadReferenceDocument(skill.storagePath, specific);
        } else {
          reference = await skillStorage.loadReference(skill.storagePath);
        }
        if (reference) {
          messages.push({ role: 'assistant', content });
          messages.push({ role: 'user', content: `Reference material:\n\n${reference}` });
          continue;
        }
        messages.push({ role: 'assistant', content });
        messages.push({
          role: 'user',
          content:
            'Reference material could not be loaded. Use LOAD_REFERENCE with no suffix for all docs, or LOAD_REFERENCE:basename.md for one file under references/.',
        });
        continue;
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
        scriptExecutedInLoop = true;
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

      // Guard: if the skill has scripts and the LLM quoted prices WITHOUT
      // having run any script during this entire invocation, force a retry (once).
      if (
        skill.availableScripts.length > 0 &&
        !scriptExecutedInLoop &&
        /(?:HKD|USD|\$)\s*\d+/i.test(content) &&
        iterations < maxIterations
      ) {
        console.log(`[SkillTool] Sub-LLM fabricated pricing without running a script — forcing retry`);
        messages.push({ role: 'assistant', content });
        messages.push({
          role: 'user',
          content:
            'SYSTEM: You provided pricing without running the required script. ' +
            'You MUST use EXECUTE_SCRIPT to get real prices. ' +
            'Do NOT make up numbers. Re-do your response using the script.',
        });
        continue;
      }

      // Guard: detect mid-workflow tool fabrication — LLM claims to have used a tool but never called it
      if (skill.requiredTools && skill.requiredTools.length > 0 && iterations < maxIterations) {
        const fabricationMap: Record<string, RegExp> = {
          google_sheets: /(?:order (?:logged|recorded|saved|appended|submitted)|sheet (?:updated|appended)|row (?:added|appended|written)|已記錄|已登記|已寫入|訂單.*已記|記錄.*訂單|order.*recorded|recorded.*order|appended.*sheet)/i,
          google_gmail: /(?:email (?:sent|delivered|dispatched)|confirmation (?:email )?sent|已發送.*電郵|電郵.*已發|email.*已送|sent.*confirmation email)/i,
          google_calendar: /(?:calendar (?:event|entry|appointment).*(?:added|created|scheduled)|event (?:added|created) (?:to|on) (?:the )?calendar|已加入.*日曆|日曆.*已更新)/i,
        };
        let fabricationDetected = false;
        for (const toolName of skill.requiredTools) {
          if (calledToolNames.has(toolName)) continue;
          const pattern = fabricationMap[toolName];
          if (pattern && pattern.test(content)) {
            console.log(`[SkillTool] Sub-LLM fabricated ${toolName} result without calling it — forcing actual tool call`);
            messages.push({ role: 'assistant', content });
            messages.push({
              role: 'user',
              content:
                `SYSTEM: You described an action that requires ${toolName} but you did NOT call the tool. ` +
                `You MUST make the actual function call to ${toolName} right now. ` +
                `Do NOT write text describing what you will do — invoke the function call directly.`,
            });
            fabricationDetected = true;
            break;
          }
        }
        if (fabricationDetected) continue;
      }

      const isComplete = content.includes('SKILL_COMPLETE');

      // Guard: if skill says COMPLETE but has requiredTools that were never called, force retry
      if (
        isComplete &&
        !toolCalledInLoop &&
        skill.requiredTools && skill.requiredTools.length > 0 &&
        iterations < maxIterations
      ) {
        const toolNames = skill.requiredTools.filter(t => t !== 'execute_skill' && t !== 'ask_clarification');
        if (toolNames.length > 0) {
          console.log(`[SkillTool] Sub-LLM marked SKILL_COMPLETE without calling required tool(s): ${toolNames.join(', ')} — forcing retry`);
          messages.push({ role: 'assistant', content });
          messages.push({
            role: 'user',
            content:
              'SYSTEM: You marked the skill as complete, but you FORGOT to call the required tool(s): ' +
              toolNames.join(', ') + '. ' +
              'You MUST actually invoke the tool function call NOW before completing. ' +
              'Do NOT just write text about it — make the actual function call.',
          });
          continue;
        }
      }

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

    console.warn(
      `[SkillTool] Skill "${skill.slug}" hit max iterations (${maxIterations}) — returning last assistant text or fallback`,
    );
    const lastAssistantText = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0);
    const fallback =
      typeof lastAssistantText?.content === 'string' && lastAssistantText.content.trim().length > 0
        ? lastAssistantText.content
            .replace(/SKILL_COMPLETE\s*/g, '')
            .replace(/SKILL_OBSERVATIONS\n[\s\S]*?\nEND_OBSERVATIONS\s*/g, '')
            .trim()
        : '';
    if (fallback.length > 0) {
      return { type: 'response', content: fallback };
    }
    return {
      type: 'response',
      content:
        'Skill execution reached maximum iterations. The workflow may need more steps (e.g. Google tools). Please try again or narrow the request.',
    };
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
    signal?: AbortSignal,
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
          ...openRouterHeaders('Foodflow Skill Execution'),
        },
        timeout: 90_000,
        signal,
      },
    );

    const data = response.data;
    if (!data?.choices?.[0]?.message) {
      const snippet = JSON.stringify(data ?? {}).slice(0, 800);
      throw new Error(`Skill sub-LLM returned no choices. ${snippet}`);
    }
    return data;
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
