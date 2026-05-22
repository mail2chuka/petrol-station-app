/**
 * Migration: Rename attendantId/attendantName → supervisorId/supervisorName
 * in existing SalesEntry, PaymentRecord, and DayShift documents.
 *
 * Run once with: node scripts/migrate-rename-attendant-fields.mjs
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not found in .env.local');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
console.log('Connected to MongoDB');

const db = mongoose.connection.db;

// --- SalesEntry ---
const salesResult = await db.collection('salesentries').updateMany(
  { attendantId: { $exists: true } },
  {
    $rename: {
      attendantId: 'supervisorId',
      attendantName: 'supervisorName',
    },
  }
);
console.log(`SalesEntry: renamed fields in ${salesResult.modifiedCount} documents`);

// --- PaymentRecord ---
const paymentsResult = await db.collection('paymentrecords').updateMany(
  { attendantId: { $exists: true } },
  {
    $rename: {
      attendantId: 'supervisorId',
      attendantName: 'supervisorName',
    },
  }
);
console.log(`PaymentRecord: renamed fields in ${paymentsResult.modifiedCount} documents`);

// --- DayShift dispenserAssignments (nested array) ---
// MongoDB $rename doesn't work on array subdocument fields, so use aggregation pipeline.
const dayShiftResult = await db.collection('dayshifts').updateMany(
  { 'dispenserAssignments.attendantId': { $exists: true } },
  [
    {
      $set: {
        dispenserAssignments: {
          $map: {
            input: '$dispenserAssignments',
            as: 'da',
            in: {
              $mergeObjects: [
                '$$da',
                {
                  supervisorId: '$$da.attendantId',
                  supervisorName: '$$da.attendantName',
                },
              ],
            },
          },
        },
      },
    },
    {
      $unset: ['dispenserAssignments.attendantId', 'dispenserAssignments.attendantName'],
    },
  ]
);
console.log(`DayShift: renamed fields in ${dayShiftResult.modifiedCount} documents`);

// Verify no attendantId fields remain
const remaining = await Promise.all([
  db.collection('salesentries').countDocuments({ attendantId: { $exists: true } }),
  db.collection('paymentrecords').countDocuments({ attendantId: { $exists: true } }),
  db.collection('dayshifts').countDocuments({ 'dispenserAssignments.attendantId': { $exists: true } }),
]);
console.log(`Remaining attendantId fields — SalesEntry: ${remaining[0]}, PaymentRecord: ${remaining[1]}, DayShift: ${remaining[2]}`);

await mongoose.disconnect();
console.log('Done.');
