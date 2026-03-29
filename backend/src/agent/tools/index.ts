export { BaseTool } from './base.js';
export { ToolRegistry } from './registry.js';
export { KnowledgeBaseTool } from './knowledgeBase.tool.js';
export { ClarificationTool } from './clarification.tool.js';
export { ContactLookupTool } from './contactLookup.tool.js';
export { ConversationHistoryTool } from './conversationHistory.tool.js';
export { MediaAnalysisTool } from './mediaAnalysis.tool.js';
export { DocumentDataCaptureTool } from './documentDataCapture.tool.js';
export { CalendarTool } from './calendar.tool.js';
export { GoogleGmailTool } from './googleGmail.tool.js';
export { GoogleCalendarTool } from './googleCalendar.tool.js';
export { GoogleDriveTool } from './googleDrive.tool.js';
export { GoogleSheetsTool } from './googleSheets.tool.js';
export { SkillExecutionTool } from './skill.tool.js';
export { WebSearchTool } from './webSearch.tool.js';

import { ToolRegistry } from './registry.js';
import { KnowledgeBaseTool } from './knowledgeBase.tool.js';
import { ClarificationTool } from './clarification.tool.js';
import { ContactLookupTool } from './contactLookup.tool.js';
import { ConversationHistoryTool } from './conversationHistory.tool.js';
import { MediaAnalysisTool } from './mediaAnalysis.tool.js';
import { DocumentDataCaptureTool } from './documentDataCapture.tool.js';
import { GoogleGmailTool } from './googleGmail.tool.js';
import { GoogleCalendarTool } from './googleCalendar.tool.js';
import { GoogleDriveTool } from './googleDrive.tool.js';
import { GoogleSheetsTool } from './googleSheets.tool.js';
import { SkillExecutionTool } from './skill.tool.js';
import { WebSearchTool } from './webSearch.tool.js';

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new KnowledgeBaseTool());
  registry.register(new ClarificationTool());
  registry.register(new ContactLookupTool());
  registry.register(new ConversationHistoryTool());
  registry.register(new MediaAnalysisTool());
  registry.register(new DocumentDataCaptureTool());
  registry.register(new GoogleCalendarTool());
  registry.register(new GoogleGmailTool());
  registry.register(new GoogleDriveTool());
  registry.register(new GoogleSheetsTool());
  registry.register(new WebSearchTool());

  const skillTool = new SkillExecutionTool();
  skillTool.setParentRegistry(registry);
  registry.register(skillTool);

  return registry;
}
