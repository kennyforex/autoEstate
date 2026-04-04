/**
 * Smoke: pdf_toolkit without PDF source.
 * Usage: npx tsx src/scripts/test-pdf-toolkit.ts
 */
import 'dotenv/config';
import { PdfToolkitTool } from '../agent/tools/pdfToolkit.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new PdfToolkitTool();
  const r = await t.execute({ action: 'extract_text' }, stubAgentContext);
  if (r.success) throw new Error('expected failure');
  console.log('PASS', t.name);
}

if (process.argv[1]?.includes('test-pdf-toolkit')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
