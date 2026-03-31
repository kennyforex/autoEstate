import { BaseTool } from './base.js';
import { googleWorkspaceService } from '../../services/googleWorkspace.service.js';
import { skillStorage } from '../../services/skillStorage.service.js';
import { parseOrderSheetIdFromSkillMarkdown } from '../../utils/skillMdConfig.js';
import type { AgentContext, ToolResult } from '../types.js';

/** Tool arg → active skill's SKILL.md `orderSheetId` → env fallback. */
async function resolveSpreadsheetId(
  argsId: string | undefined,
  context: AgentContext,
): Promise<string | undefined> {
  if (argsId?.trim()) return argsId.trim();

  if (context.activeSkillSlug) {
    const info = context.skills.find((s) => s.slug === context.activeSkillSlug);
    if (info?.storagePath) {
      try {
        const raw = await skillStorage.loadSkillMd(info.storagePath);
        const id = parseOrderSheetIdFromSkillMarkdown(raw);
        if (id?.trim()) return id.trim();
      } catch (e: any) {
        console.warn('[GoogleSheets] Could not read SKILL.md for orderSheetId:', e?.message);
      }
    }
  }

  return process.env.GOOGLE_MILLE_ORDER_SHEET_ID?.trim() || undefined;
}

export class GoogleSheetsTool extends BaseTool {
  readonly name = 'google_sheets';
  readonly description =
    'Read, append, or update rows in Google Sheets. For cake orders: append_row adds a line; ' +
    'update_row_by_order_id replaces the row whose column A matches the Order ID (after payment, etc.). ' +
    '19 columns with Receipt hyperlink: see row parameter. Requires Google connected in Settings.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['append_row', 'read_range', 'update_row_by_order_id'],
        description:
          'append_row adds data rows; read_range reads cell values; update_row_by_order_id replaces a row by Order ID (column A)',
      },
      spreadsheetId: {
        type: 'string',
        description:
          'Spreadsheet document ID (from the URL). If omitted while a skill is running, reads `orderSheetId` from that skill\'s SKILL.md; else env GOOGLE_MILLE_ORDER_SHEET_ID.',
      },
      sheetName: {
        type: 'string',
        description: 'Worksheet tab name, e.g. Cake orders',
      },
      range: {
        type: 'string',
        description: 'A1 range for read_range, e.g. Cake orders!A1:N5 or Sheet1!A1:C10',
      },
      row: {
        type: 'array',
        items: { type: 'string' },
        description:
          'One row: 19 cells — (1–14) Order ID, Order Date, Customer, Phone/Email, Cake Name, Flavor, Size, Servings, Pickup Date, Pickup Time, Decoration Notes, Dietary, Status, Price (HKD); (15–18) Payment Status, Payment Amount, Paid Date, Payment Checked; (19) Receipt as =HYPERLINK("url","Receipt") formula (USER_ENTERED). Legacy: 14 or 18 cells still accepted.',
      },
      orderId: {
        type: 'string',
        description:
          'For update_row_by_order_id: the Order ID to find in column A (must match the cell exactly).',
      },
      lastColumnLetter: {
        type: 'string',
        description: 'Last column letter for append range (default S for 19 columns, R for 18, N for 14).',
      },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>, context: AgentContext, _signal?: AbortSignal): Promise<ToolResult> {
    const userId = context.userId;
    if (!userId) {
      return {
        success: false,
        data: null,
        summary: 'Google account is not connected. Connect Google in Settings > Connected Apps.',
      };
    }

    const action = args.action as string;

    try {
      switch (action) {
        case 'append_row': {
          const row = args.row as string[] | undefined;
          if (!row || !Array.isArray(row) || row.length < 14) {
            return {
              success: false,
              data: null,
              summary:
                'append_row requires row: string[] with 14 (legacy), 18 (payment), or 19 (+ Receipt hyperlink) cells — see tool description.',
            };
          }
          const spreadsheetId = await resolveSpreadsheetId(args.spreadsheetId as string | undefined, context);
          if (!spreadsheetId) {
            return {
              success: false,
              data: null,
              summary:
                'Missing spreadsheet ID. Put `orderSheetId` in the skill SKILL.md frontmatter, set GOOGLE_MILLE_ORDER_SHEET_ID, or pass spreadsheetId.',
            };
          }
          const sheetName = (args.sheetName as string) || 'Cake orders';
          const lastCol =
            (args.lastColumnLetter as string)?.trim().toUpperCase() ||
            (row.length >= 19 ? 'S' : row.length >= 18 ? 'R' : 'N');
          const result = await googleWorkspaceService.appendSpreadsheetRows(userId, {
            spreadsheetId,
            sheetName,
            rows: [row],
            lastColumnLetter: lastCol,
          });
          return {
            success: true,
            data: result,
            summary: `Appended ${result.updatedRows ?? 1} row(s) to ${sheetName}. Range: ${result.updatedRange ?? 'n/a'}`,
          };
        }

        case 'read_range': {
          const range = args.range as string;
          const spreadsheetId = await resolveSpreadsheetId(args.spreadsheetId as string | undefined, context);
          if (!spreadsheetId || !range) {
            return {
              success: false,
              data: null,
              summary:
                'read_range requires range (e.g. Cake orders!A1:N20). spreadsheetId is optional if SKILL.md has orderSheetId or GOOGLE_MILLE_ORDER_SHEET_ID is set.',
            };
          }
          const values = await googleWorkspaceService.getSpreadsheetValues(userId, spreadsheetId, range);
          return {
            success: true,
            data: values,
            summary: `Read ${values.length} row(s).`,
          };
        }

        case 'update_row_by_order_id': {
          const row = args.row as string[] | undefined;
          const orderId = (args.orderId as string | undefined)?.trim();
          if (!row || !Array.isArray(row) || row.length < 14) {
            return {
              success: false,
              data: null,
              summary:
                'update_row_by_order_id requires orderId and row: string[] with 14 (legacy), 18 (payment), or 19 (+ Receipt) cells.',
            };
          }
          if (!orderId) {
            return {
              success: false,
              data: null,
              summary: 'update_row_by_order_id requires orderId (must match column A).',
            };
          }
          const spreadsheetId = await resolveSpreadsheetId(args.spreadsheetId as string | undefined, context);
          if (!spreadsheetId) {
            return {
              success: false,
              data: null,
              summary:
                'Missing spreadsheet ID. Put `orderSheetId` in the skill SKILL.md frontmatter, set GOOGLE_MILLE_ORDER_SHEET_ID, or pass spreadsheetId.',
            };
          }
          const sheetName = (args.sheetName as string) || 'Cake orders';
          const lastCol =
            (args.lastColumnLetter as string)?.trim().toUpperCase() ||
            (row.length >= 19 ? 'S' : row.length >= 18 ? 'R' : 'N');
          const result = await googleWorkspaceService.updateSpreadsheetRowByMatch(userId, {
            spreadsheetId,
            sheetName,
            matchColumnLetter: 'A',
            matchValue: orderId,
            row,
            lastColumnLetter: lastCol,
          });
          return {
            success: true,
            data: result,
            summary: `Updated row ${result.matchedRow} (${result.updatedRange}).`,
          };
        }

        default:
          return {
            success: false,
            data: null,
            summary: `Unknown action "${action}". Use append_row, read_range, or update_row_by_order_id.`,
          };
      }
    } catch (error: any) {
      if (error.message === 'GOOGLE_NOT_CONNECTED') {
        return {
          success: false,
          data: null,
          summary: 'Google account is not connected.',
        };
      }
      console.error(`[GoogleSheets] Error:`, error.message);
      return { success: false, data: null, summary: `Sheets error: ${error.message}` };
    }
  }
}
