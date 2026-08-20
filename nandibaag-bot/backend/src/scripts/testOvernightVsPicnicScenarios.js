const assert = require('assert');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const env = require('../config/env');

const {
  getDetailedAvailabilityMessage,
  checkOvernightAvailability,
  checkOneDayPicknicAvailability
} = require('../services/availabilityService');

async function runScenarioTests() {
  console.log('═════════════════════════════════════════════════════════');
  console.log('🧪 TESTING OVERNIGHT vs ONE-DAY PICNIC SCENARIOS');
  console.log('═════════════════════════════════════════════════════════\n');

  const mongoUri = env.mongodbUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nandibaag_bot';
  await mongoose.connect(mongoUri);

  const origOvernight = checkOvernightAvailability;
  const origDayuse = checkOneDayPicknicAvailability;

  try {
    const availabilityService = require('../services/availabilityService');

    // -------------------------------------------------------------
    // Test 1: All rooms booked for overnight, but One-Day Picnic available
    // -------------------------------------------------------------
    console.log('[Scenario 1] All rooms booked for overnight stay, picnic available...');
    const mockOvernightFull = async () => ({
      availableRooms: [],
      totalRooms: 10,
      bookedRoomIds: ['101', '102', '103', '104', '105', '106', '201', '202', '203', '204']
    });
    const mockDayuseAvailable = async () => ({
      availableRooms: [{ _id: '101', number: '101' }, { _id: '102', number: '102' }],
      totalRooms: 10,
      blockedRoomIds: ['103', '104', '105', '106', '201', '202', '203', '204']
    });

    availabilityService.checkOvernightAvailability = mockOvernightFull;
    availabilityService.checkOneDayPicknicAvailability = mockDayuseAvailable;

    const res1 = await availabilityService.getDetailedAvailabilityMessage(new Date('2026-08-10'), new Date('2026-08-11'), 'couple');
    console.log('Result message:\n' + res1.message);
    assert.strictEqual(res1.isAvailable, false);
    assert.strictEqual(res1.alternativeOffering, 'one-day-picnic');
    assert.ok(res1.message.includes('all rooms are booked for overnight stay'));
    assert.ok(res1.message.includes('ONE-DAY PICNIC'));
    console.log('✅ Scenario 1 Passed: Overnight full, offers one-day picnic!\n');

    // -------------------------------------------------------------
    // Test 2: Some rooms available overnight
    // -------------------------------------------------------------
    console.log('[Scenario 2] Some rooms available for overnight stay...');
    const mockOvernightAvail = async () => ({
      availableRooms: [{ _id: '101', number: '101' }, { _id: '102', number: '102' }, { _id: '103', number: '103' }],
      totalRooms: 10,
      bookedRoomIds: ['104', '105', '106', '201', '202', '203', '204']
    });
    availabilityService.checkOvernightAvailability = mockOvernightAvail;

    const res2 = await availabilityService.getDetailedAvailabilityMessage(new Date('2026-08-10'), new Date('2026-08-11'), 'couple');
    console.log('Result message:\n' + res2.message);
    assert.strictEqual(res2.isAvailable, true);
    assert.strictEqual(res2.availableForOvernight, 3);
    assert.ok(res2.message.includes('We have 3 room(s) available for overnight stay'));
    console.log('✅ Scenario 2 Passed: Available overnight rooms reported correctly!\n');

    // -------------------------------------------------------------
    // Test 3: All rooms booked for BOTH overnight and one-day picnic
    // -------------------------------------------------------------
    console.log('[Scenario 3] All rooms booked for BOTH overnight and picnic...');
    const mockDayuseFull = async () => ({
      availableRooms: [],
      totalRooms: 10,
      blockedRoomIds: ['101', '102', '103', '104', '105', '106', '201', '202', '203', '204']
    });
    availabilityService.checkOvernightAvailability = mockOvernightFull;
    availabilityService.checkOneDayPicknicAvailability = mockDayuseFull;

    const res3 = await availabilityService.getDetailedAvailabilityMessage(new Date('2026-08-10'), new Date('2026-08-11'), 'couple');
    console.log('Result message:\n' + res3.message);
    assert.strictEqual(res3.isAvailable, false);
    assert.strictEqual(res3.alternativeOffering, null);
    assert.ok(res3.message.includes('fully booked'));
    assert.ok(res3.message.includes('both overnight and one-day picnic'));
    console.log('✅ Scenario 3 Passed: Fully booked for both reports no availability!\n');

    // -------------------------------------------------------------
    // Test 4: One-day picnic available
    // -------------------------------------------------------------
    console.log('[Scenario 4] One-day picnic requested and available...');
    availabilityService.checkOneDayPicknicAvailability = mockDayuseAvailable;

    const res4 = await availabilityService.getDetailedAvailabilityMessage(new Date('2026-08-10'), null, 'one-day-picnic');
    console.log('Result message:\n' + res4.message);
    assert.strictEqual(res4.isAvailable, true);
    assert.strictEqual(res4.availableForDayuse, 2);
    assert.ok(res4.message.includes('We have 2 room(s) available for one-day picnic'));
    console.log('✅ Scenario 4 Passed: One-day picnic availability reported correctly!\n');

    console.log('═════════════════════════════════════════════════════════');
    console.log('🎉 ALL 4 SCENARIO TESTS PASSED 100%!');
    console.log('═════════════════════════════════════════════════════════\n');

  } finally {
    const availabilityService = require('../services/availabilityService');
    availabilityService.checkOvernightAvailability = origOvernight;
    availabilityService.checkOneDayPicknicAvailability = origDayuse;
    await mongoose.disconnect();
  }
}

runScenarioTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
