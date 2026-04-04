import { BaseTool } from './base.js';
import { googleWorkspaceService } from '../../services/googleWorkspace.service.js';
import { skillStorage } from '../../services/skillStorage.service.js';
import {
  normalizeFrontmatterScalar,
  parsePaymentPendingFolderIdFromSkillMarkdown,
} from '../../utils/skillMdConfig.js';
import type { AgentContext, ToolResult } from '../types.js';

async function resolveUploadParentFolderId(
  argsParentId: string | undefined,
  context: AgentContext,
  userId: string,
): Promise<string> {
  const fromArgs = normalizeFrontmatterScalar(String(argsParentId ?? '').trim());
  if (fromArgs?.trim()) return fromArgs.trim();
  if (context.activeSkillSlug) {
    const info = context.skills.find((s) => s.slug === context.activeSkillSlug);
    if (info?.storagePath) {
      try {
        const raw = await skillStorage.loadSkillMd(info.storagePath);
        const id = parsePaymentPendingFolderIdFromSkillMarkdown(raw);
        if (id?.trim()) return id.trim();
      } catch (e: any) {
        console.warn('[GoogleDrive] Could not read SKILL.md for paymentPendingFolderId:', e?.message);
      }
    }
  }
  return googleWorkspaceService.resolvePaymentPendingFolderId(userId);
}

export class GoogleDriveTool extends BaseTool {
  readonly name = 'google_drive';
  readonly description =
    'Manage Google Drive: list, search, file info, or upload a file from a URL into a folder. ' +
    'Requires the admin to have connected their Google account in Settings.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'search', 'info', 'upload'],
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
      fileUrl: {
        type: 'string',
        description: 'Public or same-origin URL of the file to upload (for upload)',
      },
      fileName: {
        type: 'string',
        description: 'Destination file name on Drive, e.g. Receipt-MILLE-001.jpg (for upload)',
      },
      parentFolderId: {
        type: 'string',
        description:
          'Parent Drive folder ID (for upload). Omit to use skill YAML paymentPendingFolderId, then folder lookup Client Payment > Pending.',
      },
      paymentFolders: {
        type: 'boolean',
        description: 'Deprecated optional flag; omit parentFolderId to use skill file or default folders.',
      },
      mimeType: {
        type: 'string',
        description: 'Optional MIME type for upload (e.g. image/jpeg)',
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
            `${i + 1}. ${f.name} | Type: ${f.mimeType} | Modified: ${f.modifiedTime} | ID: ${f.id}${f.webViewLink ? ` | Open: ${f.webViewLink}` : ''}`,
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

        case 'upload': {
          const fileUrl = args.fileUrl as string;
          const fileName = args.fileName as string;
          if (!fileUrl?.trim() || !fileName?.trim()) {
            return {
              success: false,
              data: null,
              summary: 'upload requires fileUrl and fileName.',
            };
          }
          const parentId = await resolveUploadParentFolderId(
            args.parentFolderId as string | undefined,
            context,
            userId,
          );
          const mimeType = (args.mimeType as string) || undefined;
          const result = await googleWorkspaceService.uploadFileFromUrl(userId, {
            fileUrl: fileUrl.trim(),
            fileName: fileName.trim(),
            parentFolderId: parentId,
            mimeType,
          });
          return {
            success: true,
            data: result,
            summary: `Uploaded "${result.name}" to Drive. ID: ${result.id} | Link: ${result.webViewLink || 'n/a'}`,
          };
        }

        default:
          return { success: false, data: null, summary: `Unknown action "${action}". Use: list, search, info, upload.` };
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
