import Docxtemplater from 'docxtemplater';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { BaseTool } from './base.js';
import { AGENT_TEXT_OUTPUT_MAX_CHARS } from '../../config/agentToolsSandbox.js';
import { fetchUrlToBuffer } from '../../utils/fetchUrlBounded.js';
import { readUploadsFile } from '../../utils/uploadsPath.js';
import type { AgentContext, ToolResult } from '../types.js';

async function loadBuffer(args: Record<string, unknown>): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const url = (args.source_url as string | undefined)?.trim();
  const uploadsPath = (args.uploads_path as string | undefined)?.trim();
  if (url) {
    const got = await fetchUrlToBuffer(url);
    if (!got.ok) return got;
    return { ok: true, buffer: got.buffer };
  }
  if (uploadsPath) {
    return readUploadsFile(uploadsPath);
  }
  return { ok: false, error: 'Provide source_url (https) or uploads_path (under uploads/)' };
}

export class OfficeFilesTool extends BaseTool {
  readonly name = 'office_files';
  readonly description =
    'Read or edit Excel (.xlsx) workbooks or fill a Word (.docx) template with data. ' +
    'Sources must be a public HTTPS URL or a path under server uploads/. ' +
    'For collaborative editing in the cloud prefer google_sheets / google_docs.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['xlsx_read', 'xlsx_append_row', 'xlsx_set_cell', 'docx_fill_template'],
        description: 'xlsx_read: sample rows | xlsx_append_row: add row | xlsx_set_cell: A1 notation | docx_fill_template: merge fields',
      },
      source_url: { type: 'string', description: 'HTTPS URL to .xlsx or .docx' },
      uploads_path: { type: 'string', description: 'Path relative to uploads/' },
      sheet_name: { type: 'string', description: 'Worksheet name (xlsx); defaults to first sheet' },
      max_rows: { type: 'number', description: 'xlsx_read: max rows to return (default 200)' },
      row_values: {
        type: 'array',
        items: { type: 'string' },
        description: 'xlsx_append_row: one row of cell values',
      },
      cell: { type: 'string', description: 'xlsx_set_cell: e.g. B2' },
      cell_value: { type: 'string', description: 'xlsx_set_cell: new value' },
      template_data_json: {
        type: 'string',
        description:
          'docx_fill_template: JSON object of placeholder keys to values (Word docx with {tags} for docxtemplater)',
      },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>, _context: AgentContext, signal?: AbortSignal): Promise<ToolResult> {
    const action = args.action as string;

    try {
      switch (action) {
        case 'xlsx_read': {
          const loaded = await loadBuffer(args);
          if (!loaded.ok) {
            return { success: false, data: null, summary: loaded.error };
          }
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(loaded.buffer as never);
          const name = (args.sheet_name as string)?.trim();
          const ws = name ? wb.getWorksheet(name) : wb.worksheets[0];
          if (!ws) {
            return { success: false, data: null, summary: 'Worksheet not found' };
          }
          const maxRows = Math.min(Number(args.max_rows) || 200, 2000);
          const rows: string[][] = [];
          ws.eachRow((row, rowNumber) => {
            if (rowNumber > maxRows) return false;
            const r: string[] = [];
            row.eachCell({ includeEmpty: true }, (cell) => {
              r.push(cell.value == null ? '' : String(cell.value));
            });
            rows.push(r);
            return undefined;
          });
          let text = JSON.stringify(rows);
          if (text.length > AGENT_TEXT_OUTPUT_MAX_CHARS) {
            text = text.slice(0, AGENT_TEXT_OUTPUT_MAX_CHARS) + '…[truncated]';
          }
          return {
            success: true,
            data: { sheet: ws.name, rowCount: rows.length, rows },
            summary: `Sheet "${ws.name}" (${rows.length} rows):\n${text}`,
          };
        }

        case 'xlsx_append_row': {
          const loaded = await loadBuffer(args);
          if (!loaded.ok) {
            return { success: false, data: null, summary: loaded.error };
          }
          const rowValues = args.row_values as string[] | undefined;
          if (!Array.isArray(rowValues)) {
            return { success: false, data: null, summary: 'xlsx_append_row requires row_values array' };
          }
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(loaded.buffer as never);
          const name = (args.sheet_name as string)?.trim();
          const ws = name ? wb.getWorksheet(name) : wb.worksheets[0];
          if (!ws) {
            return { success: false, data: null, summary: 'Worksheet not found' };
          }
          ws.addRow(rowValues);
          const out = Buffer.from(await wb.xlsx.writeBuffer());
          return {
            success: true,
            data: { xlsxBase64: out.toString('base64'), sizeBytes: out.length },
            summary: `Appended row; new workbook ${out.length} bytes (data.xlsxBase64).`,
          };
        }

        case 'xlsx_set_cell': {
          const loaded = await loadBuffer(args);
          if (!loaded.ok) {
            return { success: false, data: null, summary: loaded.error };
          }
          const cell = (args.cell as string)?.trim().toUpperCase();
          const cellValue = args.cell_value;
          if (!cell || cellValue === undefined) {
            return { success: false, data: null, summary: 'xlsx_set_cell requires cell (e.g. A2) and cell_value' };
          }
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(loaded.buffer as never);
          const name = (args.sheet_name as string)?.trim();
          const ws = name ? wb.getWorksheet(name) : wb.worksheets[0];
          if (!ws) {
            return { success: false, data: null, summary: 'Worksheet not found' };
          }
          ws.getCell(cell).value = String(cellValue);
          const out = Buffer.from(await wb.xlsx.writeBuffer());
          return {
            success: true,
            data: { xlsxBase64: out.toString('base64'), sizeBytes: out.length },
            summary: `Set ${cell}; new workbook ${out.length} bytes (data.xlsxBase64).`,
          };
        }

        case 'docx_fill_template': {
          const loaded = await loadBuffer(args);
          if (!loaded.ok) {
            return { success: false, data: null, summary: loaded.error };
          }
          const rawJson = (args.template_data_json as string)?.trim();
          if (!rawJson) {
            return { success: false, data: null, summary: 'docx_fill_template requires template_data_json string' };
          }
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(rawJson) as Record<string, unknown>;
          } catch {
            return { success: false, data: null, summary: 'template_data_json must be valid JSON object' };
          }
          const zip = new PizZip(loaded.buffer);
          const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
          doc.setData(data);
          doc.render();
          const out = doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
          return {
            success: true,
            data: { docxBase64: out.toString('base64'), sizeBytes: out.length },
            summary: `Rendered docx (${out.length} bytes). Base64 in data.docxBase64.`,
          };
        }

        default:
          return { success: false, data: null, summary: `Unknown action: ${action}` };
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[office_files]', msg);
      return { success: false, data: null, summary: `office_files error: ${msg}` };
    }
  }
}
