import { BaseTool } from './base.js';
import { googleWorkspaceService } from '../../services/googleWorkspace.service.js';
import { skillStorage } from '../../services/skillStorage.service.js';
import {
  parseOrderSheetIdFromSkillMarkdown,
  parseOrderSheetTabFromSkillMarkdown,
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
async function resolveOrderSheetTab(context: AgentContext): Promise<string | undefined> {
  if (context.activeSkillSlug) {
    const info = context.skills.find((s) => s.slug === context.activeSkillSlug);
    if (info?.storagePath) {
      const raw = await readSkillMd(info.storagePath);
      if (raw) {
        const tab = parseOrderSheetTabFromSkillMarkdown(raw);
        if (tab) return tab;
      }
    }
  }
  for (const s of context.skills) {
    if (!s.storagePath) continue;
    const raw = await readSkillMd(s.storagePath);
    if (raw) {
      const tab = parseOrderSheetTabFromSkillMarkdown(raw);
      if (tab) return tab;
    }
  }
  return undefined;
}

/** Prefer SKILL.md `orderSheetTab` over tool args so the tab matches booking / append_row. */
async function resolveSheetNameForAction(
  argsSheetName: string | undefined,
  context: AgentContext,
): Promise<string> {
  const fromYaml = await resolveOrderSheetTab(context);
  if (fromYaml?.trim()) return fromYaml.trim();
  const a = argsSheetName?.trim();
  if (a) return a;
  return 'Cake orders';
}

/** Quote worksheet title for Google Sheets A1 ranges. */
function quoteSheetTitleForRange(title: string): string {
  const t = title.replace(/'/g, "''");
  return `'${t}'`;
}

/**
 * When `orderSheetTab` is set in SKILL.md, rewrite the range to use that tab
 * (fixes bad model output like `Orders!A1:U` when the real tab is `Cake orders`).
 */
function applyCanonicalSheetTabToRange(range: string, canonicalTab: string | undefined): string {
  const r = range.trim();
  if (!canonicalTab?.trim()) return r;
  const quoted = quoteSheetTitleForRange(canonicalTab.trim());
  if (!r.includes('!')) {
    return `${quoted}!${r}`;
  }
  const bang = r.indexOf('!');
  const cellPart = r.slice(bang + 1).trim();
  return `${quoted}!${cellPart}`;
}

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

/** Skill sub-agents only receive `summary` (not `data`); include values here so the model can quote cells. */
const READ_RANGE_MAX_ROWS = 50;
const READ_RANGE_MAX_SUMMARY_CHARS = 14_000;

function mapRowToNamedFields(row: string[], fields: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i < fields.length; i++) {
    o[fields[i]] = String(row[i] ?? "").trim();
  }
  return o;
}

/**
 * Build a summary that includes raw grid + rows mapped to `sheetFields` when column count matches.
 */
function buildReadRangeSummary(
  values: unknown[][],
  fields: string[] | undefined,
  rangeLabel: string,
): string {
  const rows: string[][] = values.map((row) =>
    (row ?? []).map((c) => (c == null ? "" : String(c))),
  );
  const total = rows.length;
  const slice = rows.slice(0, READ_RANGE_MAX_ROWS);
  let out = `Read ${total} row(s) from ${rangeLabel}${total > READ_RANGE_MAX_ROWS ? ` (showing first ${READ_RANGE_MAX_ROWS} rows)` : ""}.\n\n`;

  out += "Raw rows (each inner array is one row, cells left-to-right A, B, C…):\n";
  let rawJson = JSON.stringify(slice);
  if (rawJson.length > READ_RANGE_MAX_SUMMARY_CHARS / 2) {
    rawJson = rawJson.slice(0, Math.floor(READ_RANGE_MAX_SUMMARY_CHARS / 2)) + "…[truncated]";
  }
  out += rawJson;

  if (fields?.length) {
    let startRow = 0;
    const first = rows[0];
    if (
      first?.length === fields.length &&
      String(first[0] ?? "")
        .trim()
        .toLowerCase() === fields[0].trim().toLowerCase()
    ) {
      startRow = 1;
    }

    const mapped: Record<string, string>[] = [];
    for (let r = startRow; r < rows.length && mapped.length < READ_RANGE_MAX_ROWS; r++) {
      const row = rows[r];
      if (!row?.length) continue;
      if (row.length < fields.length) continue;
      mapped.push(mapRowToNamedFields(row, fields));
    }

    if (mapped.length > 0) {
      out +=
        "\n\nRows mapped to skill sheetFields (use these exact values when replying — do not guess):\n";
      const mappedStr = JSON.stringify(mapped, null, 2);
      out += mappedStr.length > READ_RANGE_MAX_SUMMARY_CHARS / 2
        ? mappedStr.slice(0, Math.floor(READ_RANGE_MAX_SUMMARY_CHARS / 2)) + "…[truncated]"
        : mappedStr;
    }
  }

  if (out.length > READ_RANGE_MAX_SUMMARY_CHARS) {
    out = out.slice(0, READ_RANGE_MAX_SUMMARY_CHARS) + "\n…[summary truncated]";
  }
  return out;
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
          'append_row adds a new row — use once per new order only; for payment/receipt updates on an existing order, use update_row or update_row_by_order_id (never append a second row for the same Order ID). read_range reads cell values. update_row and update_row_by_order_id find and update an existing row by matching a key (default column A). Use update_row_by_order_id when the skill matches Order ID in column A.',
      },
      spreadsheetId: {
        type: 'string',
        description:
          'Spreadsheet document ID (from the URL). If omitted, resolved from skill SKILL.md `orderSheetId` or env.',
      },
      sheetName: {
        type: 'string',
        description:
          'Worksheet tab name (e.g. Cake orders). If the skill SKILL.md has `orderSheetTab`, the server uses that tab and ignores a wrong sheetName.',
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
          const sheetName = await resolveSheetNameForAction(args.sheetName as string | undefined, context);

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
          let range = (args.range as string)?.trim();
          const spreadsheetId = await resolveSpreadsheetId(args.spreadsheetId as string | undefined, context);
          if (!spreadsheetId || !range) {
            return {
              success: false,
              data: null,
              summary: 'read_range requires range (e.g. A1:U500 or Cake orders!A1:T20).',
            };
          }
          const canonicalTab = await resolveOrderSheetTab(context);
          range = applyCanonicalSheetTabToRange(range, canonicalTab);
          const values = await googleWorkspaceService.getSpreadsheetValues(userId, spreadsheetId, range);
          const fields = await resolveSheetFields(context);
          const summary = buildReadRangeSummary(values as unknown[][], fields, range);
          return { success: true, data: values, summary };
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
          const sheetName = await resolveSheetNameForAction(args.sheetName as string | undefined, context);

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
