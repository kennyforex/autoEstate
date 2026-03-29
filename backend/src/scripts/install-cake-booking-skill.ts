/**
 * One-off: register Cake Booking skill from backend/skills/cake-booking/SKILL.md
 *
 *   npx tsx src/scripts/install-cake-booking-skill.ts
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { skillService } from '../services/skill.service.js';
import { GoogleConnection } from '../models/GoogleConnection.js';
import { Skill } from '../models/Skill.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autoEstate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await mongoose.connect(MONGODB_URI);
  const conn = await GoogleConnection.findOne();
  if (!conn) {
    console.error('No GoogleConnection — use any user with Skills access. Add a user id manually if needed.');
    await mongoose.disconnect();
    process.exit(1);
  }
  const userId = conn.userId.toString();
  const mdPath = path.join(__dirname, '../../skills/cake-booking/SKILL.md');
  const content = await fs.readFile(mdPath, 'utf-8');
  const skill = await skillService.installFromMarkdown(content, userId);
  await Skill.updateOne(
    { slug: 'cake-booking' },
    {
      $set: {
        requiredTools: [
          'document_data_capture',
          'google_drive',
          'google_sheets',
          'google_calendar',
          'google_gmail',
        ],
      },
    },
  );
  console.log('Installed skill:', skill.slug, skill.name, '\nstoragePath:', skill.storagePath);
  console.log(
    'requiredTools: document_data_capture, google_drive, google_sheets, google_calendar, google_gmail',
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
