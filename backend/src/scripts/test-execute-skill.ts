/**
 * Smoke: execute_skill requires slug and userRequest.
 * Usage: npx tsx src/scripts/test-execute-skill.ts
 */
import 'dotenv/config';
import { createDefaultRegistry } from '../agent/tools/index.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const reg = createDefaultRegistry();
  const t = reg.get('execute_skill');
  if (!t) throw new Error('execute_skill not registered');
  const r = await t.execute({ slug: '', userRequest: 'x' }, stubAgentContext);
  if (r.success) throw new Error('expected failure');
  console.log('PASS', t.name);
}

if (process.argv[1]?.includes('test-execute-skill')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
