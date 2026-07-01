import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf8');
for (const line of envRaw.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const APPLY = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const col = db.collection('dayshifts');

  // Find any (stationId, date) that appears more than once across the whole collection.
  const dupes = await col.aggregate([
    { $group: { _id: { stationId: '$stationId', date: '$date' }, count: { $sum: 1 }, ids: { $push: '$_id' }, statuses: { $push: '$status' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { '_id.date': 1 } },
  ]).toArray();

  console.log(`Duplicate (stationId, date) groups found: ${dupes.length}`);
  for (const d of dupes) {
    console.log(`  station=${d._id.stationId} date=${d._id.date?.toISOString?.()} count=${d.count} statuses=[${d.statuses.join(', ')}] ids=[${d.ids.join(', ')}]`);
  }

  if (dupes.length > 0) {
    console.log('\n⚠ Cannot build unique index while duplicates remain. Resolve the groups above first.');
    process.exit(dupes.length ? 2 : 0);
  }

  if (!APPLY) {
    console.log('\nNo duplicates. DRY RUN — re-run with --apply to build the unique index.');
    process.exit(0);
  }

  const name = await col.createIndex({ stationId: 1, date: 1 }, { unique: true });
  console.log(`\n✅ Unique index built: ${name}`);
  const idx = await col.indexes();
  console.log('Current indexes:', idx.map(i => `${i.name}${i.unique ? ' (unique)' : ''}`).join(', '));

  await mongoose.connection.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
