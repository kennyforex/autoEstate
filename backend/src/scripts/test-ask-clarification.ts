/**
 * Smoke: ask_clarification requires question.
 * Usage: npx tsx src/scripts/test-ask-clarification.ts
 */
import 'dotenv/config';
import { ClarificationTool } from '../agent/tools/clarification.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new ClarificationTool();
  const r = await t.execute({ question: 'Smoke test: OK to ignore?' }, stubAgentContext);
  if (!r.success) throw new Error('expected success');
  console.log('PASS', t.name);
}

if (process.argv[1]?.includes('test-ask-clarification')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
