/**
 * OpenRouter and outbound HTTP client identification for Foodflow.
 * Override with OPENROUTER_HTTP_REFERER when you have a production app URL.
 */
const DEFAULT_OPENROUTER_REFERER = "https://github.com/kennyforex/foodflow";

export function openRouterHttpReferer(): string {
  const fromEnv = process.env.OPENROUTER_HTTP_REFERER?.trim();
  return fromEnv || DEFAULT_OPENROUTER_REFERER;
}

export function openRouterHeaders(xTitle: string): Record<string, string> {
  return {
    "HTTP-Referer": openRouterHttpReferer(),
    "X-Title": xTitle,
  };
}

export const FOODFLOW_FETCH_USER_AGENT = "FoodflowAgent/1.0";
export const FOODFLOW_WHATSAPP_IMAGE_FETCH_USER_AGENT =
  "Foodflow-WhatsApp-ImageFetcher/1.0";
