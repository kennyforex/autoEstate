/**
 * Smoke: google_drive without Google userId.
 * Usage: npx tsx src/scripts/test-google-drive.ts
 */
import 'dotenv/config';
import { GoogleDriveTool } from '../agent/tools/googleDrive.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new GoogleDriveTool();
  const r = await t.execute({ action: 'list' }, stubAgentContext);
  if (r.success) throw new Error('expected failure without Google');
  console.log('PASS', t.name, '(smoke)');
}

if (process.argv[1]?.includes('test-google-drive')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
