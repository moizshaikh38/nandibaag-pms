const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const { mongoUri } = require('../config/env');
const bookingRoutes = require('../routes/bookingRoutes');
const roomRoutes = require('../routes/roomRoutes');
const { checkMultipleRoomsAvailable } = require('../services/availabilityService');
const {
  formatBookingMessageForCustomer,
  formatBookingMessageForStaffGroup
} = require('../utils/bookingMessageFormatter');

async function runTest() {
  console.log('====================================================');
  console.log('      RUNNING MULTI-ROOM ASSIGNMENT SUITE           ');
  console.log('====================================================\n');

  try {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    } catch (_) {
      await mongoose.connect('mongodb://127.0.0.1:27017/nandibaag-pms-test', { serverSelectionTimeoutMS: 3000 });
    }

    const app = express();
    app.use(express.json());
    app.use('/api/bookings', bookingRoutes);
    app.use('/api/rooms', roomRoutes);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const makeRequest = (path, method = 'GET', body = null) => {
      return new Promise((resolve, reject) => {
        const req = http.request(`${baseUrl}${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
        });
        if (body) req.write(JSON.stringify(body));
        req.on('error', reject);
        req.end();
      });
    };

    console.log('--- TEST 1: GET /api/rooms/availability ---');
    const res1 = await makeRequest('/api/rooms/availability?checkInDate=2026-08-15&checkOutDate=2026-08-16');
    console.log('Status:', res1.status);
    console.log('Available Rooms Count:', res1.body.rooms?.length);
    const pass1 = res1.status === 200 && res1.body.success === true && Array.isArray(res1.body.rooms);
    console.log(`TEST 1 RESULT: ${pass1 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 2: checkMultipleRoomsAvailable() Service Check (Unbooked Dates) ---');
    const checkResult = await checkMultipleRoomsAvailable(['101', '103', '105'], '2026-09-01', '2026-09-02');
    console.log('Check Result:', checkResult);
    const pass2 = checkResult.available === true && checkResult.selectedRooms?.length === 3;
    console.log(`TEST 2 RESULT: ${pass2 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 3: POST /api/bookings/manual-booking WITH MULTIPLE ROOMS ---');
    const multiRoomBookingData = {
      customerName: 'Vikram & Friends',
      customerPhone: '+919876500000',
      checkInDate: '2026-09-10',
      checkOutDate: '2026-09-11',
      packageType: 'group',
      guestComposition: { adults: 12, children: 2 },
      bookedBy: { name: 'Kadambari' },
      roomIds: ['101', '103', '105'],
      totalAmount: 36000,
      advancePaid: 10000,
      notes: 'Group booking with 3 cottages'
    };

    const res3 = await makeRequest('/api/bookings/manual-booking', 'POST', multiRoomBookingData);
    console.log('Status:', res3.status);
    console.log('Booking ID:', res3.body.booking?._id);
    console.log('Room IDs:', res3.body.booking?.roomIds);
    console.log('Room ID String:', res3.body.booking?.roomId);
    const pass3 = res3.status === 200 && res3.body.success === true && res3.body.booking?.roomIds?.length === 3;
    console.log(`TEST 3 RESULT: ${pass3 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 4: VERIFY CONFLICT DETECTION FOR BOOKED ROOMS ---');
    const conflictResult = await checkMultipleRoomsAvailable(['101'], '2026-09-10', '2026-09-11');
    console.log('Conflict Result for Booked Room 101:', conflictResult);
    const pass4 = conflictResult.available === false && conflictResult.conflicts?.length > 0;
    console.log(`TEST 4 RESULT: ${pass4 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 5: VERIFY MESSAGES FORMATTING WITH MULTIPLE ROOMS ---');
    const createdBooking = res3.body.booking;
    const customerMsg = formatBookingMessageForCustomer(createdBooking);
    const staffMsg = formatBookingMessageForStaffGroup(createdBooking);

    console.log('Customer Message Room Line:', customerMsg.match(/Room: .*/)?.[0]);
    console.log('Staff Message Room Line:', staffMsg.match(/🏨 Room: .*/)?.[0]);

    const pass5 = customerMsg.includes('Room 101, 103, 105') && staffMsg.includes('Room 101, 103, 105');
    console.log(`TEST 5 RESULT: ${pass5 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('====================================================');
    console.log('                 SUMMARY OF TESTS                   ');
    console.log('====================================================');
    console.log(`TEST 1 (Rooms Availability Endpoint): ${pass1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 2 (checkMultipleRoomsAvailable Unbooked): ${pass2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 3 (POST /manual-booking with roomIds): ${pass3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 4 (Conflict Detection for Booked Rooms): ${pass4 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 5 (Confirmation Messages Formatting): ${pass5 ? '✅ PASS' : '❌ FAIL'}`);

    server.close();
    await mongoose.disconnect();
  } catch (err) {
    console.error('Test error:', err);
  }
}

runTest();
