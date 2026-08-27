const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Booking = require('../src/models/Booking');
const Room = require('../src/models/Room');

const syncBookings = async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    await mongoose.connect(uri);

    console.log('\n' + '═'.repeat(70));
    console.log('🔄 SYNCING MANUAL BOOKINGS TO AVAILABILITY');
    console.log('═'.repeat(70) + '\n');

    // STEP 1: Get all confirmed bookings with rooms
    const bookingsWithRooms = await Booking.find({
      status: { $in: ['confirmed', 'pending_payment', 'checked_in'] },
      roomIds: { $exists: true, $ne: [] }
    }).lean();

    console.log(`Found ${bookingsWithRooms.length} active bookings with rooms\n`);

    let syncedCount = 0;
    let issueCount = 0;

    // STEP 2: Verify each booking's rooms exist
    for (const booking of bookingsWithRooms) {
      const checkIn = new Date(booking.checkInDate).toISOString().split('T')[0];
      const checkOut = new Date(booking.checkOutDate).toISOString().split('T')[0];

      console.log(`Checking: ${booking.customerName}`);
      console.log(`  Dates: ${checkIn} → ${checkOut}`);
      console.log(`  Room IDs: ${booking.roomIds.join(', ')}`);

      // Verify rooms exist in the Room collection
      const validIds = booking.roomIds.filter(id => mongoose.Types.ObjectId.isValid(id));
      const rooms = await Room.find({ _id: { $in: validIds } }).select('roomNumber').lean();

      const roomNumbers = rooms.map(r => r.roomNumber);
      console.log(`  Room Numbers: ${roomNumbers.join(', ') || 'NONE FOUND'}`);

      if (rooms.length !== booking.roomIds.length) {
        const invalidIds = booking.roomIds.filter(id => !rooms.find(r => r._id.toString() === id.toString()));
        console.log(`  ⚠️  ${booking.roomIds.length - rooms.length} room ID(s) are INVALID: ${invalidIds.join(', ')}`);
        issueCount++;
      } else {
        console.log(`  ✅ All ${rooms.length} rooms valid`);
        syncedCount++;
      }
      console.log('');
    }

    // STEP 3: Check for ghost entries
    console.log('\nCHECKING FOR GHOST BOOKINGS:');
    console.log('─'.repeat(70) + '\n');

    // Find bookings with non-existent room IDs
    const allActive = await Booking.find({
      status: { $in: ['confirmed', 'pending_payment', 'checked_in'] }
    }).lean();

    let ghostCount = 0;
    for (const b of allActive) {
      if (!b.roomIds || b.roomIds.length === 0) continue;

      for (const rid of b.roomIds) {
        if (!mongoose.Types.ObjectId.isValid(rid)) {
          console.log(`👻 Ghost ID: "${rid}" in booking for ${b.customerName}`);
          ghostCount++;
          continue;
        }
        const exists = await Room.findById(rid).select('_id').lean();
        if (!exists) {
          console.log(`👻 Ghost ID: "${rid}" in booking for ${b.customerName} - Room NOT in DB`);
          ghostCount++;
        }
      }
    }

    if (ghostCount === 0) {
      console.log('✅ No ghost room IDs found!\n');
    } else {
      console.log(`\n⚠️  Found ${ghostCount} ghost room ID(s)\n`);
    }

    // STEP 4: Summary
    console.log('═'.repeat(70));
    console.log('📊 SYNC RESULTS');
    console.log('═'.repeat(70));

    const allRooms = await Room.find({ status: 'active' }).lean();
    console.log(`\nTotal active rooms: ${allRooms.length}`);
    console.log(`Bookings synced: ${syncedCount}`);
    console.log(`Bookings with issues: ${issueCount}`);
    console.log(`Ghost room IDs: ${ghostCount}`);

    if (issueCount === 0 && ghostCount === 0) {
      console.log('\n🎉 All bookings are properly synced!');
    } else {
      console.log(`\n⚠️  Run 'npm run cleanup-ghost' to fix issues`);
    }

    console.log('\n' + '═'.repeat(70) + '\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

syncBookings();
