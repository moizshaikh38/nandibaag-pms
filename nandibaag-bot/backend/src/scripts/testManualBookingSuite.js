const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const { mongoUri } = require('../config/env');
const bookingRoutes = require('../routes/bookingRoutes');
const {
  formatBookingMessageForCustomer,
  formatBookingMessageForStaffGroup
} = require('../utils/bookingMessageFormatter');

async function runTest() {
  console.log('====================================================');
  console.log('      RUNNING MANUAL BOOKING & DYNAMIC TIMINGS SUITE ');
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
    const pass1 = res1.status === 200 && res1.body.success === true;
    console.log(`TEST 1 RESULT: ${pass1 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- SCENARIO 1: ONE DAY PICNIC (B→D) ---');
    const sc1Data = {
      customerName: 'Aarav Mehta',
      customerPhone: '+919988776655',
      checkInDate: '2026-08-15',
      packageType: 'oneDay',
      mealOption: 'B->D',
      guestComposition: { adults: 4, children: 0 },
      bookedBy: { name: 'Kadambari' },
      totalAmount: 5000,
      advancePaid: 1000
    };
    const resSc1 = await makeRequest('/api/bookings/manual-booking', 'POST', sc1Data);
    const msg1Cust = formatBookingMessageForCustomer(resSc1.body.booking);
    const msg1Staff = formatBookingMessageForStaffGroup(resSc1.body.booking);
    const passSc1 = msg1Cust.includes('⏳ Check in: 09:00 AM') && msg1Cust.includes('⏳ Check out: 9:30 PM') && msg1Staff.includes('Meal: B->D');
    console.log('Customer Check-in/out:', msg1Cust.match(/⏳ Check in: .*\n⏳ Check out: .*/)?.[0]);
    console.log(`SCENARIO 1 (One Day B→D) RESULT: ${passSc1 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- SCENARIO 2: ONE DAY PICNIC (B→T) ---');
    const sc2Data = {
      customerName: 'Rohan Verma',
      customerPhone: '+919988776644',
      checkInDate: '2026-08-15',
      packageType: 'oneDay',
      mealOption: 'B->T',
      guestComposition: { adults: 2, children: 1 },
      bookedBy: { name: 'Ravi' },
      totalAmount: 3250
    };
    const resSc2 = await makeRequest('/api/bookings/manual-booking', 'POST', sc2Data);
    const msg2Cust = formatBookingMessageForCustomer(resSc2.body.booking);
    const msg2Staff = formatBookingMessageForStaffGroup(resSc2.body.booking);
    const passSc2 = msg2Cust.includes('⏳ Check in: 09:00 AM') && msg2Cust.includes('⏳ Check out: 6:30 PM') && msg2Staff.includes('Meal: B->T');
    console.log('Customer Check-in/out:', msg2Cust.match(/⏳ Check in: .*\n⏳ Check out: .*/)?.[0]);
    console.log(`SCENARIO 2 (One Day B→T) RESULT: ${passSc2 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- SCENARIO 3: ONE DAY PICNIC (B→L) ---');
    const sc3Data = {
      customerName: 'Pooja Patel',
      customerPhone: '+919988776633',
      checkInDate: '2026-08-15',
      packageType: 'oneDay',
      mealOption: 'B->L',
      guestComposition: { adults: 3, children: 0 },
      bookedBy: { name: 'Priti' },
      totalAmount: 3000
    };
    const resSc3 = await makeRequest('/api/bookings/manual-booking', 'POST', sc3Data);
    const msg3Cust = formatBookingMessageForCustomer(resSc3.body.booking);
    const msg3Staff = formatBookingMessageForStaffGroup(resSc3.body.booking);
    const passSc3 = msg3Cust.includes('⏳ Check in: 09:00 AM') && msg3Cust.includes('⏳ Check out: 2:30 PM') && msg3Staff.includes('Meal: B->L');
    console.log('Customer Check-in/out:', msg3Cust.match(/⏳ Check in: .*\n⏳ Check out: .*/)?.[0]);
    console.log(`SCENARIO 3 (One Day B→L) RESULT: ${passSc3 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- SCENARIO 4: COUPLE STAY ---');
    const sc4Data = {
      customerName: 'Karan & Ananya',
      customerPhone: '+919988776622',
      checkInDate: '2026-08-15',
      checkOutDate: '2026-08-16',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Mansi' },
      totalAmount: 5500
    };
    const resSc4 = await makeRequest('/api/bookings/manual-booking', 'POST', sc4Data);
    const msg4Cust = formatBookingMessageForCustomer(resSc4.body.booking);
    const passSc4 = msg4Cust.includes('⏳ Check in: 12:00 PM') && msg4Cust.includes('⏳ Check out: 10:30 AM');
    console.log('Customer Check-in/out:', msg4Cust.match(/⏳ Check in: .*\n⏳ Check out: .*/)?.[0]);
    console.log(`SCENARIO 4 (Couple Stay) RESULT: ${passSc4 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- SCENARIO 5: GROUP STAY ---');
    const sc5Data = {
      customerName: 'Swati Kamble',
      customerPhone: '+919876543210',
      checkInDate: '2026-08-15',
      checkOutDate: '2026-08-16',
      packageType: 'group',
      guestComposition: { adults: 8, children: 2 },
      bookedBy: { name: 'Kadambari' },
      totalAmount: 10000,
      advancePaid: 1000
    };
    const resSc5 = await makeRequest('/api/bookings/manual-booking', 'POST', sc5Data);
    const msg5Cust = formatBookingMessageForCustomer(resSc5.body.booking);
    const passSc5 = msg5Cust.includes('⏳ Check in: 12:00 PM') && msg5Cust.includes('⏳ Check out: 10:30 AM');
    console.log('Customer Check-in/out:', msg5Cust.match(/⏳ Check in: .*\n⏳ Check out: .*/)?.[0]);
    console.log(`SCENARIO 5 (Group Stay) RESULT: ${passSc5 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('====================================================');
    console.log('                 SUMMARY OF TESTS                   ');
    console.log('====================================================');
    console.log(`SCENARIO 1 (One Day B→D [9 AM - 9:30 PM]): ${passSc1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`SCENARIO 2 (One Day B→T [9 AM - 6:30 PM]): ${passSc2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`SCENARIO 3 (One Day B→L [9 AM - 2:30 PM]): ${passSc3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`SCENARIO 4 (Couple Stay [12 PM - 10:30 AM]): ${passSc4 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`SCENARIO 5 (Group Stay [12 PM - 10:30 AM]): ${passSc5 ? '✅ PASS' : '❌ FAIL'}`);

    server.close();
    await mongoose.disconnect();
  } catch (err) {
    console.error('Test error:', err);
  }
}

runTest();
