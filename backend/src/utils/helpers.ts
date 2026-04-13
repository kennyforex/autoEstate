import { parsePhoneNumber } from "libphonenumber-js";

/**
 * Detect country from phone number
 * @param phoneNumber - Phone number (can be with or without + prefix)
 * @returns ISO 3166-1 alpha-2 country code (e.g., "US", "TW", "CN") or undefined if not detected
 */
export function detectCountryFromPhone(phoneNumber: string | undefined | null): string | undefined {
  if (!phoneNumber) return undefined;
  
  try {
    // Ensure the phone number has a + prefix for international format
    const normalizedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    const parsed = parsePhoneNumber(normalizedPhone);
    
    if (parsed && parsed.country) {
      return parsed.country;
    }
    
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * True if `digits` (no + prefix) is a valid international phone (E.164-style).
 * Used to ignore WhatsApp LIDs mistakenly stored in {@link Contact.phoneNumber}.
 */
export function isValidInternationalPhoneDigits(digits: string): boolean {
  if (!digits || digits.length < 8 || digits.length > 15) return false;
  try {
    const parsed = parsePhoneNumber(`+${digits}`);
    return parsed.isValid();
  } catch {
    return false;
  }
}

/**
 * Extract phone number from WhatsApp JID
 * @param jid - WhatsApp JID (e.g., "5511999999999@s.whatsapp.net")
 * @returns Phone number (e.g., "5511999999999")
 */
export function extractPhoneFromJid(jid: string): string {
  return jid.split("@")[0];
}

/**
 * Format phone number to WhatsApp JID
 * @param phone - Phone number (e.g., "5511999999999")
 * @returns WhatsApp JID (e.g., "5511999999999@s.whatsapp.net")
 */
export function formatPhoneToJid(phone: string): string {
  // Remove any non-numeric characters
  const cleanPhone = phone.replace(/\D/g, "");
  return `${cleanPhone}@s.whatsapp.net`;
}

/**
 * Check if a JID is a WhatsApp LID (Linked ID) rather than a phone number
 * LIDs are WhatsApp's privacy feature that hides actual phone numbers
 * @param jid - WhatsApp JID (e.g., "62002215014473@lid" or "5511999999999@s.whatsapp.net")
 * @returns true if the JID is a LID
 */
export function isLidJid(jid: string): boolean {
  if (jid.includes("@lid")) return true;
  const id = jid.split("@")[0];
  // LIDs are typically 14+ digits, while phone numbers are 10-13 digits
  return id.length >= 14;
}

/**
 * Extract ID from WhatsApp JID and determine if it's a phone or LID
 * @param jid - WhatsApp JID
 * @returns Object with type ('phone' or 'lid') and the extracted value
 */
export function extractIdFromJid(jid: string): {
  type: "phone" | "lid";
  value: string;
} {
  const value = jid.split("@")[0];
  const isLid = jid.includes("@lid") || value.length >= 14;
  return { type: isLid ? "lid" : "phone", value };
}

/**
 * Walk JID strings in priority order (Evolution: `sender` → `key.senderPn` → `key.remoteJid`)
 * and return the first dialable phone local part (skips LIDs).
 *
 * Some Evolution builds put the **connected instance / channel** JID in `sender` and the peer’s
 * real number in `senderPn`. Use {@link extractFirstPhoneFromJidCandidatesExcluding} with the
 * channel’s normalized digits so the customer’s PN is not mistaken for the business line.
 */
export function extractFirstPhoneFromJidCandidates(
  ...candidates: (string | undefined)[]
): string | undefined {
  return extractFirstPhoneFromJidCandidatesExcluding(undefined, ...candidates);
}

/**
 * Same as {@link extractFirstPhoneFromJidCandidates}, but skips any candidate whose local part
 * (digits only) equals `excludeNormalizedDigits` (e.g. the Foodflow channel `phoneNumber`).
 */
export function extractFirstPhoneFromJidCandidatesExcluding(
  excludeNormalizedDigits: string | undefined,
  ...candidates: (string | undefined)[]
): string | undefined {
  const ex =
    excludeNormalizedDigits?.replace(/\D/g, "").trim() ?? "";
  for (const jid of candidates) {
    if (!jid) continue;
    const { type, value } = extractIdFromJid(jid);
    if (type !== "phone") continue;
    const digits = value.replace(/\D/g, "");
    if (ex.length > 0 && digits === ex) continue;
    return value;
  }
  return undefined;
}

/**
 * Dialable peer phone for inbound WhatsApp webhooks. For `@lid` threads, `senderPn` is usually the
 * customer's number and `sender` may be the business instance — try senderPn first. Still applies
 * {@link extractFirstPhoneFromJidCandidatesExcluding}. If exclusion is empty and the first hit equals
 * `sender` but `senderPn` is a different valid E.164, prefer `senderPn`.
 */
export function extractPeerPhoneFromEvolutionInbound(
  remoteJid: string | undefined,
  sender: string | undefined,
  senderPn: string | undefined,
  excludeNormalizedDigits: string | undefined,
): string | undefined {
  const { type: remoteType } = extractIdFromJid(remoteJid || "");
  const exRaw = excludeNormalizedDigits?.replace(/\D/g, "").trim() ?? "";
  const ex = exRaw.length > 0 ? exRaw : undefined;

  const order: (string | undefined)[] =
    remoteType === "lid"
      ? [senderPn, sender, remoteJid]
      : [sender, senderPn, remoteJid];

  let picked = extractFirstPhoneFromJidCandidatesExcluding(ex, ...order);

  const senderDigits =
    sender && extractIdFromJid(sender).type === "phone"
      ? sender.split("@")[0].replace(/\D/g, "")
      : "";
  const senderPnDigits =
    senderPn && extractIdFromJid(senderPn).type === "phone"
      ? senderPn.split("@")[0].replace(/\D/g, "")
      : "";
  const pickedDigits = picked ? picked.replace(/\D/g, "") : "";

  if (
    remoteType === "lid" &&
    senderPnDigits.length > 0 &&
    senderDigits.length > 0 &&
    pickedDigits === senderDigits &&
    senderPnDigits !== senderDigits &&
    isValidInternationalPhoneDigits(senderPnDigits)
  ) {
    return senderPnDigits;
  }

  return picked;
}

/**
 * Evolution sendText/sendMedia `number` field: when the contact has a WhatsApp LID (`whatsappId`),
 * prefer `digits@lid` so outbound stays on the same thread as inbound `@lid` chats (matches
 * media `remoteJid` in ai.service / media.routes). Otherwise use a dialable E.164-style number,
 * or `digits@lid` for long internal ids.
 *
 * Coerces values with `String()` so MongoDB `Number` types (raw imports) do not break `.trim` / `.replace`.
 */
export function recipientJidForEvolutionSend(contact: {
  phoneNumber?: string | null | number;
  whatsappId?: string | null | number;
}): string | undefined {
  const wid =
    contact.whatsappId != null && contact.whatsappId !== ""
      ? String(contact.whatsappId).replace(/\D/g, "")
      : "";
  const rawPhone =
    contact.phoneNumber != null && contact.phoneNumber !== ""
      ? String(contact.phoneNumber).trim()
      : "";

  if (wid) {
    return `${wid}@lid`;
  }

  // Phone-only contact (no LID)
  if (rawPhone) {
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length > 0) {
      if (isValidInternationalPhoneDigits(digits)) return digits;
      if (digits.length >= 13) return `${digits}@lid`;
      return digits;
    }
  }

  return undefined;
}

/**
 * Generate a unique instance name for Evolution API
 * @param channelName - Channel name
 * @returns Unique instance name
 */
export function generateInstanceName(channelName: string): string {
  const timestamp = Date.now().toString(36);
  const cleanName = channelName.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `ffcs-${cleanName}-${timestamp}`;
}

/**
 * Parse message content from Evolution API message data
 */
export function parseMessageContent(message: {
  conversation?: string;
  extendedTextMessage?: { text: string };
  imageMessage?: { url: string; caption?: string };
  audioMessage?: { url: string };
  documentMessage?: { url: string; fileName?: string };
  videoMessage?: { url: string; caption?: string; gifPlayback?: boolean };
  stickerMessage?: { url: string };
  contactMessage?: { displayName?: string; vcard?: string };
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string };
  reactionMessage?: { text?: string };
}): { content: string; contentType: string; mediaUrl?: string } {
  if (message.conversation) {
    return { content: message.conversation, contentType: "text" };
  }

  if (message.extendedTextMessage) {
    return { content: message.extendedTextMessage.text, contentType: "text" };
  }

  if (message.imageMessage) {
    return {
      content: message.imageMessage.caption || "[Image]",
      contentType: "image",
      mediaUrl: message.imageMessage.url,
    };
  }

  if (message.videoMessage) {
    const isGif = message.videoMessage.gifPlayback;
    return {
      content: message.videoMessage.caption || (isGif ? "[GIF]" : "[Video]"),
      contentType: isGif ? "gif" : "video",
      mediaUrl: message.videoMessage.url,
    };
  }

  if (message.stickerMessage) {
    return {
      content: "[Sticker]",
      contentType: "sticker",
      mediaUrl: message.stickerMessage.url,
    };
  }

  if (message.audioMessage) {
    return {
      content: "[Audio]",
      contentType: "audio",
      mediaUrl: message.audioMessage.url,
    };
  }

  if (message.documentMessage) {
    return {
      content: message.documentMessage.fileName || "[Document]",
      contentType: "document",
      mediaUrl: message.documentMessage.url,
    };
  }

  if (message.contactMessage) {
    return {
      content: `[Contact: ${message.contactMessage.displayName || "Unknown"}]`,
      contentType: "contact",
    };
  }

  if (message.locationMessage) {
    const name = message.locationMessage.name || "Location";
    return {
      content: `[${name}]`,
      contentType: "location",
    };
  }

  if (message.reactionMessage) {
    return {
      content: message.reactionMessage.text || "👍",
      contentType: "reaction",
    };
  }

  return { content: "[Unknown message type]", contentType: "text" };
}

/**
 * Remove internal skill continuation markers (used by the agent router) before
 * sending text to external channels such as WhatsApp.
 *
 * Handles CRLF, optional whitespace in the comment, and markers not preceded by
 * a newline. If anything still matches `<!-- skill:`, truncates from there (agent
 * always appends markers at the end).
 */
export function stripSkillMarkers(content: string): string {
  let out = content.replace(
    /(?:\r\n|\r|\n)*<!--\s*skill:\S+?(?::complete\s+\{.*?\})?\s*-->/g,
    "",
  );
  const orphan = out.indexOf("<!-- skill:");
  if (orphan >= 0) {
    out = out.slice(0, orphan).trimEnd();
  }
  return out;
}

/**
 * Delay execution for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safely parse JSON string
 */
export function safeJsonParse<T>(str: string, defaultValue: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return defaultValue;
  }
}
