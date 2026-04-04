/**
 * Smoke: web_browser disabled unless ENABLE_WEB_FETCH_BROWSER=true.
 * Optional integration: WEB_BROWSER_INTEGRATION_TEST=true with Playwright + allowlist (navigate + get_text reuse).
 * Usage: npx tsx src/scripts/test-web-browser.ts
 */
import 'dotenv/config';
import { disposePlaywrightSession } from '../agent/playwrightSession.js';
import { WebBrowserTool } from '../agent/tools/webBrowser.tool.js';
import type { AgentContext } from '../agent/types.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new WebBrowserTool();
  const originalEnable = process.env.ENABLE_WEB_FETCH_BROWSER;
  process.env.ENABLE_WEB_FETCH_BROWSER = '';
  try {
    const r = await t.execute({ action: 'goto_text', url: 'https://example.com/' }, stubAgentContext);
    if (r.success) throw new Error('expected disabled');
    if (!String(r.summary).toLowerCase().includes('disabled')) {
      throw new Error(r.summary);
    }
    console.log('PASS', t.name, '(disabled)');
  } finally {
    if (originalEnable === undefined) delete process.env.ENABLE_WEB_FETCH_BROWSER;
    else process.env.ENABLE_WEB_FETCH_BROWSER = originalEnable;
  }

  if (process.env.WEB_BROWSER_INTEGRATION_TEST !== 'true') {
    console.log('SKIP integration (set WEB_BROWSER_INTEGRATION_TEST=true, WEB_FETCH_ALLOWLIST_ORIGINS, npx playwright install chromium)');
    return;
  }

  const originalAllow = process.env.WEB_FETCH_ALLOWLIST_ORIGINS;
  process.env.ENABLE_WEB_FETCH_BROWSER = 'true';
  process.env.WEB_FETCH_ALLOWLIST_ORIGINS = 'https://example.com';

  const ctx: AgentContext = { ...stubAgentContext, ephemeral: {} };
  try {
    const nav = await t.execute({ action: 'navigate', url: 'https://example.com/' }, ctx);
    if (!nav.success) throw new Error(`navigate: ${nav.summary}`);
    const text = await t.execute({ action: 'get_text' }, ctx);
    if (!text.success) throw new Error(`get_text: ${text.summary}`);
    if (!String(text.summary).toLowerCase().includes('example')) {
      throw new Error(`unexpected body: ${text.summary.slice(0, 200)}`);
    }
    console.log('PASS', t.name, '(integration: session reuse)');
  } finally {
    await disposePlaywrightSession(ctx);
    if (originalAllow === undefined) delete process.env.WEB_FETCH_ALLOWLIST_ORIGINS;
    else process.env.WEB_FETCH_ALLOWLIST_ORIGINS = originalAllow;
    if (originalEnable === undefined) delete process.env.ENABLE_WEB_FETCH_BROWSER;
    else process.env.ENABLE_WEB_FETCH_BROWSER = originalEnable;
  }
}

if (process.argv[1]?.includes('test-web-browser')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
