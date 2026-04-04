/**
 * Smoke: knowledge_base requires query.
 * Integration: set MONGODB + real assistantId and OPENROUTER/Pinecone as per assistantService.
 *
 * Usage: npx tsx src/scripts/test-knowledge-base.ts
 */
import 'dotenv/config';
import { KnowledgeBaseTool } from '../agent/tools/knowledgeBase.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new KnowledgeBaseTool();
  const r = await t.execute({ query: '' }, stubAgentContext);
  if (r.success) throw new Error('expected failure without query');
  console.log('PASS', t.name, '-', r.summary.slice(0, 80));
}

if (process.argv[1]?.includes('test-knowledge-base')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
