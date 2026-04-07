import path from 'path';
import Docxtemplater from 'docxtemplater';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { BaseTool } from './base.js';
import { AGENT_TEXT_OUTPUT_MAX_CHARS } from '../../config/agentToolsSandbox.js';
import { convertDocxFileToPdf } from '../../utils/docxToPdf.js';
import { fetchUrlToBuffer } from '../../utils/fetchUrlBounded.js';
import {
  getPublicUploadsUrl,
  getUploadsRoot,
  readUploadsFile,
  resolveUploadsRelativePath,
  writeUploadsFile,
} from '../../utils/uploadsPath.js';
import type { AgentContext, ToolResult } from '../types.js';

/**
 * When uploads_path starts with `assets/`, resolve against the active skill's storagePath
 * (under uploads/skills/...) so SKILL.md does not need user-specific paths.
 */
function resolveSkillAssetToUploadsRelative(
  uploadsPathTrimmed: string,
  context: AgentContext,
): { ok: true; relative: string } | { ok: false; error: string } {
  const slug = context.activeSkillSlug;
  if (!slug) {
    return {
      ok: false,
      error:
        'uploads_path starting with assets/ requires an active skill context (use office_files inside execute_skill). ' +
        'Otherwise use a full path under uploads/ (e.g. templates/... or quotations/...).',
    };
  }
  const skill = context.skills.find((s) => s.slug === slug);
  if (!skill?.storagePath) {
    return { ok: false, error: 'Active skill has no storagePath; cannot resolve assets/' };
  }
  const skillRoot = path.resolve(skill.storagePath);
  const absFile = path.resolve(skillRoot, uploadsPathTrimmed);
  const skillRootWithSep = skillRoot.endsWith(path.sep) ? skillRoot : skillRoot + path.sep;
  if (absFile !== skillRoot && !absFile.startsWith(skillRootWithSep)) {
    return { ok: false, error: 'Invalid path (escapes skill directory)' };
  }
  const uploadsRoot = getUploadsRoot();
  const rel = path.relative(uploadsRoot, absFile);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'Resolved asset path is outside uploads root' };
  }
  return { ok: true, relative: rel.split(path.sep).join('/') };
}

async function loadBuffer(
  args: Record<string, unknown>,
  context: AgentContext,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const url = (args.source_url as string | undefined)?.trim();
  const uploadsPath = (args.uploads_path as string | undefined)?.trim();
  if (url) {
    const got = await fetchUrlToBuffer(url);
    if (!got.ok) return got;
    return { ok: true, buffer: got.buffer };
  }
  if (uploadsPath) {
    const trimmed = uploadsPath.replace(/^\/+/, '');
    if (trimmed.toLowerCase().startsWith('assets/')) {
      const resolved = resolveSkillAssetToUploadsRelative(trimmed, context);
      if (!resolved.ok) {
        return { ok: false, error: resolved.error };
      }
      return readUploadsFile(resolved.relative);
    }
    return readUploadsFile(trimmed);
  }
  return { ok: false, error: 'Provide source_url (https) or uploads_path (under uploads/)' };
}

export class OfficeFilesTool extends BaseTool {
  readonly name = 'office_files';
  readonly description =
    'Read or edit Excel (.xlsx) workbooks or fill a Word (.docx) template with data, or convert .docx to .pdf (LibreOffice). ' +
    'Sources must be a public HTTPS URL or a path under server uploads/. ' +
    'During execute_skill, uploads_path may start with assets/ to load a file from that skill directory (e.g. assets/template.docx). ' +
    'For collaborative editing in the cloud prefer google_sheets / google_docs.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['xlsx_read', 'xlsx_append_row', 'xlsx_set_cell', 'docx_fill_template', 'docx_to_pdf'],
        description:
          'xlsx_read | xlsx_append_row | xlsx_set_cell | docx_fill_template (Docxtemplater merge) | docx_to_pdf (needs LibreOffice on server)',
      },
      source_url: { type: 'string', description: 'HTTPS URL to .xlsx or .docx' },
      uploads_path: {
        type: 'string',
        description:
          'Path relative to uploads/, or assets/... relative to the active skill folder when running inside execute_skill (e.g. assets/report.docx)',
      },
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
      output_docx_uploads_path: {
        type: 'string',
        description:
          'docx_fill_template: optional path under uploads/ to save the merged .docx (e.g. quotations/q-20260404-abc.docx). When set, summary includes public URL; base64 omitted unless include_docx_base64 is true.',
      },
      include_docx_base64: {
        type: 'boolean',
        description:
          'docx_fill_template: if true, include data.docxBase64 in the result (large). Default false when output_docx_uploads_path is set, true otherwise.',
      },
      output_pdf_uploads_path: {
        type: 'string',
        description:
          'docx_to_pdf: required — path under uploads/ for the generated .pdf (e.g. quotations/q-20260404-abc.pdf)',
      },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>, context: AgentContext, signal?: AbortSignal): Promise<ToolResult> {
    const action = args.action as string;

    try {
      switch (action) {
        case 'xlsx_read': {
          const loaded = await loadBuffer(args, context);
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
          const loaded = await loadBuffer(args, context);
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
          const loaded = await loadBuffer(args, context);
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
          const loaded = await loadBuffer(args, context);
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
          doc.render(data);
          const out = doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;

          const outRel = (args.output_docx_uploads_path as string | undefined)?.trim();
          const includeB64Arg = args.include_docx_base64;
          const includeB64 =
            typeof includeB64Arg === 'boolean'
              ? includeB64Arg
              : !outRel;

          const resultData: Record<string, unknown> = { sizeBytes: out.length };
          if (includeB64) {
            resultData.docxBase64 = out.toString('base64');
          }

          if (outRel) {
            const written = await writeUploadsFile(outRel, out);
            if (!written.ok) {
              return { success: false, data: null, summary: written.error };
            }
            resultData.outputDocxUploadsPath = written.uploadsRelative;
            resultData.outputDocxPublicUrl = getPublicUploadsUrl(written.uploadsRelative);
          }

          let summary: string;
          if (outRel) {
            summary =
              `Merged docx (${out.length} bytes). Saved to uploads/${resultData.outputDocxUploadsPath}. ` +
              `Public URL: ${resultData.outputDocxPublicUrl}. ` +
              (includeB64 ? 'Base64 in data.docxBase64.' : 'Omitted data.docxBase64 (set include_docx_base64 true if needed).');
          } else {
            summary = `Rendered docx (${out.length} bytes). Base64 in data.docxBase64.`;
          }

          return {
            success: true,
            data: resultData,
            summary,
          };
        }

        case 'docx_to_pdf': {
          const docxRel = (args.uploads_path as string | undefined)?.trim();
          const pdfRel = (args.output_pdf_uploads_path as string | undefined)?.trim();
          if (!docxRel || !pdfRel) {
            return {
              success: false,
              data: null,
              summary: 'docx_to_pdf requires uploads_path (.docx) and output_pdf_uploads_path (.pdf)',
            };
          }
          if (!/\.docx$/i.test(docxRel)) {
            return { success: false, data: null, summary: 'uploads_path must end with .docx' };
          }
          if (!/\.pdf$/i.test(pdfRel)) {
            return { success: false, data: null, summary: 'output_pdf_uploads_path must end with .pdf' };
          }
          const docxResolved = resolveUploadsRelativePath(docxRel);
          if (!docxResolved.ok) {
            return { success: false, data: null, summary: docxResolved.error };
          }
          const pdfResolved = resolveUploadsRelativePath(pdfRel);
          if (!pdfResolved.ok) {
            return { success: false, data: null, summary: pdfResolved.error };
          }
          const conv = await convertDocxFileToPdf(docxResolved.abs, pdfResolved.abs);
          if (!conv.ok) {
            return { success: false, data: null, summary: `docx_to_pdf failed: ${conv.error}` };
          }
          const pdfRelNorm = pdfRel.replace(/^\/+/, '');
          return {
            success: true,
            data: {
              outputPdfUploadsPath: pdfRelNorm,
              outputPdfPublicUrl: getPublicUploadsUrl(pdfRelNorm),
            },
            summary: `PDF written to uploads/${pdfRelNorm}. Public URL: ${getPublicUploadsUrl(pdfRelNorm)}`,
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
