/**
 * Migration script: Convert all 'attendant' users to 'supervisor' role
 * 
 * Run once to update existing user records to new role structure.
 * Usage: node scripts/migrate-attendants-to-supervisors.mjs
 */

import mongoose from 'mongoose';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

async function migrateAttendants() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('users');

    console.log('\nMigration Summary:');
    console.log('-'.repeat(50));

    // Count before
    const countBefore = await collection.countDocuments({ role: 'attendant' });
    console.log(`Users with 'attendant' role: ${countBefore}`);

    if (countBefore === 0) {
      console.log('No attendant users to migrate');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Perform migration
    console.log('\nMigrating attendants to supervisors...');
    const result = await collection.updateMany(
      { role: 'attendant' },
      { $set: { role: 'supervisor' } }
    );

    console.log(`Updated: ${result.modifiedCount} users`);
    console.log(`Matched: ${result.matchedCount} users`);

    // Verify migration
    const countAfter = await collection.countDocuments({ role: 'supervisor' });
    const countStillAttendant = await collection.countDocuments({ role: 'attendant' });
    
    console.log(`\nAfter Migration:`);
    console.log(`Users with 'supervisor' role: ${countAfter}`);
    console.log(`Users with 'attendant' role: ${countStillAttendant}`);

    if (countStillAttendant === 0) {
      console.log('\nMigration completed successfully');
    } else {
      console.warn(`\nWarning: ${countStillAttendant} attendant users remain`);
    }

    console.log('-'.repeat(50));
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

migrateAttendants();
