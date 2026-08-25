const mongoose = require('mongoose');
const path = require('path');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Booking = require('../src/models/Booking');
const Room = require('../src/models/Room');
const { getDetailedAvailabilityMessage } = require('../src/services/availabilityService');

const debugAvailabilityIssue = async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
      console.error('❌ No MONGODB_URI or MONGO_URI found in .env');
      process.exit(1);
    }
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    console.log('\n' + '═'.repeat(70));
    console.log('🔍 DEBUGGING AVAILABILITY ISSUE');
    console.log('═'.repeat(70) + '\n');

    // TEST DATES
    const testDate = new Date('2026-09-26'); // Sept 26 (problematic date)
    const testDate2 = new Date('2026-09-27');

    console.log('📅 TEST CASE: Sept 26-27 (Customer says "rooms booked" but shouldn\'t be)\n');

    // STEP 1: Check total rooms
    console.log('STEP 1: Total Rooms in System');
    console.log('─'.repeat(70));

    const allRooms = await Room.find().select('_id roomNumber capacity status').lean();
    console.log(`Total rooms: ${allRooms.length}`);
    if (allRooms.length === 0) {
      console.log('⚠️  NO ROOMS IN DATABASE — This is likely the root cause!');
    } else {
      console.log('Room Numbers:', allRooms.map(r => r.roomNumber).filter(Boolean).join(', '));
      allRooms.slice(0, 10).forEach(r => {
        console.log(`  Room #${r.roomNumber || 'N/A'} | Capacity: ${r.capacity || 'N/A'} | Status: ${r.status || 'N/A'} | ID: ${r._id}`);
      });
      if (allRooms.length > 10) console.log(`  ... and ${allRooms.length - 10} more rooms.`);
    }

    // STEP 2: Check bookings for Sept 26-27
    console.log('\n\nSTEP 2: All Bookings for Sept 26-27');
    console.log('─'.repeat(70));

    const allBookings = await Booking.find({
      checkInDate: { $lte: testDate2 },
      checkOutDate: { $gte: testDate }
    })
      .select('_id customerName checkInDate checkOutDate roomIds roomId bookingType status packageType')
      .lean();

    console.log(`Total bookings overlapping Sept 26-27: ${allBookings.length}\n`);

    if (allBookings.length === 0) {
      console.log('✅ NO BOOKINGS - Database is empty for this range, should show AVAILABLE');
    } else {
      allBookings.forEach((booking, idx) => {
        console.log(`\nBooking #${idx + 1}:`);
        console.log(`  ID: ${booking._id}`);
        console.log(`  Customer: ${booking.customerName}`);
        console.log(`  Check-in: ${new Date(booking.checkInDate).toISOString().split('T')[0]}`);
        console.log(`  Check-out: ${new Date(booking.checkOutDate).toISOString().split('T')[0]}`);
        console.log(`  Booking Type: ${booking.bookingType}`);
        console.log(`  Package Type: ${booking.packageType || 'N/A'}`);
        console.log(`  Status: ${booking.status}`);
        console.log(`  Room IDs (roomIds): ${booking.roomIds && booking.roomIds.length > 0 ? booking.roomIds.join(', ') : 'NONE/EMPTY'}`);
        console.log(`  Room ID (roomId): ${booking.roomId || 'NONE'}`);
        console.log(`  Has Room Assignment? ${(booking.roomIds && booking.roomIds.length > 0) || booking.roomId ? 'YES ✅' : 'NO ❌'}`);
      });
    }

    // STEP 3: Check with NEW filter (roomIds must exist)
    console.log('\n\nSTEP 3: Bookings with Room Assignments (New Filter)');
    console.log('─'.repeat(70));

    const bookingsWithRooms = await Booking.find({
      checkInDate: { $lte: testDate2 },
      checkOutDate: { $gte: testDate },
      $or: [
        { roomIds: { $exists: true, $not: { $size: 0 } } },
        { roomId: { $exists: true, $ne: null } }
      ]
    })
      .select('_id customerName checkInDate checkOutDate roomIds roomId status')
      .lean();

    console.log(`Bookings WITH room assignments: ${bookingsWithRooms.length}\n`);

    if (bookingsWithRooms.length === 0) {
      console.log('✅ NO BOOKINGS WITH ROOMS - Availability should be 100%');
    } else {
      bookingsWithRooms.forEach((b, idx) => {
        const rooms = b.roomIds && b.roomIds.length > 0 ? b.roomIds.join(',') : (b.roomId || 'N/A');
        console.log(`  Booking #${idx + 1}: ${b.customerName} | Status: ${b.status} | Rooms: ${rooms}`);
      });
    }

    // STEP 4: Check bookings WITHOUT room assignments (one-day)
    console.log('\n\nSTEP 4: Bookings WITHOUT Room Assignments (One-Day Picnic)');
    console.log('─'.repeat(70));

    const bookingsWithoutRooms = await Booking.find({
      checkInDate: { $lte: testDate2 },
      checkOutDate: { $gte: testDate },
      $and: [
        { $or: [{ roomIds: { $exists: false } }, { roomIds: { $size: 0 } }, { roomIds: null }] },
        { $or: [{ roomId: { $exists: false } }, { roomId: null }] }
      ]
    })
      .select('_id customerName bookingType packageType status')
      .lean();

    console.log(`Bookings WITHOUT room assignments: ${bookingsWithoutRooms.length}\n`);

    if (bookingsWithoutRooms.length > 0) {
      console.log('⚠️  These are one-day picnics (should NOT affect availability):');
      bookingsWithoutRooms.forEach(b => {
        console.log(`  - ${b.customerName} (${b.bookingType || 'N/A'} / ${b.packageType || 'N/A'}) [${b.status}]`);
      });
    }

    // STEP 5: Calculate available rooms
    console.log('\n\nSTEP 5: Available Rooms Calculation');
    console.log('─'.repeat(70));

    const bookedRoomIds = new Set();

    bookingsWithRooms.forEach(booking => {
      if (booking.roomIds && Array.isArray(booking.roomIds)) {
        booking.roomIds.forEach(roomId => {
          bookedRoomIds.add(roomId.toString());
        });
      }
      if (booking.roomId) {
        bookedRoomIds.add(booking.roomId.toString());
      }
    });

    console.log(`Booked rooms: ${bookedRoomIds.size}`);
    console.log(`Booked room IDs: ${Array.from(bookedRoomIds).join(', ') || 'NONE'}`);

    const availableRooms = allRooms.filter(room => !bookedRoomIds.has(room._id.toString()));

    console.log(`\nAvailable rooms: ${availableRooms.length}`);
    console.log(`Available room numbers: ${availableRooms.map(r => r.roomNumber || r._id).join(', ') || 'ALL'}`);

    // STEP 6: Call availability function and compare
    console.log('\n\nSTEP 6: Availability Service Output');
    console.log('─'.repeat(70));

    try {
      const availMsg = await getDetailedAvailabilityMessage(testDate, testDate2, 'couple');
      console.log('Function returned:');
      if (typeof availMsg === 'object') {
        console.log(`  Available for Overnight: ${availMsg.availableForOvernight}`);
        console.log(`  Total Rooms: ${availMsg.totalRooms}`);
        console.log(`  Booked Rooms: ${availMsg.bookedRooms}`);
        console.log(`  Message: ${(availMsg.message || JSON.stringify(availMsg)).substring(0, 200)}...`);
      } else {
        console.log(`  Result: ${String(availMsg).substring(0, 300)}`);
      }
    } catch (error) {
      console.log(`❌ Error calling availability function: ${error.message}`);
      console.log(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n   ')}`);
    }

    // STEP 6B: Also test with checkOvernightAvailability directly
    console.log('\n\nSTEP 6B: checkOvernightAvailability Direct Call');
    console.log('─'.repeat(70));

    try {
      const { checkOvernightAvailability } = require('../src/services/availabilityService');
      const overnight = await checkOvernightAvailability(testDate, testDate2);
      console.log(`Available rooms: ${overnight.availableRooms?.length || 0}`);
      console.log(`Booked rooms: ${overnight.bookedRooms?.length || 0}`);
      console.log(`Total rooms: ${overnight.totalRooms || 'N/A'}`);
      if (overnight.availableRooms && overnight.availableRooms.length > 0) {
        console.log('Available room details:');
        overnight.availableRooms.forEach(r => {
          console.log(`  - ${r.number || r.name || r._id}`);
        });
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }

    // STEP 6C: Also test checkOneDayPicknicAvailability
    console.log('\n\nSTEP 6C: checkOneDayPicknicAvailability Direct Call');
    console.log('─'.repeat(70));

    try {
      const { checkOneDayPicknicAvailability } = require('../src/services/availabilityService');
      const dayuse = await checkOneDayPicknicAvailability(testDate, 'breakfast-to-dinner');
      console.log(`Available rooms: ${dayuse.availableRooms?.length || 0}`);
      console.log(`Total rooms: ${dayuse.totalRooms || 'N/A'}`);
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }

    // STEP 6D: Test Sept 2-3 (Another reported problem date)
    console.log('\n\nSTEP 6D: Test Sept 02-03 (Reported Issue Date)');
    console.log('─'.repeat(70));
    try {
      const sept2 = new Date('2026-09-02');
      const sept3 = new Date('2026-09-03');
      const { checkOvernightAvailability } = require('../src/services/availabilityService');
      const overnightSept2 = await checkOvernightAvailability(sept2, sept3);
      console.log(`Sept 2-3 Available rooms: ${overnightSept2.availableRooms?.length || 0}`);
      console.log(`Sept 2-3 Booked rooms: ${overnightSept2.bookedRooms?.length || 0}`);
      console.log(`Sept 2-3 Total rooms: ${overnightSept2.totalRooms || 'N/A'}`);

      const sept2Bookings = await Booking.find({
        checkInDate: { $lt: sept3 },
        checkOutDate: { $gt: sept2 },
        status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }
      }).select('customerName checkInDate checkOutDate roomIds roomId bookingType status').lean();

      console.log(`Bookings on Sept 2-3 (${sept2Bookings.length}):`);
      sept2Bookings.forEach(b => {
        console.log(`  - ${b.customerName} | Type: ${b.bookingType} | Status: ${b.status} | roomIds: ${JSON.stringify(b.roomIds)} | roomId: ${b.roomId}`);
      });
    } catch (error) {
      console.log(`❌ Error testing Sept 2: ${error.message}`);
    }

    // STEP 7: Check ALL bookings in entire DB (not just Sept 26-27)
    console.log('\n\nSTEP 7: ALL Bookings in Database (Full Dump)');
    console.log('─'.repeat(70));

    const totalBookings = await Booking.countDocuments();
    console.log(`Total bookings in entire database: ${totalBookings}`);

    const recentBookings = await Booking.find()
      .sort({ checkInDate: -1 })
      .limit(20)
      .select('_id customerName checkInDate checkOutDate roomIds roomId bookingType status')
      .lean();

    if (recentBookings.length > 0) {
      console.log('\nLast 20 bookings (sorted by check-in date):');
      recentBookings.forEach((b, idx) => {
        const ci = new Date(b.checkInDate).toISOString().split('T')[0];
        const co = new Date(b.checkOutDate).toISOString().split('T')[0];
        const rooms = b.roomIds && b.roomIds.length > 0 ? `[${b.roomIds.join(',')}]` : (b.roomId || 'NO-ROOM');
        console.log(`  ${idx + 1}. ${ci} → ${co} | ${b.customerName || 'N/A'} | ${b.bookingType || 'N/A'} | ${b.status} | Rooms: ${rooms}`);
      });
    } else {
      console.log('⚠️  NO BOOKINGS AT ALL in database');
    }

    // STEP 8: Check all statuses used in bookings
    console.log('\n\nSTEP 8: Booking Status Distribution');
    console.log('─'.repeat(70));

    const statusAgg = await Booking.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    if (statusAgg.length > 0) {
      statusAgg.forEach(s => {
        console.log(`  ${s._id}: ${s.count}`);
      });
    } else {
      console.log('  No bookings to aggregate');
    }

    // STEP 9: DIAGNOSIS
    console.log('\n\n' + '═'.repeat(70));
    console.log('🩺 DIAGNOSIS');
    console.log('═'.repeat(70));

    if (allRooms.length === 0) {
      console.log('\n❌ ROOT CAUSE: NO ROOMS IN DATABASE');
      console.log('   The Room collection is EMPTY.');
      console.log('   Availability function has nothing to compare against.');
      console.log('   FIX: Seed rooms into the database.');
    } else if (totalBookings === 0) {
      console.log('\n✅ DATABASE: No bookings exist at all');
      console.log('   All rooms should show as AVAILABLE.');
      console.log('   If AI says "booked" → function logic is wrong.');
    } else if (allBookings.length === 0) {
      console.log('\n✅ DATABASE: No bookings overlap Sept 26-27');
      console.log('   All rooms should show as AVAILABLE for these dates.');
      console.log('   If AI says "booked" → date query or function logic is wrong.');
    } else if (bookingsWithRooms.length === 0 && bookingsWithoutRooms.length > 0) {
      console.log('\n✅ DATABASE: Only one-day bookings (no roomIds) overlap Sept 26-27');
      console.log('   Expected: Should show AVAILABLE (one-day picnics don\'t block rooms)');
      console.log('   If AI says "booked" → roomIds filter in availability query is not working.');
    } else if (bookingsWithRooms.length > 0 && availableRooms.length > 0) {
      console.log(`\n⚠️  DATABASE: ${bookingsWithRooms.length} bookings WITH rooms, but ${availableRooms.length} rooms still free`);
      console.log('   Expected: Should show PARTIALLY AVAILABLE');
      console.log('   If AI says "fully booked" → availability function overcounting.');
    } else if (bookingsWithRooms.length > 0 && availableRooms.length === 0) {
      console.log(`\n✅ DATABASE: ${bookingsWithRooms.length} bookings WITH rooms, ALL rooms booked`);
      console.log('   Expected: Should show FULLY BOOKED — this is CORRECT behavior.');
    }

    console.log('\n' + '═'.repeat(70) + '\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

debugAvailabilityIssue();
