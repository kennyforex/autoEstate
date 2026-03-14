import type { BaseTool } from './base.js';
import type { AgentSkillInfo, OpenAITool } from '../types.js';

export class ToolRegistry {
  private tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting tool "${tool.name}"`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  names(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Broadcast the current skill list to all tools so context-aware tools
   * (like execute_skill) can update their dynamic descriptions / schemas.
   */
  updateSkillContext(skills: AgentSkillInfo[]): void {
    for (const tool of this.tools.values()) {
      tool.setSkillContext(skills);
    }
  }

  toOpenAIFormat(): OpenAITool[] {
    return this.list().map((tool) => tool.toOpenAITool());
  }
}
