/**
 * Smoke: web_fetch_static with empty allowlist should reject.
 * Usage: npx tsx src/scripts/test-web-fetch-static.ts
 */
import 'dotenv/config';
import { WebFetchStaticTool } from '../agent/tools/webFetchStatic.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new WebFetchStaticTool();
  const prev = process.env.WEB_FETCH_ALLOWLIST_ORIGINS;
  process.env.WEB_FETCH_ALLOWLIST_ORIGINS = '';
  try {
    const r = await t.execute({ url: 'https://example.com/' }, stubAgentContext);
    if (r.success) throw new Error('expected failure with empty allowlist');
    console.log('PASS', t.name);
  } finally {
    if (prev === undefined) delete process.env.WEB_FETCH_ALLOWLIST_ORIGINS;
    else process.env.WEB_FETCH_ALLOWLIST_ORIGINS = prev;
  }
}

if (process.argv[1]?.includes('test-web-fetch-static')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
