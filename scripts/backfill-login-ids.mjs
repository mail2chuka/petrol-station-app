import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env.local') });

function slugifyLoginId(input) {
  const normalized = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
  return normalized || 'user';
}

async function generateUniqueLoginId(collection, seed) {
  const base = slugifyLoginId(seed).slice(0, 24);
  let candidate = base;
  let counter = 1;
  while (await collection.findOne({ loginId: candidate })) {
    candidate = `${base}${counter}`;
    counter += 1;
  }
  return candidate;
}

async function backfillForCollection(label, collection) {
  const users = await collection
    .find({ $or: [{ loginId: { $exists: false } }, { loginId: null }, { loginId: '' }] })
    .toArray();

  let updated = 0;
  for (const user of users) {
    const seed = user.name || user.email?.split('@')[0] || 'user';
    const loginId = await generateUniqueLoginId(collection, seed);
    await collection.updateOne({ _id: user._id }, { $set: { loginId } });
    updated += 1;
  }

  console.log(`${label}: updated ${updated} users`);
  return updated;
}

async function run() {
  const fuelUri = process.env.MONGODB_URI_FUEL || process.env.MONGODB_URI;
  const materialsUri = process.env.MONGODB_URI_MATERIALS;

  if (!fuelUri) {
    throw new Error('Missing fuel DB URI (MONGODB_URI_FUEL or MONGODB_URI)');
  }

  let total = 0;

  const fuelConn = await mongoose.createConnection(fuelUri).asPromise();
  total += await backfillForCollection('Fuel users', fuelConn.db.collection('users'));
  await fuelConn.close();

  if (materialsUri) {
    const materialsConn = await mongoose.createConnection(materialsUri).asPromise();
    total += await backfillForCollection('Materials users', materialsConn.db.collection('users'));
    await materialsConn.close();
  } else {
    console.log('Materials DB URI not set; skipped materials backfill.');
  }

  console.log(`Done. Total users updated: ${total}`);
}

run().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
