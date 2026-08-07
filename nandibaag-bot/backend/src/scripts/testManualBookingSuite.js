const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const { mongoUri } = require('../config/env');
const bookingRoutes = require('../routes/bookingRoutes');

async function runTest() {
  console.log('====================================================');
  console.log('      RUNNING MANUAL BOOKING & STAFF SUITE          ');
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

    console.log('--- TEST 1: GET /api/bookings/staff-names ---');
    const res1 = await makeRequest('/api/bookings/staff-names');
    console.log('Status:', res1.status);
    console.log('Staff count:', res1.body.staffNames?.length);
    const pass1 = res1.status === 200 && res1.body.success === true && Array.isArray(res1.body.staffNames);
    console.log(`TEST 1 RESULT: ${pass1 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 2: POST /api/bookings/staff-names (Add Staff) ---');
    const res2 = await makeRequest('/api/bookings/staff-names', 'POST', { name: 'Karan Test' });
    console.log('Status:', res2.status);
    console.log('New Staff:', res2.body.staff);
    const addedStaffId = res2.body.staff?.id;
    const pass2 = res2.status === 200 && res2.body.success === true && res2.body.staff?.name === 'Karan Test';
    console.log(`TEST 2 RESULT: ${pass2 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 3: DELETE /api/bookings/staff-names/:staffId ---');
    const res3 = await makeRequest(`/api/bookings/staff-names/${addedStaffId}`, 'DELETE');
    console.log('Status:', res3.status);
    console.log('Deleted ID:', res3.body.deletedId);
    const pass3 = res3.status === 200 && res3.body.success === true && res3.body.deletedId === addedStaffId;
    console.log(`TEST 3 RESULT: ${pass3 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 4: POST /api/bookings/manual-booking ---');
    const bookingData = {
      customerName: 'Aarav Mehta',
      customerPhone: '+919988776655',
      checkInDate: '2026-08-15',
      checkOutDate: '2026-08-17',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 1 },
      bookedBy: { name: 'Kadambari', staffId: 'staff_1' },
      staffNames: [{ name: 'Kadambari', id: 'staff_1' }],
      totalAmount: 7000,
      notes: 'Anniversary celebration requested'
    };

    const res4 = await makeRequest('/api/bookings/manual-booking', 'POST', bookingData);
    console.log('Status:', res4.status);
    console.log('Booking ID:', res4.body.booking?._id);
    console.log('Package Type:', res4.body.booking?.packageType);
    console.log('Guest Composition:', res4.body.booking?.guestComposition);
    console.log('Notes:', res4.body.booking?.notes);
    const pass4 = res4.status === 200 && res4.body.success === true && res4.body.booking?.customerName === 'Aarav Mehta' && res4.body.booking?.packageType === 'couple';
    console.log(`TEST 4 RESULT: ${pass4 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('====================================================');
    console.log('                 SUMMARY OF TESTS                   ');
    console.log('====================================================');
    console.log(`TEST 1 (GET staff-names): ${pass1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 2 (POST staff-names): ${pass2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 3 (DELETE staff-names): ${pass3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 4 (POST manual-booking): ${pass4 ? '✅ PASS' : '❌ FAIL'}`);

    server.close();
    await mongoose.disconnect();
  } catch (err) {
    console.error('Test error:', err);
  }
}

runTest();
