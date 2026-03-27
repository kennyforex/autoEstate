/**
 * Test script for Google Workspace integration.
 *
 * Usage:
 *   npx tsx src/scripts/test-google-integration.ts
 *
 * Requires:
 *   - MongoDB running with a connected Google account
 *   - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET set in .env
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { googleWorkspaceService } from '../services/googleWorkspace.service.js';
import { GoogleConnection } from '../models/GoogleConnection.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autoEstate';

let passed = 0;
let failed = 0;

function log(label: string, status: 'PASS' | 'FAIL', detail?: string) {
  const icon = status === 'PASS' ? '✅' : '❌';
  passed += status === 'PASS' ? 1 : 0;
  failed += status === 'FAIL' ? 1 : 0;
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function run() {
  console.log('═══════════════════════════════════════════');
  console.log('  Google Workspace Integration Test Suite  ');
  console.log('═══════════════════════════════════════════\n');

  // ── Connect to DB ──
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // ── 1. Find a connected Google account ──
  const connection = await GoogleConnection.findOne();
  if (!connection) {
    console.log('❌ No Google connection found in DB. Connect an account first.');
    await mongoose.disconnect();
    process.exit(1);
  }
  const userId = connection.userId.toString();
  log('1. GoogleConnection exists', 'PASS', `userId=${userId}, email=${connection.email}`);

  // ── 2. isConnected check ──
  const connected = await googleWorkspaceService.isConnected(userId);
  log('2. isConnected()', connected ? 'PASS' : 'FAIL', `${connected}`);

  // ── 3. Gmail: Search Inbox ──
  try {
    const messages = await googleWorkspaceService.getInbox(userId, { query: 'is:inbox', maxResults: 3 });
    log('3. Gmail — getInbox()', 'PASS', `${messages.length} message(s) returned`);
    if (messages.length > 0) {
      console.log(`   └─ Latest: "${messages[0].subject}" from ${messages[0].from}`);
    }
  } catch (err: any) {
    log('3. Gmail — getInbox()', 'FAIL', err.message);
  }

  // ── 4. Gmail: Read a message ──
  try {
    const inbox = await googleWorkspaceService.getInbox(userId, { maxResults: 1 });
    if (inbox.length > 0) {
      const msg = await googleWorkspaceService.getMessage(userId, inbox[0].id!);
      log('4. Gmail — getMessage()', 'PASS', `Subject: "${msg.subject}", body length: ${msg.body.length}`);
    } else {
      log('4. Gmail — getMessage()', 'PASS', 'Skipped (empty inbox)');
    }
  } catch (err: any) {
    log('4. Gmail — getMessage()', 'FAIL', err.message);
  }

  // ── 5. Calendar: List Events ──
  try {
    const events = await googleWorkspaceService.listEvents(userId, { maxResults: 5 });
    log('5. Calendar — listEvents()', 'PASS', `${events.length} event(s) returned`);
    if (events.length > 0) {
      console.log(`   └─ Next: "${events[0].summary}" at ${events[0].start}`);
    }
  } catch (err: any) {
    log('5. Calendar — listEvents()', 'FAIL', err.message);
  }

  // ── 6. Calendar: Get Today's Agenda ──
  try {
    const agenda = await googleWorkspaceService.getAgenda(userId);
    log('6. Calendar — getAgenda()', 'PASS', `${agenda.length} event(s) today`);
  } catch (err: any) {
    log('6. Calendar — getAgenda()', 'FAIL', err.message);
  }

  // ── 7. Drive: List Files ──
  try {
    const files = await googleWorkspaceService.listFiles(userId, { pageSize: 5 });
    log('7. Drive — listFiles()', 'PASS', `${files.length} file(s) returned (sorted by modified time)`);
    for (let i = 0; i < Math.min(files.length, 5); i++) {
      const f = files[i];
      const link = f.webViewLink ? `\n      ${f.webViewLink}` : '';
      console.log(`   ${i + 1}. "${f.name}" (${f.mimeType})${link}`);
    }
  } catch (err: any) {
    log('7. Drive — listFiles()', 'FAIL', err.message);
  }

  // ── 8. Sheets: Read cells (first Google Sheet from recent Drive files) ──
  try {
    const files = await googleWorkspaceService.listFiles(userId, { pageSize: 20 });
    const sheet = files.find((f) => f.mimeType === 'application/vnd.google-apps.spreadsheet');
    if (!sheet?.id) {
      log('8. Sheets — getSpreadsheetValues()', 'PASS', 'Skipped (no spreadsheet in recent files)');
    } else {
      const values = await googleWorkspaceService.getSpreadsheetValues(userId, sheet.id, 'A1:C5');
      log(
        '8. Sheets — getSpreadsheetValues()',
        'PASS',
        `"${sheet.name}" A1:C5 → ${values.length} row(s)`,
      );
      if (values.length > 0) {
        console.log(`   └─ Sample row: ${JSON.stringify(values[0])}`);
      }
    }
  } catch (err: any) {
    log('8. Sheets — getSpreadsheetValues()', 'FAIL', err.message);
  }

  // ── 9. Gmail: Send Test Email (to self) ──
  try {
    const result = await googleWorkspaceService.sendEmail(userId, {
      to: connection.email,
      subject: `[autoEstate Test] Integration Test — ${new Date().toLocaleString()}`,
      body: 'This is an automated test email from the autoEstate Google Workspace integration.\n\nIf you received this, the Gmail send API is working correctly.',
    });
    log('9. Gmail — sendEmail()', 'PASS', `Sent to self (id: ${result.id})`);
  } catch (err: any) {
    log('9. Gmail — sendEmail()', 'FAIL', err.message);
  }

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═══════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
