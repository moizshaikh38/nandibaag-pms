#!/usr/bin/env node

/**
 * Test Suite: Room Maintenance & Availability Verification
 * 
 * Verifies:
 * - RoomMaintenance model creation & query
 * - Maintenance exclusion from available room queries
 * - getAvailabilityMessage logic for all-booked, partial maintenance, and available states
 * 
 * Usage: node backend/src/scripts/testAvailabilitySuite.js
 */

const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { Room, Booking, RoomMaintenance } = require('../models');
const {
  getRoomsWithReservationStatus,
  getAvailabilityMessage
} = require('../services/availabilityService');
const {
  addMaintenance,
  completeMaintenance,
  cancelMaintenance
} = require('../services/maintenanceService');

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${name}`);
  }
}

async function runSuite() {
  console.log('\n====================================================');
  console.log('   RUNNING ROOM MAINTENANCE & AVAILABILITY SUITE     ');
  console.log('====================================================\n');

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB.\n');

    const checkInDate = '2026-09-01';
    const checkOutDate = '2026-09-02';

    // Cleanup previous test maintenance
    await RoomMaintenance.deleteMany({ reason: 'UNIT_TEST_REASON' });

    // Step 1: Initial Availability Check
    console.log('--- Step 1: Initial Availability Check ---');
    const roomsInitial = await getRoomsWithReservationStatus(checkInDate, checkOutDate);
    const msgInitial = await getAvailabilityMessage(checkInDate, checkOutDate);
    assert('Fetched initial room status list', Array.isArray(roomsInitial));
    assert('Availability message contains summary', typeof msgInitial.message === 'string');

    // Step 2: Add Maintenance Lock on Room 101
    console.log('\n--- Step 2: Add Maintenance Lock on Room 101 ---');
    const maintenanceRecords = await addMaintenance(
      ['101'],
      checkInDate,
      checkOutDate,
      'wellness',
      'UNIT_TEST_REASON',
      'TestRunner'
    );
    assert('Created maintenance record for Room 101', maintenanceRecords.length === 1);
    const recordId = maintenanceRecords[0]._id;

    // Step 3: Verify Room 101 is Marked Under Maintenance
    console.log('\n--- Step 3: Verify Room 101 Status ---');
    const roomsAfterLock = await getRoomsWithReservationStatus(checkInDate, checkOutDate);
    const room101 = roomsAfterLock.find(r => String(r._id) === '101' || String(r.roomNumber) === '101');
    assert('Room 101 status is maintenance', room101 && room101.status === 'maintenance');
    assert('Room 101 maintenanceType is wellness', room101 && room101.maintenanceType === 'wellness');

    // Step 4: Verify Availability Message Breakdown
    console.log('\n--- Step 4: Verify Availability Summary Message ---');
    const msgAfterLock = await getAvailabilityMessage(checkInDate, checkOutDate);
    assert('Message includes maintenance count', msgAfterLock.maintenanceRooms >= 1);
    assert('Message text mentions maintenance', msgAfterLock.message.includes('maintenance'));

    // Step 5: Complete Maintenance Lock
    console.log('\n--- Step 5: Complete Maintenance ---');
    const completed = await completeMaintenance(recordId);
    assert('Maintenance marked as completed', completed.status === 'completed');

    const roomsAfterComplete = await getRoomsWithReservationStatus(checkInDate, checkOutDate);
    const room101After = roomsAfterComplete.find(r => String(r._id) === '101' || String(r.roomNumber) === '101');
    assert('Room 101 no longer under maintenance', room101After && room101After.status !== 'maintenance');

    // Clean up
    await RoomMaintenance.deleteMany({ reason: 'UNIT_TEST_REASON' });

    console.log('\n====================================================');
    console.log('                 SUMMARY OF TESTS                   ');
    console.log('====================================================');
    console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);

    await mongoose.disconnect();

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('\n🎉 ALL AVAILABILITY TESTS PASSED!\n');
      process.exit(0);
    }

  } catch (error) {
    console.error('Suite error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runSuite();
