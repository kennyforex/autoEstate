/**
 * Install「建立報價」技能：註冊 SKILL.md，複製 Word 範本至技能目錄 assets/，複製 reference.md 至技能儲存目錄，並設定 requiredTools / hasReferences。
 *
 *   npx tsx src/scripts/install-mille-create-quotation-skill.ts
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
    console.error('No GoogleConnection — use any user with Skills access. Add a user id manually if needed.');
    await mongoose.disconnect();
    process.exit(1);
  }
  const userId = conn.userId.toString();

  const templateSrc = path.join(process.cwd(), 'skills/mille-create-quotation/assets/mille-quotation.docx');
  const mdPath = path.join(process.cwd(), 'skills/mille-create-quotation/SKILL.md');
  const content = await fs.readFile(mdPath, 'utf-8');
  const skill = await skillService.installFromMarkdown(content, userId);

  const assetsDir = path.join(skill.storagePath, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });
  const templateDest = path.join(assetsDir, 'mille-quotation.docx');
  await fs.copyFile(templateSrc, templateDest);
  console.log('Copied template to', templateDest);

  const refSrc = path.join(process.cwd(), 'skills/mille-create-quotation/reference.md');
  let hasReferences = false;
  try {
    await fs.access(refSrc);
    await fs.copyFile(refSrc, path.join(skill.storagePath, 'reference.md'));
    hasReferences = true;
    console.log('Copied reference.md to', path.join(skill.storagePath, 'reference.md'));
  } catch {
    console.log('No reference.md beside SKILL.md — hasReferences left false');
  }

  await Skill.updateOne(
    { slug: 'mille-create-quotation' },
    {
      $set: {
        requiredTools: ['office_files'],
        hasReferences,
      },
    },
  );
  console.log('Installed skill:', skill.slug, skill.name, '\nstoragePath:', skill.storagePath);
  console.log('requiredTools: office_files, hasReferences:', hasReferences);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
