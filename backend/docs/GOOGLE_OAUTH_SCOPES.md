# Google OAuth scopes (backend)

Configured in [`src/config/google.ts`](../src/config/google.ts) as `SCOPES` passed to `generateAuthUrl`.

| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/gmail.modify` | Gmail send/read |
| `https://www.googleapis.com/auth/calendar` | Calendar |
| `https://www.googleapis.com/auth/drive` | Drive list/upload/export |
| `https://www.googleapis.com/auth/spreadsheets` | Sheets |
| `https://www.googleapis.com/auth/documents` | **Google Docs** create/edit (tool: `google_docs`) |
| `https://www.googleapis.com/auth/userinfo.email` | Account identity |

## Consent UX

When **adding or changing** scopes, Google may show a new consent screen. Existing connections stored in `GoogleConnection` were issued with the **previous** scope set. Users must **disconnect and reconnect** Google under Settings → Connected Apps so the refresh token is re-issued with the new scopes (including Docs). Until then, Docs API calls may fail with `403` / insufficient permissions.

## Environment

See [`../.env.example`](../.env.example) for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
