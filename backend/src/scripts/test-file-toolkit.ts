/**
 * Smoke: file_toolkit metadata without path.
 * Usage: npx tsx src/scripts/test-file-toolkit.ts
 */
import 'dotenv/config';
import { FileToolkitTool } from '../agent/tools/fileToolkit.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new FileToolkitTool();
  const r = await t.execute({ action: 'metadata' }, stubAgentContext);
  if (r.success) throw new Error('expected failure');
  console.log('PASS', t.name);
}

if (process.argv[1]?.includes('test-file-toolkit')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
