/**
 * Smoke: google_gmail without Google userId.
 * Integration: connect Google + MONGODB (see test-google-integration.ts).
 * Usage: npx tsx src/scripts/test-google-gmail.ts
 */
import 'dotenv/config';
import { GoogleGmailTool } from '../agent/tools/googleGmail.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new GoogleGmailTool();
  const r = await t.execute({ action: 'search', query: 'is:inbox', maxResults: 1 }, stubAgentContext);
  if (r.success) throw new Error('expected failure without Google connection');
  if (!String(r.summary).includes('not connected') && !String(r.summary).includes('Google')) {
    throw new Error(r.summary);
  }
  console.log('PASS', t.name, '(smoke)');
}

if (process.argv[1]?.includes('test-google-gmail')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
