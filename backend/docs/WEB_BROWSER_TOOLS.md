# Web fetch and browser tools

## `web_fetch_static`

- Fetches **HTTP(S) HTML** and parses with Cheerio (no JavaScript execution).
- **Fail closed:** set `WEB_FETCH_ALLOWLIST_ORIGINS` to a comma-separated list of allowed origins or URL prefixes (e.g. `https://example.com,https://internal.example.com/app`).
- If empty, **no** URL is allowed.
- Rate limiting: rely on agent/tool usage patterns; add reverse-proxy limits in production if needed.

## `web_browser` (Playwright)

- Set `ENABLE_WEB_FETCH_BROWSER=true` and install browsers: `npx playwright install chromium`.
- Uses the **same** `WEB_FETCH_ALLOWLIST_ORIGINS` as `web_fetch_static`.
- Optional `storage_state_uploads_path`: path **relative to server `uploads/`** to a Playwright `storageState` JSON (cookies/session). Export this file manually after a logged-in session; **do not** commit secrets.
- **Credentials:** do not put passwords in LLM prompts. Prefer official APIs, OAuth, or pre-exported storage state files maintained by admins.
- **CAPTCHA / 2FA:** automation cannot reliably solve these; use human-in-the-loop workflows outside the agent.

## Human-in-the-loop

For sites that require interactive login, CAPTCHA, or WebAuthn, document an operational procedure (pause conversation, admin completes step, resume) rather than automating credential entry in chat.
