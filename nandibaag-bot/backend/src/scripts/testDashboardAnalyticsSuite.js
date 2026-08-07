const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const { mongoUri } = require('../config/env');
const dashboardRoutes = require('../routes/dashboardRoutes');

async function runTest() {
  console.log('====================================================');
  console.log('    RUNNING DASHBOARD ANALYTICS ENDPOINTS SUITE     ');
  console.log('====================================================\n');

  try {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    } catch (_) {
      await mongoose.connect('mongodb://127.0.0.1:27017/nandibaag-pms-test', { serverSelectionTimeoutMS: 3000 });
    }

    const app = express();
    app.use(express.json());
    app.use('/api/dashboard', dashboardRoutes);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const makeRequest = (path, method = 'GET') => {
      return new Promise((resolve, reject) => {
        const req = http.request(`${baseUrl}${path}`, { method }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
        });
        req.on('error', reject);
        req.end();
      });
    };

    console.log('--- TEST 1: GET /api/dashboard/last-2-days-stats ---');
    const res1 = await makeRequest('/api/dashboard/last-2-days-stats');
    console.log('Response Status:', res1.status);
    console.log('Body:', res1.body);
    const pass1 = res1.status === 200 && res1.body.success === true && typeof res1.body.chatsCount === 'number';
    console.log(`TEST 1 RESULT: ${pass1 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 2: GET /api/dashboard/last-2-days-hot-leads ---');
    const res2 = await makeRequest('/api/dashboard/last-2-days-hot-leads');
    console.log('Response Status:', res2.status);
    console.log('Body count:', res2.body.count);
    const pass2 = res2.status === 200 && res2.body.success === true && Array.isArray(res2.body.hotLeads);
    console.log(`TEST 2 RESULT: ${pass2 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 3: GET /api/dashboard/last-2-days-chats ---');
    const res3 = await makeRequest('/api/dashboard/last-2-days-chats');
    console.log('Response Status:', res3.status);
    console.log('Body count:', res3.body.count);
    const pass3 = res3.status === 200 && res3.body.success === true && Array.isArray(res3.body.chats);
    console.log(`TEST 3 RESULT: ${pass3 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 4: GET /api/dashboard/last-2-days-bookings ---');
    const res4 = await makeRequest('/api/dashboard/last-2-days-bookings');
    console.log('Response Status:', res4.status);
    console.log('Body count:', res4.body.count);
    const pass4 = res4.status === 200 && res4.body.success === true && Array.isArray(res4.body.bookings);
    console.log(`TEST 4 RESULT: ${pass4 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 5: POST /api/dashboard/refresh-stats ---');
    const res5 = await makeRequest('/api/dashboard/refresh-stats', 'POST');
    console.log('Response Status:', res5.status);
    console.log('Body:', res5.body);
    const pass5 = res5.status === 200 && res5.body.success === true;
    console.log(`TEST 5 RESULT: ${pass5 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('====================================================');
    console.log('                 SUMMARY OF TESTS                   ');
    console.log('====================================================');
    console.log(`TEST 1 (last-2-days-stats): ${pass1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 2 (last-2-days-hot-leads): ${pass2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 3 (last-2-days-chats): ${pass3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 4 (last-2-days-bookings): ${pass4 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 5 (refresh-stats): ${pass5 ? '✅ PASS' : '❌ FAIL'}`);

    server.close();
    await mongoose.disconnect();
  } catch (err) {
    console.error('Test error:', err);
  }
}

runTest();
