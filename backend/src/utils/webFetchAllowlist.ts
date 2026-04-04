/**
 * WEB_FETCH_ALLOWLIST_ORIGINS: comma-separated origins or URL prefixes, e.g.
 * "https://example.com,https://api.foo.com/path"
 * Empty list denies all requests (fail closed).
 */
export function parseWebFetchAllowlist(): string[] {
  const raw = process.env.WEB_FETCH_ALLOWLIST_ORIGINS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isUrlAllowedByAllowlist(url: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const targetOrigin = u.origin;
  for (const entry of allowlist) {
    try {
      if (entry.includes('://')) {
        const e = new URL(entry);
        if (e.origin === targetOrigin) {
          if (e.pathname && e.pathname !== '/' && !u.pathname.startsWith(e.pathname)) {
            continue;
          }
          return true;
        }
      }
    } catch {
      /* fall through */
    }
    if (entry === targetOrigin || url.startsWith(entry)) {
      return true;
    }
  }
  return false;
}
