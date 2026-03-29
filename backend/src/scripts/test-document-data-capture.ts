/**
 * Smoke-test DocumentDataCaptureTool (image/PDF → JSON via OpenRouter structured outputs).
 *
 * Usage (from backend/):
 *   npx tsx src/scripts/test-document-data-capture.ts local
 *       No API calls: invalid URL / invalid schema validation only.
 *
 *   npx tsx src/scripts/test-document-data-capture.ts local --schema-file=<path.json>
 *       Also validates your outputSchema file parses (inner schema, or { name, strict, schema }, or full response_format).
 *
 *   npx tsx src/scripts/test-document-data-capture.ts image [--url=<https://...>] [--schema-file=<path>] [--requirements="..."]
 *   npx tsx src/scripts/test-document-data-capture.ts pdf [--url=<https://...>] [--schema-file=<path>] [--requirements="..."]
 *       Requires OPENROUTER_API_KEY. Optional: OPENROUTER_DOCUMENT_CAPTURE_MODEL, OPENROUTER_PDF_ENGINE.
 *       Prompt-only JSON is the default for document capture; set OPENROUTER_DOCUMENT_CAPTURE_USE_STRUCTURED_OUTPUT=true for OpenRouter json_schema enforcement.
 *
 * Schema file: JSON text matching tool `outputSchema` — same shapes as OpenRouter json_schema (see tool + docs).
 *
 * @see https://openrouter.ai/docs/guides/features/structured-outputs
 */

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import "dotenv/config";
import {
  DocumentDataCaptureTool,
  parseOutputSchema,
} from "../agent/tools/documentDataCapture.tool.js";
import type { AgentContext } from "../agent/types.js";

function parseArgs(): { mode: string; url?: string; schemaFile?: string; requirements?: string } {
  const argv = process.argv.slice(2);
  const mode = argv[0] || "local";
  let url: string | undefined;
  let schemaFile: string | undefined;
  let requirements: string | undefined;
  for (const a of argv) {
    if (a.startsWith("--url=")) url = a.slice(6);
    if (a.startsWith("--schema-file=")) schemaFile = a.slice(14);
    if (a.startsWith("--requirements=")) requirements = a.slice(15);
  }
  return { mode, url, schemaFile, requirements };
}

function loadOutputSchemaRaw(schemaFile: string): string {
  const path = isAbsolute(schemaFile) ? schemaFile : resolve(process.cwd(), schemaFile);
  const raw = readFileSync(path, "utf8").trim();
  JSON.parse(raw);
  return raw;
}

const stubContext: AgentContext = {
  conversationId: "script-test",
  assistantId: "script-test",
  channelId: "script-test",
  contact: { id: "c1" },
  assistant: {
    id: "a1",
    name: "Script",
    primaryLanguage: "en",
    tone: "professional",
    model: "stub",
    pineconeAssistantName: "stub",
  },
  skills: [],
  messageHistory: [],
};

/** Strict schema for a simple generated image with text (dummyimage.com). */
const IMAGE_OUTPUT_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    mainText: {
      type: "string",
      description: "Main readable text visible in the image, short phrase.",
    },
    containsDigits: {
      type: "boolean",
      description: "True if any digits or a numeric price is visible.",
    },
  },
  required: ["mainText", "containsDigits"],
  additionalProperties: false,
});

/** Strict schema for a small tabular PDF smoke test. */
const PDF_OUTPUT_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "One sentence describing what the PDF contains.",
    },
    tablePresent: {
      type: "boolean",
      description: "True if the document appears to contain a table.",
    },
  },
  required: ["summary", "tablePresent"],
  additionalProperties: false,
});

const DEFAULT_IMAGE_URL =
  "https://dummyimage.com/640x120/1a1a2e/ffffff.png&text=Order+ID+7392+Total+$19.99";

/** Small public PDF (common sample). Override with --url= if unreachable. */
const DEFAULT_PDF_URL =
  "https://www.w3.org/WAI/WCAG21/working-examples/pdf-table/table.pdf";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function runSchemaFileCheck(schemaFile: string): void {
  console.log("\n--- local: outputSchema file (--schema-file) ---");
  let raw: string;
  try {
    raw = loadOutputSchemaRaw(schemaFile);
  } catch (e: unknown) {
    console.error("FAIL: could not read or JSON-parse schema file:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
  const parsed = parseOutputSchema(raw);
  if ("error" in parsed) {
    console.error("FAIL:", parsed.error);
    process.exit(1);
  }
  console.log("ok: schema name=%s strict=%s keys(root)=%s", parsed.name, parsed.strict, Object.keys(parsed.schema).join(", "));
}

async function runLocal(tool: DocumentDataCaptureTool, schemaFile?: string): Promise<void> {
  if (schemaFile) {
    runSchemaFileCheck(schemaFile);
  }

  console.log("\n--- local: invalid sourceUrl ---");
  const badUrl = await tool.execute(
    {
      documentType: "image",
      sourceUrl: "not-a-url",
      requirements: "Extract text",
      outputSchema: IMAGE_OUTPUT_SCHEMA,
    },
    stubContext,
  );
  assert(!badUrl.success, "expected failure for invalid URL");
  console.log("ok:", badUrl.summary.slice(0, 120));

  console.log("\n--- local: invalid outputSchema JSON ---");
  const badSchema = await tool.execute(
    {
      documentType: "image",
      sourceUrl: DEFAULT_IMAGE_URL,
      requirements: "x",
      outputSchema: "{not json",
    },
    stubContext,
  );
  assert(!badSchema.success, "expected failure for bad JSON schema");
  console.log("ok:", badSchema.summary.slice(0, 120));

  console.log("\n--- local: outputSchema must be object ---");
  const arraySchema = await tool.execute(
    {
      documentType: "image",
      sourceUrl: DEFAULT_IMAGE_URL,
      requirements: "x",
      outputSchema: "[1,2,3]",
    },
    stubContext,
  );
  assert(!arraySchema.success, "expected failure for array schema");
  console.log("ok:", arraySchema.summary.slice(0, 120));

  console.log("\nLocal checks passed (no OpenRouter calls).\n");
}

async function runImage(
  tool: DocumentDataCaptureTool,
  url: string,
  opts?: { outputSchema?: string; requirements?: string },
): Promise<void> {
  const outputSchema = opts?.outputSchema ?? IMAGE_OUTPUT_SCHEMA;
  const requirements =
    opts?.requirements?.trim() ||
    "Read visible text. Set containsDigits true if any numbers or currency appear.";
  console.log("\n--- image extraction ---");
  console.log("url:", url);
  const result = await tool.execute(
    {
      documentType: "image",
      sourceUrl: url,
      requirements,
      outputSchema,
    },
    stubContext,
  );
  if (!result.success) {
    console.error("FAIL:", result.summary);
    process.exit(1);
  }
  const d = result.data as { model?: string; extracted?: unknown; structuredOutput?: boolean };
  console.log("model:", d?.model, "| structuredOutput:", d?.structuredOutput ?? "(n/a)");
  console.log("extracted:", JSON.stringify(d?.extracted, null, 2));
  console.log("\nImage test OK.\n");
}

async function runPdf(
  tool: DocumentDataCaptureTool,
  url: string,
  opts?: { outputSchema?: string; requirements?: string },
): Promise<void> {
  const outputSchema = opts?.outputSchema ?? PDF_OUTPUT_SCHEMA;
  const requirements =
    opts?.requirements?.trim() ||
    "Summarize the document. Set tablePresent true if you see tabular data.";
  console.log("\n--- pdf extraction ---");
  console.log("url:", url);
  const result = await tool.execute(
    {
      documentType: "pdf",
      sourceUrl: url,
      requirements,
      outputSchema,
    },
    stubContext,
  );
  if (!result.success) {
    console.error("FAIL:", result.summary);
    process.exit(1);
  }
  const d = result.data as { model?: string; extracted?: unknown; structuredOutput?: boolean };
  console.log("model:", d?.model, "| structuredOutput:", d?.structuredOutput ?? "(n/a)");
  console.log("extracted:", JSON.stringify(d?.extracted, null, 2));
  console.log("\nPDF test OK.\n");
}

async function main(): Promise<void> {
  const { mode, url, schemaFile, requirements } = parseArgs();
  const tool = new DocumentDataCaptureTool();

  let customSchema: string | undefined;
  if (schemaFile && mode !== "local") {
    try {
      customSchema = loadOutputSchemaRaw(schemaFile);
    } catch (e: unknown) {
      console.error("FAIL: --schema-file read/parse:", e instanceof Error ? e.message : e);
      process.exit(1);
    }
    const check = parseOutputSchema(customSchema);
    if ("error" in check) {
      console.error("FAIL: outputSchema:", check.error);
      process.exit(1);
    }
  }

  if (mode === "local") {
    await runLocal(tool, schemaFile);
    return;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Set OPENROUTER_API_KEY for image/pdf modes.");
    process.exit(1);
  }

  const schemaOpts =
    customSchema !== undefined || requirements
      ? { outputSchema: customSchema, requirements }
      : undefined;

  if (mode === "image") {
    await runImage(tool, url || DEFAULT_IMAGE_URL, schemaOpts);
    return;
  }

  if (mode === "pdf") {
    await runPdf(tool, url || DEFAULT_PDF_URL, schemaOpts);
    return;
  }

  console.error(`Unknown mode "${mode}". Use: local | image | pdf`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
