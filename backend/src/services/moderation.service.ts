import { randomUUID } from "crypto";
import { conversationService } from "./conversation.service.js";
import type {
  IBadWordingCategory,
  IModerationSettings,
  ModerationInboxFolder,
  ModerationMatchResult,
} from "../types/moderation.js";
import {
  MODERATION_INBOX_FOLDERS,
  MODERATION_MAX_CATEGORIES,
  MODERATION_MAX_PHRASE_LENGTH,
  MODERATION_MAX_PHRASES_PER_CATEGORY,
  MODERATION_NOTIFY_MAX_LENGTH,
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

export function getDefaultModerationSettings(): IModerationSettings {
  return {
    enabled: true,
    notifyEnabled: false,
    notifyPhoneNumber: "",
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
    notifyPhoneNumber: stored.notifyPhoneNumber ?? defaults.notifyPhoneNumber,
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
    ? input.categories.slice(0, MODERATION_MAX_CATEGORIES)
    : defaults.categories;

  const categories: IBadWordingCategory[] = categoriesInput.map((cat, index) => {
    const raw = cat as Partial<IBadWordingCategory>;
    const phrases = (Array.isArray(raw.phrases) ? raw.phrases : [])
      .map((p) =>
        typeof p === "string"
          ? p.trim().slice(0, MODERATION_MAX_PHRASE_LENGTH)
          : "",
      )
      .filter((p) => p.length > 0)
      .slice(0, MODERATION_MAX_PHRASES_PER_CATEGORY);

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
    notifyPhoneNumber:
      typeof input.notifyPhoneNumber === "string"
        ? input.notifyPhoneNumber.replace(/\D/g, "").slice(0, 20)
        : "",
    categories:
      categories.length > 0 ? categories : defaults.categories,
  };
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
    MODERATION_NOTIFY_MAX_LENGTH,
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
  match,
  truncateForNotify,
  buildNotifyText,
  shouldNotify,
  applyFolderActions,
};
