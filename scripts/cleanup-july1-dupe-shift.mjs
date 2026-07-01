import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf8');
for (const line of envRaw.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const KEEP_ID = '6a44f6ad77cac2169f26acff';   // ended, complete
const DELETE_ID = '6a45238902a5f76284a9e61b'; // in_progress, stray duplicate
const APPLY = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const col = db.collection('dayshifts');

  const keep = await col.findOne({ _id: new mongoose.Types.ObjectId(KEEP_ID) });
  const del = await col.findOne({ _id: new mongoose.Types.ObjectId(DELETE_ID) });

  if (!del) { console.log('Target already gone — nothing to delete.'); process.exit(0); }
  console.log(`KEEP  : ${KEEP_ID} status=${keep?.status} tolerance=${keep?.tolerancePercent}`);
  console.log(`DELETE: ${DELETE_ID} status=${del.status} tolerance=${del.tolerancePercent}`);

  // Safety guards: never delete an ended shift; never delete the keep target.
  if (del.status === 'ended') { console.error('ABORT: target is ended, refusing to delete.'); process.exit(1); }
  if (DELETE_ID === KEEP_ID) { console.error('ABORT: delete id equals keep id.'); process.exit(1); }

  const backupPath = join(__dirname, `backup-dayshift-${DELETE_ID}.json`);
  writeFileSync(backupPath, JSON.stringify(del, null, 2));
  console.log(`Backup written: ${backupPath}`);

  if (!APPLY) {
    console.log('\nDRY RUN — no deletion performed. Re-run with --apply to delete.');
    process.exit(0);
  }

  const res = await col.deleteOne({ _id: new mongoose.Types.ObjectId(DELETE_ID) });
  console.log(`\nDeleted ${res.deletedCount} document(s).`);

  const remaining = await col.find({
    stationId: keep.stationId,
    date: { $gte: new Date('2026-07-01T00:00:00.000Z'), $lte: new Date('2026-07-01T23:59:59.999Z') },
  }).toArray();
  console.log(`Remaining July 1 shifts for station: ${remaining.length}`);
  remaining.forEach(d => console.log(`   ${d._id} status=${d.status}`));

  await mongoose.connection.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
