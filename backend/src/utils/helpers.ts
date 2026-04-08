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
 */
export function extractFirstPhoneFromJidCandidates(
  ...candidates: (string | undefined)[]
): string | undefined {
  for (const jid of candidates) {
    if (!jid) continue;
    const { type, value } = extractIdFromJid(jid);
    if (type === "phone") return value;
  }
  return undefined;
}

/**
 * Evolution sendText/sendMedia `number` field: prefer a dialable phone when we have one.
 * If only a WhatsApp internal id (LID) is known, pass it as `digits@lid` so 13-digit LIDs work.
 * (Media decryption should still use {@link extractIdFromJid} / message key JID, not this.)
 */
export function recipientJidForEvolutionSend(contact: {
  phoneNumber?: string | null;
  whatsappId?: string | null;
}): string | undefined {
  const rawPhone = contact.phoneNumber?.trim();
  if (rawPhone) {
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length > 0) return digits;
  }
  const wid = contact.whatsappId?.replace(/\D/g, "");
  if (wid) return `${wid}@lid`;
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
