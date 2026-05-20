/** Resolve receipt URL for display (uploads paths need API origin). */
export function resolveReceiptUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  const base = (import.meta.env.VITE_API_URL || "http://localhost:3001/api").replace(
    /\/api\/?$/,
    "",
  );
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Whether the order UI should render an inline image preview. */
export function isReceiptImagePreviewable(url: string): boolean {
  const resolved = resolveReceiptUrl(url) ?? url;
  if (/\.(png|jpe?g|webp|gif)(?:$|\?)/i.test(resolved)) return true;
  if (/\/api\/media\/[a-fA-F0-9]{24}/i.test(resolved)) return true;
  if (/\/uploads\//i.test(resolved)) return true;
  return false;
}
