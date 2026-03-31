/** Dispatched after the company logo is saved so the shell (e.g. sidebar) can refresh. */
export const COMPANY_LOGO_UPDATED_EVENT = "autoestate:company-logo-updated";

/** Resolve logo URL so relative paths point at the backend origin (uploads). */
export function resolveLogoUrl(logo: string | undefined): string | undefined {
  if (!logo) return undefined;
  if (logo.startsWith("http://") || logo.startsWith("https://")) return logo;
  const base = (import.meta.env.VITE_API_URL || "http://localhost:3001/api").replace(
    /\/api\/?$/,
    "",
  );
  return `${base}${logo.startsWith("/") ? "" : "/"}${logo}`;
}
