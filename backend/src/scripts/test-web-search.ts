/**
 * Smoke: web_search without BRAVE_SEARCH_API_KEY fails clearly.
 * Usage: npx tsx src/scripts/test-web-search.ts
 */
import 'dotenv/config';
import { WebSearchTool } from '../agent/tools/webSearch.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new WebSearchTool();
  const prev = process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  try {
    const r = await t.execute({ query: 'test' }, stubAgentContext);
    if (r.success) throw new Error('expected failure without API key');
    console.log('PASS', t.name, '(no key)');
  } finally {
    if (prev !== undefined) process.env.BRAVE_SEARCH_API_KEY = prev;
  }
}

if (process.argv[1]?.includes('test-web-search')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
