import type { AgentContext } from './types.js';

/**
 * Close Chromium for this agent run. Safe to call multiple times.
 * Must not use a process singleton — session lives only on context.ephemeral.
 */
export async function disposePlaywrightSession(context: AgentContext): Promise<void> {
  const s = context.ephemeral?.playwright;
  if (!s) return;
  try {
    await s.page.close().catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    await s.context.close().catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    await s.browser.close();
  } catch (e) {
    console.warn('[PlaywrightSession] browser.close:', e);
  }
  if (context.ephemeral) {
    delete context.ephemeral.playwright;
  }
}
