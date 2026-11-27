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
const { Booking, Staff, User } = require('../src/models');
const staffRoutes = require('../src/routes/staffRoutes');
const {
  validateStaffAnalyticsParams,
  StaffAnalyticsValidationError,
  getAllStaffStats,
  getIndividualStaffProfile
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

    const origStaffFind = Staff.find;
    const origBookingFind = Booking.find;

    try {
      await test('6. Case-insensitive reconciliation merges "Ravi" bookings & "ravi" collections into 1 canonical entry', async () => {
        Staff.find = () => ({
          lean: async () => [{ name: 'Ravi', status: 'active', role: 'Front Desk', contact: '9999999999' }]
        });
        Booking.aggregate = async (pipeline) => {
          if (pipeline.some((s) => s.$addFields && s.$addFields._staffName)) {
            return [
              { _id: 'Ravi', totalBookings: 103, totalBookingValue: 1328150, coupleCount: 80, groupCount: 20, oneDayCount: 3 }
            ];
          }
          if (pipeline.some((s) => s.$unwind === '$payments')) {
            return [
              { _id: 'ravi', collectedActive: 500000, collectedCancelled: 5000, collectionCountActive: 40, collectionCountCancelled: 1 }
            ];
          }
          if (pipeline.some((s) => s.$addFields && s.$addFields._monthlyStaffName)) {
            return [
              { _id: { staffName: 'Ravi', month: '2026-11' }, count: 80, revenue: 918400 },
              { _id: { staffName: 'ravi', month: '2026-10' }, count: 23, revenue: 409750 }
            ];
          }
          return [];
        };

        const res = await getAllStaffStats({ months: 3 });
        const raviEntries = res.stats.filter((s) => s.name.toLowerCase() === 'ravi');
        assert.strictEqual(raviEntries.length, 1);
        assert.strictEqual(raviEntries[0].name, 'Ravi');
        assert.strictEqual(raviEntries[0].totalBookings, 103);
        assert.strictEqual(raviEntries[0].totalCount, 103);
        assert.strictEqual(raviEntries[0].totalBookingValue, 1328150);
        assert.strictEqual(raviEntries[0].collectedAmount, 500000);
        assert.strictEqual(raviEntries[0].cancelledCollectedAmount, 5000);
        assert.strictEqual(raviEntries[0].monthlyStats['2026-11'].count, 80);
        assert.strictEqual(raviEntries[0].monthlyStats['2026-10'].count, 23);
      });

      await test('7. Case and whitespace variants ("Ravi", "ravi", " Ravi ") reconcile to one identity', async () => {
        Staff.find = () => ({ lean: async () => [{ name: 'Ravi', status: 'active' }] });
        Booking.aggregate = async (pipeline) => {
          if (pipeline.some((s) => s.$addFields && s.$addFields._staffName)) {
            return [
              { _id: 'Ravi', totalBookings: 2, totalBookingValue: 10000, coupleCount: 2, groupCount: 0, oneDayCount: 0 },
              { _id: 'ravi', totalBookings: 1, totalBookingValue: 5000, coupleCount: 1, groupCount: 0, oneDayCount: 0 }
            ];
          }
          if (pipeline.some((s) => s.$unwind === '$payments')) {
            return [
              { _id: ' Ravi ', collectedActive: 7500, collectedCancelled: 0, collectionCountActive: 2, collectionCountCancelled: 0 }
            ];
          }
          return [];
        };
        const res = await getAllStaffStats({ months: 3 });
        assert.strictEqual(res.stats.length, 1);
        assert.strictEqual(res.stats[0].name, 'Ravi');
        assert.strictEqual(res.stats[0].totalBookings, 3);
        assert.strictEqual(res.stats[0].totalBookingValue, 15000);
        assert.strictEqual(res.stats[0].collectedAmount, 7500);
      });

      await test('8. Profile consistency: getIndividualStaffProfile("ravi", 6) and ("Ravi", 6) match & include packageBreakdown + <=10 recent bookings', async () => {
        Staff.find = () => ({ lean: async () => [{ name: 'Ravi', status: 'active', role: 'Manager', contact: '9876543210' }] });
        const fakeBookings = Array.from({ length: 10 }, (_, i) => ({
          _id: `b_${i}`,
          customerName: `Guest ${i + 1}`,
          packageType: 'couple',
          totalAmount: 5000,
          createdAt: new Date(`2026-11-${String(20 - i).padStart(2, '0')}T10:00:00Z`),
          status: 'confirmed',
          guestPhone: 'SHOULD_NOT_LEAK'
        }));
        let capturedLimit = null;
        Booking.find = () => ({
          select: () => ({
            sort: () => ({
              limit: (n) => {
                capturedLimit = n;
                return { lean: async () => fakeBookings.slice(0, n) };
              }
            })
          })
        });
        Booking.aggregate = async (pipeline) => {
          if (pipeline.some((s) => s.$addFields && s.$addFields._staffName)) {
            return [
              { _id: 'Ravi', totalBookings: 106, totalBookingValue: 1382150, coupleCount: 80, groupCount: 20, oneDayCount: 6 }
            ];
          }
          if (pipeline.some((s) => s.$unwind === '$payments')) {
            return [
              { _id: 'ravi', collectedActive: 600000, collectedCancelled: 0, collectionCountActive: 50, collectionCountCancelled: 0 }
            ];
          }
          if (pipeline.some((s) => s.$match && s.$match.$or)) {
            return [
              { _id: '2026-11', count: 80, revenue: 918400 },
              { _id: '2026-09', count: 18, revenue: 276250 },
              { _id: '2026-08', count: 8, revenue: 187500 }
            ];
          }
          return [];
        };

        const pLower = await getIndividualStaffProfile('ravi', 6);
        const pUpper = await getIndividualStaffProfile('Ravi', 6);

        assert.strictEqual(pLower.name, 'Ravi');
        assert.strictEqual(pUpper.name, 'Ravi');
        assert.strictEqual(pLower.totalBookings, 106);
        assert.strictEqual(pUpper.totalBookings, 106);
        assert.strictEqual(pLower.totalRevenue, 1382150);
        assert.strictEqual(pUpper.totalRevenue, 1382150);
        assert.strictEqual(pLower.collectedAmount, 600000);
        assert.deepStrictEqual(pLower.packageBreakdown, { couple: 80, group: 20, oneDay: 6 });
        assert.deepStrictEqual(pLower.monthlyStats, pUpper.monthlyStats);
        const monthlyCountSum = Object.values(pLower.monthlyStats).reduce((s, m) => s + m.count, 0);
        assert.strictEqual(monthlyCountSum, pLower.totalBookings);
        assert.strictEqual(capturedLimit, 10);
        assert.strictEqual(pLower.bookings.length, 10);
        assert.strictEqual(pLower.bookings[0].guestPhone, undefined);
      });

      await test('9. Missing, empty, whitespace-only, and malformed identity records do not crash', async () => {
        Staff.find = () => ({ lean: async () => [{ name: '  ', status: 'active' }, null] });
        Booking.find = () => ({
          select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) })
        });
        Booking.aggregate = async (pipeline) => {
          if (pipeline.some((s) => s.$addFields && s.$addFields._staffName)) {
            return [
              null,
              { _id: null, totalBookings: 1, totalBookingValue: 3000 },
              { _id: '   ', totalBookings: 2, totalBookingValue: 4000 }
            ];
          }
          if (pipeline.some((s) => s.$unwind === '$payments')) {
            return [
              { _id: '', collectedActive: 1000, collectedCancelled: 0, collectionCountActive: 1, collectionCountCancelled: 0 }
            ];
          }
          return [];
        };

        const res = await getAllStaffStats({ months: 3 });
        assert.strictEqual(res.stats.length, 1);
        assert.strictEqual(res.stats[0].name, 'Unattributed');
        assert.strictEqual(res.stats[0].totalBookings, 3);
        assert.strictEqual(res.stats[0].collectedAmount, 1000);

        const emptyProfile = await getIndividualStaffProfile('   ', 6);
        assert.strictEqual(emptyProfile.name, 'Unattributed');
        assert.deepStrictEqual(emptyProfile.bookings, []);
      });

      await test('10. F-01: bookingAgg falls back from packageType to bookingType to unknown without double counting', async () => {
        Staff.find = () => ({ lean: async () => [{ name: 'Ravi', status: 'active' }] });
        const syntheticBookings = [
          { _id: '1', bookedBy: { name: 'Ravi' }, packageType: 'group', bookingType: 'couple', totalAmount: 8000 },
          { _id: '2', bookedBy: { name: 'Ravi' }, bookingType: 'couple', totalAmount: 5500 },
          { _id: '3', bookedBy: { name: 'Ravi' }, packageType: '', bookingType: 'picnic', totalAmount: 2000 },
          { _id: '4', bookedBy: { name: 'Ravi' }, totalAmount: 3000 }
        ];

        let capturedPkgExpr = null;
        Booking.aggregate = async (pipeline) => {
          const addFieldsStage = pipeline.find((s) => s.$addFields && s.$addFields._staffName);
          if (addFieldsStage) {
            capturedPkgExpr = addFieldsStage.$addFields._pkg;
            const groupStage = pipeline.find((s) => s.$group);
            const oneDaySet = new Set(groupStage.$group.oneDayCount.$sum.$cond[0].$in[1]);
            // Evaluate the exact package fallback semantics across synthetic bookings
            let coupleCount = 0;
            let groupCount = 0;
            let oneDayCount = 0;
            let totalBookingValue = 0;
            for (const doc of syntheticBookings) {
              const pkg = String(doc.packageType ?? '').trim();
              const bType = String(doc.bookingType ?? '').trim();
              const resolved = pkg.length > 0 ? pkg : (bType.length > 0 ? bType : 'unknown');
              if (resolved === 'couple') coupleCount++;
              else if (resolved === 'group') groupCount++;
              else if (oneDaySet.has(resolved)) oneDayCount++;
              totalBookingValue += doc.totalAmount || 0;
            }
            return [{
              _id: 'Ravi',
              totalBookings: syntheticBookings.length,
              totalBookingValue,
              coupleCount,
              groupCount,
              oneDayCount
            }];
          }
          return [];
        };

        const res = await getAllStaffStats({ months: 3 });
        assert.ok(capturedPkgExpr && capturedPkgExpr.$let, 'bookingAgg _pkg must use $let fallback');
        assert.strictEqual(res.stats.length, 1);
        assert.strictEqual(res.stats[0].totalBookings, 4);
        assert.strictEqual(res.stats[0].totalBookingValue, 18500);
        assert.deepStrictEqual(res.stats[0].packageBreakdown, { couple: 1, group: 1, oneDay: 1 });
      });
    } finally {
      Staff.find = origStaffFind;
      Booking.find = origBookingFind;
    }
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
