/**
 * Smoke-test document_data_capture against fixed Megafintech LPC URLs (JPEG receipt + Closing PDF).
 *
 * Run from backend/:
 *   npm run test:lpc-documents
 *
 * Requires OPENROUTER_API_KEY. Uses OPENROUTER_DOCUMENT_CAPTURE_MODEL (else vision default).
 * Optional: OPENROUTER_DOCUMENT_CAPTURE_USE_STRUCTURED_OUTPUT, OPENROUTER_PDF_ENGINE.
 *
 * The PDF is sent as a base64 data URL so OpenRouter can parse it even if its servers cannot fetch lpc.megafintech-hk.com.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import { DocumentDataCaptureTool } from "../agent/tools/documentDataCapture.tool.js";
import type { AgentContext } from "../agent/types.js";

const RECEIPT_JPEG_URL =
  "https://lpc.megafintech-hk.com:3014/upload/2026/0324/files/undefined/20260321_CHAN%20YUEN%20MEI%20MARYANN_DN26030706_%245%2C419.98_TRANSFER.jpeg";

const CLOSING_PDF_URL =
  "https://lpc.megafintech-hk.com:3014/upload/2026/0327/emails/5715/RN26010639%20-%20Closing.pdf";

async function pdfHttpUrlToDataUrl(href: string): Promise<string> {
  const res = await fetch(href);
  if (!res.ok) {
    throw new Error(`PDF fetch ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:application/pdf;base64,${buf.toString("base64")}`;
}

function loadFixture(name: string): string {
  const p = join(process.cwd(), "src/scripts/fixtures", name);
  return readFileSync(p, "utf8").trim();
}

const stubContext: AgentContext = {
  conversationId: "lpc-doc-test",
  assistantId: "lpc-doc-test",
  channelId: "lpc-doc-test",
  contact: { id: "c1" },
  assistant: {
    id: "a1",
    name: "LPC doc test",
    primaryLanguage: "en",
    tone: "professional",
    model: "stub",
    pineconeAssistantName: "stub",
  },
  skills: [],
  messageHistory: [],
};

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    console.error("Missing OPENROUTER_API_KEY (load backend/.env or export it).");
    process.exit(1);
  }

  const receiptSchema = loadFixture("receipt-transfer-slip-schema.json");
  const closingSchema = loadFixture("closing-pdf-schema.json");
  const tool = new DocumentDataCaptureTool();

  let failed = false;

  console.log("\n========== 1) Receipt image (JPEG) ==========\n");
  const img = await tool.execute(
    {
      documentType: "image",
      sourceUrl: RECEIPT_JPEG_URL,
      requirements:
        "Hong Kong bank transfer / payment receipt. Extract only what is visible; use not_shown for missing fields per schema.",
      outputSchema: receiptSchema,
    },
    stubContext,
  );
  if (img.success) {
    const d = img.data as { extracted?: unknown; model?: string; structuredOutput?: boolean };
    console.log("STATUS: SUCCESS");
    console.log("model:", d.model, "| structuredOutput:", d.structuredOutput);
    console.log("extracted:\n", JSON.stringify(d.extracted, null, 2));
  } else {
    failed = true;
    console.log("STATUS: FAILED");
    console.log("summary:", img.summary);
  }

  console.log("\n========== 2) Closing PDF ==========\n");
  let pdfSource = CLOSING_PDF_URL;
  try {
    console.log("Fetching PDF locally → data URL (for OpenRouter file parser)…");
    pdfSource = await pdfHttpUrlToDataUrl(CLOSING_PDF_URL);
    console.log("Inlined PDF size (base64 data URL chars):", pdfSource.length);
  } catch (e) {
    console.warn("Could not inline PDF; using raw URL (may fail if OpenRouter cannot reach host):", e);
  }

  const pdf = await tool.execute(
    {
      documentType: "pdf",
      sourceUrl: pdfSource,
      requirements:
        "Real estate or transaction closing document. Extract visible references, parties, property, amounts and dates; use not_shown when absent.",
      outputSchema: closingSchema,
    },
    stubContext,
  );
  if (pdf.success) {
    const d = pdf.data as { extracted?: unknown; model?: string; structuredOutput?: boolean };
    console.log("STATUS: SUCCESS");
    console.log("model:", d.model, "| structuredOutput:", d.structuredOutput);
    console.log("extracted:\n", JSON.stringify(d.extracted, null, 2));
  } else {
    failed = true;
    console.log("STATUS: FAILED");
    console.log("summary:", pdf.summary);
  }

  console.log("\n========== Overall ==========\n");
  if (failed) {
    console.log("RESULT: at least one capture failed (see above).");
    process.exit(1);
  }
  console.log("RESULT: both captures succeeded.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
