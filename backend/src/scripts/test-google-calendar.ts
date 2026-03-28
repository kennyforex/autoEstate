/**
 * Exercise Calendar API: create → list → update → delete.
 *
 * Usage (from backend/):
 *   npx tsx src/scripts/test-google-calendar.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { googleWorkspaceService } from '../services/googleWorkspace.service.js';
import { GoogleConnection } from '../models/GoogleConnection.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autoEstate';

async function run() {
  await mongoose.connect(MONGODB_URI);
  const connection = await GoogleConnection.findOne();
  if (!connection) {
    console.error('No Google connection. Connect Google in the app first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const userId = connection.userId.toString();
  const label = `[autoEstate test ${Date.now()}]`;

  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(14, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  console.log('\n1) create_event');
  const created = await googleWorkspaceService.createEvent(userId, {
    summary: `${label} original title`,
    startTime: startIso,
    endTime: endIso,
    description: 'autoEstate calendar test — create',
    location: 'Test location A',
  });
  console.log('   id:', created.id, 'link:', created.htmlLink);

  console.log('\n2) list_events (search window around event)');
  const timeMin = new Date(start.getTime() - 60 * 60 * 1000).toISOString();
  const timeMax = new Date(end.getTime() + 60 * 60 * 1000).toISOString();
  const listed = await googleWorkspaceService.listEvents(userId, { timeMin, timeMax, maxResults: 20 });
  const found = listed.find((e) => e.id === created.id);
  if (!found) {
    console.error('   FAIL: created event not in list');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('   found:', found.summary, '|', found.start);

  console.log('\n3) update_event');
  const updated = await googleWorkspaceService.updateEvent(userId, created.id!, {
    summary: `${label} edited title`,
    description: 'autoEstate calendar test — updated',
    location: 'Test location B',
  });
  console.log('   summary:', updated.summary);

  console.log('\n4) delete_event');
  await googleWorkspaceService.deleteEvent(userId, created.id!);
  console.log('   deleted:', created.id);

  console.log('\nAll calendar steps OK.\n');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
