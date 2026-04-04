/**
 * Smoke: office_files without source.
 * Usage: npx tsx src/scripts/test-office-files.ts
 */
import 'dotenv/config';
import { OfficeFilesTool } from '../agent/tools/officeFiles.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new OfficeFilesTool();
  const r = await t.execute({ action: 'xlsx_read' }, stubAgentContext);
  if (r.success) throw new Error('expected failure');
  console.log('PASS', t.name);
}

if (process.argv[1]?.includes('test-office-files')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
