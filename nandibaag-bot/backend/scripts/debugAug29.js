require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Booking = require('../src/models/Booking');
const {
  checkOvernightAvailability,
  checkOneDayPicknicAvailability,
  getDetailedAvailabilityMessage
} = require('../src/services/availabilityService');

const debugAug29 = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nandibaag';
    await mongoose.connect(mongoUri);

    console.log('\n═════════════════════════════════════════════════════════');
    console.log('🔍 DEBUGGING AUG 29 AVAILABILITY');
    console.log('═════════════════════════════════════════════════════════\n');

    // Test date: Aug 29, 2026
    const aug29 = new Date('2026-08-29');
    const aug30 = new Date('2026-08-30');

    console.log('📅 Testing date: 2026-08-29\n');

    // Check all bookings on this date
    console.log('📋 ALL BOOKINGS on Aug 29:\n');

    const allBookings = await Booking.find({
      $or: [
        {
          checkInDate: { $lte: aug29 },
          checkOutDate: { $gt: aug29 }
        }
      ]
    }).select('customerName checkInDate checkOutDate roomIds roomId bookingType status');

    if (allBookings.length === 0) {
      console.log('  No bookings found for this date');
    } else {
      allBookings.forEach((b, idx) => {
        console.log(`  [${idx + 1}] ${b.customerName}`);
        console.log(`      Check-in: ${new Date(b.checkInDate).toISOString().split('T')[0]}`);
        console.log(`      Check-out: ${new Date(b.checkOutDate).toISOString().split('T')[0]}`);
        console.log(`      Rooms: ${b.roomIds?.join(',') || b.roomId}`);
        console.log(`      Type: ${b.bookingType}`);
        console.log(`      Status: ${b.status}\n`);
      });
    }

    // Test overnight availability
    console.log('\n🏨 OVERNIGHT AVAILABILITY (Aug 29-30):\n');
    const overnight = await checkOvernightAvailability(aug29, aug30);
    console.log(`Available: ${overnight.availableRooms.length}/${overnight.totalRooms}\n`);

    // Test one-day picnic
    console.log('\n🎉 ONE-DAY PICNIC AVAILABILITY (Aug 29):\n');
    const oneDay = await checkOneDayPicknicAvailability(aug29, 'breakfast-to-dinner');
    console.log(`Available: ${oneDay.availableRooms.length}/${oneDay.totalRooms}\n`);

    // Test messages
    console.log('\n💬 AI MESSAGES:\n');

    const coupleMsg = await getDetailedAvailabilityMessage(aug29, aug30, 'couple');
    console.log('Couple message:');
    console.log(coupleMsg.message);

    console.log('\nOne-day message:');
    const oneDayMsg = await getDetailedAvailabilityMessage(aug29, aug30, 'one-day-picnic');
    console.log(oneDayMsg.message);

    console.log('\n═════════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

debugAug29();
