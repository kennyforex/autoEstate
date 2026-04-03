import { BaseTool } from './base.js';
import { googleWorkspaceService } from '../../services/googleWorkspace.service.js';
import { skillStorage } from '../../services/skillStorage.service.js';
import {
  parseOrderSheetIdFromSkillMarkdown,
  parseSheetFieldsFromSkillMarkdown,
} from '../../utils/skillMdConfig.js';
import { spreadsheetColumnLettersToCount } from '../../utils/spreadsheetColumns.js';
import type { AgentContext, ToolResult } from '../types.js';

/** Legacy positional `row` must declare width via `lastColumnLetter` so we can reject shifted data. */
function validateLegacyRowAgainstLastColumn(
  lastColumnLetter: string | undefined,
  row: string[],
): { ok: true; lastCol: string } | { ok: false; summary: string } {
  const trimmed = lastColumnLetter?.trim().toUpperCase();
  if (!trimmed) {
    return {
      ok: false,
      summary:
        'Legacy `row` requires `lastColumnLetter` (e.g. T) so column count can be validated. Prefer `data` with `sheetFields` in SKILL.md.',
    };
  }
  const expected = spreadsheetColumnLettersToCount(trimmed);
  if (row.length !== expected) {
    return {
      ok: false,
      summary:
        `Legacy row has ${row.length} cells but ${trimmed} requires ${expected}. A missing column shifts data — use \`data\` with \`sheetFields\` or fix the array.`,
    };
  }
  return { ok: true, lastCol: trimmed };
}

async function readSkillMd(storagePath: string): Promise<string | undefined> {
  try {
    return await skillStorage.loadSkillMd(storagePath);
  } catch {
    return undefined;
  }
}

async function resolveSpreadsheetId(
  argsId: string | undefined,
  context: AgentContext,
): Promise<string | undefined> {
  if (argsId?.trim()) return argsId.trim();

  if (context.activeSkillSlug) {
    const info = context.skills.find((s) => s.slug === context.activeSkillSlug);
    if (info?.storagePath) {
      const raw = await readSkillMd(info.storagePath);
      if (raw) {
        const id = parseOrderSheetIdFromSkillMarkdown(raw);
        if (id) return id;
      }
    }
  }

  for (const s of context.skills) {
    if (!s.storagePath) continue;
    const raw = await readSkillMd(s.storagePath);
    if (raw) {
      const id = parseOrderSheetIdFromSkillMarkdown(raw);
      if (id) return id;
    }
  }

  return process.env.GOOGLE_MILLE_ORDER_SHEET_ID?.trim() || undefined;
}

/**
 * Resolve sheetFields from the active skill's SKILL.md.
 * Returns ordered field names (index = column position: 0=A, 1=B, …) or undefined.
 */
async function resolveSheetFields(context: AgentContext): Promise<string[] | undefined> {
  if (context.activeSkillSlug) {
    const info = context.skills.find((s) => s.slug === context.activeSkillSlug);
    if (info?.storagePath) {
      const raw = await readSkillMd(info.storagePath);
      if (raw) {
        const fields = parseSheetFieldsFromSkillMarkdown(raw);
        if (fields) return fields;
      }
    }
  }
  for (const s of context.skills) {
    if (!s.storagePath) continue;
    const raw = await readSkillMd(s.storagePath);
    if (raw) {
      const fields = parseSheetFieldsFromSkillMarkdown(raw);
      if (fields) return fields;
    }
  }
  return undefined;
}

/**
 * Map a data object to a positional row using the skill's sheetFields definition.
 * Each field name in sheetFields corresponds to a column (A, B, C…).
 */
function mapDataToRow(
  data: Record<string, string>,
  fields: string[],
  emptyValue: string = '—',
): { row: string[]; unmatched: string[] } {
  const fieldIndex = new Map<string, number>();
  for (let i = 0; i < fields.length; i++) {
    fieldIndex.set(fields[i].trim().toLowerCase(), i);
  }

  const row: string[] = new Array(fields.length).fill(emptyValue);
  const unmatched: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    const idx = fieldIndex.get(key.trim().toLowerCase());
    if (idx !== undefined) {
      row[idx] = value ?? emptyValue;
    } else {
      unmatched.push(key);
    }
  }

  return { row, unmatched };
}

export class GoogleSheetsTool extends BaseTool {
  readonly name = 'google_sheets';
  readonly description =
    'Read, append, or update rows in Google Sheets. ' +
    'append_row, update_row, and update_row_by_order_id accept a `data` object whose keys match the skill\'s `sheetFields` config. ' +
    'The tool maps each field to the correct column automatically. ' +
    'read_range reads an A1-style range. Requires Google connected in Settings.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['append_row', 'read_range', 'update_row', 'update_row_by_order_id'],
        description:
          'append_row adds a new row; read_range reads cell values; update_row and update_row_by_order_id find and update an existing row by matching a key (default column A). Use update_row_by_order_id when the skill matches Order ID in column A.',
      },
      spreadsheetId: {
        type: 'string',
        description:
          'Spreadsheet document ID (from the URL). If omitted, resolved from skill SKILL.md `orderSheetId` or env.',
      },
      sheetName: {
        type: 'string',
        description: 'Worksheet tab name, e.g. Sheet1 or Orders',
      },
      range: {
        type: 'string',
        description: 'A1 range for read_range, e.g. Cake orders!A1:N5 or Sheet1!A1:C10',
      },
      data: {
        type: 'object',
        description:
          'Key-value object where keys are field names defined in the skill\'s `sheetFields` (case-insensitive). ' +
          'For append_row: provide all fields; missing fields default to "—". ' +
          'For update_row: provide only fields you want to change; unmentioned fields keep existing values. ' +
          'Example: {"Order ID": "ORD-001", "Customer": "John", "Phone": "91234567", "Status": "WAITING"}',
      },
      matchValue: {
        type: 'string',
        description:
          'For update_row: the value to find in matchColumnLetter (exact match). If omitted, uses the value from data at column A.',
      },
      matchColumnLetter: {
        type: 'string',
        description:
          'For update_row: which column letter to search for the key (default A).',
      },
      // Legacy support
      row: {
        type: 'array',
        items: { type: 'string' },
        description: '(Legacy) Positional row array. Prefer `data` object instead.',
      },
      lastColumnLetter: {
        type: 'string',
        description:
          'Required with legacy `row` (must match cell count, e.g. T for 20 columns). Optional with `data`; if set, must match sheetFields width.',
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
          const spreadsheetId = await resolveSpreadsheetId(args.spreadsheetId as string | undefined, context);
          if (!spreadsheetId) {
            return {
              success: false,
              data: null,
              summary: 'Missing spreadsheet ID. Set `orderSheetId` in SKILL.md frontmatter or pass spreadsheetId.',
            };
          }
          const sheetName = (args.sheetName as string) || 'Cake orders';

          let row: string[];
          let lastCol: string;
          const dataObj = args.data as Record<string, string> | undefined;
          const legacyRow = args.row as string[] | undefined;

          if (dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj)) {
            const fields = await resolveSheetFields(context);
            if (!fields) {
              return {
                success: false,
                data: null,
                summary:
                  'No `sheetFields` defined in the skill SKILL.md. Add a sheetFields list to the frontmatter to use the data object.',
              };
            }
            const mapped = mapDataToRow(dataObj, fields);
            row = mapped.row;
            if (mapped.unmatched.length > 0) {
              return {
                success: false,
                data: null,
                summary:
                  `These data keys do not match any field in sheetFields: [${mapped.unmatched.join(', ')}]. ` +
                  `Valid fields are: [${fields.join(', ')}]. Fix the keys and retry.`,
              };
            }
            const explicitLast = (args.lastColumnLetter as string | undefined)?.trim().toUpperCase();
            if (explicitLast) {
              const expected = spreadsheetColumnLettersToCount(explicitLast);
              if (row.length !== expected) {
                return {
                  success: false,
                  data: null,
                  summary: `Mapped row has ${row.length} columns but lastColumnLetter ${explicitLast} expects ${expected}. Fix sheetFields or lastColumnLetter.`,
                };
              }
              lastCol = explicitLast;
            } else {
              lastCol = String.fromCharCode(64 + row.length);
            }
          } else if (legacyRow && Array.isArray(legacyRow) && legacyRow.length >= 2) {
            row = legacyRow;
            const v = validateLegacyRowAgainstLastColumn(args.lastColumnLetter as string | undefined, row);
            if (!v.ok) {
              return { success: false, data: null, summary: v.summary };
            }
            lastCol = v.lastCol;
          } else {
            return {
              success: false,
              data: null,
              summary: 'append_row requires `data` (object) or `row` (legacy array).',
            };
          }

          const result = await googleWorkspaceService.appendSpreadsheetRows(userId, {
            spreadsheetId,
            sheetName,
            rows: [row],
            lastColumnLetter: lastCol,
          });

          return {
            success: true,
            data: result,
            summary: `Appended 1 row to ${sheetName}. Range: ${result.updatedRange ?? 'n/a'}`,
          };
        }

        case 'read_range': {
          const range = args.range as string;
          const spreadsheetId = await resolveSpreadsheetId(args.spreadsheetId as string | undefined, context);
          if (!spreadsheetId || !range) {
            return {
              success: false,
              data: null,
              summary: 'read_range requires range (e.g. Cake orders!A1:T20).',
            };
          }
          const values = await googleWorkspaceService.getSpreadsheetValues(userId, spreadsheetId, range);
          return { success: true, data: values, summary: `Read ${values.length} row(s).` };
        }

        case 'update_row':
        case 'update_row_by_order_id': {
          const spreadsheetId = await resolveSpreadsheetId(args.spreadsheetId as string | undefined, context);
          if (!spreadsheetId) {
            return {
              success: false,
              data: null,
              summary: 'Missing spreadsheet ID. Set `orderSheetId` in SKILL.md frontmatter or pass spreadsheetId.',
            };
          }
          const sheetName = (args.sheetName as string) || 'Cake orders';

          let row: string[];
          let lastCol: string;
          const dataObj = args.data as Record<string, string> | undefined;
          const legacyRow = args.row as string[] | undefined;

          if (dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj)) {
            const fields = await resolveSheetFields(context);
            if (!fields) {
              return {
                success: false,
                data: null,
                summary:
                  'No `sheetFields` defined in the skill SKILL.md. Add a sheetFields list to the frontmatter to use the data object.',
              };
            }
            // For update: empty string = keep existing value
            const mapped = mapDataToRow(dataObj, fields, '');
            row = mapped.row;
            if (mapped.unmatched.length > 0) {
              return {
                success: false,
                data: null,
                summary:
                  `These data keys do not match any field in sheetFields: [${mapped.unmatched.join(', ')}]. ` +
                  `Valid fields are: [${fields.join(', ')}]. Fix the keys and retry.`,
              };
            }
            const explicitLast = (args.lastColumnLetter as string | undefined)?.trim().toUpperCase();
            if (explicitLast) {
              const expected = spreadsheetColumnLettersToCount(explicitLast);
              if (row.length !== expected) {
                return {
                  success: false,
                  data: null,
                  summary: `Mapped row has ${row.length} columns but lastColumnLetter ${explicitLast} expects ${expected}. Fix sheetFields or lastColumnLetter.`,
                };
              }
              lastCol = explicitLast;
            } else {
              lastCol = String.fromCharCode(64 + row.length);
            }
          } else if (legacyRow && Array.isArray(legacyRow) && legacyRow.length >= 2) {
            row = legacyRow;
            const v = validateLegacyRowAgainstLastColumn(args.lastColumnLetter as string | undefined, row);
            if (!v.ok) {
              return { success: false, data: null, summary: v.summary };
            }
            lastCol = v.lastCol;
          } else {
            return {
              success: false,
              data: null,
              summary: 'update_row requires `data` (object) or `row` (legacy array).',
            };
          }

          // Resolve match key
          const matchCol = (args.matchColumnLetter as string)?.trim().toUpperCase() || 'A';
          const matchColIdx = matchCol.charCodeAt(0) - 65;
          const explicit = (args.matchValue as string | undefined)?.trim() || '';
          const fromRow = matchColIdx >= 0 && matchColIdx < row.length ? String(row[matchColIdx] ?? '').trim() : '';
          const matchKey = explicit || fromRow;

          if (!matchKey) {
            return {
              success: false,
              data: null,
              summary: `update_row needs a key to find the row. Pass matchValue or include the column ${matchCol} field in data.`,
            };
          }

          const result = await googleWorkspaceService.updateSpreadsheetRowByMatch(userId, {
            spreadsheetId,
            sheetName,
            matchColumnLetter: matchCol,
            matchValue: matchKey,
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
            summary: `Unknown action "${action}". Use append_row, read_range, update_row, or update_row_by_order_id.`,
          };
      }
    } catch (error: any) {
      if (error.message === 'GOOGLE_NOT_CONNECTED') {
        return { success: false, data: null, summary: 'Google account is not connected.' };
      }
      console.error(`[GoogleSheets] Error:`, error.message);
      return { success: false, data: null, summary: `Sheets error: ${error.message}` };
    }
  }
}
