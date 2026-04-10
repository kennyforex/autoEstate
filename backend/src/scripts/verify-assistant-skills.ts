/**
 * Print assistant skill bindings vs active Skill documents (MongoDB).
 * Usage (from backend/): npx tsx src/scripts/verify-assistant-skills.ts <assistantId> [expectedSlug]
 *
 * Example:
 *   npx tsx src/scripts/verify-assistant-skills.ts 69746d924ea1c1351594876f cake-booking-mille
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
import { Assistant, Skill } from '../models/index.js';

config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ffcs';

async function main(): Promise<void> {
  const assistantId = process.argv[2];
  const expectedSlug = process.argv[3];
  if (!assistantId) {
    console.error('Usage: npx tsx src/scripts/verify-assistant-skills.ts <assistantId> [expectedSlug]');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const assistant = await Assistant.findById(assistantId).lean();
  if (!assistant) {
    console.log('Assistant not found:', assistantId);
    await mongoose.disconnect();
    process.exit(2);
  }

  const skillIds = [...(assistant.skills || [])];
  console.log('Assistant:', assistantId, '| name:', assistant.name);
  console.log('skills[] binding count:', skillIds.length);

  if (skillIds.length === 0) {
    console.log('No skills bound — agent context will have 0 skills (matches prod symptom if DB differs from local).');
    await mongoose.disconnect();
    process.exit(0);
  }

  const docs = await Skill.find({ _id: { $in: skillIds } }).lean();
  const byId = new Map(docs.map((d) => [d._id.toString(), d]));

  for (const sid of skillIds) {
    const id = sid.toString();
    const doc = byId.get(id);
    if (!doc) {
      console.log(`  ${id}: MISSING Skill document (stale binding)`);
      continue;
    }
    const active = doc.status === 'active';
    console.log(
      `  ${id}: slug=${doc.slug} status=${doc.status}${active ? ' (active)' : ' (NOT ACTIVE — excluded from agent)'}`,
    );
  }

  const activeSlugs = docs.filter((d) => d.status === 'active').map((d) => d.slug);
  console.log('Active slugs loaded by agent:', activeSlugs.join(', ') || '(none)');

  if (expectedSlug) {
    const ok = activeSlugs.includes(expectedSlug);
    console.log(expectedSlug, ok ? 'OK (active)' : 'MISSING or not active');
    await mongoose.disconnect();
    process.exit(ok ? 0 : 3);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
