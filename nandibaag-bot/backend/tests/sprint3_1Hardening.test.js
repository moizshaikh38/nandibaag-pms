/**
 * Sprint 3.1: Payment Integrity Hardening Regression Suite
 *
 * Tests (in-memory/stubbed Mongoose models):
 * - Concurrent payment CAS (__v) protection & overpayment prevention
 * - Payment & settlement idempotency recovery (post-persistence failure)
 * - Settlement already-paid protection & idempotency replay
 * - Regex-safe booking search
 * - IST (+05:30) date-range boundaries
 */

const assert = require('assert');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../src/config/env');
const { Booking, IdempotencyRecord, ActivityLog, User } = require('../src/models');
const pmsBookingRoutes = require('../src/routes/pmsBookingRoutes');

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

function makeRequest(server, method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
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
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('🔒 SPRINT 3.1: PAYMENT INTEGRITY HARDENING SUITE');
  console.log('══════════════════════════════════════════════════════════════\n');

  const bookingId = '507f1f77bcf86cd799439021';
  const paidBookingId = '507f1f77bcf86cd799439022';

  const bookingsStore = [
    {
      _id: bookingId,
      __v: 0,
      customerName: 'Rohan Kulkarni',
      customerPhone: '+919800011122',
      packageType: 'couple',
      status: 'confirmed',
      totalAmount: 5500,
      advancePayment: 1500,
      advancePaid: 1500,
      remainingPayment: 4000,
      paymentStatus: 'partially_paid',
      payments: [{ amount: 1500, mode: 'upi' }],
      toObject: function () { return { ...this }; }
    },
    {
      _id: paidBookingId,
      __v: 0,
      customerName: 'Meera Joshi',
      customerPhone: '+919800033344',
      packageType: 'couple',
      status: 'confirmed',
      totalAmount: 5500,
      advancePayment: 5500,
      advancePaid: 5500,
      remainingPayment: 0,
      paymentStatus: 'paid',
      payments: [{ amount: 5500, mode: 'upi' }],
      toObject: function () { return { ...this }; }
    }
  ];

  const idempotencyStore = new Map();
  const auditLogs = [];
  let lastFindFilter = null;
  let simulateCompleteIdemFailure = false;

  const origFindById = Booking.findById;
  const origFindOneAndUpdate = Booking.findOneAndUpdate;
  const origFind = Booking.find;
  const origCountDocuments = Booking.countDocuments;
  const origIdemCreate = IdempotencyRecord.create;
  const origIdemFindOne = IdempotencyRecord.findOne;
  const origIdemUpdateOne = IdempotencyRecord.updateOne;
  const origIdemDeleteOne = IdempotencyRecord.deleteOne;
  const origActivityCreate = ActivityLog.create;
  const origUserFindById = User.findById;

  User.findById = () => {
    const userObj = {
      _id: '507f1f77bcf86cd799439099',
      role: 'staff',
      name: 'Kadambari',
      email: 'kadambari@nandibaag.com',
      isActive: true
    };
    return {
      select: () => ({ lean: async () => userObj, then: (r) => r(userObj) }),
      then: (r) => r(userObj)
    };
  };

  Booking.findById = async (id) => {
    const found = bookingsStore.find((b) => String(b._id) === String(id));
    return found ? { ...found, payments: [...found.payments] } : null;
  };

  Booking.findOneAndUpdate = async (filter, update) => {
    const idx = bookingsStore.findIndex(
      (b) => String(b._id) === String(filter._id) && (b.__v ?? 0) === filter.__v
    );
    if (idx === -1) return null; // CAS version mismatch!
    const updated = {
      ...bookingsStore[idx],
      ...update.$set,
      __v: (bookingsStore[idx].__v ?? 0) + (update.$inc?.__v || 1)
    };
    bookingsStore[idx] = updated;
    return { ...updated, toObject: () => ({ ...updated }) };
  };

  Booking.countDocuments = async (filter) => {
    lastFindFilter = filter;
    return 0;
  };
  Booking.find = (filter) => {
    lastFindFilter = filter;
    return {
      populate() { return this; },
      sort() { return this; },
      limit() { return this; },
      skip() { return this; },
      then(resolve) { resolve([]); }
    };
  };

  IdempotencyRecord.create = async (doc) => {
    if (idempotencyStore.has(doc.scopeKey)) {
      const err = new Error('Duplicate key');
      err.code = 11000;
      throw err;
    }
    const rec = { ...doc };
    idempotencyStore.set(doc.scopeKey, rec);
    return rec;
  };
  IdempotencyRecord.findOne = async ({ scopeKey }) => idempotencyStore.get(scopeKey) || null;
  IdempotencyRecord.updateOne = async ({ scopeKey }, update) => {
    if (simulateCompleteIdemFailure && update.$set?.status === 'completed') {
      throw new Error('Simulated completeIdempotency failure');
    }
    const rec = idempotencyStore.get(scopeKey);
    if (rec && update.$set) Object.assign(rec, update.$set);
    return { modifiedCount: rec ? 1 : 0 };
  };
  IdempotencyRecord.deleteOne = async ({ scopeKey }) => {
    idempotencyStore.delete(scopeKey);
    return { deletedCount: 1 };
  };
  ActivityLog.create = async (doc) => {
    auditLogs.push(doc);
    return doc;
  };

  const staffToken = jwt.sign(
    { id: '507f1f77bcf86cd799439099', role: 'staff', name: 'Kadambari', email: 'kadambari@nandibaag.com' },
    jwtSecret
  );

  const app = express();
  app.use(express.json());
  app.use('/api/pms', pmsBookingRoutes);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    await test('1. Concurrent payments with different keys: CAS prevents overpayment & preserves history', async () => {
      const [r1, r2] = await Promise.all([
        makeRequest(server, 'POST', `/api/pms/bookings/${bookingId}/payments`, { amount: 4000, mode: 'upi' }, { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'conc-key-a1' }),
        makeRequest(server, 'POST', `/api/pms/bookings/${bookingId}/payments`, { amount: 4000, mode: 'cash' }, { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'conc-key-b2' })
      ]);
      const statuses = [r1.status, r2.status].sort();
      assert.deepStrictEqual(statuses, [201, 400]);
      assert.strictEqual(bookingsStore[0].advancePaid, 5500);
      assert.strictEqual(bookingsStore[0].remainingPayment, 0);
      assert.strictEqual(bookingsStore[0].payments.length, 2);
    });

    await test('2. Settlement on already-paid booking is rejected (400) with no zero-value payment or audit log', async () => {
      const auditCountBefore = auditLogs.length;
      const res = await makeRequest(
        server,
        'PATCH',
        `/api/pms/bookings/${paidBookingId}/settle-payment`,
        { mode: 'cash' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'settle-paid-1' }
      );
      assert.strictEqual(res.status, 400);
      assert.strictEqual(bookingsStore[1].payments.length, 1);
      assert.strictEqual(auditLogs.length, auditCountBefore);
    });

    await test('3. Payment persistence followed by completeIdempotency failure does not release lock & recovers on retry', async () => {
      // Reset booking[0] to partially paid
      bookingsStore[0].payments = [{ amount: 1500, mode: 'upi' }];
      bookingsStore[0].advancePaid = 1500;
      bookingsStore[0].advancePayment = 1500;
      bookingsStore[0].remainingPayment = 4000;
      bookingsStore[0].paymentStatus = 'partially_paid';

      simulateCompleteIdemFailure = true;
      const rFail = await makeRequest(
        server,
        'POST',
        `/api/pms/bookings/${bookingId}/payments`,
        { amount: 1000, mode: 'upi' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'idem-rec-1' }
      );
      assert.strictEqual(rFail.status, 500);
      assert.strictEqual(bookingsStore[0].advancePaid, 2500); // persisted!

      // Lock must NOT have been released, and bookingId must be attached
      const scopeKey = `507f1f77bcf86cd799439099:POST:/api/pms/bookings/${bookingId}/payments:idem-rec-1`;
      assert.strictEqual(idempotencyStore.has(scopeKey), true);
      assert.strictEqual(String(idempotencyStore.get(scopeKey).bookingId), bookingId);

      // Retry with same key recovers without double-recording
      simulateCompleteIdemFailure = false;
      const rRetry = await makeRequest(
        server,
        'POST',
        `/api/pms/bookings/${bookingId}/payments`,
        { amount: 1000, mode: 'upi' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'idem-rec-1' }
      );
      assert.strictEqual([200, 201].includes(rRetry.status), true);
      assert.strictEqual(bookingsStore[0].advancePaid, 2500); // still 2500, no duplicate!
    });

    await test('4. Settlement idempotency replay prevents duplicate settlement', async () => {
      const r1 = await makeRequest(
        server,
        'PATCH',
        `/api/pms/bookings/${bookingId}/settle-payment`,
        { mode: 'cash' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'settle-key-1' }
      );
      assert.strictEqual(r1.status, 200);
      assert.strictEqual(bookingsStore[0].remainingPayment, 0);

      const r2 = await makeRequest(
        server,
        'PATCH',
        `/api/pms/bookings/${bookingId}/settle-payment`,
        { mode: 'cash' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'settle-key-1' }
      );
      assert.strictEqual(r2.status, 200);
      assert.strictEqual(bookingsStore[0].payments.length, 3); // 1500 + 1000 + 3000, no duplicate!
    });

    await test('5. Regex-safe booking search escapes metacharacters & rejects >100 chars', async () => {
      const rSpecial = await makeRequest(
        server,
        'GET',
        `/api/pms/bookings?search=${encodeURIComponent('.*+?^${}()|[]\\')}`,
        null,
        { Authorization: `Bearer ${staffToken}` }
      );
      assert.strictEqual(rSpecial.status, 200);
      assert.strictEqual(lastFindFilter.$or[0].customerName.$regex, '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');

      const rLong = await makeRequest(
        server,
        'GET',
        `/api/pms/bookings?search=${'a'.repeat(101)}`,
        null,
        { Authorization: `Bearer ${staffToken}` }
      );
      assert.strictEqual(rLong.status, 400);
    });

    await test('6. IST (+05:30) date-range boundaries for stay & creation dates', async () => {
      const res = await makeRequest(
        server,
        'GET',
        '/api/pms/bookings?dateFrom=2026-12-31&dateTo=2027-01-01&createdFrom=2026-11-30&createdTo=2026-12-01',
        null,
        { Authorization: `Bearer ${staffToken}` }
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastFindFilter.checkOutDate.$gte.toISOString(), new Date('2026-12-31T00:00:00.000+05:30').toISOString());
      assert.strictEqual(lastFindFilter.checkInDate.$lte.toISOString(), new Date('2027-01-01T23:59:59.999+05:30').toISOString());
      assert.strictEqual(lastFindFilter.createdAt.$gte.toISOString(), new Date('2026-11-30T00:00:00.000+05:30').toISOString());
      assert.strictEqual(lastFindFilter.createdAt.$lte.toISOString(), new Date('2026-12-01T23:59:59.999+05:30').toISOString());
    });
  } finally {
    server.close();
    Booking.findById = origFindById;
    Booking.findOneAndUpdate = origFindOneAndUpdate;
    Booking.find = origFind;
    Booking.countDocuments = origCountDocuments;
    IdempotencyRecord.create = origIdemCreate;
    IdempotencyRecord.findOne = origIdemFindOne;
    IdempotencyRecord.updateOne = origIdemUpdateOne;
    IdempotencyRecord.deleteOne = origIdemDeleteOne;
    ActivityLog.create = origActivityCreate;
    User.findById = origUserFindById;
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`SPRINT 3.1 HARDENING SUITE SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('══════════════════════════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}

run();
