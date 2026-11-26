/**
 * Sprint 4 Phase 1: Backend Analytics Engine Tests
 *
 * Classification:
 * - Unit tests for validateAnalyticsParams (real logic)
 * - Route & service tests with stubbed Booking.aggregate / User.findById (in-memory/stubbed)
 */

const assert = require('assert');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../src/config/env');
const { Booking, User } = require('../src/models');
const dashboardRoutes = require('../src/routes/dashboardRoutes');
const { validateAnalyticsParams, AnalyticsValidationError, getDashboardAnalytics } = require('../src/services/analyticsService');

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
  console.log('📊 SPRINT 4 PHASE 1: BACKEND ANALYTICS ENGINE TESTS');
  console.log('══════════════════════════════════════════════════════════════\n');

  await test('1. validateAnalyticsParams enforces IST boundaries & rejects invalid params', () => {
    const p = validateAnalyticsParams({ dateFrom: '2026-11-01', dateTo: '2026-11-30', dateBasis: 'stay', granularity: 'weekly' });
    assert.strictEqual(p.startDate.toISOString(), new Date('2026-11-01T00:00:00.000+05:30').toISOString());
    assert.strictEqual(p.endDate.toISOString(), new Date('2026-11-30T23:59:59.999+05:30').toISOString());

    assert.throws(() => validateAnalyticsParams({ dateFrom: '2026-02-30' }), AnalyticsValidationError);
    assert.throws(() => validateAnalyticsParams({ dateFrom: '2026-11-10', dateTo: '2026-11-01' }), AnalyticsValidationError);
    assert.throws(() => validateAnalyticsParams({ dateFrom: '2025-01-01', dateTo: '2026-11-01' }), AnalyticsValidationError);
    assert.throws(() => validateAnalyticsParams({ dateBasis: 'invalid' }), AnalyticsValidationError);
    assert.throws(() => validateAnalyticsParams({ granularity: 'hourly' }), AnalyticsValidationError);
  });

  const origAggregate = Booking.aggregate;
  const origUserFindById = User.findById;
  const capturedPipelines = [];

  User.findById = () => {
    const userObj = { _id: '507f1f77bcf86cd799439099', role: 'staff', name: 'Kadambari', email: 'k@n.com', isActive: true };
    return { select: () => ({ lean: async () => userObj, then: (r) => r(userObj) }), then: (r) => r(userObj) };
  };

  Booking.aggregate = async (pipeline) => {
    capturedPipelines.push(pipeline);
    // 1: overviewFacet
    if (pipeline.some((s) => s.$facet)) {
      return [{
        activeSummary: [{
          totalBookings: 2,
          totalBookingValue: 12000,
          totalCollected: 7500,
          outstandingBalance: 4500,
          fullyPaidCount: 1,
          partiallyPaidCount: 1,
          unpaidCount: 0
        }],
        byStatus: [{ _id: 'confirmed', count: 2 }, { _id: 'cancelled', count: 1 }],
        packageBreakdown: [
          { _id: 'couple', bookingCount: 1, bookingValue: 6500, collectedAmount: 6500, outstandingBalance: 0 },
          { _id: 'unknown', bookingCount: 1, bookingValue: 5500, collectedAmount: 1000, outstandingBalance: 4500 }
        ]
      }];
    }
    // 2: collectionsAgg
    if (pipeline.some((s) => s.$unwind === '$payments')) {
      return [
        { _id: false, totalAmount: 6500, transactionCount: 1 },
        { _id: true, totalAmount: 500, transactionCount: 1 }
      ];
    }
    // 3: legacyUntimestampedAgg
    if (pipeline.some((s) => s.$addFields && s.$addFields._legacyAdv)) {
      return [{ count: 1, totalAmount: 1000 }];
    }
    // 4: trendsAgg
    if (pipeline.some((s) => s.$group && s.$group._id && s.$group._id.$dateToString)) {
      return [{ _id: '2026-11-26', bookingsCreated: 2, bookingValue: 12000 }];
    }
    // 5: stayAgg
    if (pipeline.some((s) => s.$group && s.$group._id && s.$group._id.$eq)) {
      return [
        { _id: false, bookingCount: 1, bookingValue: 6500 },
        { _id: true, bookingCount: 1, bookingValue: 5500 }
      ];
    }
    return [];
  };

  const staffToken = jwt.sign({ id: '507f1f77bcf86cd799439099', role: 'staff' }, jwtSecret);
  const app = express();
  app.use('/api/dashboard', dashboardRoutes);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    await test('2. GET /api/dashboard/analytics requires auth (401)', async () => {
      const res = await makeRequest(server, '/api/dashboard/analytics');
      assert.strictEqual(res.status, 401);
    });

    await test('3. GET /api/dashboard/analytics rejects invalid query params (400)', async () => {
      const res = await makeRequest(server, '/api/dashboard/analytics?granularity=yearly', { Authorization: `Bearer ${staffToken}` });
      assert.strictEqual(res.status, 400);
    });

    await test('4. GET /api/dashboard/analytics returns structured metrics, legacy flags & IST trends', async () => {
      capturedPipelines.length = 0;
      const res = await makeRequest(
        server,
        '/api/dashboard/analytics?dateFrom=2026-11-01&dateTo=2026-11-26&dateBasis=created&granularity=daily',
        { Authorization: `Bearer ${staffToken}` }
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.bookingOverview.totalBookingValue, 12000);
      assert.strictEqual(res.body.paymentPosition.totalCollected, 7500);
      assert.strictEqual(res.body.paymentPosition.outstandingBalance, 4500);
      assert.strictEqual(res.body.collections.periodCollectedActive, 6500);
      assert.strictEqual(res.body.collections.periodCollectedCancelled, 500);
      assert.strictEqual(res.body.collections.legacyUntimestampedCount, 1);
      assert.strictEqual(res.body.stayAnalytics.overnightBookings, 1);
      assert.strictEqual(res.body.stayAnalytics.oneDayBookings, 1);
      assert.strictEqual(res.body.packageBreakdown.length, 2);
      assert.strictEqual(res.body.metadata.legacyPaymentsAffected, true);
      assert.strictEqual(res.body.metadata.timezone, 'Asia/Kolkata (+05:30)');
    });

    await test('5. Empty dataset returns zeroed metrics cleanly', async () => {
      Booking.aggregate = async () => [];
      const data = await getDashboardAnalytics({ dateFrom: '2026-11-01', dateTo: '2026-11-26' });
      assert.strictEqual(data.bookingOverview.totalBookings, 0);
      assert.strictEqual(data.paymentPosition.outstandingBalance, 0);
      assert.strictEqual(data.collections.periodCollectedActive, 0);
      assert.strictEqual(data.metadata.legacyPaymentsAffected, false);
    });
  } finally {
    server.close();
    Booking.aggregate = origAggregate;
    User.findById = origUserFindById;
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`SPRINT 4 PHASE 1 ANALYTICS SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('══════════════════════════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}

run();
