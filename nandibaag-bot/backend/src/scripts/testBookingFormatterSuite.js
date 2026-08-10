#!/usr/bin/env node

/**
 * Test Suite: Booking Message Formatter
 * 
 * Validates premium header, room numbers, Nil pending, rate display.
 * 
 * Usage: node backend/src/scripts/testBookingFormatterSuite.js
 */

const {
  formatBookingMessageForCustomer,
  formatBookingMessageForStaffGroup
} = require('../utils/bookingMessageFormatter');

let passed = 0;
let failed = 0;
const results = [];

function assert(testName, condition, detail = '') {
  if (condition) {
    passed++;
    results.push({ name: testName, status: '✅ PASS' });
    console.log(`  ✅ ${testName}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    results.push({ name: testName, status: '❌ FAIL' });
    console.log(`  ❌ ${testName}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('\n====================================================');
console.log('   RUNNING BOOKING MESSAGE FORMATTER SUITE          ');
console.log('====================================================\n');

// ─── TEST 1: Multi-room group booking (fully paid) ───────────────
console.log('--- TEST 1: Multi-room group booking (fully paid) ---');
const booking1 = {
  customerName: 'Nikhil Desai',
  customerPhone: '9820623361',
  checkInDate: '2026-08-10',
  checkOutDate: '2026-08-11',
  packageType: 'group',
  guestComposition: { adults: 7, children: 1 },
  totalAmount: 12000,
  advancePaid: 12000,
  roomIds: ['101', '102'],
  bookedBy: { name: 'Priti' },
  notes: '',
  mealOption: null
};

const customerMsg1 = formatBookingMessageForCustomer(booking1);
const staffMsg1 = formatBookingMessageForStaffGroup(booking1);

assert('Customer msg has premium header', customerMsg1.includes('✅ BOOKING CONFIRMED ✓'));
assert('Customer msg shows room count', customerMsg1.includes('Room: 2 Rooms'));
assert('Customer msg shows pending Nil', customerMsg1.includes('Pending Payment: Nil'));
assert('Customer msg shows rate', customerMsg1.includes('₹2,000 (Weekday) / ₹3,000 (Weekend)'));
assert('Customer msg shows Booked by: Priti', customerMsg1.includes('Booked by: Priti'));
assert('Customer msg shows Thank you', customerMsg1.includes('Thank you for booking with Nandibaag Resort! 🙏'));
assert('Staff msg has alert header', staffMsg1.includes('🔔 NEW BOOKING ALERT ✅'));
assert('Staff msg shows room count', staffMsg1.includes('Rooms: 2 Rooms'));
assert('Staff msg shows GROUP STAY', staffMsg1.includes('GROUP STAY'));
assert('Staff msg shows members breakdown', staffMsg1.includes('7 Adults, 1 Children'));
assert('Staff msg shows Pending: ₹0', staffMsg1.includes('Pending: ₹0'));

console.log('\n--- Customer Message Preview ---');
console.log(customerMsg1);
console.log('\n--- Staff Message Preview ---');
console.log(staffMsg1);

// ─── TEST 2: Single room couple booking (partially paid) ─────────
console.log('\n--- TEST 2: Single room couple booking (partially paid) ---');
const booking2 = {
  customerName: 'Rahul Sharma',
  customerPhone: '9876543210',
  checkInDate: '2026-08-14',
  checkOutDate: '2026-08-16',
  packageType: 'couple',
  guestComposition: { adults: 2, children: 0 },
  totalAmount: 13000,
  advancePaid: 5000,
  roomIds: ['205'],
  bookedBy: { name: 'Kadambari' },
  notes: 'Anniversary celebration',
  mealOption: null
};

const customerMsg2 = formatBookingMessageForCustomer(booking2);

assert('Single room shows "Room: 1 Room"', customerMsg2.includes('Room: 1 Room'));
assert('Pending shows ₹8,000', customerMsg2.includes('Pending Payment: ₹8,000'));
assert('Rate shows couple rate', customerMsg2.includes('₹5,500 (Weekday) / ₹6,500 (Weekend)'));
assert('Shows special notes', customerMsg2.includes('Anniversary celebration'));

// ─── TEST 3: No rooms selected ──────────────────────────────────
console.log('\n--- TEST 3: No rooms selected ---');
const booking3 = {
  customerName: 'Test User',
  customerPhone: '9999999999',
  checkInDate: '2026-08-20',
  checkOutDate: '2026-08-21',
  packageType: 'group',
  guestComposition: { adults: 5, children: 0 },
  totalAmount: 10000,
  advancePaid: 0,
  roomIds: [],
  bookedBy: { name: 'Staff' },
  notes: '',
  mealOption: null
};

const customerMsg3 = formatBookingMessageForCustomer(booking3);
const staffMsg3 = formatBookingMessageForStaffGroup(booking3);

assert('No rooms → "Common Room"', customerMsg3.includes('Room: Common Room'));
assert('Staff msg no rooms → "Common Room"', staffMsg3.includes('Rooms: Common Room'));
assert('Pending shows ₹10,000', customerMsg3.includes('Pending Payment: ₹10,000'));

// ─── TEST 4: Three rooms (101, 102, 103) ────────────────────────
console.log('\n--- TEST 4: Three rooms (101, 102, 103) ---');
const booking4 = {
  customerName: 'Big Group',
  customerPhone: '9111111111',
  checkInDate: '2026-08-15',
  checkOutDate: '2026-08-17',
  packageType: 'group',
  guestComposition: { adults: 15, children: 3 },
  totalAmount: 96000,
  advancePaid: 50000,
  roomIds: ['101', '102', '103'],
  bookedBy: { name: 'Ravi' },
  notes: 'Corporate outing',
  mealOption: null
};

const customerMsg4 = formatBookingMessageForCustomer(booking4);
assert('Three rooms shows "3 Rooms"', customerMsg4.includes('Room: 3 Rooms'));
assert('Pending shows ₹46,000', customerMsg4.includes('Pending Payment: ₹46,000'));

// ─── TEST 5: One Day Picnic ──────────────────────────────────────
console.log('\n--- TEST 5: One Day Picnic ---');
const booking5 = {
  customerName: 'Picnic Group',
  customerPhone: '9222222222',
  checkInDate: '2026-08-12',
  checkOutDate: '2026-08-12',
  packageType: 'oneDay',
  guestComposition: { adults: 4, children: 2 },
  totalAmount: 7500,
  advancePaid: 7500,
  roomIds: [],
  bookedBy: { name: 'Mansi' },
  notes: '',
  mealOption: 'B->D'
};

const staffMsg5 = formatBookingMessageForStaffGroup(booking5);
assert('Picnic staff msg shows ONE DAY PICNIC', staffMsg5.includes('ONE DAY PICNIC'));
assert('Picnic staff msg shows Meal option', staffMsg5.includes('Meal: B->D'));
assert('Picnic rate display correct', formatBookingMessageForCustomer(booking5).includes('₹1,250 (Weekday) / ₹1,500 (Weekend)'));

// ─── SUMMARY ────────────────────────────────────────────────────
console.log('\n====================================================');
console.log('                 SUMMARY OF TESTS                   ');
console.log('====================================================');
results.forEach(r => console.log(`${r.status} ${r.name}`));
console.log(`\nTotal: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);

if (failed > 0) {
  console.log('\n⚠️  SOME TESTS FAILED\n');
  process.exit(1);
} else {
  console.log('\n🎉 ALL TESTS PASSED\n');
  process.exit(0);
}
