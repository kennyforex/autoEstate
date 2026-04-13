/**
 * Install「建立報價」技能：註冊 SKILL.md，複製 Word 範本至 assets/，複製 references/*.md|*.txt 至技能儲存目錄，並設定 requiredTools / hasReferences。
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

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodflow';

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

  const refsSrcDir = path.join(process.cwd(), 'skills/mille-create-quotation/references');
  const refsDestDir = path.join(skill.storagePath, 'references');
  let hasReferences = false;
  try {
    const entries = await fs.readdir(refsSrcDir, { withFileTypes: true });
    await fs.mkdir(refsDestDir, { recursive: true });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const lower = ent.name.toLowerCase();
      if (!lower.endsWith('.md') && !lower.endsWith('.txt')) continue;
      const from = path.join(refsSrcDir, ent.name);
      const to = path.join(refsDestDir, ent.name);
      await fs.copyFile(from, to);
      hasReferences = true;
      console.log('Copied reference file to', to);
    }
    if (!hasReferences) {
      await fs.rm(refsDestDir, { recursive: true, force: true });
    }
  } catch {
    console.log('No references/ beside SKILL.md — hasReferences left false');
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
