import { randomUUID } from "crypto";
import { conversationService } from "./conversation.service.js";
import { messageService } from "./message.service.js";
import { sendModerationAlertEmail } from "./email.service.js";
import type {
  IBadWordingCategory,
  IModerationSettings,
  ModerationInboxFolder,
  ModerationMatchResult,
} from "../types/moderation.js";
import {
  MODERATION_INBOX_FOLDERS,
  MODERATION_LIMITS,
} from "../types/moderation.js";

const DEFAULT_ENGLISH_PROFANITY = [
  "fuck",
  "fucking",
  "fucked",
  "fucker",
  "shit",
  "shitting",
  "shitted",
  "damn",
  "damned",
  "dammit",
  "hell",
  "crap",
  "ass",
  "asshole",
  "bitch",
  "bastard",
  "piss",
  "pissed",
  "cunt",
  "dick",
  "cock",
  "pussy",
  "motherfucker",
  "motherfucking",
];

const DEFAULT_CHINESE_PROFANITY = [
  "屌",
  "屌你",
  "屌你老母",
  "屌你媽",
  "屌你媽咪",
  "操",
  "操你",
  "操你媽",
  "操你媽的",
  "死開",
  "死仆街",
  "死全家",
  "冚家",
  "冚家鏟",
  "冚家富貴",
  "廢物",
  "廢柴",
  "垃圾",
  "白癡",
  "智障",
  "弱智",
];

const DEFAULT_COMPLAINT_PHRASES = [
  "投诉",
  "投訴",
  "complaint",
  "refund",
  "scam",
  "騙",
  "骗子",
  "騙子",
  "貨不對版",
  "货不对版",
  "退錢",
  "退钱",
  "唔合理",
  "不合理",
];

function hasCjk(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(text);
}

function phraseMatches(text: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed) return false;
  if (hasCjk(trimmed)) {
    return text.includes(trimmed);
  }
  return text.toLowerCase().includes(trimmed.toLowerCase());
}

function normalizePhoneDigits(input: string | undefined): string {
  return input?.replace(/\D/g, "") ?? "";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseNotifyPhoneNumbers(
  input: Partial<IModerationSettings> | IModerationSettings,
): string[] {
  if (Array.isArray(input.notifyPhoneNumbers)) {
    return input.notifyPhoneNumbers;
  }
  const legacy = (input as { notifyPhoneNumber?: string }).notifyPhoneNumber;
  if (legacy?.trim()) {
    return [legacy.trim()];
  }
  return [];
}

function parseNotifyEmails(
  input: Partial<IModerationSettings> | IModerationSettings,
): string[] {
  if (Array.isArray(input.notifyEmails)) {
    return input.notifyEmails;
  }
  return [];
}

function normalizeNotifyPhoneNumbers(
  input: Partial<IModerationSettings> | IModerationSettings,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of parseNotifyPhoneNumbers(input)) {
    const normalized = normalizePhoneDigits(String(raw));
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
    if (result.length >= MODERATION_LIMITS.maxNotifyPhoneNumbers) break;
  }
  return result;
}

function normalizeNotifyEmails(
  input: Partial<IModerationSettings> | IModerationSettings,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of parseNotifyEmails(input)) {
    const normalized = String(raw).trim().toLowerCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
    if (result.length >= MODERATION_LIMITS.maxNotifyEmails) break;
  }
  return result;
}

export function getDefaultModerationSettings(): IModerationSettings {
  return {
    enabled: true,
    notifyEnabled: false,
    notifyPhoneNumbers: [],
    notifyEmails: [],
    categories: [
      {
        id: "english-profanity",
        name: "English profanity",
        enabled: true,
        phrases: [...DEFAULT_ENGLISH_PROFANITY],
        inboxFolder: "attention",
      },
      {
        id: "chinese-profanity",
        name: "Chinese profanity",
        enabled: true,
        phrases: [...DEFAULT_CHINESE_PROFANITY],
        inboxFolder: "attention",
      },
      {
        id: "complaint-scam",
        name: "Complaint / scam language",
        enabled: true,
        phrases: [...DEFAULT_COMPLAINT_PHRASES],
        inboxFolder: "negative",
      },
    ],
  };
}

export function mergeModerationSettings(
  stored?: IModerationSettings | null,
): IModerationSettings {
  if (!stored || typeof stored !== "object") {
    return getDefaultModerationSettings();
  }
  const defaults = getDefaultModerationSettings();
  return normalizeModerationSettings({
    enabled: stored.enabled ?? defaults.enabled,
    notifyEnabled: stored.notifyEnabled ?? defaults.notifyEnabled,
    notifyPhoneNumbers: stored.notifyPhoneNumbers,
    notifyEmails: stored.notifyEmails,
    notifyPhoneNumber: stored.notifyPhoneNumber,
    categories:
      Array.isArray(stored.categories) && stored.categories.length > 0
        ? stored.categories
        : defaults.categories,
  });
}

export function normalizeModerationSettings(
  input: Partial<IModerationSettings> | IModerationSettings,
): IModerationSettings {
  const defaults = getDefaultModerationSettings();
  const categoriesInput = Array.isArray(input.categories)
    ? input.categories.slice(0, MODERATION_LIMITS.maxCategories)
    : defaults.categories;

  const categories: IBadWordingCategory[] = categoriesInput.map((cat, index) => {
    const raw = cat as Partial<IBadWordingCategory>;
    const phrases = (Array.isArray(raw.phrases) ? raw.phrases : [])
      .map((p) =>
        typeof p === "string"
          ? p.trim().slice(0, MODERATION_LIMITS.maxPhraseLength)
          : "",
      )
      .filter((p) => p.length > 0)
      .slice(0, MODERATION_LIMITS.maxPhrasesPerCategory);

    const inboxFolder = MODERATION_INBOX_FOLDERS.includes(
      raw.inboxFolder as ModerationInboxFolder,
    )
      ? (raw.inboxFolder as ModerationInboxFolder)
      : "attention";

    return {
      id:
        typeof raw.id === "string" && raw.id.trim()
          ? raw.id.trim()
          : `category-${index}-${randomUUID().slice(0, 8)}`,
      name:
        typeof raw.name === "string" && raw.name.trim()
          ? raw.name.trim().slice(0, 80)
          : `Category ${index + 1}`,
      enabled: raw.enabled !== false,
      phrases,
      inboxFolder,
    };
  });

  return {
    enabled: input.enabled !== false,
    notifyEnabled: Boolean(input.notifyEnabled),
    notifyPhoneNumbers: normalizeNotifyPhoneNumbers(input),
    notifyEmails: normalizeNotifyEmails(input),
    categories:
      categories.length > 0 ? categories : defaults.categories,
  };
}

export function validateModerationSettings(
  input: Partial<IModerationSettings> | IModerationSettings,
): string | null {
  const normalized = normalizeModerationSettings(input);

  if (
    normalized.notifyEnabled &&
    normalized.notifyPhoneNumbers.length === 0 &&
    normalized.notifyEmails.length === 0
  ) {
    return "At least one notify recipient is required when alerts are enabled";
  }

  for (const email of normalized.notifyEmails) {
    if (!isValidEmail(email)) {
      return `Invalid email address: ${email}`;
    }
  }

  for (const cat of normalized.categories) {
    if (!MODERATION_INBOX_FOLDERS.includes(cat.inboxFolder)) {
      return `Invalid inbox folder for category "${cat.name}"`;
    }
  }

  if ((input.categories?.length ?? 0) > MODERATION_LIMITS.maxCategories) {
    return `Maximum ${MODERATION_LIMITS.maxCategories} categories allowed`;
  }

  for (const cat of input.categories ?? []) {
    if (
      (cat.phrases?.length ?? 0) > MODERATION_LIMITS.maxPhrasesPerCategory
    ) {
      return `Maximum ${MODERATION_LIMITS.maxPhrasesPerCategory} phrases per category`;
    }
  }

  return null;
}

export function match(
  text: string,
  settings: IModerationSettings,
): ModerationMatchResult | null {
  if (!settings.enabled) {
    return null;
  }

  for (const category of settings.categories) {
    if (!category.enabled) continue;
    for (const phrase of category.phrases) {
      if (phraseMatches(text, phrase)) {
        return { category, matchedPhrase: phrase };
      }
    }
  }

  return null;
}

export function truncateForNotify(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

export function buildNotifyText(params: {
  categoryName: string;
  contactLabel: string;
  channelName: string;
  messageContent: string;
}): string {
  const body = truncateForNotify(
    params.messageContent,
    MODERATION_LIMITS.notifyTruncateLength,
  );
  return [
    `[Moderation] ${params.categoryName}`,
    `Contact: ${params.contactLabel}`,
    `Channel: ${params.channelName}`,
    "",
    body,
  ].join("\n");
}

export function shouldNotify(
  moderationAlertsSent: string[] | undefined,
  categoryId: string,
): boolean {
  const sent = moderationAlertsSent ?? [];
  return !sent.includes(categoryId);
}

export async function dispatchModerationNotifications(params: {
  evolutionInstanceName: string;
  notifyText: string;
  phoneNumbers: string[];
  emails: string[];
  onError: (context: string, error: unknown) => void;
}): Promise<boolean> {
  const sendTasks: Promise<boolean>[] = [];

  for (const phone of params.phoneNumbers) {
    sendTasks.push(
      messageService
        .sendViaWhatsApp(
          params.evolutionInstanceName,
          phone,
          params.notifyText,
          "text",
        )
        .then(() => true)
        .catch((err: unknown) => {
          params.onError(`badWordingNotifyWhatsApp:${phone}`, err);
          return false;
        }),
    );
  }

  for (const email of params.emails) {
    sendTasks.push(
      sendModerationAlertEmail(email, params.notifyText).catch(
        (err: unknown) => {
          params.onError(`badWordingNotifyEmail:${email}`, err);
          return false;
        },
      ),
    );
  }

  const results = await Promise.all(sendTasks);
  return results.some((ok) => ok);
}

export async function applyFolderActions(
  conversationId: string,
  folder: ModerationInboxFolder,
): Promise<void> {
  switch (folder) {
    case "attention":
      await conversationService.update(conversationId, { needsAttention: true });
      break;
    case "negative":
      await conversationService.update(conversationId, { needsAttention: true });
      await conversationService.updateAISignals(conversationId, {
        sentiment: "negative",
      });
      break;
    case "priority":
      await conversationService.update(conversationId, { needsAttention: true });
      await conversationService.updateAISignals(conversationId, { priority: 8 });
      break;
    case "slaRisk":
      await conversationService.update(conversationId, { needsAttention: true });
      await conversationService.updateAISignals(conversationId, {
        slaRisk: true,
        priority: 8,
      });
      break;
    case "spam":
      await conversationService.update(conversationId, { status: "spam" });
      break;
    default:
      break;
  }
}

export const moderationService = {
  getDefaultModerationSettings,
  mergeModerationSettings,
  normalizeModerationSettings,
  validateModerationSettings,
  match,
  truncateForNotify,
  buildNotifyText,
  shouldNotify,
  dispatchModerationNotifications,
  applyFolderActions,
};
