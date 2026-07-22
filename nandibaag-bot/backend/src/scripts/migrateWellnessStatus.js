/**
 * Migration Script: Convert 'wellness' status to 'maintenance'
 * 
 * This script converts any Room or Series documents with status 'wellness'
 * to status 'maintenance' (the closest equivalent - out of service for a reason).
 * 
 * Run this once after removing wellness from the status enum.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Room, Series } = require('../models');

async function migrateWellnessStatus() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nandibaag';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Migrate Rooms
    const roomResult = await Room.updateMany(
      { status: 'wellness' },
      { $set: { status: 'maintenance' } }
    );
    console.log(`Rooms migrated: ${roomResult.modifiedCount} documents updated`);

    // Migrate Series
    const seriesResult = await Series.updateMany(
      { status: 'wellness' },
      { $set: { status: 'maintenance' } }
    );
    console.log(`Series migrated: ${seriesResult.modifiedCount} documents updated`);

    // Verify no wellness status remains
    const roomWellnessCount = await Room.countDocuments({ status: 'wellness' });
    const seriesWellnessCount = await Series.countDocuments({ status: 'wellness' });

    console.log('\n--- Verification ---');
    console.log(`Rooms with status 'wellness': ${roomWellnessCount}`);
    console.log(`Series with status 'wellness': ${seriesWellnessCount}`);

    if (roomWellnessCount === 0 && seriesWellnessCount === 0) {
      console.log('\n✅ Migration successful: No wellness status remaining');
    } else {
      console.log('\n⚠️  Migration incomplete: Some wellness status still exists');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the migration
migrateWellnessStatus();
