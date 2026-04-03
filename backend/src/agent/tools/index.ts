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

/** Same exclusions as the skill sub-agent in skill.tool.ts (resolveSkillTools). */
const SKILL_PERMISSION_EXCLUDED = new Set(['execute_skill', 'ask_clarification']);

export interface SkillPermissionToolOption {
  id: string;
  label: string;
}

/**
 * Tools a skill may declare in `requiredTools` (registry ids only).
 * Used by the assistant playground UI — must stay aligned with createDefaultRegistry().
 */
export function getSkillPermissionToolOptions(): SkillPermissionToolOption[] {
  const registry = createDefaultRegistry();
  return registry
    .list()
    .filter((t) => !SKILL_PERMISSION_EXCLUDED.has(t.name))
    .map((t) => ({
      id: t.name,
      label: t.name.replace(/_/g, ' '),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
