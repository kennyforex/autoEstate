import { BaseTool } from './base.js';
import { googleWorkspaceService } from '../../services/googleWorkspace.service.js';
import type { AgentContext, ToolResult } from '../types.js';

export class GoogleDocsTool extends BaseTool {
  readonly name = 'google_docs';
  readonly description =
    'Create or edit Google Docs (cloud Word-like documents), read plain text export, or export as PDF. ' +
    'Requires Google connected in Settings. Use for drafting letters, reports, or exporting PDFs from Docs.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'append_text', 'get_plain_text', 'export_pdf', 'export_pdf_to_drive'],
        description: 'create: new doc | append_text: append to doc | get_plain_text: export as text | export_pdf: PDF bytes summary (use export_pdf_to_drive to upload)',
      },
      title: {
        type: 'string',
        description: 'Document title (for create)',
      },
      documentId: {
        type: 'string',
        description: 'Google Doc ID from the document URL (for append_text, get_plain_text, export_pdf, export_pdf_to_drive)',
      },
      text: {
        type: 'string',
        description: 'Text to append (for append_text)',
      },
      fileName: {
        type: 'string',
        description: 'Drive file name for uploaded PDF (export_pdf_to_drive), e.g. Report.pdf',
      },
      parentFolderId: {
        type: 'string',
        description: 'Drive folder ID for export_pdf_to_drive (required for that action)',
      },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    const userId = context.userId;
    if (!userId) {
      return {
        success: false,
        data: null,
        summary:
          'Google account is not connected. The admin needs to connect Google in Settings > Connected Apps.',
      };
    }

    const action = args.action as string;

    try {
      switch (action) {
        case 'create': {
          const title = (args.title as string)?.trim() || 'Untitled';
          const res = await googleWorkspaceService.createGoogleDocument(userId, title);
          return {
            success: true,
            data: res,
            summary: `Created Google Doc "${res.title}". documentId=${res.documentId} | Open: ${res.documentUrl}`,
          };
        }
        case 'append_text': {
          const documentId = (args.documentId as string)?.trim();
          const text = args.text as string;
          if (!documentId || text === undefined || text === null) {
            return { success: false, data: null, summary: 'append_text requires documentId and text.' };
          }
          const res = await googleWorkspaceService.appendGoogleDocText(userId, documentId, String(text));
          return {
            success: true,
            data: res,
            summary: `Appended ${res.appendedChars} characters to document ${documentId}.`,
          };
        }
        case 'get_plain_text': {
          const documentId = (args.documentId as string)?.trim();
          if (!documentId) {
            return { success: false, data: null, summary: 'get_plain_text requires documentId.' };
          }
          const raw = await googleWorkspaceService.getGoogleDocPlainText(userId, documentId);
          const max = 120_000;
          const text = raw.length > max ? `${raw.slice(0, max)}\n\n[truncated]` : raw;
          return {
            success: true,
            data: { documentId, charCount: raw.length, text },
            summary: `Document text (${raw.length} chars):\n${text}`,
          };
        }
        case 'export_pdf': {
          const documentId = (args.documentId as string)?.trim();
          if (!documentId) {
            return { success: false, data: null, summary: 'export_pdf requires documentId.' };
          }
          const buf = await googleWorkspaceService.exportGoogleDocAsPdfBuffer(userId, documentId);
          const b64 = buf.toString('base64');
          const note =
            'PDF is returned as base64 in data.pdfBase64. For WhatsApp-sized replies, use export_pdf_to_drive instead.';
          return {
            success: true,
            data: { documentId, pdfBase64: b64, sizeBytes: buf.length },
            summary: `${note} Size: ${buf.length} bytes.`,
          };
        }
        case 'export_pdf_to_drive': {
          const documentId = (args.documentId as string)?.trim();
          const fileName = (args.fileName as string)?.trim();
          const parentFolderId = (args.parentFolderId as string)?.trim();
          if (!documentId || !fileName || !parentFolderId) {
            return {
              success: false,
              data: null,
              summary: 'export_pdf_to_drive requires documentId, fileName, and parentFolderId.',
            };
          }
          const buf = await googleWorkspaceService.exportGoogleDocAsPdfBuffer(userId, documentId);
          const up = await googleWorkspaceService.uploadDriveBytes(userId, {
            fileName,
            mimeType: 'application/pdf',
            body: buf,
            parentFolderId,
          });
          return {
            success: true,
            data: up,
            summary: `Exported Doc to PDF on Drive: ${up.name} | ${up.webViewLink || 'no link'}`,
          };
        }
        default:
          return { success: false, data: null, summary: `Unknown action: ${action}` };
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === 'GOOGLE_NOT_CONNECTED') {
        return {
          success: false,
          data: null,
          summary: 'Google account is not connected. Connect Google in Settings.',
        };
      }
      console.error('[GoogleDocs]', msg);
      return { success: false, data: null, summary: `Google Docs error: ${msg}` };
    }
  }
}
