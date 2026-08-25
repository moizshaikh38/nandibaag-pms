const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Booking = require('../src/models/Booking');

const cleanup = async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
      console.error('❌ No MONGODB_URI or MONGO_URI found in .env');
      process.exit(1);
    }
    await mongoose.connect(uri);

    console.log('\n' + '═'.repeat(70));
    console.log('🧹 CLEANING UP BROKEN BOOKINGS');
    console.log('═'.repeat(70) + '\n');

    // Find bookings: confirmed status BUT no roomIds
    const broken = await Booking.find({
      status: { $in: ['confirmed', 'pending_payment', 'checked_in'] }, // Include other active statuses
      $and: [
        { $or: [{ roomIds: { $exists: false } }, { roomIds: { $size: 0 } }, { roomIds: null }, { roomIds: ["NO-ROOM"] }, { roomIds: "NO-ROOM" }] },
        { $or: [{ roomId: { $exists: false } }, { roomId: null }, { roomId: "NO-ROOM" }, { roomId: "" }] }
      ],
      $or: [
        { bookingType: { $in: ['couple', 'group', 'overnight'] } },
        { packageType: { $in: ['couple', 'group', 'overnight'] } }
      ]
    }).lean();

    console.log(`Found ${broken.length} broken bookings\n`);

    if (broken.length > 0) {
      console.log('Bookings to DELETE:');
      broken.forEach((b, idx) => {
        console.log(`${idx + 1}. ${b.customerName}`);
        console.log(`   Type: ${b.bookingType || b.packageType}`);
        console.log(`   Date: ${new Date(b.checkInDate).toISOString().split('T')[0]}`);
        console.log(`   Rooms: NONE\n`);
      });

      // Delete broken bookings
      const result = await Booking.deleteMany({
        status: { $in: ['confirmed', 'pending_payment', 'checked_in'] },
        $and: [
          { $or: [{ roomIds: { $exists: false } }, { roomIds: { $size: 0 } }, { roomIds: null }, { roomIds: ["NO-ROOM"] }, { roomIds: "NO-ROOM" }] },
          { $or: [{ roomId: { $exists: false } }, { roomId: null }, { roomId: "NO-ROOM" }, { roomId: "" }] }
        ],
        $or: [
          { bookingType: { $in: ['couple', 'group', 'overnight'] } },
          { packageType: { $in: ['couple', 'group', 'overnight'] } }
        ]
      });

      console.log(`\n✅ Deleted ${result.deletedCount} broken bookings`);
    } else {
      console.log('✅ No broken bookings found - Database is clean!');
    }

    console.log('\n' + '═'.repeat(70) + '\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

cleanup();
