#!/usr/bin/env node

/**
 * Availability Engine Test Script for Nandibaag Bot
 *
 * Exercises the availability engine directly against the seeded room data from Phase A.
 * Tests all core functions: checkOverlap, getCapacityAvailability, getDetailedAvailability,
 * suggestRoomCombinations, createRoomBooking, cancelRoomBooking, rescheduleRoomBooking.
 *
 * Usage: npm run test-availability
 * Prerequisites: Run `npm run seed-rooms` first to populate room inventory.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { Room, RoomBooking, Booking, User } = require('../models');
const {
  checkOverlap,
  getCapacityAvailability,
  getDetailedAvailability,
  suggestRoomCombinations,
  createRoomBooking,
  cancelRoomBooking,
  rescheduleRoomBooking
} = require('../services/availabilityService');

// ── Helpers ────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function pass(testName) {
  console.log(`  ✅ PASS: ${testName}`);
  passCount++;
}

function fail(testName, reason) {
  console.log(`  ❌ FAIL: ${testName}`);
  if (reason) console.log(`     Reason: ${reason}`);
  failCount++;
}

function section(title) {
  console.log('');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${title}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

// Date helpers
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       🏨 Nandibaag Availability Engine Test Suite           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Connect to MongoDB
  console.log('  ⏳ Connecting to MongoDB...');
  try {
    await mongoose.connect(mongoUri);
    console.log('  ✅ MongoDB connected\n');
  } catch (err) {
    console.log(`  ❌ MongoDB connection failed: ${err.message}`);
    console.log('     Make sure MONGO_URI in .env is correct.\n');
    process.exit(1);
  }

  // Verify room inventory exists
  const roomCount = await Room.countDocuments({ status: { $ne: 'deleted' } });
  if (roomCount === 0) {
    console.log('  ❌ No rooms found in database. Run `npm run seed-rooms` first!');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`  📊 Found ${roomCount} active rooms in inventory\n`);

  // Get a test user (admin) for assignedBy
  let testUser = await User.findOne({ role: 'admin' });
  if (!testUser) {
    console.log('  ❌ No admin user found. Run the setup script first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Get a test booking
  let testBooking = await Booking.findOne();
  if (!testBooking) {
    // Create a dummy booking for testing
    testBooking = new Booking({
      customerName: 'Test Guest',
      customerPhone: '9999999999',
      bookingType: 'group',
      date: '2025-08-01',
      adults: 4,
      totalAmount: 5000,
      status: 'confirmed',
      createdBy: 'staff'
    });
    await testBooking.save();
    console.log('  📝 Created test booking for testing\n');
  }

  // Clean up any leftover test room bookings
  await RoomBooking.deleteMany({ bookingId: testBooking._id });

  // ── Test Dates ──────────────────────────────────────────────────────
  const baseDate = addDays(new Date(), 30); // 30 days from now
  const checkIn1 = formatDate(baseDate);
  const checkOut1 = formatDate(addDays(baseDate, 2));
  const checkInOverlap = formatDate(addDays(baseDate, 1)); // overlaps with range 1
  const checkOutOverlap = formatDate(addDays(baseDate, 3));
  const checkInNoOverlap = formatDate(addDays(baseDate, 5)); // no overlap
  const checkOutNoOverlap = formatDate(addDays(baseDate, 7));

  console.log(`  📅 Test dates:`);
  console.log(`     Range 1: ${checkIn1} → ${checkOut1}`);
  console.log(`     Overlapping: ${checkInOverlap} → ${checkOutOverlap}`);
  console.log(`     Non-overlapping: ${checkInNoOverlap} → ${checkOutNoOverlap}`);

  // ── TEST 1: Full inventory available (no bookings yet) ──────────────
  section('TEST 1: Capacity availability with no bookings');

  const avail1 = await getCapacityAvailability(checkIn1, checkOut1, 1);
  if (avail1.available && avail1.availableCount > 0) {
    pass(`Full inventory available: ${avail1.availableCount} rooms free`);
  } else {
    fail('Full inventory availability check', `Expected rooms available, got: ${JSON.stringify(avail1)}`);
  }

  // Check breakdown exists
  if (Object.keys(avail1.breakdown).length > 0) {
    pass('Capacity breakdown returned');
    console.log(`     Breakdown: ${JSON.stringify(avail1.breakdown)}`);
  } else {
    fail('Capacity breakdown check', 'No breakdown returned');
  }

  // ── TEST 2: Detailed availability ───────────────────────────────────
  section('TEST 2: Detailed room-level availability');

  const detailed1 = await getDetailedAvailability(checkIn1, checkOut1, 1);
  if (detailed1.length > 0) {
    pass(`Detailed availability: ${detailed1.length} rooms returned`);
    console.log(`     Sample: ${detailed1[0].roomNumber} (${detailed1[0].seriesName}, cap ${detailed1[0].capacity})`);
  } else {
    fail('Detailed availability check', 'No rooms returned');
  }

  // ── TEST 3: Create a RoomBooking ────────────────────────────────────
  section('TEST 3: Create a RoomBooking');

  // Pick a specific room (capacity 4 from 100 Series)
  const testRoom = await Room.findOne({ roomNumber: '101', status: 'active' });
  if (!testRoom) {
    console.log('  ⚠️  Room 101 not found, picking first available room...');
    const anyRoom = await Room.findOne({ status: 'active' });
    if (!anyRoom) {
      fail('Create RoomBooking', 'No active rooms found');
      await mongoose.disconnect();
      process.exit(1);
    }
  }
  const roomForTest = testRoom || await Room.findOne({ status: 'active' });
  console.log(`  📍 Using room: ${roomForTest.roomNumber} (capacity: ${roomForTest.capacity})`);

  let createdBooking;
  try {
    createdBooking = await createRoomBooking(
      roomForTest._id,
      testBooking._id,
      checkIn1,
      checkOut1,
      testUser._id
    );
    pass(`RoomBooking created: ${createdBooking._id}`);
  } catch (err) {
    fail('Create RoomBooking', err.message);
  }

  // ── TEST 4: Overlapping date range shows one less room ──────────────
  section('TEST 4: Overlapping dates show reduced availability');

  const avail2 = await getCapacityAvailability(checkInOverlap, checkOutOverlap, 1);
  const expectedReduction = 1;
  const actualReduction = avail1.availableCount - avail2.availableCount;

  if (actualReduction === expectedReduction) {
    pass(`Overlap reduces availability by ${expectedReduction}: ${avail2.availableCount} rooms free (was ${avail1.availableCount})`);
  } else {
    fail('Overlap availability reduction', `Expected reduction of ${expectedReduction}, got ${actualReduction}`);
  }

  // Verify the specific room shows as blocked
  const overlap = await checkOverlap(roomForTest._id, checkInOverlap, checkOutOverlap);
  if (overlap) {
    pass(`Room ${roomForTest.roomNumber} correctly shows as blocked for overlapping dates`);
  } else {
    fail('Room overlap check', `Room ${roomForTest.roomNumber} should be blocked but isn't`);
  }

  // ── TEST 5: Non-overlapping dates unaffected ────────────────────────
  section('TEST 5: Non-overlapping dates unaffected');

  const avail3 = await getCapacityAvailability(checkInNoOverlap, checkOutNoOverlap, 1);
  if (avail3.availableCount === avail1.availableCount) {
    pass(`Non-overlapping dates unaffected: ${avail3.availableCount} rooms free (same as original ${avail1.availableCount})`);
  } else {
    fail('Non-overlapping availability', `Expected ${avail1.availableCount}, got ${avail3.availableCount}`);
  }

  const noOverlap = await checkOverlap(roomForTest._id, checkInNoOverlap, checkOutNoOverlap);
  if (!noOverlap) {
    pass(`Room ${roomForTest.roomNumber} correctly shows as free for non-overlapping dates`);
  } else {
    fail('Room non-overlap check', `Room ${roomForTest.roomNumber} should be free but shows as blocked`);
  }

  // ── TEST 6: Double-booking prevention ───────────────────────────────
  section('TEST 6: Double-booking prevention');

  // Create a second booking for the same room with overlapping dates
  const testBooking2 = new Booking({
    customerName: 'Test Guest 2',
    customerPhone: '9999999998',
    bookingType: 'group',
    date: checkInOverlap,
    adults: 4,
    totalAmount: 5000,
    status: 'confirmed',
    createdBy: 'staff'
  });
  await testBooking2.save();

  try {
    await createRoomBooking(
      roomForTest._id,
      testBooking2._id,
      checkInOverlap,
      checkOutOverlap,
      testUser._id
    );
    fail('Double-booking prevention', 'Should have thrown error but created booking instead');
  } catch (err) {
    if (err.message.includes('no longer available')) {
      pass(`Double-booking blocked: "${err.message}"`);
    } else {
      fail('Double-booking error message', `Got unexpected error: ${err.message}`);
    }
  }

  // ── TEST 7: Cancel booking frees the room ───────────────────────────
  section('TEST 7: Cancel booking frees the room');

  try {
    await cancelRoomBooking(createdBooking._id, 'Test cancellation');
    pass('RoomBooking cancelled successfully');
  } catch (err) {
    fail('Cancel RoomBooking', err.message);
  }

  // Re-check availability
  const avail4 = await getCapacityAvailability(checkInOverlap, checkOutOverlap, 1);
  if (avail4.availableCount === avail1.availableCount) {
    pass(`Room freed after cancellation: ${avail4.availableCount} rooms free (back to original ${avail1.availableCount})`);
  } else {
    fail('Post-cancellation availability', `Expected ${avail1.availableCount}, got ${avail4.availableCount}`);
  }

  // ── TEST 8: Reschedule booking ──────────────────────────────────────
  section('TEST 8: Reschedule booking');

  // Create a new booking to reschedule
  const testBooking3 = new Booking({
    customerName: 'Test Guest 3',
    customerPhone: '9999999997',
    bookingType: 'group',
    date: checkIn1,
    adults: 4,
    totalAmount: 5000,
    status: 'confirmed',
    createdBy: 'staff'
  });
  await testBooking3.save();

  const bookingToReschedule = await createRoomBooking(
    roomForTest._id,
    testBooking3._id,
    checkIn1,
    checkOut1,
    testUser._id
  );

  // Reschedule to non-overlapping dates
  try {
    const rescheduled = await rescheduleRoomBooking(
      bookingToReschedule._id,
      checkInNoOverlap,
      checkOutNoOverlap
    );
    pass(`Booking rescheduled: ${formatDate(rescheduled.checkInDate)} → ${formatDate(rescheduled.checkOutDate)}`);
  } catch (err) {
    fail('Reschedule booking', err.message);
  }

  // Verify original dates are now free
  const overlapAfterReschedule = await checkOverlap(roomForTest._id, checkIn1, checkOut1);
  if (!overlapAfterReschedule) {
    pass('Original dates freed after reschedule');
  } else {
    fail('Post-reschedule original dates', 'Original dates still show as blocked');
  }

  // Verify new dates are blocked
  const newDatesBlocked = await checkOverlap(roomForTest._id, checkInNoOverlap, checkOutNoOverlap);
  if (newDatesBlocked) {
    pass('New dates correctly blocked after reschedule');
  } else {
    fail('Post-reschedule new dates', 'New dates should be blocked but are free');
  }

  // Clean up
  await cancelRoomBooking(bookingToReschedule._id, 'Test cleanup');
  await Booking.deleteMany({ _id: { $in: [testBooking2._id, testBooking3._id] } });

  // ── TEST 9: suggestRoomCombinations ─────────────────────────────────
  section('TEST 9: Room combination suggestions');

  // Test with a guest count larger than any single room's max capacity
  const maxCapacityRoom = await Room.findOne({ status: 'active' }).sort({ capacity: -1 }).limit(1);
  const largeGuestCount = maxCapacityRoom ? maxCapacityRoom.capacity + 8 : 30; // Larger than max single room

  const suggestions = await suggestRoomCombinations(checkIn1, checkOut1, largeGuestCount);
  if (suggestions.available && suggestions.suggestions.length > 0) {
    pass(`Suggestions returned for ${largeGuestCount} guests`);
    for (const s of suggestions.suggestions) {
      console.log(`     → ${s.description} (total capacity: ${s.totalCapacity})`);
    }
  } else {
    fail('Room combination suggestions', 'No suggestions returned');
  }

  // Test with small guest count (should find single room)
  const smallSuggestions = await suggestRoomCombinations(checkIn1, checkOut1, 2);
  if (smallSuggestions.available && smallSuggestions.suggestions.length > 0) {
    const firstOption = smallSuggestions.suggestions[0];
    if (firstOption.rooms === 1) {
      pass(`Small guest count (2) correctly suggests single room: ${firstOption.description}`);
    } else {
      fail('Small guest count suggestion', `Expected single room, got ${firstOption.rooms} rooms`);
    }
  } else {
    fail('Small guest count suggestions', 'No suggestions returned');
  }

  // ── TEST 10: Capacity-level only (no room numbers in bot response) ──
  section('TEST 10: Business rule — bot sees only counts, not room numbers');

  const botResponse = await getCapacityAvailability(checkIn1, checkOut1, 4);
  const responseStr = JSON.stringify(botResponse);

  // Check that no room numbers appear in the response
  const allRooms = await Room.find({ status: 'active' }).select('roomNumber');
  let leakedRoomNumbers = [];
  for (const room of allRooms) {
    if (responseStr.includes(room.roomNumber)) {
      leakedRoomNumbers.push(room.roomNumber);
    }
  }

  if (leakedRoomNumbers.length === 0) {
    pass('Bot response contains NO room numbers (business rule upheld)');
  } else {
    fail('Room number leak check', `Bot response contains room numbers: ${leakedRoomNumbers.join(', ')}`);
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('── Summary ─────────────────────────────────────────────────');
  console.log(`  ✅ Passed: ${passCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log(`  Total:   ${passCount + failCount}`);
  console.log('');

  if (failCount === 0) {
    console.log('  🎉 All availability engine tests passed!');
  } else {
    console.log('  ⛔ Some tests failed — review the output above.');
  }

  console.log('');
  await mongoose.disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Fatal error in availability test:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
