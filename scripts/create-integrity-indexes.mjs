// Run with --apply after reviewing the read-only duplicate check.
import mongoose from 'mongoose';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
try {
  const db = mongoose.connection.db;
  const sales = db.collection('salesentries');
  const payments = db.collection('paymentrecords');
  const duplicateSales = await sales.aggregate([
    { $group: { _id: { dayShiftId: '$dayShiftId', dispenserId: '$dispenserId', supervisorId: '$supervisorId' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).toArray();
  const duplicateRequests = await payments.aggregate([
    { $match: { requestId: { $type: 'string' } } },
    { $group: { _id: { stationId: '$stationId', requestId: '$requestId' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).toArray();
  if (duplicateSales.length || duplicateRequests.length) throw new Error('Duplicate business keys exist; resolve them before indexing.');
  if (!process.argv.includes('--apply')) {
    console.log('No duplicate business keys found. Pass --apply to create unique indexes.');
  } else {
    const salesKey = { dayShiftId: 1, dispenserId: 1, supervisorId: 1 };
    const paymentKey = { stationId: 1, requestId: 1 };
    const salesExisting = (await sales.indexes()).find(index => index.unique && JSON.stringify(index.key) === JSON.stringify(salesKey));
    const paymentExisting = (await payments.indexes()).find(index => index.unique &&
      JSON.stringify(index.key) === JSON.stringify(paymentKey) &&
      index.partialFilterExpression?.requestId?.$type === 'string');
    const salesIndex = salesExisting?.name || await sales.createIndex(salesKey,
      { unique: true, name: 'dayShiftId_1_dispenserId_1_supervisorId_1' });
    const paymentIndex = paymentExisting?.name || await payments.createIndex(paymentKey,
      { unique: true, partialFilterExpression: { requestId: { $type: 'string' } }, name: 'stationId_1_requestId_1' });
    console.log(JSON.stringify({ salesIndex, paymentIndex }));
  }
} finally {
  await mongoose.disconnect();
}
