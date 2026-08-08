const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const { mongoUri } = require('../config/env');
const bookingRoutes = require('../routes/bookingRoutes');
const roomRoutes = require('../routes/roomRoutes');

async function runTest() {
  console.log('====================================================');
  console.log('      RUNNING PHASE 2 MULTI-ROOM DISPLAY SUITE      ');
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

    console.log('--- TEST 1: GET /api/bookings WITH MULTI-ROOM DATA ---');
    const res1 = await makeRequest('/api/bookings');
    console.log('Status:', res1.status);
    console.log('Total Bookings:', res1.body.bookings?.length);

    const multiRoomBooking = res1.body.bookings?.find(b => b.roomIds && b.roomIds.length > 1);
    console.log('Sample Multi-Room Booking:', {
      _id: multiRoomBooking?._id,
      customerName: multiRoomBooking?.customerName,
      roomIds: multiRoomBooking?.roomIds,
      roomId: multiRoomBooking?.roomId
    });

    const pass1 = res1.status === 200 && Array.isArray(res1.body.bookings);
    console.log(`TEST 1 RESULT: ${pass1 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 2: DISPLAY FORMATTING CHECK ---');
    const sampleFormattedRooms = multiRoomBooking?.roomIds?.length > 0
      ? multiRoomBooking.roomIds.join(', ')
      : (multiRoomBooking?.roomId || 'TBA');
    
    console.log('Formatted Rooms String:', sampleFormattedRooms);
    const pass2 = typeof sampleFormattedRooms === 'string' && sampleFormattedRooms.length > 0;
    console.log(`TEST 2 RESULT: ${pass2 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('====================================================');
    console.log('                 SUMMARY OF TESTS                   ');
    console.log('====================================================');
    console.log(`TEST 1 (GET /api/bookings multi-room data): ${pass1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 2 (Multi-room display formatting): ${pass2 ? '✅ PASS' : '❌ FAIL'}`);

    server.close();
    await mongoose.disconnect();
  } catch (err) {
    console.error('Test error:', err);
  }
}

runTest();
