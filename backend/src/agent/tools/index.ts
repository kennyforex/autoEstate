export { BaseTool } from './base.js';
export { ToolRegistry } from './registry.js';
export { KnowledgeBaseTool } from './knowledgeBase.tool.js';
export { ClarificationTool } from './clarification.tool.js';
export { ContactLookupTool } from './contactLookup.tool.js';
export { ConversationHistoryTool } from './conversationHistory.tool.js';
export { MediaAnalysisTool } from './mediaAnalysis.tool.js';
export { CalendarTool } from './calendar.tool.js';
export { SkillExecutionTool } from './skill.tool.js';

import { ToolRegistry } from './registry.js';
import { KnowledgeBaseTool } from './knowledgeBase.tool.js';
import { ClarificationTool } from './clarification.tool.js';
import { ContactLookupTool } from './contactLookup.tool.js';
import { ConversationHistoryTool } from './conversationHistory.tool.js';
import { MediaAnalysisTool } from './mediaAnalysis.tool.js';
import { CalendarTool } from './calendar.tool.js';
import { SkillExecutionTool } from './skill.tool.js';

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new KnowledgeBaseTool());
  registry.register(new ClarificationTool());
  registry.register(new ContactLookupTool());
  registry.register(new ConversationHistoryTool());
  registry.register(new MediaAnalysisTool());
  registry.register(new CalendarTool());

  const skillTool = new SkillExecutionTool();
  skillTool.setParentRegistry(registry);
  registry.register(skillTool);

  return registry;
}
