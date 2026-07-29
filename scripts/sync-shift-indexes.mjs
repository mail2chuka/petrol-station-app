// Phase 1 of multi-shift support: widen the unique indexes on dayshifts,
// tankstockentries, meterreadings and attendantassignments to include the
// new shift-scoping field, and drop the old narrower unique index.
//
// Safe to run any time — existing data (no shiftKey/dayShiftId set) already
// satisfies the wider index, since there's currently at most one row per
// the old narrower key. Dry-run by default; pass --apply to actually change
// indexes. Must be run (with --apply) BEFORE Phase 2 ships, otherwise the
// old narrower unique index will reject legitimate same-day multi-shift
// writes with a duplicate-key error.
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

const TARGETS = [
  { collection: 'dayshifts', oldKey: { stationId: 1, date: 1 }, newKey: { stationId: 1, date: 1, shiftKey: 1 } },
  { collection: 'tankstockentries', oldKey: { stationId: 1, tankId: 1, date: 1, period: 1 }, newKey: { stationId: 1, tankId: 1, date: 1, period: 1, dayShiftId: 1 } },
  { collection: 'meterreadings', oldKey: { stationId: 1, pumpId: 1, date: 1 }, newKey: { stationId: 1, pumpId: 1, date: 1, dayShiftId: 1 } },
  { collection: 'attendantassignments', oldKey: { stationId: 1, date: 1, dispenserId: 1 }, newKey: { stationId: 1, date: 1, dispenserId: 1, dayShiftId: 1 } },
];

function sameKey(a, b) {
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k, i) => k === bk[i] && a[k] === b[k]);
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI_FUEL || process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  for (const t of TARGETS) {
    const col = db.collection(t.collection);
    const indexes = await col.indexes();

    const oldIdx = indexes.find((i) => sameKey(i.key, t.oldKey) && i.unique);
    const newIdx = indexes.find((i) => sameKey(i.key, t.newKey) && i.unique);

    console.log(`\n${t.collection}:`);
    console.log(`  old unique index (${JSON.stringify(t.oldKey)}): ${oldIdx ? oldIdx.name : 'not found'}`);
    console.log(`  new unique index (${JSON.stringify(t.newKey)}): ${newIdx ? newIdx.name + ' (already exists)' : 'not found'}`);

    if (!APPLY) continue;

    if (!newIdx) {
      const name = await col.createIndex(t.newKey, { unique: true });
      console.log(`  ✅ created ${name}`);
    }
    if (oldIdx) {
      await col.dropIndex(oldIdx.name);
      console.log(`  🗑  dropped old index ${oldIdx.name}`);
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to create the new indexes and drop the old ones.');
  }

  await mongoose.connection.close();
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
