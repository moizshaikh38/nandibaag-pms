const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const env = require('../config/env');

const {
  checkOvernightAvailability,
  checkOneDayPicknicAvailability,
  getDetailedAvailabilityMessage,
  getRoomsWithDetailedStatus
} = require('../services/availabilityService');

const testAvailability = async () => {
  try {
    const mongoUri = env.mongodbUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nandibaag_bot';
    await mongoose.connect(mongoUri);

    console.log('\n═════════════════════════════════════════════════════════');
    console.log('🧪 TESTING AVAILABILITY LOGIC');
    console.log('═════════════════════════════════════════════════════════\n');

    const testDate = new Date('2026-08-10');
    const nextDate = new Date('2026-08-11');

    console.log('📅 Test Date:', testDate.toLocaleDateString());

    // Test 1: Overnight availability
    console.log('\n1️⃣ OVERNIGHT AVAILABILITY:');
    const overnight = await checkOvernightAvailability(testDate, nextDate);
    console.log('   Available:', overnight.availableRooms.length);
    console.log('   Booked:', overnight.bookedRoomIds.length);

    // Test 2: One-day picnic availability
    console.log('\n2️⃣ ONE-DAY PICNIC AVAILABILITY:');
    const dayuse = await checkOneDayPicknicAvailability(testDate, 'breakfast-to-dinner');
    console.log('   Available:', dayuse.availableRooms.length);
    console.log('   Blocked:', dayuse.blockedRoomIds.length);

    // Test 3: Messages
    console.log('\n3️⃣ AVAILABILITY MESSAGES:');

    const msgCouple = await getDetailedAvailabilityMessage(testDate, nextDate, 'couple');
    console.log('   Couple message:\n' + msgCouple.message);

    const msgOneDay = await getDetailedAvailabilityMessage(testDate, nextDate, 'one-day-picnic');
    console.log('\n   One-day message:\n' + msgOneDay.message);

    // Test 4: Detailed room status
    console.log('\n4️⃣ DETAILED ROOM STATUSES:');
    const roomStatuses = await getRoomsWithDetailedStatus(testDate, nextDate, 'couple');
    console.log('   Rooms checked:', roomStatuses.length);
    console.log('   Sample status:', roomStatuses.slice(0, 3).map(r => `${r.number}: ${r.status}`));

    console.log('\n═════════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

testAvailability();
