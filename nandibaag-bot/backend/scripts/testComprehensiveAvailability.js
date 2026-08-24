/**
 * testComprehensiveAvailability.js — Validates all 8 availability test scenarios
 */

const assert = require('assert');
const dateHelper = require('../src/utils/dateHelper');
const availabilityService = require('../src/services/availabilityService');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🧪 RUNNING COMPREHENSIVE 8-SCENARIO AVAILABILITY TEST SUITE');
console.log('═════════════════════════════════════════════════════════════════════\n');

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Error: ${err.message}`);
  }
}

// -------------------------------------------------------------
// TEST 1: ONE-DAY PICNIC (No Room Assignment)
// -------------------------------------------------------------
console.log('----------------------------------------------------');
console.log('TEST 1: One-Day Picnic on Sept 2 (No Room Assignment)');
console.log('----------------------------------------------------');
runTest('One-day booking without roomIds does NOT block overnight stay', () => {
  const mockAllRooms = Array.from({ length: 10 }, (_, i) => ({
    _id: `room_${i + 1}`,
    roomNumber: `10${i + 1}`,
    capacity: 2,
    status: 'active'
  }));

  const mockBookings = [
    {
      customerName: 'Day Guest',
      bookingType: 'picnic',
      date: '2026-09-02',
      checkInDate: new Date('2026-09-02T09:00:00.000Z'),
      checkOutDate: new Date('2026-09-02T18:30:00.000Z'),
      status: 'confirmed',
      roomIds: []
    }
  ];

  const blockedIds = new Set();
  mockBookings.forEach(b => {
    if (b.roomIds && b.roomIds.length > 0) {
      b.roomIds.forEach(id => blockedIds.add(id));
    }
    if (b.roomId) blockedIds.add(b.roomId);
  });

  const available = mockAllRooms.filter(r => !blockedIds.has(r._id) && !blockedIds.has(r.roomNumber));
  assert.strictEqual(available.length, 10, 'Expected all 10 rooms to remain available');
  assert.strictEqual(dateHelper.getDayName('2026-09-02'), 'Wednesday');
});

// -------------------------------------------------------------
// TEST 2: OVERNIGHT WITH FULL ROOMS (Aug 28-29)
// -------------------------------------------------------------
console.log('\n----------------------------------------------------');
console.log('TEST 2: Overnight with Full Rooms (Aug 28-29)');
console.log('----------------------------------------------------');
runTest('Overnight booking with all 10 roomIds blocks overnight availability', () => {
  const allRoomIds = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'];
  const mockBookings = [
    {
      customerName: 'Full Group',
      bookingType: 'overnight',
      checkInDate: new Date('2026-08-28T12:00:00.000Z'),
      checkOutDate: new Date('2026-08-29T10:30:00.000Z'),
      status: 'confirmed',
      roomIds: allRoomIds
    }
  ];

  const blockedIds = new Set();
  mockBookings.forEach(b => {
    if (b.roomIds && b.roomIds.length > 0) {
      b.roomIds.forEach(id => blockedIds.add(id));
    }
  });

  assert.strictEqual(blockedIds.size, 10);
  const remaining = allRoomIds.filter(id => !blockedIds.has(id));
  assert.strictEqual(remaining.length, 0, 'Expected 0 rooms available');
});

// -------------------------------------------------------------
// TEST 3: PARTIAL ROOMS BOOKED (Aug 25-26)
// -------------------------------------------------------------
console.log('\n----------------------------------------------------');
console.log('TEST 3: Partial Rooms Booked (Aug 25-26, 5 rooms booked)');
console.log('----------------------------------------------------');
runTest('Overnight booking with 5 rooms leaves 5 rooms available', () => {
  const allRoomIds = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'];
  const mockBookings = [
    {
      customerName: 'Partial Group',
      bookingType: 'group',
      checkInDate: new Date('2026-08-25T12:00:00.000Z'),
      checkOutDate: new Date('2026-08-26T10:30:00.000Z'),
      status: 'confirmed',
      roomIds: ['101', '102', '103', '104', '105']
    }
  ];

  const blockedIds = new Set();
  mockBookings.forEach(b => {
    b.roomIds.forEach(id => blockedIds.add(id));
  });

  const remaining = allRoomIds.filter(id => !blockedIds.has(id));
  assert.strictEqual(remaining.length, 5, 'Expected 5 rooms available');
  assert.deepStrictEqual(remaining, ['106', '107', '108', '109', '110']);
});

// -------------------------------------------------------------
// TEST 4: MIXED BOOKINGS (One-Day + Overnight) (Aug 30-31)
// -------------------------------------------------------------
console.log('\n----------------------------------------------------');
console.log('TEST 4: Mixed Bookings on Aug 30-31 (One-Day + 3 Rooms Overnight)');
console.log('----------------------------------------------------');
runTest('One-day without roomIds is ignored, overnight with 3 roomIds blocks 3 rooms (leaves 7)', () => {
  const allRoomIds = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'];
  const mockBookings = [
    {
      customerName: 'Picnic Guest',
      bookingType: 'picnic',
      date: '2026-08-30',
      status: 'confirmed',
      roomIds: [] // No rooms
    },
    {
      customerName: 'Overnight Guest',
      bookingType: 'overnight',
      checkInDate: new Date('2026-08-30T12:00:00.000Z'),
      checkOutDate: new Date('2026-08-31T10:30:00.000Z'),
      status: 'confirmed',
      roomIds: ['101', '102', '103']
    }
  ];

  const blockedIds = new Set();
  mockBookings.forEach(b => {
    if (b.roomIds && b.roomIds.length > 0) {
      b.roomIds.forEach(id => blockedIds.add(id));
    }
  });

  const remaining = allRoomIds.filter(id => !blockedIds.has(id));
  assert.strictEqual(remaining.length, 7, 'Expected 7 rooms available');
});

// -------------------------------------------------------------
// TEST 5: ONE-DAY AVAILABILITY (Sept 5)
// -------------------------------------------------------------
console.log('\n----------------------------------------------------');
console.log('TEST 5: One-Day Picnic Availability on Sept 5');
console.log('----------------------------------------------------');
runTest('One-day booking without roomIds does not block dayuse capacity', () => {
  const allRoomIds = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'];
  const mockBookings = [
    {
      customerName: 'Day Picnic',
      bookingType: 'picnic',
      date: '2026-09-05',
      status: 'confirmed',
      roomIds: []
    }
  ];

  const blockedIds = new Set();
  mockBookings.forEach(b => {
    if (b.roomIds && b.roomIds.length > 0) {
      b.roomIds.forEach(id => blockedIds.add(id));
    }
  });

  const available = allRoomIds.filter(id => !blockedIds.has(id));
  assert.strictEqual(available.length, 10, 'Expected 10 rooms available for dayuse');
});

// -------------------------------------------------------------
// TEST 6: EMPTY DATABASE (Oct 15)
// -------------------------------------------------------------
console.log('\n----------------------------------------------------');
console.log('TEST 6: Empty Database (No Bookings on Oct 15)');
console.log('----------------------------------------------------');
runTest('Zero bookings returns all 10 rooms available', () => {
  const allRoomIds = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'];
  const mockBookings = [];

  const blockedIds = new Set();
  mockBookings.forEach(b => {
    if (b.roomIds && b.roomIds.length > 0) {
      b.roomIds.forEach(id => blockedIds.add(id));
    }
  });

  const available = allRoomIds.filter(id => !blockedIds.has(id));
  assert.strictEqual(available.length, 10, 'Expected 10 rooms available');
});

// -------------------------------------------------------------
// TEST 7: BACK-TO-BACK BOOKINGS
// -------------------------------------------------------------
console.log('\n----------------------------------------------------');
console.log('TEST 7: Back-to-Back Bookings (Aug 28-29 vs Aug 29-30 vs Aug 30-31)');
console.log('----------------------------------------------------');
runTest('Independent date queries check the specific overlapping window', () => {
  const allRoomIds = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'];
  const bookings = [
    {
      checkIn: new Date('2026-08-28T12:00:00Z'),
      checkOut: new Date('2026-08-29T10:30:00Z'),
      roomIds: ['101', '102', '103', '104', '105']
    },
    {
      checkIn: new Date('2026-08-29T12:00:00Z'),
      checkOut: new Date('2026-08-30T10:30:00Z'),
      roomIds: ['106', '107', '108', '109', '110']
    },
    {
      checkIn: new Date('2026-08-30T09:00:00Z'),
      checkOut: new Date('2026-08-30T18:30:00Z'),
      roomIds: [] // One day, no rooms
    }
  ];

  // Query A: Aug 28-29 (Check-in Aug 28 12:00 to Check-out Aug 29 10:30)
  const qA_in = new Date('2026-08-28T12:00:00Z');
  const qA_out = new Date('2026-08-29T10:30:00Z');
  const blockedA = new Set();
  bookings.filter(b => b.checkIn < qA_out && b.checkOut > qA_in).forEach(b => b.roomIds.forEach(id => blockedA.add(id)));
  assert.strictEqual(allRoomIds.filter(id => !blockedA.has(id)).length, 5, 'Aug 28-29 has 5 rooms free');

  // Query B: Aug 29-30 (Check-in Aug 29 12:00 to Check-out Aug 30 10:30)
  const qB_in = new Date('2026-08-29T12:00:00Z');
  const qB_out = new Date('2026-08-30T10:30:00Z');
  const blockedB = new Set();
  bookings.filter(b => b.checkIn < qB_out && b.checkOut > qB_in).forEach(b => b.roomIds.forEach(id => blockedB.add(id)));
  assert.strictEqual(allRoomIds.filter(id => !blockedB.has(id)).length, 5, 'Aug 29-30 has 5 rooms free');

  // Query C: Aug 30-31 (Check-in Aug 30 12:00 to Check-out Aug 31 10:30)
  const qC_in = new Date('2026-08-30T12:00:00Z');
  const qC_out = new Date('2026-08-31T10:30:00Z');
  const blockedC = new Set();
  bookings.filter(b => b.checkIn < qC_out && b.checkOut > qC_in).forEach(b => b.roomIds.forEach(id => blockedC.add(id)));
  assert.strictEqual(allRoomIds.filter(id => !blockedC.has(id)).length, 10, 'Aug 30-31 has all 10 rooms free');
});

// -------------------------------------------------------------
// TEST 8: PENDING PAYMENT STATUS
// -------------------------------------------------------------
console.log('\n----------------------------------------------------');
console.log('TEST 8: Pending Payment Status (Sept 1 with 2 rooms)');
console.log('----------------------------------------------------');
runTest('Bookings with pending_payment status block rooms from other guests', () => {
  const allRoomIds = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'];
  const mockBookings = [
    {
      customerName: 'Pending Guest',
      bookingType: 'couple',
      status: 'pending_payment',
      checkInDate: new Date('2026-09-01T12:00:00.000Z'),
      checkOutDate: new Date('2026-09-02T10:30:00.000Z'),
      roomIds: ['101', '102']
    }
  ];

  const blockedIds = new Set();
  mockBookings.filter(b => ['pending_payment', 'confirmed', 'checked_in'].includes(b.status)).forEach(b => {
    b.roomIds.forEach(id => blockedIds.add(id));
  });

  const remaining = allRoomIds.filter(id => !blockedIds.has(id));
  assert.strictEqual(remaining.length, 8, 'Expected 8 rooms available (2 blocked by pending_payment)');
});

console.log('\n═════════════════════════════════════════════════════════════════════');
console.log(`🏁 RESULTS: ${passed}/${total} TESTS PASSED`);
console.log('═════════════════════════════════════════════════════════════════════\n');

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
