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
export { GoogleDocsTool } from './googleDocs.tool.js';
export { PdfToolkitTool } from './pdfToolkit.tool.js';
export { OfficeFilesTool } from './officeFiles.tool.js';
export { FileToolkitTool } from './fileToolkit.tool.js';
export { WebFetchStaticTool } from './webFetchStatic.tool.js';
export { WebBrowserTool } from './webBrowser.tool.js';
export { SkillExecutionTool } from './skill.tool.js';
export { WebSearchTool } from './webSearch.tool.js';
export { GetProductMenuTool } from './getProductMenu.tool.js';
export { CreateOrderTool } from './createOrder.tool.js';
export { SearchOrdersTool } from './searchOrders.tool.js';

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
import { GoogleDocsTool } from './googleDocs.tool.js';
import { PdfToolkitTool } from './pdfToolkit.tool.js';
import { OfficeFilesTool } from './officeFiles.tool.js';
import { FileToolkitTool } from './fileToolkit.tool.js';
import { WebFetchStaticTool } from './webFetchStatic.tool.js';
import { WebBrowserTool } from './webBrowser.tool.js';
import { SkillExecutionTool } from './skill.tool.js';
import { WebSearchTool } from './webSearch.tool.js';
import { GetProductMenuTool } from './getProductMenu.tool.js';
import { CreateOrderTool } from './createOrder.tool.js';
import { SearchOrdersTool } from './searchOrders.tool.js';

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
  registry.register(new GoogleDocsTool());
  registry.register(new PdfToolkitTool());
  registry.register(new OfficeFilesTool());
  registry.register(new FileToolkitTool());
  registry.register(new WebFetchStaticTool());
  registry.register(new WebBrowserTool());
  registry.register(new WebSearchTool());
  registry.register(new GetProductMenuTool());
  registry.register(new CreateOrderTool());
  registry.register(new SearchOrdersTool());

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
