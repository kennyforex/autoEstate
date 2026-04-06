/**
 * 安裝「收款項」技能（backend/skills/mille-shoukuan/SKILL.md）
 *
 *   npx tsx src/scripts/install-mille-shoukuan-skill.ts
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { skillService } from '../services/skill.service.js';
import { GoogleConnection } from '../models/GoogleConnection.js';
import { Skill } from '../models/Skill.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autoEstate';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const conn = await GoogleConnection.findOne();
  if (!conn) {
    console.error('No GoogleConnection — use any user with Skills access.');
    await mongoose.disconnect();
    process.exit(1);
  }
  const userId = conn.userId.toString();
  const mdPath = path.join(process.cwd(), 'skills/mille-shoukuan/SKILL.md');
  const content = await fs.readFile(mdPath, 'utf-8');
  const skill = await skillService.installFromMarkdown(content, userId);
  await Skill.updateOne(
    { slug: 'mille-shoukuan' },
    {
      $set: {
        requiredTools: ['document_data_capture', 'google_drive', 'google_sheets'],
      },
    },
  );
  console.log('Installed skill:', skill.slug, skill.name, '\nstoragePath:', skill.storagePath);
  console.log('requiredTools: document_data_capture, google_drive, google_sheets');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
