import { Assistant } from "../models/index.js";
import {
  createChatCompletion,
  type ChatCompletionRequest,
} from "../config/aiChatProvider.js";
import type { OpenRouterResponse } from "../agent/types.js";
import { aiLogger } from "./aiLogger.service.js";
import {
  CUSTOMER_RESPONSE_FALLBACK,
  detectInternalLeakage,
  prepareCustomerTextDraft,
  stripObviousLeakage,
} from "../utils/customerResponse.js";

type CreateChatCompletionFn = (
  request: ChatCompletionRequest,
) => Promise<OpenRouterResponse>;

const LANG_LABELS: Record<string, string> = {
  "zh-TW": "Traditional Chinese",
  "zh-CN": "Simplified Chinese",
  en: "English",
};

function buildRewriteSystemPrompt(params: {
  tone?: string;
  primaryLanguage?: string;
}): string {
  const lang =
    params.primaryLanguage && params.primaryLanguage !== "auto"
      ? LANG_LABELS[params.primaryLanguage] || params.primaryLanguage
      : "the same language as the draft";

  const parts = [
    "You rewrite internal support-agent drafts into short WhatsApp messages for customers.",
    `Respond in ${lang}.`,
    "Rules:",
    "- Output ONLY the customer message — no preamble, quotes, or explanation.",
    "- Keep order IDs, amounts, dates, and pickup details exactly as in the draft when present.",
    "- Remove all mentions of tools, skills, agents, workflows, function calls, verification steps, and internal statuses.",
    '- Translate internal statuses naturally (e.g. "verifying" → 核對緊 / payment being checked).',
    "- Warm, concise, professional tone.",
    "- Plain text only — no Markdown.",
  ];

  if (params.tone) {
    parts.push(`Tone: ${params.tone}.`);
  }

  return parts.join("\n");
}

export async function rewriteForCustomer(params: {
  draft: string;
  assistantId?: string;
  conversationId?: string;
  createChatCompletionFn?: CreateChatCompletionFn;
}): Promise<string> {
  const {
    draft,
    assistantId,
    conversationId,
    createChatCompletionFn = createChatCompletion,
  } = params;

  let tone: string | undefined;
  let primaryLanguage: string | undefined;

  if (assistantId) {
    try {
      const assistant = await Assistant.findById(assistantId).lean();
      tone = assistant?.tone;
      primaryLanguage = assistant?.primaryLanguage;
    } catch {
      /* use defaults */
    }
  }

  const systemPrompt = buildRewriteSystemPrompt({ tone, primaryLanguage });

  try {
    const response = await createChatCompletionFn({
      useCase: "fast",
      title: "Foodflow AI",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Rewrite this internal draft for the customer:\n\n" + draft,
        },
      ],
      temperature: 0.2,
    });

    const rewritten =
      response.choices[0]?.message?.content?.trim() || "";

    if (rewritten && !detectInternalLeakage(rewritten)) {
      return rewritten;
    }

    if (rewritten) {
      console.warn(
        "[CustomerResponse] Rewrite still contains leakage — applying heuristic strip",
      );
      const stripped = stripObviousLeakage(rewritten);
      if (stripped && !detectInternalLeakage(stripped)) {
        return stripped;
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CustomerResponse] Rewrite failed:", msg);
    aiLogger.logError({
      conversationId,
      error: msg,
      context: "rewriteForCustomer",
      metadata: { assistantId },
    });
  }

  const stripped = stripObviousLeakage(draft);
  if (stripped && !detectInternalLeakage(stripped)) {
    return stripped;
  }

  return CUSTOMER_RESPONSE_FALLBACK;
}

/**
 * Prepare outbound AI text for customers: strip markers, detect leakage, rewrite if needed.
 */
export async function prepareCustomerFacingResponse(params: {
  draft: string;
  assistantId?: string;
  conversationId?: string;
  createChatCompletionFn?: CreateChatCompletionFn;
}): Promise<string> {
  const cleaned = prepareCustomerTextDraft(params.draft);
  if (!cleaned) return cleaned;

  if (!detectInternalLeakage(cleaned)) {
    return cleaned;
  }

  console.log(
    `[CustomerResponse] Internal leakage detected (${cleaned.length} chars) — rewriting`,
  );

  return rewriteForCustomer({
    draft: cleaned,
    assistantId: params.assistantId,
    conversationId: params.conversationId,
    createChatCompletionFn: params.createChatCompletionFn,
  });
}

export const customerResponseService = {
  rewriteForCustomer,
  prepareCustomerFacingResponse,
};
