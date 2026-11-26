/**
 * Sprint 3: Guest Bookings, Payment Synchronization, Filters & Pagination Tests
 */

const assert = require('assert');
const express = require('express');
const http = require('http');

const {
  computePaymentSummary,
  syncBookingPaymentFields
} = require('../src/services/paymentSyncService');

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
  console.log('🧪 SPRINT 3: GUEST BOOKINGS, PAYMENT SYNC, FILTERS & PAGINATION');
  console.log('══════════════════════════════════════════════════════════════\n');

  // 1. Payment Synchronization Unit Tests
  await test('1. Unpaid booking summary', () => {
    const s = computePaymentSummary({ totalAmount: 5500, payments: [], advancePayment: 0 });
    assert.deepStrictEqual(s, { totalAmount: 5500, paidAmount: 0, remainingAmount: 5500, paymentStatus: 'unpaid' });
  });

  await test('2. Partially paid booking from payments[]', () => {
    const s = computePaymentSummary({
      totalAmount: 5500,
      payments: [{ amount: 2000, mode: 'upi' }, { amount: 1500, mode: 'cash' }]
    });
    assert.deepStrictEqual(s, { totalAmount: 5500, paidAmount: 3500, remainingAmount: 2000, paymentStatus: 'partially_paid' });
  });

  await test('3. Fully paid booking from payments[]', () => {
    const s = computePaymentSummary({
      totalAmount: 5500,
      payments: [{ amount: 5500, mode: 'upi' }]
    });
    assert.deepStrictEqual(s, { totalAmount: 5500, paidAmount: 5500, remainingAmount: 0, paymentStatus: 'paid' });
  });

  await test('4. Legacy booking fallback without double-counting', () => {
    const legacy = computePaymentSummary({ totalAmount: 6500, advancePaid: 2500, payments: [] });
    assert.deepStrictEqual(legacy, { totalAmount: 6500, paidAmount: 2500, remainingAmount: 4000, paymentStatus: 'partially_paid' });

    const withPayments = computePaymentSummary({
      totalAmount: 6500,
      advancePayment: 2500,
      advancePaid: 2500,
      payments: [{ amount: 2500, mode: 'upi' }]
    });
    assert.deepStrictEqual(withPayments, { totalAmount: 6500, paidAmount: 2500, remainingAmount: 4000, paymentStatus: 'partially_paid' });
  });

  await test('5. syncBookingPaymentFields updates compatibility fields without altering totalAmount', () => {
    const b = { totalAmount: 5500, payments: [{ amount: 2000, mode: 'cash' }] };
    syncBookingPaymentFields(b);
    assert.strictEqual(b.totalAmount, 5500);
    assert.strictEqual(b.advancePayment, 2000);
    assert.strictEqual(b.advancePaid, 2000);
    assert.strictEqual(b.remainingPayment, 3500);
    assert.strictEqual(b.paymentStatus, 'partially_paid');
  });

  // 2. Endpoint Integration Tests (with in-memory stubs)
  const bookingId = '507f1f77bcf86cd799439011';
  const bookingsStore = [
    {
      _id: bookingId,
      customerName: 'Aarav Sharma',
      customerPhone: '+919876543210',
      packageType: 'couple',
      status: 'confirmed',
      totalAmount: 5500,
      advancePayment: 1500,
      advancePaid: 1500,
      remainingPayment: 4000,
      paymentStatus: 'partially_paid',
      payments: [],
      checkInDate: new Date('2026-12-01T00:00:00Z'),
      checkOutDate: new Date('2026-12-02T00:00:00Z'),
      createdAt: new Date('2026-11-20T10:00:00Z'),
      save: async function () { return this; },
      toObject: function () { return { ...this }; }
    },
    {
      _id: '507f1f77bcf86cd799439012',
      customerName: 'Priya Nair',
      customerPhone: '+919111222333',
      packageType: 'group',
      status: 'checked_in',
      totalAmount: 10000,
      advancePayment: 10000,
      advancePaid: 10000,
      remainingPayment: 0,
      paymentStatus: 'paid',
      payments: [{ amount: 10000, mode: 'upi' }],
      checkInDate: new Date('2026-12-05T00:00:00Z'),
      checkOutDate: new Date('2026-12-06T00:00:00Z'),
      createdAt: new Date('2026-11-22T10:00:00Z'),
      save: async function () { return this; },
      toObject: function () { return { ...this }; }
    }
  ];

  const idempotencyStore = new Map();
  const auditLogs = [];

  const origFindById = Booking.findById;
  const origFindOneAndUpdate = Booking.findOneAndUpdate;
  const origFind = Booking.find;
  const origCountDocuments = Booking.countDocuments;
  const origIdemCreate = IdempotencyRecord.create;
  const origIdemFindOne = IdempotencyRecord.findOne;
  const origIdemUpdateOne = IdempotencyRecord.updateOne;
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
      select: () => ({
        lean: async () => userObj,
        then: (resolve) => resolve(userObj)
      }),
      then: (resolve) => resolve(userObj)
    };
  };

  Booking.findById = async (id) => bookingsStore.find((b) => String(b._id) === String(id)) || null;
  Booking.findOneAndUpdate = async (filter, update) => {
    const idx = bookingsStore.findIndex((b) => String(b._id) === String(filter._id));
    if (idx === -1) return null;
    bookingsStore[idx] = { ...bookingsStore[idx], ...update.$set };
    return bookingsStore[idx];
  };
  Booking.countDocuments = async (filter) => {
    return bookingsStore.filter((b) => {
      if (filter.status && b.status !== filter.status) return false;
      if (filter.paymentStatus && b.paymentStatus !== filter.paymentStatus) return false;
      if (filter.packageType && b.packageType !== filter.packageType) return false;
      return true;
    }).length;
  };
  Booking.find = (filter) => {
    const filtered = bookingsStore.filter((b) => {
      if (filter.status && b.status !== filter.status) return false;
      if (filter.paymentStatus && b.paymentStatus !== filter.paymentStatus) return false;
      if (filter.packageType && b.packageType !== filter.packageType) return false;
      return true;
    });
    const chain = {
      _skip: 0,
      _limit: 20,
      populate() { return this; },
      sort() { return this; },
      limit(n) { this._limit = n; return this; },
      skip(n) { this._skip = n; return this; },
      then(resolve) {
        resolve(filtered.slice(this._skip, this._skip + this._limit));
      }
    };
    return chain;
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
    const rec = idempotencyStore.get(scopeKey);
    if (rec && update.$set) Object.assign(rec, update.$set);
    return { modifiedCount: rec ? 1 : 0 };
  };
  ActivityLog.create = async (doc) => {
    auditLogs.push(doc);
    return doc;
  };

  // Build test Express app with mock auth
  const jwt = require('jsonwebtoken');
  const { jwtSecret } = require('../src/config/env');
  const staffToken = jwt.sign({ id: '507f1f77bcf86cd799439099', role: 'staff', name: 'Kadambari', email: 'kadambari@nandibaag.com' }, jwtSecret);

  const app = express();
  app.use(express.json());
  app.use('/api/pms', pmsBookingRoutes);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    await test('6. Unauthorized partial payment request is rejected (401)', async () => {
      const res = await makeRequest(server, 'POST', `/api/pms/bookings/${bookingId}/payments`, { amount: 1000, mode: 'upi' });
      assert.strictEqual(res.status, 401);
    });

    await test('7. Invalid/zero/negative/excessive payment & invalid mode rejected (400)', async () => {
      const rZero = await makeRequest(server, 'POST', `/api/pms/bookings/${bookingId}/payments`, { amount: 0, mode: 'upi' }, { Authorization: `Bearer ${staffToken}` });
      assert.strictEqual(rZero.status, 400);

      const rNeg = await makeRequest(server, 'POST', `/api/pms/bookings/${bookingId}/payments`, { amount: -500, mode: 'upi' }, { Authorization: `Bearer ${staffToken}` });
      assert.strictEqual(rNeg.status, 400);

      const rMode = await makeRequest(server, 'POST', `/api/pms/bookings/${bookingId}/payments`, { amount: 500, mode: 'crypto' }, { Authorization: `Bearer ${staffToken}` });
      assert.strictEqual(rMode.status, 400);

      const rExcess = await makeRequest(server, 'POST', `/api/pms/bookings/${bookingId}/payments`, { amount: 9000, mode: 'upi' }, { Authorization: `Bearer ${staffToken}` });
      assert.strictEqual(rExcess.status, 400);

      const rBase64 = await makeRequest(server, 'POST', `/api/pms/bookings/${bookingId}/payments`, { amount: 500, mode: 'upi', screenshotRef: 'data:image/png;base64,AAA' }, { Authorization: `Bearer ${staffToken}` });
      assert.strictEqual(rBase64.status, 400);
    });

    await test('8. Valid partial payment preserves legacy advance, updates summary, & logs audit', async () => {
      const res = await makeRequest(
        server,
        'POST',
        `/api/pms/bookings/${bookingId}/payments`,
        { amount: 2000, mode: 'upi', utr: 'UTR12345', notes: '2nd installment' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'pay-key-1' }
      );
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.paymentSummary.paidAmount, 3500); // 1500 legacy + 2000 new
      assert.strictEqual(res.body.paymentSummary.remainingAmount, 2000);
      assert.strictEqual(res.body.paymentSummary.paymentStatus, 'partially_paid');
      assert.strictEqual(res.body.booking.payments.length, 2);
      assert.strictEqual(auditLogs.length, 1);
      assert.strictEqual(auditLogs[0].action, 'booking_payment_recorded');
    });

    await test('9. Idempotent retry with same Idempotency-Key replays without double-recording', async () => {
      const res = await makeRequest(
        server,
        'POST',
        `/api/pms/bookings/${bookingId}/payments`,
        { amount: 2000, mode: 'upi', utr: 'UTR12345', notes: '2nd installment' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'pay-key-1' }
      );
      assert.strictEqual(res.status, 201);
      assert.strictEqual(bookingsStore[0].payments.length, 2);
      assert.strictEqual(bookingsStore[0].advancePaid, 3500);
    });

    await test('10. GET /api/pms/bookings filters & pagination work correctly', async () => {
      const rFiltered = await makeRequest(server, 'GET', '/api/pms/bookings?paymentStatus=paid&page=1&limit=1', null, { Authorization: `Bearer ${staffToken}` });
      assert.strictEqual(rFiltered.status, 200);
      assert.strictEqual(rFiltered.body.total, 1);
      assert.strictEqual(rFiltered.body.bookings.length, 1);
      assert.strictEqual(rFiltered.body.bookings[0].customerName, 'Priya Nair');
      assert.strictEqual(rFiltered.body.limit, 1);
      assert.strictEqual(rFiltered.body.totalPages, 1);

      const rInvalid = await makeRequest(server, 'GET', '/api/pms/bookings?paymentStatus=bogus', null, { Authorization: `Bearer ${staffToken}` });
      assert.strictEqual(rInvalid.status, 400);
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
    ActivityLog.create = origActivityCreate;
    User.findById = origUserFindById;
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`SPRINT 3 GUEST BOOKINGS SUITE SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('══════════════════════════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}

run();
