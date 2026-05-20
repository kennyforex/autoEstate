import { Message, Conversation, Contact, Channel } from "../models/index.js";
import { getEvolutionClient } from "../config/evolution.js";
import { getPublicUploadsUrl, writeUploadsFile } from "../utils/uploadsPath.js";

export type DecryptedWhatsAppMedia = {
  buffer: Buffer;
  mimetype: string;
  base64: string;
};

const WHATSAPP_CDN_HOSTS = new Set(["mmg.whatsapp.net", "mmg-fna.whatsapp.net"]);

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const DEFAULT_AUDIO_MIME = "audio/ogg";

/**
 * Public API base for /api/media/:messageId links (no trailing slash).
 */
export function getPublicApiBase(): string {
  const base =
    process.env.PUBLIC_API_URL?.replace(/\/$/, "") ||
    process.env.BACKEND_PUBLIC_URL?.replace(/\/$/, "") ||
    "";
  return base;
}

export function buildMediaProxyUrl(messageId: string): string {
  const apiBase = getPublicApiBase();
  if (apiBase) {
    return `${apiBase}/api/media/${messageId}`;
  }
  return `/api/media/${messageId}`;
}

export function isWhatsAppCdnUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return WHATSAPP_CDN_HOSTS.has(host);
  } catch {
    return false;
  }
}

/** Parse MongoDB message id from /api/media/:id URLs. */
export function parseMessageIdFromMediaUrl(url: string): string | undefined {
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed, "http://localhost");
    const match = u.pathname.match(/\/api\/media\/([a-fA-F0-9]{24})\/?$/);
    return match?.[1];
  } catch {
    const rel = trimmed.match(/\/api\/media\/([a-fA-F0-9]{24})\/?$/);
    return rel?.[1];
  }
}

/**
 * URLs that staff can open or embed without Evolution decrypt.
 */
export function isStablePreviewReceiptUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:")) return true;
  if (/\/uploads\//i.test(trimmed)) return true;
  if (/drive\.google\.com|googleusercontent\.com/i.test(trimmed)) return true;
  if (/\.(png|jpe?g|webp|gif)(?:$|[?#])/i.test(trimmed)) return true;
  if (parseMessageIdFromMediaUrl(trimmed)) return true;
  if (isWhatsAppCdnUrl(trimmed)) return false;
  return false;
}

function extensionForMimetype(mimetype: string, fallback = ".bin"): string {
  const mime = mimetype.toLowerCase().split(";")[0].trim();
  return IMAGE_EXT_BY_MIME[mime] || (mime === "application/pdf" ? ".pdf" : fallback);
}

/**
 * Fetch decrypted WhatsApp media for a message via Evolution API.
 */
export async function fetchDecryptedMediaByMessageId(
  messageId: string,
  options?: { timeoutMs?: number; logPrefix?: string },
): Promise<DecryptedWhatsAppMedia | null> {
  const logPrefix = options?.logPrefix ?? "[WhatsAppMedia]";
  const timeout = options?.timeoutMs ?? 30_000;

  try {
    const message = await Message.findById(messageId);
    if (!message?.evolutionMessageId) {
      console.log(`${logPrefix} Message ${messageId} not found or has no evolutionMessageId`);
      return null;
    }

    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      console.log(`${logPrefix} Conversation ${message.conversationId} not found`);
      return null;
    }

    const contact = await Contact.findById(conversation.contactId);
    if (!contact) {
      console.log(`${logPrefix} Contact not found for conversation ${message.conversationId}`);
      return null;
    }

    const channel = await Channel.findById(message.channelId);
    if (!channel?.evolutionInstanceName) {
      console.log(`${logPrefix} Channel not found or has no evolutionInstanceName`);
      return null;
    }

    const senderId = contact.whatsappId || contact.phoneNumber;
    if (!senderId) {
      console.log(`${logPrefix} Contact has no phone number or WhatsApp ID`);
      return null;
    }

    const remoteJid = contact.whatsappId
      ? `${contact.whatsappId}@lid`
      : `${senderId}@s.whatsapp.net`;

    const requestPayload = {
      message: {
        key: {
          remoteJid,
          fromMe: false,
          id: message.evolutionMessageId,
        },
      },
    };

    const evolutionClient = getEvolutionClient();
    const response = await evolutionClient.post(
      `/chat/getBase64FromMediaMessage/${channel.evolutionInstanceName}`,
      requestPayload,
      { timeout },
    );

    const { base64, mimetype } = response.data as { base64?: string; mimetype?: string };
    if (!base64) {
      console.log(`${logPrefix} No base64 returned from Evolution API`);
      return null;
    }

    const mime =
      (typeof mimetype === "string" && mimetype.trim()) ||
      (message.contentType === "image" ? "image/jpeg" : DEFAULT_AUDIO_MIME);

    return {
      base64,
      mimetype: mime,
      buffer: Buffer.from(base64, "base64"),
    };
  } catch (error: unknown) {
    const ax = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error(`${logPrefix} Failed to fetch decrypted media for ${messageId}`);
    if (ax.response?.status) console.error(`${logPrefix} Error status:`, ax.response.status);
    if (ax.response?.data) {
      console.error(`${logPrefix} Error data:`, JSON.stringify(ax.response.data, null, 2));
    }
    console.error(`${logPrefix} Error message:`, ax.message ?? String(error));
    return null;
  }
}

/** Legacy shape used by ai.service analyzeMedia. */
export async function fetchMediaBase64ByMessageId(
  messageId: string,
  _conversationId?: string,
): Promise<{ base64: string; mimetype: string } | null> {
  const media = await fetchDecryptedMediaByMessageId(messageId, { logPrefix: "[AI:Media]" });
  if (!media) return null;
  return { base64: media.base64, mimetype: media.mimetype };
}

/**
 * Persist decrypted receipt bytes under uploads/order-receipts/.
 */
export async function persistOrderReceiptMedia(
  messageId: string,
  orderNumber: string,
): Promise<{ receiptUrl: string; receiptFileName: string } | null> {
  const media = await fetchDecryptedMediaByMessageId(messageId, {
    logPrefix: "[OrderReceipt]",
  });
  if (!media) return null;

  const safeOrder = orderNumber.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 48);
  const ext = extensionForMimetype(media.mimetype, ".jpg");
  const ts = Date.now();
  const fileName = `Receipt-${safeOrder}-${ts}${ext}`;
  const relative = `order-receipts/${fileName}`;

  const written = await writeUploadsFile(relative, media.buffer);
  if (!written.ok) {
    console.error(`[OrderReceipt] Failed to write ${relative}: ${written.error}`);
    return null;
  }

  return {
    receiptUrl: getPublicUploadsUrl(written.uploadsRelative),
    receiptFileName: fileName,
  };
}

export function bufferToDataUrl(buffer: Buffer, mimetype: string): string {
  return `data:${mimetype};base64,${buffer.toString("base64")}`;
}

/** Whether receiptUrl should be copied to uploads/order-receipts/ for staff preview. */
export function needsPersistedReceiptCopy(receiptUrl: string): boolean {
  const trimmed = receiptUrl.trim();
  if (!trimmed || trimmed.startsWith("data:")) return false;
  if (isWhatsAppCdnUrl(trimmed)) return true;
  if (parseMessageIdFromMediaUrl(trimmed)) return true;
  if (/\/uploads\//i.test(trimmed)) return false;
  if (/drive\.google\.com|googleusercontent\.com/i.test(trimmed)) return false;
  if (/\.(png|jpe?g|webp|gif|pdf)(?:$|[?#])/i.test(trimmed)) return false;
  return true;
}

/**
 * Replace WhatsApp CDN / media-proxy URLs with a persisted uploads copy when possible.
 */
export async function resolvePaymentProofReceiptUrl(params: {
  receiptUrl: string;
  receiptFileName?: string;
  messageId?: string;
  orderNumber: string;
}): Promise<{ receiptUrl: string; receiptFileName?: string }> {
  const receiptUrl = params.receiptUrl.trim();
  let messageId = params.messageId?.trim();
  if (!messageId) {
    messageId = parseMessageIdFromMediaUrl(receiptUrl);
  }

  if (!needsPersistedReceiptCopy(receiptUrl) || !messageId) {
    return {
      receiptUrl,
      receiptFileName: params.receiptFileName,
    };
  }

  const persisted = await persistOrderReceiptMedia(messageId, params.orderNumber);
  if (!persisted) {
    return {
      receiptUrl,
      receiptFileName: params.receiptFileName,
    };
  }

  return {
    receiptUrl: persisted.receiptUrl,
    receiptFileName: params.receiptFileName || persisted.receiptFileName,
  };
}
