# Web fetch and browser tools

## `web_fetch_static`

- Fetches **HTTP(S) HTML** and parses with Cheerio (no JavaScript execution).
- **Fail closed:** set `WEB_FETCH_ALLOWLIST_ORIGINS` to a comma-separated list of allowed origins or URL prefixes (e.g. `https://example.com,https://internal.example.com/app`).
- If empty, **no** URL is allowed.
- Rate limiting: rely on agent/tool usage patterns; add reverse-proxy limits in production if needed.

## `web_browser` (Playwright)

- Set `ENABLE_WEB_FETCH_BROWSER=true` and install browsers: `npx playwright install chromium`.
- Uses the **same** `WEB_FETCH_ALLOWLIST_ORIGINS` as `web_fetch_static`.
- **Session reuse:** Within a single assistant reply (one `AgentEngine.run`), all `web_browser` calls share one Chromium tab so the model can navigate, screenshot, and interact in multiple steps. The browser is closed when the run finishes. Different conversations never share browser state (no global singleton).
- **Interactive actions:** `fill`, `type`, `click`, `press`, `download` (click or direct GET), `scroll`, and `select_option` require `WEB_BROWSER_ALLOW_INTERACTION=true`. With it `false` (default in examples), read-only-style actions still work: `navigate`, `get_text`, `goto_text`, `get_selector_text`, `goto_selector`, `screenshot`, `wait_for_selector`, `wait_timeout` (pause for `wait_ms` or `timeout_ms`, capped by `WEB_BROWSER_MAX_ACTION_MS`).
- **Limits:** `WEB_BROWSER_MAX_ACTION_MS`, `WEB_BROWSER_SCREENSHOT_MAX_BYTES`, `WEB_BROWSER_DOWNLOAD_MAX_BYTES`, `WEB_BROWSER_MAX_SELECTOR_LENGTH`, `WEB_BROWSER_NAV_TIMEOUT_MS` (see `backend/src/config/agentToolsSandbox.ts`).
- **Outputs:** Screenshots and downloads are written under `uploads/browser-captures/<conversation>/` and the tool returns a short path/URL hint — not large base64 in the summary.
- Optional `storage_state_uploads_path`: path **relative to server `uploads/`** to a Playwright `storageState` JSON (cookies/session). Loaded on first session create in that run. Export this file manually after a logged-in session; **do not** commit secrets.
- **Credentials:** do not put passwords in LLM prompts or tool `text` fields in production. Prefer official APIs, OAuth, or pre-exported storage state files maintained by admins.
- **CAPTCHA / 2FA:** automation cannot reliably solve these; use human-in-the-loop workflows outside the agent.

## Human-in-the-loop

For sites that require interactive login, CAPTCHA, or WebAuthn, document an operational procedure (pause conversation, admin completes step, resume) rather than automating credential entry in chat.
