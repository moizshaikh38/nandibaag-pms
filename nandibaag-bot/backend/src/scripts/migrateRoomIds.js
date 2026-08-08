const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { Booking } = require('../models');

const migrateRoomIds = async () => {
  try {
    console.log('[Migration] Starting roomId → roomIds migration...');
    
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    } catch (_) {
      await mongoose.connect('mongodb://127.0.0.1:27017/nandibaag-pms-test', { serverSelectionTimeoutMS: 3000 });
    }
    
    const bookingsToMigrate = await Booking.find({
      $or: [
        { roomIds: { $exists: false } },
        { roomIds: { $size: 0 }, roomId: { $exists: true, $ne: null, $ne: '' } }
      ]
    });
    
    console.log('[Migration] Found', bookingsToMigrate.length, 'bookings to migrate');
    
    let migratedCount = 0;
    for (const booking of bookingsToMigrate) {
      if (booking.roomId && (!booking.roomIds || booking.roomIds.length === 0)) {
        const roomArray = String(booking.roomId)
          .split(',')
          .map(r => r.trim())
          .filter(Boolean);
        
        booking.roomIds = roomArray;
        await booking.save();
        migratedCount++;
        console.log(`[Migration] Migrated booking ${booking._id}: roomIds=[${roomArray.join(', ')}]`);
      }
    }
    
    console.log(`[Migration] ✅ Migration complete! ${migratedCount} bookings updated.`);
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('[Migration] Error:', error.message);
    process.exit(1);
  }
};

migrateRoomIds();
