import { BaseTool } from './base.js';
import { googleWorkspaceService } from '../../services/googleWorkspace.service.js';
import type { AgentContext, ToolResult } from '../types.js';

export class GoogleDriveTool extends BaseTool {
  readonly name = 'google_drive';
  readonly description =
    'Manage Google Drive: list recent files, search files, get file details. ' +
    'Requires the admin to have connected their Google account in Settings.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'search', 'info'],
        description: 'The Drive action to perform',
      },
      query: {
        type: 'string',
        description: "Drive search query (for search), e.g. \"name contains 'report'\"",
      },
      fileId: {
        type: 'string',
        description: 'File ID (for info)',
      },
      pageSize: {
        type: 'number',
        description: 'Number of files to return (default 10)',
      },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>, context: AgentContext, _signal?: AbortSignal): Promise<ToolResult> {
    const userId = context.userId;
    if (!userId) {
      return { success: false, data: null, summary: 'Google account is not connected. The admin needs to connect Google in Settings > Connected Apps.' };
    }

    const action = args.action as string;

    try {
      switch (action) {
        case 'list':
        case 'search': {
          const query = action === 'search' ? (args.query as string) : undefined;
          const pageSize = (args.pageSize as number) || 10;
          const files = await googleWorkspaceService.listFiles(userId, { query, pageSize });
          if (files.length === 0) {
            return { success: true, data: [], summary: 'No files found.' };
          }
          const summary = files.map((f, i) =>
            `${i + 1}. ${f.name} | Type: ${f.mimeType} | Modified: ${f.modifiedTime} | ID: ${f.id}`,
          ).join('\n');
          return { success: true, data: files, summary: `${files.length} file(s):\n${summary}` };
        }

        case 'info': {
          const fileId = args.fileId as string;
          if (!fileId) {
            return { success: false, data: null, summary: 'Missing required parameter: fileId' };
          }
          const info = await googleWorkspaceService.getFileInfo(userId, fileId);
          return {
            success: true,
            data: info,
            summary: `File: ${info.name}\nType: ${info.mimeType}\nSize: ${info.size || 'N/A'}\nModified: ${info.modifiedTime}\nLink: ${info.webViewLink}`,
          };
        }

        default:
          return { success: false, data: null, summary: `Unknown action "${action}". Use: list, search, info.` };
      }
    } catch (error: any) {
      if (error.message === 'GOOGLE_NOT_CONNECTED') {
        return { success: false, data: null, summary: 'Google account is not connected. The admin needs to connect Google in Settings > Connected Apps.' };
      }
      console.error(`[GoogleDrive] Error:`, error.message);
      return { success: false, data: null, summary: `Drive error: ${error.message}` };
    }
  }
}
