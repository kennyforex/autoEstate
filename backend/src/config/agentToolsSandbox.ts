/**
 * Limits for agent file/PDF/office/web tools. Override via environment where noted.
 */

function intEnv(key: string, fallback: number): number {
  const v = parseInt(process.env[key] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Max bytes when fetching a URL for pdf/office/web_fetch (default 15 MiB). */
export const AGENT_FETCH_MAX_BYTES = intEnv('AGENT_FETCH_MAX_BYTES', 15 * 1024 * 1024);

/** Max text length returned from file_read_text / pdf extract (default 500k chars). */
export const AGENT_TEXT_OUTPUT_MAX_CHARS = intEnv('AGENT_TEXT_OUTPUT_MAX_CHARS', 500_000);

/** Temp files from office/pdf tools: best-effort delete after this many ms (default 5 min). */
export const AGENT_TEMP_FILE_TTL_MS = intEnv('AGENT_TEMP_FILE_TTL_MS', 300_000);

/** Max entries in web_fetch selector map (default 20). */
export const WEB_FETCH_MAX_SELECTOR_KEYS = intEnv('WEB_FETCH_MAX_SELECTOR_KEYS', 20);

/** Playwright navigation timeout ms (default 45s). */
export const WEB_BROWSER_NAV_TIMEOUT_MS = intEnv('WEB_BROWSER_NAV_TIMEOUT_MS', 45_000);
