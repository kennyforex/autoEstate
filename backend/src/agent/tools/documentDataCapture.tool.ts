import fs from 'fs/promises';
import path from 'path';
import { BaseTool } from './base.js';
import axios from 'axios';
import { openRouterConfig } from '../../config/openrouter.js';
import type { AgentContext, ToolResult } from '../types.js';
import { getUploadsRoot } from '../../utils/uploadsPath.js';

/**
 * OpenRouter cannot fetch localhost URLs. When the agent passes our Playground/inbox
 * `http://localhost:PORT/uploads/...` URL, read the file from disk and pass a data URL to the model.
 */
async function hydrateLocalUploadsUrlForOpenRouter(sourceUrl: string): Promise<
  | { ok: true; url: string }
  | { ok: false; error: string }
> {
  const trimmed = sourceUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return { ok: true, url: trimmed };
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: true, url: trimmed };
  }
  const host = u.hostname.toLowerCase();
  const isLoopback =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '0.0.0.0';
  if (!isLoopback) {
    return { ok: true, url: trimmed };
  }
  let pathname = u.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    /* keep raw */
  }
  if (!pathname.startsWith('/uploads/')) {
    return {
      ok: false,
      error:
        'document_data_capture cannot fetch localhost URLs that are not under /uploads/. Re-upload the file or use a public URL.',
    };
  }
  const relative = pathname.replace(/^\/uploads\/?/, '');
  if (!relative || relative.includes('..')) {
    return { ok: false, error: 'Invalid /uploads/ path (possible path traversal).' };
  }
  const root = getUploadsRoot();
  const abs = path.resolve(root, relative);
  const normalizedRoot = path.resolve(root);
  if (!abs.startsWith(normalizedRoot + path.sep)) {
    return { ok: false, error: 'Resolved path escapes uploads directory.' };
  }
  let buf: Buffer;
  try {
    buf = await fs.readFile(abs);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Could not read uploaded file at ${pathname}: ${msg}`,
    };
  }
  const ext = path.extname(abs).toLowerCase();
  let mime = 'application/octet-stream';
  if (['.jpg', '.jpeg'].includes(ext)) mime = 'image/jpeg';
  else if (ext === '.png') mime = 'image/png';
  else if (ext === '.webp') mime = 'image/webp';
  else if (ext === '.gif') mime = 'image/gif';
  else if (ext === '.pdf') mime = 'application/pdf';
  return { ok: true, url: `data:${mime};base64,${buf.toString('base64')}` };
}

const PDF_ENGINES = new Set(['native', 'cloudflare-ai', 'mistral-ocr']);

function isValidSourceUrl(url: string): boolean {
  return Boolean(
    url &&
      (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')),
  );
}

/** OpenRouter file-parser uses the filename; a wrong extension breaks PDF detection. */
function pdfFilenameFromSourceUrl(sourceUrl: string): string {
  if (sourceUrl.startsWith('data:')) {
    return 'document.pdf';
  }
  try {
    const u = new URL(sourceUrl);
    const last = u.pathname.split('/').pop() || '';
    const decoded = decodeURIComponent(last);
    if (decoded && /\.pdf$/i.test(decoded) && decoded.length <= 200) {
      return decoded.replace(/[/\\]/g, '_');
    }
  } catch {
    /* ignore */
  }
  return 'document.pdf';
}

function formatAxiosError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    const detail =
      typeof data === 'object' && data !== null && 'error' in data
        ? JSON.stringify((data as { error: unknown }).error)
        : typeof data === 'string'
          ? data
          : err.message;
    return detail || err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

const DEFAULT_SCHEMA_NAME = 'document_extraction';

/**
 * Parse outputSchema string into OpenRouter response_format.json_schema parts.
 * Accepts (see https://openrouter.ai/docs/guides/features/structured-outputs):
 * 1. Full wrapper: { "type": "json_schema", "json_schema": { "name", "strict", "schema" } }
 * 2. json_schema body only: { "name", "strict", "schema" }  ← recommended in skill docs
 * 3. Legacy inner JSON Schema root only: { "type": "object", "properties", ... }
 */
/** Exposed for scripts/tests that validate skill/schema JSON without calling OpenRouter. */
export function parseOutputSchema(outputSchemaRaw: string): {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
} | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputSchemaRaw) as unknown;
  } catch (e: unknown) {
    return {
      error: `Invalid outputSchema JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'outputSchema must be a JSON object, not an array or primitive.' };
  }

  const root = parsed as Record<string, unknown>;

  // Shape 1: full response_format
  if (root.type === 'json_schema' && root.json_schema && typeof root.json_schema === 'object' && !Array.isArray(root.json_schema)) {
    return extractJsonSchemaBody(root.json_schema as Record<string, unknown>);
  }

  // Shape 2: { name, strict, schema }
  if ('schema' in root && root.schema !== null && typeof root.schema === 'object' && !Array.isArray(root.schema)) {
    return extractJsonSchemaBody(root);
  }

  // Shape 3: inner schema only (legacy)
  return {
    name: DEFAULT_SCHEMA_NAME,
    strict: true,
    schema: root,
  };
}

function extractJsonSchemaBody(
  body: Record<string, unknown>,
): { name: string; strict: boolean; schema: Record<string, unknown> } | { error: string } {
  const schema = body.schema;
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    return { error: 'outputSchema must include a "schema" object (JSON Schema root).' };
  }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : DEFAULT_SCHEMA_NAME;
  const strict = body.strict !== false;
  return { name, strict, schema: schema as Record<string, unknown> };
}

/** Tool message `summary` is always a JSON string (for agent / logs). */
function toolJsonSummary(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

/** Parse model reply as JSON; tolerate optional ```json fences and trailing junk. */
function parseModelJsonContent(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  let t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  try {
    return { ok: true, value: JSON.parse(t) as unknown };
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return { ok: true, value: JSON.parse(t.slice(start, end + 1)) as unknown };
      } catch (e: unknown) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
    return { ok: false, error: 'No JSON object found in model output' };
  }
}

export class DocumentDataCaptureTool extends BaseTool {
  readonly name = 'document_data_capture';
  readonly description =
    'Extract structured data from an image or PDF. Returns a tool result whose summary is a JSON object string: ' +
    'on success { success:true, model, structuredOutput, extracted }; on failure { success:false, error, ... }. ' +
    'Pass outputSchema as JSON: { name, strict, schema } (OpenRouter json_schema body) or legacy inner schema only. ' +
    'Source must be a base64 data URL or a public HTTPS URL.';

  readonly parameters = {
    type: 'object',
    properties: {
      documentType: {
        type: 'string',
        enum: ['image', 'pdf'],
        description: 'Whether the source is a raster image or a PDF document',
      },
      sourceUrl: {
        type: 'string',
        description: 'Base64 data URL or public URL of the image or PDF',
      },
      requirements: {
        type: 'string',
        description:
          'What to extract: field names, formats, language, and any rules or edge cases. ' +
          'Must align with outputSchema.schema property descriptions.',
      },
      outputSchema: {
        type: 'string',
        description:
          'JSON string of OpenRouter json_schema: {"name":"...","strict":true,"schema":{...}}. ' +
          'The inner schema must use strict-friendly shapes (required + additionalProperties: false on objects). ' +
          'Alternatively, pass only the inner schema object as a JSON string for backward compatibility.',
      },
    },
    required: ['documentType', 'sourceUrl', 'requirements', 'outputSchema'],
  };

  async execute(
    args: Record<string, unknown>,
    _context: AgentContext,
    _signal?: AbortSignal,
  ): Promise<ToolResult> {
    const documentType = args.documentType as 'image' | 'pdf';
    const sourceUrl = args.sourceUrl as string;
    const requirements = (args.requirements as string)?.trim() || '';
    const outputSchemaRaw = args.outputSchema as string;

    if (!openRouterConfig.apiKey) {
      return {
        success: false,
        data: null,
        summary: toolJsonSummary({
          success: false,
          error: 'Document data capture unavailable: API key not configured',
        }),
      };
    }

    if (!isValidSourceUrl(sourceUrl)) {
      return {
        success: false,
        data: null,
        summary: toolJsonSummary({
          success: false,
          error: 'Invalid sourceUrl: must start with http://, https://, or data:.',
          sourceUrlPreview: sourceUrl?.substring(0, 120) ?? '',
        }),
      };
    }

    const hydrated = await hydrateLocalUploadsUrlForOpenRouter(sourceUrl.trim());
    if (!hydrated.ok) {
      return {
        success: false,
        data: null,
        summary: toolJsonSummary({ success: false, error: hydrated.error }),
      };
    }
    const effectiveSourceUrl = hydrated.url;

    const parsedSchema = parseOutputSchema(outputSchemaRaw);
    if ('error' in parsedSchema) {
      return {
        success: false,
        data: null,
        summary: toolJsonSummary({ success: false, error: parsedSchema.error }),
      };
    }
    const { name: schemaName, strict: schemaStrict, schema: schemaObj } = parsedSchema;

    const model = openRouterConfig.models.documentCapture;
    const useStructured = openRouterConfig.documentCaptureUseStructuredOutput;
    const schemaJson = JSON.stringify(schemaObj, null, 2);
    const textPrompt = useStructured
      ? `${requirements}\n\n` +
        'Extract the requested information only from the attached document. ' +
        'Fill every required field in the enforced JSON schema. ' +
        'Output must be raw JSON only (no markdown fences, no commentary before or after).'
      : `${requirements}\n\n` +
        'Extract the requested information only from the attached document.\n' +
        'Reply with raw JSON only: a single JSON object, first character { and last character }. ' +
        'No markdown, no code fences, no text before or after the JSON.\n' +
        `The object must match this JSON Schema shape and field names (follow each property description; use "not_shown" or empty strings where appropriate if a value is missing):\n${schemaJson}`;

    const content: Array<Record<string, unknown>> =
      documentType === 'image'
        ? [
            { type: 'text', text: textPrompt },
            { type: 'image_url', image_url: { url: effectiveSourceUrl } },
          ]
        : [
            { type: 'text', text: textPrompt },
            {
              type: 'file',
              file: {
                filename: pdfFilenameFromSourceUrl(effectiveSourceUrl),
                file_data: effectiveSourceUrl,
              },
            },
          ];

    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content }],
      temperature: 0.1,
    };

    if (useStructured) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          strict: schemaStrict,
          schema: schemaObj,
        },
      };
    }

    const pdfEngine = process.env.OPENROUTER_PDF_ENGINE?.trim();
    if (documentType === 'pdf' && pdfEngine && PDF_ENGINES.has(pdfEngine)) {
      body.plugins = [{ id: 'file-parser', pdf: { engine: pdfEngine } }];
    }

    try {
      const response = await axios.post(
        `${openRouterConfig.baseUrl}/chat/completions`,
        body,
        {
          headers: {
            Authorization: `Bearer ${openRouterConfig.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://autoestate.ai',
            'X-Title': 'AutoEstate AI Agent',
          },
          timeout: 120_000,
        },
      );

      const rawContent = response.data?.choices?.[0]?.message?.content;
      const text =
        typeof rawContent === 'string'
          ? rawContent
          : rawContent != null
            ? JSON.stringify(rawContent)
            : '';

      if (!text) {
        return {
          success: false,
          data: { model, rawContent },
          summary: toolJsonSummary({
            success: false,
            error: 'Empty response from document capture model',
            model,
          }),
        };
      }

      const parsed = parseModelJsonContent(text);
      if (!parsed.ok) {
        return {
          success: false,
          data: { model, rawText: text },
          summary: toolJsonSummary({
            success: false,
            error: `Could not parse model JSON: ${parsed.error}`,
            model,
            rawTextPreview: text.length > 800 ? `${text.slice(0, 800)}…` : text,
          }),
        };
      }
      const extracted = parsed.value;

      const data = {
        extracted,
        model,
        structuredOutput: useStructured,
      };
      return {
        success: true,
        data,
        summary: toolJsonSummary({
          success: true,
          model,
          structuredOutput: useStructured,
          extracted,
        }),
      };
    } catch (error: unknown) {
      return {
        success: false,
        data: null,
        summary: toolJsonSummary({
          success: false,
          error: `Document data capture failed: ${formatAxiosError(error)}`,
        }),
      };
    }
  }
}
