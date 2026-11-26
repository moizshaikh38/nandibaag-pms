/**
 * Sprint 4 Phase 2: Staff Analytics Backend Upgrade Tests
 *
 * Classification:
 * - Unit tests for validateStaffAnalyticsParams (real logic)
 * - Route & service tests with stubbed Booking.aggregate / User.findById (in-memory/stubbed)
 */

const assert = require('assert');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../src/config/env');
const { Booking, User } = require('../src/models');
const staffRoutes = require('../src/routes/staffRoutes');
const {
  validateStaffAnalyticsParams,
  StaffAnalyticsValidationError,
  getAllStaffStats
} = require('../src/services/staffAnalyticsService');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ✅ PASS: ${name}`);
    })
    .catch((err) => {
      failed++;
      console.error(`  ❌ FAIL: ${name}\n     ${err.message}`);
    });
}

function makeRequest(server, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, path, method: 'GET', headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('👥 SPRINT 4 PHASE 2: STAFF ANALYTICS BACKEND TESTS');
  console.log('══════════════════════════════════════════════════════════════\n');

  await test('1. validateStaffAnalyticsParams validates IST dateFrom/dateTo & months', () => {
    const p = validateStaffAnalyticsParams({ dateFrom: '2026-11-01', dateTo: '2026-11-26' });
    assert.strictEqual(p.startDate.toISOString(), new Date('2026-11-01T00:00:00.000+05:30').toISOString());
    assert.strictEqual(p.endDate.toISOString(), new Date('2026-11-26T23:59:59.999+05:30').toISOString());

    assert.throws(() => validateStaffAnalyticsParams({ months: 0 }), StaffAnalyticsValidationError);
    assert.throws(() => validateStaffAnalyticsParams({ months: 13 }), StaffAnalyticsValidationError);
    assert.throws(() => validateStaffAnalyticsParams({ dateFrom: '2026-02-30' }), StaffAnalyticsValidationError);
    assert.throws(() => validateStaffAnalyticsParams({ dateFrom: '2026-11-20', dateTo: '2026-11-01' }), StaffAnalyticsValidationError);
  });

  const origAggregate = Booking.aggregate;
  const origUserFindById = User.findById;

  User.findById = () => {
    const userObj = { _id: '507f1f77bcf86cd799439099', role: 'staff', name: 'Kadambari', email: 'k@n.com', isActive: true };
    return { select: () => ({ lean: async () => userObj, then: (r) => r(userObj) }), then: (r) => r(userObj) };
  };

  Booking.aggregate = async (pipeline) => {
    // 1. Booking performance by bookedBy
    if (pipeline.some((s) => s.$addFields && s.$addFields._staffName)) {
      return [
        { _id: 'Kadambari', totalBookings: 3, totalBookingValue: 17500, coupleCount: 2, groupCount: 1, oneDayCount: 0 },
        { _id: 'Unattributed', totalBookings: 1, totalBookingValue: 5500, coupleCount: 1, groupCount: 0, oneDayCount: 0 }
      ];
    }
    // 2. Collection performance by payments[].collectedBy
    if (pipeline.some((s) => s.$unwind === '$payments')) {
      return [
        { _id: 'Kadambari', collectedActive: 11000, collectedCancelled: 500, collectionCountActive: 2, collectionCountCancelled: 1 },
        { _id: 'Ravi', collectedActive: 4000, collectedCancelled: 0, collectionCountActive: 1, collectionCountCancelled: 0 }
      ];
    }
    // 3. Legacy untimestamped
    if (pipeline.some((s) => s.$addFields && s.$addFields._legacyAdv)) {
      return [{ count: 1, totalAmount: 1500 }];
    }
    return [];
  };

  const staffToken = jwt.sign({ id: '507f1f77bcf86cd799439099', role: 'staff' }, jwtSecret);
  const app = express();
  app.use('/api/staff', staffRoutes);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    await test('2. GET /api/staff/analytics requires auth (401)', async () => {
      const res = await makeRequest(server, '/api/staff/analytics');
      assert.strictEqual(res.status, 401);
    });

    await test('3. GET /api/staff/analytics rejects invalid months/dates (400)', async () => {
      const r1 = await makeRequest(server, '/api/staff/analytics?months=24', { Authorization: `Bearer ${staffToken}` });
      assert.strictEqual(r1.status, 400);
      const r2 = await makeRequest(server, '/api/staff/analytics?dateFrom=bad-date', { Authorization: `Bearer ${staffToken}` });
      assert.strictEqual(r2.status, 400);
    });

    await test('4. GET /api/staff/analytics merges booking & collection attribution, separates cancelled & legacy', async () => {
      const res = await makeRequest(
        server,
        '/api/staff/analytics?dateFrom=2026-11-01&dateTo=2026-11-26',
        { Authorization: `Bearer ${staffToken}` }
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.stats.length, 3); // Kadambari, Ravi, Unattributed
      const kad = res.body.stats.find((s) => s.name === 'Kadambari');
      assert.strictEqual(kad.totalBookings, 3);
      assert.strictEqual(kad.totalBookingValue, 17500);
      assert.strictEqual(kad.collectedAmount, 11000);
      assert.strictEqual(kad.cancelledCollectedAmount, 500);
      assert.strictEqual(res.body.metadata.legacyUntimestampedCount, 1);
      assert.strictEqual(res.body.metadata.legacyUntimestampedAmount, 1500);
    });

    await test('5. Empty dataset returns empty stats cleanly', async () => {
      Booking.aggregate = async () => [];
      const res = await getAllStaffStats({ months: 3 });
      assert.deepStrictEqual(res.stats, []);
      assert.strictEqual(res.metadata.legacyUntimestampedCount, 0);
    });
  } finally {
    server.close();
    Booking.aggregate = origAggregate;
    User.findById = origUserFindById;
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`SPRINT 4 PHASE 2 STAFF ANALYTICS SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('══════════════════════════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}

run();
