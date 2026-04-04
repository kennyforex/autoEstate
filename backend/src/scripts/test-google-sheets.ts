/**
 * Smoke: google_sheets without args / user.
 * Usage: npx tsx src/scripts/test-google-sheets.ts
 */
import 'dotenv/config';
import { GoogleSheetsTool } from '../agent/tools/googleSheets.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new GoogleSheetsTool();
  const r = await t.execute({ action: 'read_range' }, stubAgentContext);
  if (r.success) throw new Error('expected failure');
  console.log('PASS', t.name, '(smoke)');
}

if (process.argv[1]?.includes('test-google-sheets')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
