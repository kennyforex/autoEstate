import axios from 'axios';
import { BaseTool } from './base.js';
import { openRouterConfig } from '../../config/openrouter.js';
import { skillStorage } from '../../services/skillStorage.service.js';
import type { AgentContext, AgentSkillInfo, ToolResult, OpenAITool } from '../types.js';
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
      const result = await this.executeSkillWithScripts(skill, userRequest, context);
      return {
        success: true,
        data: { skill: slug, output: result },
        summary: result,
      };
    } catch (error: any) {
      console.error(`[SkillExecution] Skill "${slug}" failed:`, error.message);
      return {
        success: false,
        data: null,
        summary: `Skill "${slug}" execution failed: ${error.message}`,
      };
    }
  }

  /**
   * Execute skill with on-demand loading, conversation history, and script support.
   */
  private async executeSkillWithScripts(
    skill: AgentSkillInfo,
    userRequest: string,
    context: AgentContext,
  ): Promise<string> {
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

    // Add context
    systemPrompt += '\n## Context\n';
    if (context.contact.name) {
      systemPrompt += `Customer name: ${context.contact.name}\n`;
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
      '8. When ALL required info is collected, provide a confirmation summary.\n';

    systemPrompt +=
      '\n## MANDATORY RESPONSE FORMAT\n' +
      'Before writing your customer-facing response, you MUST first output a reasoning block wrapped in <think>...</think> tags.\n' +
      'Inside <think>, list:\n' +
      '- What information has been collected so far (with values)\n' +
      '- Which step you are currently on\n' +
      '- What is the NEXT missing item in step order\n' +
      'Then, OUTSIDE the <think> tags, write your response to the customer.\n' +
      'The <think> block will be stripped before showing the response to the customer.\n';

    // Add the collected-info analysis
    if (progressSummary) {
      systemPrompt += `\n## Conversation so far\n${progressSummary}\n`;
    }

    // 4. Build messages: system + conversation history + current message
    const messages: Array<{ role: string; content: string }> = [
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
      messages.push({ role: msg.role, content });
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

    // 4. Conversation loop with script execution
    let iterations = 0;
    const maxIterations = 5; // Prevent infinite loops

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.callSkillLLM(messages);
      const content = response.choices?.[0]?.message?.content || '';

      // Check for LOAD_REFERENCE marker
      if (content.includes('LOAD_REFERENCE') && skill.hasReferences && skill.storagePath) {
        const reference = await skillStorage.loadReference(skill.storagePath);
        if (reference) {
          messages.push({ role: 'assistant', content });
          messages.push({ role: 'user', content: `Reference material:\n\n${reference}` });
          continue; // Continue conversation with reference loaded
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

          // Add to conversation
          messages.push({ role: 'assistant', content });
          messages.push({
            role: 'user',
            content:
              `Script "${scriptName}" output:\n` +
              `stdout: ${result.stdout || '(empty)'}\n` +
              `stderr: ${result.stderr || '(empty)'}\n` +
              `exit code: ${result.exitCode}`,
          });

          continue; // Continue conversation with script output
        } catch (error: any) {
          // Script execution failed
          messages.push({ role: 'assistant', content });
          messages.push({
            role: 'user',
            content: `Script "${scriptName}" failed: ${error.message}`,
          });
          continue;
        }
      }

      // No markers found - this is the final response
      // Strip <think>...</think> reasoning block before returning to customer
      const cleaned = content.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
      console.log(`[SkillTool] Final response (${cleaned.length} chars): ${cleaned.substring(0, 100)}...`);
      return cleaned;
    }

    // Max iterations reached
    return 'Skill execution reached maximum iterations. Please try a more specific request.';
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
    messages: Array<{ role: string; content: string }>,
  ): Promise<any> {
    const response = await axios.post(
      `${openRouterConfig.baseUrl}/chat/completions`,
      {
        model: openRouterConfig.models.agent,
        messages,
        temperature: 0.3,
        max_tokens: 2048,
      },
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
