/**
 * Extract HTTPS image URLs from AI replies, scrub them from the text body, and
 * fetch images safely for WhatsApp outbound sendMedia (SSRF mitigations).
 */

import dns from "node:dns/promises";
import { FOODFLOW_WHATSAPP_IMAGE_FETCH_USER_AGENT } from "../config/httpAttribution.js";

const MAX_OUTBOUND_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;

const IMAGE_EXT = "(?:jpg|jpeg|png|gif|webp)";
const BARE_URL_RE = new RegExp(
  `https://[^\\s\\)\\]>"'<]+?\\.${IMAGE_EXT}(?:\\?[^\\s\\)\\]>"'<]*)?`,
  "gi",
);
const MD_IMAGE_RE = /!\[[^\]]*]\((https:\/\/[^)\s]+)\)/gi;

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[),.;:'"\]}>]+$/g, "");
}

function parseHostAllowlist(): string[] | null {
  const raw = process.env.WHATSAPP_OUTBOUND_IMAGE_HOST_ALLOWLIST?.trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function hostAllowed(hostname: string, allowlist: string[] | null): boolean {
  const h = hostname.toLowerCase();
  if (!allowlist || allowlist.length === 0) return true;
  return allowlist.some((entry) => h === entry || h.endsWith(`.${entry}`));
}

function isBlockedIPv4(address: string): boolean {
  const parts = address.split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 127) return true;
  if (a === 10) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    return isBlockedIPv4(v4);
  }
  return false;
}

async function assertResolvableHostSafe(hostname: string): Promise<void> {
  let results: { address: string; family: number }[];
  try {
    const r = await dns.lookup(hostname, { all: true });
    results = Array.isArray(r) ? r : [r];
  } catch {
    throw new FetchImageError("DNS lookup failed", "dns");
  }
  if (results.length === 0) {
    throw new FetchImageError("No DNS records", "dns");
  }
  for (const { address, family } of results) {
    if (family === 4 && isBlockedIPv4(address)) {
      throw new FetchImageError("Resolved to non-public IPv4", "ssrf");
    }
    if (family === 6 && isBlockedIPv6(address)) {
      throw new FetchImageError("Resolved to non-public IPv6", "ssrf");
    }
  }
}

function sniffImageMime(buffer: ArrayBuffer): string | null {
  const u8 = new Uint8Array(buffer.slice(0, 16));
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    u8.length >= 8 &&
    u8[0] === 0x89 &&
    u8[1] === 0x50 &&
    u8[2] === 0x4e &&
    u8[3] === 0x47
  ) {
    return "image/png";
  }
  if (u8.length >= 6 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) {
    return "image/gif";
  }
  if (u8.length >= 12 && u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) {
    const webp = String.fromCharCode(...u8.slice(8, 12));
    if (webp === "WEBP") return "image/webp";
  }
  return null;
}

export class FetchImageError extends Error {
  constructor(
    message: string,
    readonly code: "url" | "dns" | "ssrf" | "host" | "fetch" | "size" | "type",
  ) {
    super(message);
    this.name = "FetchImageError";
  }
}

export function extractHttpsImageUrls(content: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const add = (raw: string) => {
    const u = trimTrailingPunctuation(raw.trim());
    if (!u.startsWith("https://") || seen.has(u)) return;
    seen.add(u);
    ordered.push(u);
  };

  let m: RegExpExecArray | null;
  const mdCopy = new RegExp(MD_IMAGE_RE.source, MD_IMAGE_RE.flags);
  while ((m = mdCopy.exec(content)) !== null) {
    add(m[1]!);
    if (ordered.length >= MAX_OUTBOUND_IMAGES) return ordered;
  }

  const bareCopy = new RegExp(BARE_URL_RE.source, BARE_URL_RE.flags);
  while ((m = bareCopy.exec(content)) !== null) {
    add(m[0]!);
    if (ordered.length >= MAX_OUTBOUND_IMAGES) return ordered;
  }

  return ordered;
}

const FALLBACK_TEXT_AFTER_SCRUB =
  "Here are the photos you asked for.";

export function scrubImageUrlsFromText(content: string, urls: string[]): string {
  let out = content;

  out = out.replace(MD_IMAGE_RE, "");

  for (const url of urls) {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), "");
  }

  out = out.replace(/[ \t]+\n/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.trim();

  if (!out) {
    return FALLBACK_TEXT_AFTER_SCRUB;
  }
  return out;
}

async function readBodyWithByteLimit(
  response: Response,
  maxBytes: number,
): Promise<ArrayBuffer> {
  const lenHeader = response.headers.get("content-length");
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > maxBytes) {
      throw new FetchImageError("Content-Length exceeds limit", "size");
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const buf = await response.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new FetchImageError("Body exceeds limit", "size");
    }
    return buf;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new FetchImageError("Body exceeds limit", "size");
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof FetchImageError) throw e;
    throw new FetchImageError(
      e instanceof Error ? e.message : "Read failed",
      "fetch",
    );
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

export type FetchImageOk = { dataUrl: string; mime: string; base64: string };

export async function fetchHttpsImageAsDataUrl(urlString: string): Promise<FetchImageOk> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new FetchImageError("Invalid URL", "url");
  }

  if (url.protocol !== "https:") {
    throw new FetchImageError("Only https URLs are allowed", "url");
  }

  const allowlist = parseHostAllowlist();
  if (!hostAllowed(url.hostname, allowlist)) {
    throw new FetchImageError("Host not in allowlist", "host");
  }

  await assertResolvableHostSafe(url.hostname);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let current = urlString;
  let response: Response | undefined;
  const maxRedirects = 5;

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      let nextUrl: URL;
      try {
        nextUrl = new URL(current);
      } catch {
        throw new FetchImageError("Invalid redirect URL", "url");
      }
      if (nextUrl.protocol !== "https:") {
        throw new FetchImageError("Redirect to non-https blocked", "ssrf");
      }
      if (!hostAllowed(nextUrl.hostname, allowlist)) {
        throw new FetchImageError("Redirect host not in allowlist", "host");
      }
      await assertResolvableHostSafe(nextUrl.hostname);

      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "image/*,*/*;q=0.8",
          "User-Agent": FOODFLOW_WHATSAPP_IMAGE_FETCH_USER_AGENT,
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const loc = response.headers.get("location");
        if (!loc || hop === maxRedirects) {
          throw new FetchImageError("Too many redirects or missing Location", "fetch");
        }
        current = new URL(loc, current).href;
        continue;
      }

      break;
    }
  } catch (e) {
    if (e instanceof FetchImageError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new FetchImageError(msg, "fetch");
  } finally {
    clearTimeout(t);
  }

  if (!response) {
    throw new FetchImageError("No response", "fetch");
  }
  if (!response.ok) {
    throw new FetchImageError(`HTTP ${response.status}`, "fetch");
  }

  const ct = (response.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase();
  const buffer = await readBodyWithByteLimit(response, MAX_IMAGE_BYTES);

  let mime = ct.startsWith("image/") ? ct : "";
  if (!mime) {
    const sniffed = sniffImageMime(buffer);
    if (sniffed) mime = sniffed;
  }
  if (!mime || !mime.startsWith("image/")) {
    throw new FetchImageError("Not an image (content-type and magic bytes)", "type");
  }

  const base64 = Buffer.from(buffer).toString("base64");
  const dataUrl = `data:${mime};base64,${base64}`;
  return { dataUrl, mime, base64 };
}

export function fileNameForImageUrl(urlString: string, mime: string): string {
  try {
    const path = new URL(urlString).pathname;
    const base = path.split("/").pop() || "image";
    if (/\.(jpe?g|png|gif|webp)$/i.test(base)) return base.slice(0, 120);
  } catch {
    /* ignore */
  }
  if (mime === "image/jpeg") return "image.jpg";
  if (mime === "image/png") return "image.png";
  if (mime === "image/gif") return "image.gif";
  if (mime === "image/webp") return "image.webp";
  return "image.bin";
}
