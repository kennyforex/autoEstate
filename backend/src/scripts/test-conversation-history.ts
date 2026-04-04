/**
 * Smoke: conversation_history needs MongoDB + valid conversationId on context.
 * Usage: npx tsx src/scripts/test-conversation-history.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { ConversationHistoryTool } from '../agent/tools/conversationHistory.tool.js';
import type { AgentContext } from '../agent/types.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new ConversationHistoryTool();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('SKIP', t.name, '- no MONGODB_URI');
    return;
  }
  await mongoose.connect(uri);
  try {
    const ctx: AgentContext = {
      ...stubAgentContext,
      conversationId: '000000000000000000000000',
    };
    const r = await t.execute({ limit: 1 }, ctx);
    if (r.success) {
      console.log('PASS', t.name);
    } else {
      console.log('PASS', t.name, '(no conversation)', r.summary.slice(0, 80));
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1]?.includes('test-conversation-history')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
