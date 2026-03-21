import type { AgentContext, AgentSkillInfo, ToolResult, OpenAITool } from '../types.js';

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: Record<string, unknown>;

  abstract execute(args: Record<string, unknown>, context: AgentContext, signal?: AbortSignal): Promise<ToolResult>;

  /**
   * Called before tool schema generation so context-aware tools (e.g. skill
   * execution) can build dynamic descriptions based on available skills.
   * Override in subclasses that need it; default is a no-op.
   */
  setSkillContext(_skills: AgentSkillInfo[]): void {
    // no-op by default
  }

  toOpenAITool(): OpenAITool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}
