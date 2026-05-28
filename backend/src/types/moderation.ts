export type ModerationInboxFolder =
  | "attention"
  | "negative"
  | "priority"
  | "slaRisk"
  | "spam";

export const MODERATION_INBOX_FOLDERS: ModerationInboxFolder[] = [
  "attention",
  "negative",
  "priority",
  "slaRisk",
  "spam",
];

export interface IBadWordingCategory {
  id: string;
  name: string;
  enabled: boolean;
  phrases: string[];
  inboxFolder: ModerationInboxFolder;
}

export interface IModerationSettings {
  enabled: boolean;
  categories: IBadWordingCategory[];
  notifyEnabled: boolean;
  notifyPhoneNumbers: string[];
  notifyEmails: string[];
  /** @deprecated Legacy single phone — migrated to notifyPhoneNumbers on read */
  notifyPhoneNumber?: string;
}

export interface ILastModerationMatch {
  categoryId: string;
  categoryName: string;
  at: Date;
}

export interface ModerationMatchResult {
  category: IBadWordingCategory;
  matchedPhrase: string;
}

export const MODERATION_LIMITS = {
  maxCategories: 20,
  maxPhrasesPerCategory: 200,
  maxPhraseLength: 120,
  notifyTruncateLength: 500,
  maxNotifyPhoneNumbers: 10,
  maxNotifyEmails: 10,
} as const;

/** @deprecated Use MODERATION_LIMITS.maxCategories */
export const MODERATION_MAX_CATEGORIES = MODERATION_LIMITS.maxCategories;
/** @deprecated Use MODERATION_LIMITS.maxPhrasesPerCategory */
export const MODERATION_MAX_PHRASES_PER_CATEGORY =
  MODERATION_LIMITS.maxPhrasesPerCategory;
/** @deprecated Use MODERATION_LIMITS.maxPhraseLength */
export const MODERATION_MAX_PHRASE_LENGTH = MODERATION_LIMITS.maxPhraseLength;
/** @deprecated Use MODERATION_LIMITS.notifyTruncateLength */
export const MODERATION_NOTIFY_MAX_LENGTH = MODERATION_LIMITS.notifyTruncateLength;
