import { PDFDocument } from 'pdf-lib';
import { BaseTool } from './base.js';
import { AGENT_TEXT_OUTPUT_MAX_CHARS } from '../../config/agentToolsSandbox.js';
import { fetchUrlToBuffer } from '../../utils/fetchUrlBounded.js';
import { readUploadsFile } from '../../utils/uploadsPath.js';
import type { AgentContext, ToolResult } from '../types.js';

async function loadPdfBytes(args: Record<string, unknown>): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const url = (args.source_url as string | undefined)?.trim();
  const uploadsPath = (args.uploads_path as string | undefined)?.trim();
  if (url) {
    const got = await fetchUrlToBuffer(url);
    if (!got.ok) return got;
    return { ok: true, buffer: got.buffer };
  }
  if (uploadsPath) {
    const got = await readUploadsFile(uploadsPath);
    if (!got.ok) return { ok: false, error: got.error };
    return { ok: true, buffer: got.buffer };
  }
  return { ok: false, error: 'Provide either source_url (https) or uploads_path (relative to uploads/)' };
}

export class PdfToolkitTool extends BaseTool {
  readonly name = 'pdf_toolkit';
  readonly description =
    'PDF operations on files from a public HTTPS URL or an uploads path: extract text, merge PDFs, split by page range, ' +
    'list AcroForm field names, or fill text fields. Does not bypass passwords; scanned PDFs may have little extractable text.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['extract_text', 'merge', 'split', 'list_form_fields', 'fill_form'],
        description: 'Operation to perform',
      },
      source_url: {
        type: 'string',
        description: 'HTTPS URL of a PDF (for single-file actions)',
      },
      uploads_path: {
        type: 'string',
        description: 'Path relative to server uploads/ (alternative to source_url)',
      },
      merge_sources: {
        type: 'array',
        items: { type: 'string' },
        description: 'For merge: list of HTTPS URLs to PDFs in order (max 10)',
      },
      page_ranges: {
        type: 'string',
        description: 'For split: e.g. "0" for first page only, or "0-2" for pages 0,1,2 (0-based indices)',
      },
      field_values: {
        type: 'object',
        description: 'For fill_form: map of PDF field name -> string value (text fields)',
      },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>, _context: AgentContext, signal?: AbortSignal): Promise<ToolResult> {
    const action = args.action as string;

    try {
      switch (action) {
        case 'extract_text': {
          const loaded = await loadPdfBytes(args);
          if (!loaded.ok) {
            return { success: false, data: null, summary: loaded.error };
          }
          const { PDFParse } = await import('pdf-parse');
          const parser = new PDFParse({ data: loaded.buffer });
          const textResult = await parser.getText();
          await parser.destroy();
          const text = (textResult.text || '').trim();
          const truncated =
            text.length > AGENT_TEXT_OUTPUT_MAX_CHARS
              ? `${text.slice(0, AGENT_TEXT_OUTPUT_MAX_CHARS)}\n\n[truncated]`
              : text;
          return {
            success: true,
            data: { charCount: text.length, text: truncated },
            summary: `Extracted ${text.length} characters.\n${truncated || '[empty]'}`,
          };
        }

        case 'merge': {
          const sources = (args.merge_sources as string[]) || [];
          if (!Array.isArray(sources) || sources.length < 2 || sources.length > 10) {
            return {
              success: false,
              data: null,
              summary: 'merge requires merge_sources array with 2–10 HTTPS URLs to PDFs.',
            };
          }
          const merged = await PDFDocument.create();
          for (const u of sources) {
            const got = await fetchUrlToBuffer(u.trim(), undefined, signal);
            if (!got.ok) {
              return { success: false, data: null, summary: `Failed to fetch ${u}: ${got.error}` };
            }
            const src = await PDFDocument.load(got.buffer);
            const copied = await merged.copyPages(src, src.getPageIndices());
            copied.forEach((p) => merged.addPage(p));
          }
          const out = Buffer.from(await merged.save());
          return {
            success: true,
            data: { pdfBase64: out.toString('base64'), sizeBytes: out.length },
            summary: `Merged ${sources.length} PDFs into one (${out.length} bytes). Base64 in data.pdfBase64.`,
          };
        }

        case 'split': {
          const loaded = await loadPdfBytes(args);
          if (!loaded.ok) {
            return { success: false, data: null, summary: loaded.error };
          }
          const rangeRaw = ((args.page_ranges as string) || '0').trim();
          const srcDoc = await PDFDocument.load(loaded.buffer);
          const n = srcDoc.getPageCount();
          let indices: number[] = [];
          if (rangeRaw.includes('-')) {
            const [a, b] = rangeRaw.split('-').map((x) => parseInt(x.trim(), 10));
            if (!Number.isFinite(a) || !Number.isFinite(b)) {
              return { success: false, data: null, summary: 'Invalid page_ranges; use e.g. "0-2"' };
            }
            for (let i = Math.max(0, a); i <= Math.min(n - 1, b); i++) indices.push(i);
          } else {
            const p = parseInt(rangeRaw, 10);
            if (!Number.isFinite(p) || p < 0 || p >= n) {
              return { success: false, data: null, summary: `Invalid page index (document has ${n} pages, 0-based)` };
            }
            indices = [p];
          }
          const outDoc = await PDFDocument.create();
          const copied = await outDoc.copyPages(srcDoc, indices);
          copied.forEach((p) => outDoc.addPage(p));
          const out = Buffer.from(await outDoc.save());
          return {
            success: true,
            data: { pdfBase64: out.toString('base64'), sizeBytes: out.length, pages: indices },
            summary: `Split pages ${indices.join(', ')} (${out.length} bytes). Base64 in data.pdfBase64.`,
          };
        }

        case 'list_form_fields': {
          const loaded = await loadPdfBytes(args);
          if (!loaded.ok) {
            return { success: false, data: null, summary: loaded.error };
          }
          const doc = await PDFDocument.load(loaded.buffer);
          const form = doc.getForm();
          const fields = form.getFields();
          const names = fields.map((f) => f.getName());
          return {
            success: true,
            data: { fieldNames: names, count: names.length },
            summary: names.length ? `Form fields: ${names.join(', ')}` : 'No AcroForm fields found (or unsupported field types only).',
          };
        }

        case 'fill_form': {
          const loaded = await loadPdfBytes(args);
          if (!loaded.ok) {
            return { success: false, data: null, summary: loaded.error };
          }
          const fieldValues = args.field_values as Record<string, string> | undefined;
          if (!fieldValues || typeof fieldValues !== 'object') {
            return { success: false, data: null, summary: 'fill_form requires field_values object { fieldName: value }' };
          }
          const doc = await PDFDocument.load(loaded.buffer);
          const form = doc.getForm();
          for (const [name, value] of Object.entries(fieldValues)) {
            try {
              const tf = form.getTextField(name);
              tf.setText(String(value ?? ''));
            } catch {
              try {
                const cb = form.getCheckBox(name);
                const v = String(value).toLowerCase();
                if (v === 'true' || v === 'yes' || v === '1') cb.check();
                else cb.uncheck();
              } catch {
                console.warn(`[pdf_toolkit] Could not set field "${name}"`);
              }
            }
          }
          form.flatten();
          const out = Buffer.from(await doc.save());
          return {
            success: true,
            data: { pdfBase64: out.toString('base64'), sizeBytes: out.length },
            summary: `Filled form (${out.length} bytes). Base64 in data.pdfBase64.`,
          };
        }

        default:
          return { success: false, data: null, summary: `Unknown action: ${action}` };
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[pdf_toolkit]', msg);
      return { success: false, data: null, summary: `PDF toolkit error: ${msg}` };
    }
  }
}
