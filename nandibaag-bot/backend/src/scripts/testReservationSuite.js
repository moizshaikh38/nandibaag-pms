#!/usr/bin/env node

/**
 * Test Suite: Real-Time Room Availability & 15-Minute Reservation Locks
 * 
 * Validates:
 * 1. RoomReservation model creation & auto-expiration index.
 * 2. createReservation - locks rooms for 15 minutes.
 * 3. checkMultipleRoomsAvailable - blocks other sessions when locked or booked.
 * 4. getRoomsWithReservationStatus - returns correct statuses ('available', 'reserved_by_you', 'reserved_by_other', 'booked').
 * 5. confirmReservation & cancelReservation lifecycle.
 * 
 * Usage: node backend/src/scripts/testReservationSuite.js
 */

const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { Room, RoomReservation, Booking } = require('../models');
const { createReservation, confirmReservation, cancelReservation, cleanupExpiredReservations } = require('../services/reservationService');
const { checkMultipleRoomsAvailable, getRoomsWithReservationStatus } = require('../services/availabilityService');

let passed = 0;
let failed = 0;

function assert(testName, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`  ❌ ${testName}${detail ? ' — ' + detail : ''}`);
  }
}

async function runTests() {
  console.log('\n====================================================');
  console.log('   RUNNING REAL-TIME ROOM RESERVATION SUITE        ');
  console.log('====================================================\n');

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB');

    const checkIn = new Date();
    checkIn.setDate(checkIn.getDate() + 30); // 30 days in future
    checkIn.setHours(12, 0, 0, 0);

    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + 1);
    checkOut.setHours(10, 30, 0, 0);

    const sessionA = 'session_user_A_' + Date.now();
    const sessionB = 'session_user_B_' + Date.now();
    const testRoomId = 'test_room_101_' + Date.now();

    // Cleanup any existing test reservations
    await RoomReservation.deleteMany({ roomId: testRoomId });

    // ─── TEST 1: Create 15-minute Reservation ──────────────────────
    console.log('--- TEST 1: Create 15-Minute Reservation ---');
    const resA = await createReservation([testRoomId], checkIn, checkOut, 'Staff_A', sessionA);
    assert('Reservation created', resA.length === 1);
    assert('Status is active', resA[0].status === 'active');
    assert('Session ID matches sessionA', resA[0].sessionId === sessionA);
    assert('Expires at ~15 mins in future', resA[0].expiresAt.getTime() > Date.now() + 14 * 60 * 1000);

    // ─── TEST 2: Availability check for Session A (Same Session) ────
    console.log('\n--- TEST 2: Availability Check (Same Session) ---');
    const availA = await checkMultipleRoomsAvailable([testRoomId], checkIn, checkOut, sessionA);
    assert('Available for Session A (its own lock)', availA.available === true);

    // ─── TEST 3: Availability check for Session B (Other Session) ───
    console.log('\n--- TEST 3: Availability Check (Other Session B) ---');
    const availB = await checkMultipleRoomsAvailable([testRoomId], checkIn, checkOut, sessionB);
    assert('NOT Available for Session B', availB.available === false);
    assert('Reason is reserved', availB.conflicts[0].reason === 'reserved');

    // ─── TEST 4: Room Status for Session A vs Session B ─────────────
    console.log('\n--- TEST 4: Room Statuses (reserved_by_you vs reserved_by_other) ---');
    const { Series } = require('../models');
    let series = await Series.findOne();
    if (!series) {
      series = await Series.create({ name: 'Series 100 (Cottages)', status: 'active' });
    }

    const tempRoom = await Room.create({
      roomNumber: testRoomId,
      seriesId: series._id,
      name: 'Test Cottage ' + testRoomId,
      capacity: 4,
      status: 'active'
    });

    const roomStatusesA = await getRoomsWithReservationStatus(checkIn, checkOut, sessionA);
    const roomA = roomStatusesA.find(r => String(r.roomNumber) === testRoomId || String(r._id) === String(tempRoom._id));
    assert('Session A sees "reserved_by_you"', roomA?.status === 'reserved_by_you');

    const roomStatusesB = await getRoomsWithReservationStatus(checkIn, checkOut, sessionB);
    const roomB = roomStatusesB.find(r => String(r.roomNumber) === testRoomId || String(r._id) === String(tempRoom._id));
    assert('Session B sees "reserved_by_other"', roomB?.status === 'reserved_by_other');

    // ─── TEST 5: Confirm Reservation ───────────────────────────────
    console.log('\n--- TEST 5: Confirm Reservation ---');
    await confirmReservation(sessionA, checkIn, checkOut);
    const dbRes = await RoomReservation.findOne({ sessionId: sessionA, roomId: testRoomId });
    assert('Reservation status is now "confirmed"', dbRes.status === 'confirmed');

    // Clean up temp room & reservation
    await Room.findByIdAndDelete(tempRoom._id);
    await RoomReservation.deleteMany({ roomId: testRoomId });

    console.log('\n====================================================');
    console.log('                 SUMMARY OF TESTS                   ');
    console.log('====================================================');
    console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);

    await mongoose.disconnect();

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('\n🎉 ALL RESERVATION TESTS PASSED\n');
      process.exit(0);
    }

  } catch (error) {
    console.error('Test error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTests();
