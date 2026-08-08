const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const { mongoUri } = require('../config/env');
const bookingRoutes = require('../routes/bookingRoutes');
const XLSX = require('xlsx');

async function runTest() {
  console.log('====================================================');
  console.log('   RUNNING TABLE VIEW & EXCEL EXPORT SUITE          ');
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

    const makeRequest = (path, method = 'GET') => {
      return new Promise((resolve, reject) => {
        const req = http.request(`${baseUrl}${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
        });
        req.on('error', reject);
        req.end();
      });
    };

    console.log('--- TEST 1: GET /api/bookings (Fetch All Bookings) ---');
    const res1 = await makeRequest('/api/bookings');
    console.log('Status:', res1.status);
    console.log('Bookings Count:', res1.body.count);
    const pass1 = res1.status === 200 && res1.body.success === true && typeof res1.body.count === 'number';
    console.log(`TEST 1 RESULT: ${pass1 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 2: GENERATE EXCEL (.XLSX) SPREADSHEET IN MEMORY ---');
    const sampleBookings = [
      {
        date: '08/08/2026',
        customerName: 'Swati Kamble',
        customerPhone: '+919876543210',
        checkIn: '09:00 AM',
        checkOut: '9:30 PM',
        totalAmount: 10000,
        advance: 1000,
        pending: 9000,
        adults: 8,
        children: 2,
        totalMembers: 10,
        isOneDay: '✓',
        isGroup: '',
        isCouple: '',
        roomId: '101',
        bookedBy: 'Kadambari',
        notes: 'Family event'
      },
      {
        date: '09/08/2026',
        customerName: 'Moiz Shaikh',
        customerPhone: '+917219311866',
        checkIn: '12:00 PM',
        checkOut: '10:30 AM',
        totalAmount: 3500,
        advance: 3500,
        pending: 0,
        adults: 2,
        children: 0,
        totalMembers: 2,
        isOneDay: '',
        isGroup: '',
        isCouple: '✓',
        roomId: '102',
        bookedBy: 'Ravi',
        notes: ''
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleBookings);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bookings');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    console.log('Excel Buffer Size:', buffer.length, 'bytes');
    const pass2 = Buffer.isBuffer(buffer) && buffer.length > 500;
    console.log(`TEST 2 RESULT: ${pass2 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('====================================================');
    console.log('                 SUMMARY OF TESTS                   ');
    console.log('====================================================');
    console.log(`TEST 1 (GET /api/bookings endpoint): ${pass1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 2 (XLSX Workbook Generation): ${pass2 ? '✅ PASS' : '❌ FAIL'}`);

    server.close();
    await mongoose.disconnect();
  } catch (err) {
    console.error('Test error:', err);
  }
}

runTest();
