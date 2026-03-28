/**
 * Create "Mille Order File" as a Google Sheet (cake ordering worksheet).
 *
 * Usage:
 *   npx tsx src/scripts/create-mille-order-sheet.ts
 *
 * Requires:
 *   - MongoDB + GoogleConnection (same as other Google scripts)
 *   - Google Sheets API enabled in GCP
 *   - OAuth token with https://www.googleapis.com/auth/spreadsheets
 *     → reconnect Google in Settings after scope change
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { googleWorkspaceService } from '../services/googleWorkspace.service.js';
import { GoogleConnection } from '../models/GoogleConnection.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autoEstate';

const ROWS: string[][] = [
  [
    'Order ID',
    'Order Date',
    'Customer',
    'Phone / Email',
    'Cake Name',
    'Flavor',
    'Size',
    'Servings',
    'Pickup Date',
    'Pickup Time',
    'Decoration Notes',
    'Dietary',
    'Status',
    'Price (HKD)',
    'Payment Status',
    'Payment Amount',
    'Paid Date',
    'Payment Checked',
  ],
  [
    'MILLE-001',
    '2026-03-27',
    'Avery Chan',
    '9123-4567',
    'Mille Crepe Cake',
    'Matcha',
    '8 inch',
    '10',
    '2026-03-29',
    '15:00',
    'Minimal fresh fruit topping',
    'Nut-free',
    'Confirmed',
    '380',
    'Paid',
    '380',
    '2026-03-27',
    'Yes',
  ],
  [
    'MILLE-002',
    '2026-03-27',
    'Jordan Lee',
    '9876-5432',
    'Layer Celebration Cake',
    'Chocolate + salted caramel',
    '10 inch',
    '16',
    '2026-03-30',
    '18:30',
    'Gold leaf accents, birthday candles',
    '—',
    'Pending quote',
    '520',
    'Awaiting payment',
    '—',
    '—',
    'No',
  ],
  [
    'MILLE-003',
    '2026-03-28',
    'Sam Taylor',
    'sam.t@example.com',
    'Custom Sheet Cake',
    'Vanilla strawberry',
    'Half sheet',
    '24',
    '2026-04-02',
    '12:00',
    'Company logo edible print',
    '—',
    'Draft',
    '640',
    '—',
    '—',
    '—',
    'No',
  ],
];

async function run() {
  await mongoose.connect(MONGODB_URI);
  const connection = await GoogleConnection.findOne();
  if (!connection) {
    console.error('No Google connection. Connect Google in the app first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const userId = connection.userId.toString();
  const result = await googleWorkspaceService.createSpreadsheetWithValues(userId, {
    title: 'Mille Order File',
    sheetTitle: 'Cake orders',
    rows: ROWS,
  });

  console.log('\nCreated Google Sheet:');
  console.log(`  Title: ${result.title}`);
  console.log(`  Open:  ${result.spreadsheetUrl}\n`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
