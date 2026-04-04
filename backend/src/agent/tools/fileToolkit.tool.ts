import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';
import { BaseTool } from './base.js';
import { AGENT_FETCH_MAX_BYTES, AGENT_TEXT_OUTPUT_MAX_CHARS } from '../../config/agentToolsSandbox.js';
import { readUploadsFile, resolveUploadsRelativePath } from '../../utils/uploadsPath.js';
import type { AgentContext, ToolResult } from '../types.js';

const TEXT_EXT = new Set([
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.log',
]);

export class FileToolkitTool extends BaseTool {
  readonly name = 'file_toolkit';
  readonly description =
    'Safe file operations on server uploads: read text from small text/CSV/JSON files, file metadata, or build a zip from multiple upload paths. ' +
    'Paths must be relative to uploads/ with no "..". URLs can be fetched only when allowlisted is not required here — use source uploads_path only for local files.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read_text', 'metadata', 'zip_pack'],
        description: 'read_text: utf-8 text | metadata: size/mtime | zip_pack: create zip under uploads',
      },
      uploads_path: {
        type: 'string',
        description: 'Single file path relative to uploads/ (read_text, metadata)',
      },
      uploads_paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'zip_pack: list of relative paths to include',
      },
      zip_output_path: {
        type: 'string',
        description: 'zip_pack: relative path for output .zip under uploads/ (e.g. exports/bundle.zip)',
      },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>, _context: AgentContext): Promise<ToolResult> {
    const action = args.action as string;

    try {
      switch (action) {
        case 'metadata': {
          const rel = (args.uploads_path as string)?.trim();
          if (!rel) {
            return { success: false, data: null, summary: 'metadata requires uploads_path' };
          }
          const resolved = resolveUploadsRelativePath(rel);
          if (!resolved.ok) {
            return { success: false, data: null, summary: resolved.error };
          }
          const st = await fs.stat(resolved.abs);
          return {
            success: true,
            data: {
              path: rel,
              sizeBytes: st.size,
              mtimeMs: st.mtimeMs,
              isFile: st.isFile(),
            },
            summary: `File ${rel}: ${st.size} bytes, mtime=${new Date(st.mtimeMs).toISOString()}`,
          };
        }

        case 'read_text': {
          const rel = (args.uploads_path as string)?.trim();
          if (!rel) {
            return { success: false, data: null, summary: 'read_text requires uploads_path' };
          }
          const ext = path.extname(rel).toLowerCase();
          if (!TEXT_EXT.has(ext)) {
            return {
              success: false,
              data: null,
              summary: `Extension ${ext} not allowed for read_text; allowed: ${[...TEXT_EXT].join(', ')}`,
            };
          }
          const got = await readUploadsFile(rel);
          if (!got.ok) {
            return { success: false, data: null, summary: got.error };
          }
          if (got.buffer.length > AGENT_FETCH_MAX_BYTES) {
            return { success: false, data: null, summary: 'File too large for read_text' };
          }
          const text = got.buffer.toString('utf-8');
          const out = text.length > AGENT_TEXT_OUTPUT_MAX_CHARS ? `${text.slice(0, AGENT_TEXT_OUTPUT_MAX_CHARS)}\n[truncated]` : text;
          return {
            success: true,
            data: { charCount: text.length, text: out },
            summary: out,
          };
        }

        case 'zip_pack': {
          const paths = args.uploads_paths as string[] | undefined;
          const outRel = (args.zip_output_path as string)?.trim();
          if (!Array.isArray(paths) || paths.length < 1 || paths.length > 50 || !outRel) {
            return {
              success: false,
              data: null,
              summary: 'zip_pack requires uploads_paths (1–50) and zip_output_path',
            };
          }
          const zip = new AdmZip();
          for (const rel of paths) {
            const r = rel.trim();
            const resolved = resolveUploadsRelativePath(r);
            if (!resolved.ok) {
              return { success: false, data: null, summary: resolved.error };
            }
            const buf = await fs.readFile(resolved.abs);
            zip.addFile(path.basename(r), buf);
          }
          const buf = zip.toBuffer();
          const outResolved = resolveUploadsRelativePath(outRel);
          if (!outResolved.ok) {
            return { success: false, data: null, summary: outResolved.error };
          }
          await fs.mkdir(path.dirname(outResolved.abs), { recursive: true });
          await fs.writeFile(outResolved.abs, buf);
          return {
            success: true,
            data: { outputPath: outRel, sizeBytes: buf.length },
            summary: `Created zip at uploads/${outRel} (${buf.length} bytes).`,
          };
        }

        default:
          return { success: false, data: null, summary: `Unknown action: ${action}` };
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, data: null, summary: `file_toolkit error: ${msg}` };
    }
  }
}
