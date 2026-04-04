/**
 * Smoke: google_docs without Google userId.
 * Usage: npx tsx src/scripts/test-google-docs.ts
 */
import 'dotenv/config';
import { GoogleDocsTool } from '../agent/tools/googleDocs.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new GoogleDocsTool();
  const r = await t.execute({ action: 'create', title: 'Smoke' }, stubAgentContext);
  if (r.success) throw new Error('expected failure without Google');
  console.log('PASS', t.name, '(smoke)');
}

if (process.argv[1]?.includes('test-google-docs')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
