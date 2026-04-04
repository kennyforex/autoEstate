/**
 * Smoke: contact_lookup with MongoDB when MONGODB_URI is set; otherwise skips DB.
 * Usage: npx tsx src/scripts/test-contact-lookup.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { ContactLookupTool } from '../agent/tools/contactLookup.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new ContactLookupTool();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('SKIP', t.name, '- no MONGODB_URI');
    return;
  }
  await mongoose.connect(uri);
  try {
    const r = await t.execute({ fields: ['all'] }, stubAgentContext);
    if (!r.success && !r.summary.includes('not found')) {
      throw new Error(r.summary);
    }
    console.log('PASS', t.name, '-', r.summary.slice(0, 120));
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1]?.includes('test-contact-lookup')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
