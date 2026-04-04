/**
 * Smoke: web_browser disabled unless ENABLE_WEB_FETCH_BROWSER=true.
 * Usage: npx tsx src/scripts/test-web-browser.ts
 */
import 'dotenv/config';
import { WebBrowserTool } from '../agent/tools/webBrowser.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new WebBrowserTool();
  const prev = process.env.ENABLE_WEB_FETCH_BROWSER;
  process.env.ENABLE_WEB_FETCH_BROWSER = '';
  try {
    const r = await t.execute({ action: 'goto_text', url: 'https://example.com/' }, stubAgentContext);
    if (r.success) throw new Error('expected disabled');
    if (!String(r.summary).toLowerCase().includes('disabled')) {
      throw new Error(r.summary);
    }
    console.log('PASS', t.name);
  } finally {
    if (prev === undefined) delete process.env.ENABLE_WEB_FETCH_BROWSER;
    else process.env.ENABLE_WEB_FETCH_BROWSER = prev;
  }
}

if (process.argv[1]?.includes('test-web-browser')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
