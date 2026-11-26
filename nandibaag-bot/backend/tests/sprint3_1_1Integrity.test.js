/**
 * Sprint 3.1.1: Targeted Payment Integrity Fixes
 *
 * Tests (in-memory/stubbed Mongoose models):
 * - Canonical payment payload hashing (amount, mode, utr, bookingId) -> 409 on mismatch
 * - Legacy Booking documents without __v -> { __v: { $exists: false } } CAS + concurrent write protection
 */

const assert = require('assert');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../src/config/env');
const { Booking, IdempotencyRecord, ActivityLog, User } = require('../src/models');
const pmsBookingRoutes = require('../src/routes/pmsBookingRoutes');
const { computeBookingPayloadHash } = require('../src/services/idempotencyService');

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
  console.log('🔐 SPRINT 3.1.1: TARGETED PAYMENT INTEGRITY TESTS');
  console.log('══════════════════════════════════════════════════════════════\n');

  const bookingId1 = '507f1f77bcf86cd799439031';
  const legacyBookingId = '507f1f77bcf86cd799439032'; // no __v field!

  const bookingsStore = [
    {
      _id: bookingId1,
      __v: 0,
      customerName: 'Hash Test Guest',
      customerPhone: '+919800099988',
      totalAmount: 5500,
      advancePayment: 0,
      advancePaid: 0,
      remainingPayment: 5500,
      paymentStatus: 'unpaid',
      payments: [],
      toObject: function () { return { ...this }; }
    },
    {
      _id: legacyBookingId,
      // Intentionally NO __v property!
      customerName: 'Legacy No-Version Guest',
      customerPhone: '+919800077766',
      totalAmount: 5500,
      advancePayment: 1500,
      advancePaid: 1500,
      remainingPayment: 4000,
      paymentStatus: 'partially_paid',
      payments: [],
      toObject: function () { return { ...this }; }
    }
  ];

  const idempotencyStore = new Map();
  let lastCasFilter = null;

  const origFindById = Booking.findById;
  const origFindOneAndUpdate = Booking.findOneAndUpdate;
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
    lastCasFilter = filter;
    const idx = bookingsStore.findIndex((b) => {
      if (String(b._id) !== String(filter._id)) return false;
      if (filter.__v && typeof filter.__v === 'object' && filter.__v.$exists === false) {
        return b.__v === undefined || b.__v === null;
      }
      return b.__v === filter.__v;
    });
    if (idx === -1) return null;
    const currentV = bookingsStore[idx].__v ?? 0;
    const updated = {
      ...bookingsStore[idx],
      ...update.$set,
      __v: currentV + (update.$inc?.__v || 1)
    };
    bookingsStore[idx] = updated;
    return { ...updated, toObject: () => ({ ...updated }) };
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
  IdempotencyRecord.deleteOne = async ({ scopeKey }) => {
    idempotencyStore.delete(scopeKey);
    return { deletedCount: 1 };
  };
  ActivityLog.create = async (doc) => doc;

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
    await test('1. Canonical hash differs for amount, mode, utr, and bookingId', () => {
      const base = { bookingId: bookingId1, amount: 1000, mode: 'upi', utr: 'U1', notes: 'n', screenshotRef: '' };
      const hBase = computeBookingPayloadHash(base);
      assert.strictEqual(hBase, computeBookingPayloadHash({ ...base }));
      assert.notStrictEqual(hBase, computeBookingPayloadHash({ ...base, amount: 1500 }));
      assert.notStrictEqual(hBase, computeBookingPayloadHash({ ...base, mode: 'cash' }));
      assert.notStrictEqual(hBase, computeBookingPayloadHash({ ...base, utr: 'U2' }));
      assert.notStrictEqual(hBase, computeBookingPayloadHash({ ...base, bookingId: legacyBookingId }));
    });

    await test('2. Same Idempotency-Key + same payload replays; different amount/mode/utr returns 409', async () => {
      const r1 = await makeRequest(
        server,
        'POST',
        `/api/pms/bookings/${bookingId1}/payments`,
        { amount: 1000, mode: 'upi', utr: 'UTR-1' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'pay-hash-key-1' }
      );
      assert.strictEqual(r1.status, 201);

      const rReplay = await makeRequest(
        server,
        'POST',
        `/api/pms/bookings/${bookingId1}/payments`,
        { amount: 1000, mode: 'upi', utr: 'UTR-1' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'pay-hash-key-1' }
      );
      assert.strictEqual(rReplay.status, 201);

      const rDiffAmt = await makeRequest(
        server,
        'POST',
        `/api/pms/bookings/${bookingId1}/payments`,
        { amount: 2000, mode: 'upi', utr: 'UTR-1' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'pay-hash-key-1' }
      );
      assert.strictEqual(rDiffAmt.status, 409);

      const rDiffMode = await makeRequest(
        server,
        'POST',
        `/api/pms/bookings/${bookingId1}/payments`,
        { amount: 1000, mode: 'cash', utr: 'UTR-1' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'pay-hash-key-1' }
      );
      assert.strictEqual(rDiffMode.status, 409);

      const rDiffUtr = await makeRequest(
        server,
        'POST',
        `/api/pms/bookings/${bookingId1}/payments`,
        { amount: 1000, mode: 'upi', utr: 'UTR-2' },
        { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'pay-hash-key-1' }
      );
      assert.strictEqual(rDiffUtr.status, 409);
    });

    await test('3. Legacy booking without __v uses { __v: { $exists: false } }, initializes __v=1, & blocks concurrent overpayment', async () => {
      const [r1, r2] = await Promise.all([
        makeRequest(
          server,
          'POST',
          `/api/pms/bookings/${legacyBookingId}/payments`,
          { amount: 4000, mode: 'upi' },
          { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'legacy-cas-1' }
        ),
        makeRequest(
          server,
          'POST',
          `/api/pms/bookings/${legacyBookingId}/payments`,
          { amount: 4000, mode: 'cash' },
          { Authorization: `Bearer ${staffToken}`, 'Idempotency-Key': 'legacy-cas-2' }
        )
      ]);
      const statuses = [r1.status, r2.status].sort();
      assert.deepStrictEqual(statuses, [201, 400]);
      assert.deepStrictEqual(lastCasFilter.__v, { $exists: false });
      assert.strictEqual(bookingsStore[1].__v, 1);
      assert.strictEqual(bookingsStore[1].advancePaid, 5500);
      assert.strictEqual(bookingsStore[1].remainingPayment, 0);
    });
  } finally {
    server.close();
    Booking.findById = origFindById;
    Booking.findOneAndUpdate = origFindOneAndUpdate;
    IdempotencyRecord.create = origIdemCreate;
    IdempotencyRecord.findOne = origIdemFindOne;
    IdempotencyRecord.updateOne = origIdemUpdateOne;
    IdempotencyRecord.deleteOne = origIdemDeleteOne;
    ActivityLog.create = origActivityCreate;
    User.findById = origUserFindById;
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`SPRINT 3.1.1 INTEGRITY SUITE SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('══════════════════════════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}

run();
