const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Booking = require('../src/models/Booking');
const Room = require('../src/models/Room');

const cleanupGhost = async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    await mongoose.connect(uri);

    console.log('\n' + '═'.repeat(70));
    console.log('🧹 CLEANING UP GHOST BOOKINGS');
    console.log('═'.repeat(70) + '\n');

    let totalCleaned = 0;

    // Issue 1: Overnight bookings with empty roomIds
    const emptyRoomBookings = await Booking.find({
      $or: [
        { roomIds: { $exists: false } },
        { roomIds: { $size: 0 } },
        { roomIds: null }
      ],
      $or: [
        { bookingType: { $in: ['couple', 'group', 'overnight'] } },
        { packageType: { $in: ['couple', 'group', 'overnight'] } }
      ],
      status: { $in: ['confirmed', 'pending_payment'] }
    }).lean();

    if (emptyRoomBookings.length > 0) {
      console.log(`Found ${emptyRoomBookings.length} overnight bookings with no rooms:\n`);
      emptyRoomBookings.forEach(b => {
        console.log(`  - ${b.customerName} (${b.bookingType || b.packageType}) | ${new Date(b.checkInDate).toISOString().split('T')[0]}`);
      });

      const delResult = await Booking.deleteMany({
        _id: { $in: emptyRoomBookings.map(b => b._id) }
      });
      totalCleaned += delResult.deletedCount;
      console.log(`\n✅ Deleted ${delResult.deletedCount} empty-room bookings\n`);
    } else {
      console.log('✅ No overnight bookings with empty rooms\n');
    }

    // Issue 2: Bookings with invalid (non-existent) room IDs
    console.log('CHECKING FOR INVALID ROOM IDs:');
    console.log('─'.repeat(70) + '\n');

    const allBookings = await Booking.find({
      status: { $in: ['confirmed', 'pending_payment', 'checked_in'] },
      roomIds: { $exists: true, $ne: [] }
    }).lean();

    let invalidCount = 0;

    for (const booking of allBookings) {
      const validIds = booking.roomIds.filter(id => mongoose.Types.ObjectId.isValid(id));
      
      if (validIds.length < booking.roomIds.length) {
        const invalidIds = booking.roomIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
        console.log(`⚠️  ${booking.customerName}: Non-ObjectId room IDs: ${invalidIds.join(', ')}`);
        invalidCount++;
        continue;
      }

      const rooms = await Room.find({ _id: { $in: validIds } }).select('_id').lean();

      if (rooms.length !== booking.roomIds.length) {
        const existingIds = new Set(rooms.map(r => r._id.toString()));
        const missing = booking.roomIds.filter(id => !existingIds.has(id.toString()));
        console.log(`⚠️  ${booking.customerName}: ${missing.length} room(s) don't exist: ${missing.join(', ')}`);
        invalidCount++;
      }
    }

    if (invalidCount === 0) {
      console.log('✅ All room IDs in bookings are valid\n');
    } else {
      console.log(`\n⚠️  ${invalidCount} booking(s) have invalid room IDs (manual review needed)\n`);
    }

    // Issue 3: Check RoomBooking collection for orphaned entries
    console.log('CHECKING FOR ORPHANED ROOM BOOKINGS:');
    console.log('─'.repeat(70) + '\n');

    const { RoomBooking } = require('../src/models');
    const allRoomBookings = await RoomBooking.find({
      status: { $in: ['confirmed', 'checked_in'] }
    }).lean();

    let orphanedCount = 0;
    for (const rb of allRoomBookings) {
      const parentBooking = await Booking.findById(rb.bookingId).select('_id status').lean();
      if (!parentBooking || ['cancelled', 'checked_out'].includes(parentBooking.status)) {
        console.log(`👻 Orphaned RoomBooking: room ${rb.roomId} | booking ${rb.bookingId} | ${parentBooking ? 'status: ' + parentBooking.status : 'booking DELETED'}`);
        orphanedCount++;
      }
    }

    if (orphanedCount > 0) {
      console.log(`\n⚠️  ${orphanedCount} orphaned RoomBooking entries found`);
      console.log('   Deleting orphaned entries to unblock availability grid...\n');

      // Collect orphaned IDs
      const orphanedIds = [];
      for (const rb of allRoomBookings) {
        const parentBooking = await Booking.findById(rb.bookingId).select('_id status').lean();
        if (!parentBooking || ['cancelled', 'checked_out'].includes(parentBooking.status)) {
          orphanedIds.push(rb._id);
        }
      }

      const delResult = await RoomBooking.deleteMany({ _id: { $in: orphanedIds } });
      console.log(`✅ Deleted ${delResult.deletedCount} orphaned RoomBooking entries\n`);
      totalCleaned += delResult.deletedCount;
    } else {
      console.log('✅ No orphaned RoomBooking entries\n');
    }

    // Summary
    console.log('═'.repeat(70));
    console.log('📊 CLEANUP RESULTS');
    console.log('═'.repeat(70));

    console.log(`\nBookings deleted (empty rooms): ${totalCleaned}`);
    console.log(`Bookings with invalid room IDs: ${invalidCount}`);
    console.log(`Orphaned RoomBooking entries: ${orphanedCount}`);

    if (totalCleaned === 0 && invalidCount === 0 && orphanedCount === 0) {
      console.log('\n🎉 No ghost bookings found! System is clean.');
    }

    console.log('\n' + '═'.repeat(70) + '\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

cleanupGhost();
