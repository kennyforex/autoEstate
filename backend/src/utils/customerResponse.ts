import { stripSkillMarkers } from "./helpers.js";

/** Patterns that indicate internal AI/tool narration leaked into customer text. */
const LEAKAGE_PATTERNS: RegExp[] = [
  /\btools?\b/i,
  /\bexecute_skill\b/i,
  /\bdocument_data_capture\b/i,
  /\bgoogle_sheets\b/i,
  /\bgoogle_drive\b/i,
  /\bgoogle_gmail\b/i,
  /\bgoogle_calendar\b/i,
  /\bupdate_order_payment\b/i,
  /\bcreate_order\b/i,
  /\bfunction\s+call/i,
  /\bSKILL_COMPLETE\b/,
  /\bSKILL_OBSERVATIONS\b/,
  /\bUNHANDLED_INTENT\b/,
  /\bverifying\b/i,
  /\bunpaid\b/i,
  /\bpaymentStatus\b/i,
  /payment\s*(?:亦)?已更新/i,
  /已\s*call/i,
  /流程完整/,
  /所有.{0,12}已/,
  /之前.{0,12}處理.{0,12}冇問題/,
  /資料核對/,
  /sub-?agent/i,
  /tool\s*call/i,
];

/** Inline internal ids that should be removed without dropping the whole customer-facing line. */
const INTERNAL_ID_PATTERNS: RegExp[] = [
  /\s*\((?:internal\s+)?id:\s*[^)]+\)/gi,
  /\b(?:productId|variantId|shippingMethodId|optionValueIds)\s*[:=]\s*["']?[\w,:[\]\-\s]+["']?/gi,
];

/** Lines containing these are dropped by stripObviousLeakage. */
const LEAKAGE_LINE_PATTERNS: RegExp[] = [
  ...LEAKAGE_PATTERNS,
  /^[\s\-•*]*(?:step|步驟)\s*\d+/i,
];

export function detectInternalLeakage(text: string): boolean {
  if (!text || !text.trim()) return false;
  for (const pattern of [...LEAKAGE_PATTERNS, ...INTERNAL_ID_PATTERNS]) {
    pattern.lastIndex = 0;
  }
  return (
    LEAKAGE_PATTERNS.some((pattern) => pattern.test(text)) ||
    INTERNAL_ID_PATTERNS.some((pattern) => pattern.test(text))
  );
}

export function stripObviousLeakage(text: string): string {
  if (!text || !text.trim()) return text;

  const lines = text.split(/\r?\n/);
  const kept = lines.filter(
    (line) => line.trim().length > 0 && !LEAKAGE_LINE_PATTERNS.some((p) => p.test(line)),
  );

  let result = kept.join("\n").trim();

  for (const pattern of LEAKAGE_PATTERNS) {
    result = result.replace(pattern, "");
  }
  for (const pattern of INTERNAL_ID_PATTERNS) {
    result = result.replace(pattern, "");
  }

  return result.replace(/\s{2,}/g, " ").trim();
}

/**
 * Strip skill HTML markers then optionally remove obvious internal narration.
 */
export function prepareCustomerTextDraft(draft: string): string {
  return stripSkillMarkers(draft).trim();
}

export const CUSTOMER_RESPONSE_FALLBACK =
  "已收到，我哋會盡快處理。如有需要會再聯絡你。";

export { stripSkillMarkers };
