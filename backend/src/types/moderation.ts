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
  notifyPhoneNumber: string;
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

export const MODERATION_MAX_CATEGORIES = 20;
export const MODERATION_MAX_PHRASES_PER_CATEGORY = 200;
export const MODERATION_MAX_PHRASE_LENGTH = 120;
export const MODERATION_NOTIFY_MAX_LENGTH = 500;
