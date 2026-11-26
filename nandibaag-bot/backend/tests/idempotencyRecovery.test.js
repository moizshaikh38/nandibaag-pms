/**
 * Idempotency Failure Recovery Regression Suite (100% Isolated, Zero Live DB)
 *
 * Tests all 7 post-booking failure recovery scenarios:
 * 1. Booking save succeeds and idempotency completion succeeds
 * 2. Booking save succeeds but idempotency completion fails (booking & lock preserved)
 * 3. Retry after uncertain completion (recovers persisted booking, zero duplicate)
 * 4. Retry after simulated process interruption
 * 5. Related RoomBooking write fails (rolls back booking & releases lock for safe retry)
 * 6. Same idempotency key retry after recovery
 * 7. Concurrent retry during recovery / in-progress lock
 *
 * Run: NODE_ENV=test node tests/idempotencyRecovery.test.js
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-ephemeral-secret-for-idem-recovery';

const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../src/config/env');
const models = require('../src/models');
const RoomNightLock = require('../src/models/RoomNightLock');
const RoomReservation = require('../src/models/RoomReservation');
const availabilityService = require('../src/services/availabilityService');
const roomMapper = require('../src/utils/roomMapper');

const idempStore = new Map();
const bookingStore = new Map();
let failCompleteIdempotency = false;
let bookingInsertCount = 0;

models.IdempotencyRecord.create = async (doc) => {
  if (idempStore.has(doc.scopeKey)) {
    const err = new Error('E11000 duplicate key error');
    err.code = 11000;
    throw err;
  }
  const stored = { ...doc };
  idempStore.set(doc.scopeKey, stored);
  return stored;
};
models.IdempotencyRecord.findOne = async ({ scopeKey }) => idempStore.get(scopeKey) || null;
models.IdempotencyRecord.updateOne = async ({ scopeKey }, { $set }) => {
  if (failCompleteIdempotency && $set.status === 'completed') {
    throw new Error('Simulated IdempotencyRecord completion DB failure');
  }
  const existing = idempStore.get(scopeKey);
  if (existing) Object.assign(existing, $set);
  return { acknowledged: true };
};
models.IdempotencyRecord.deleteOne = async ({ scopeKey, status }) => {
  const existing = idempStore.get(scopeKey);
  if (existing && (!status || existing.status === status)) {
    idempStore.delete(scopeKey);
  }
  return { acknowledged: true };
};

models.User.findById = (id) => ({
  select: () => ({
    lean: async () => (String(id) === 'staff_1'
      ? { _id: 'staff_1', name: 'Staff', email: 'staff@nandibaag.com', role: 'staff', isActive: true }
      : null)
  })
});
models.Session.findOne = async () => ({ _id: 's1', jti: 'j1', isActive: true });
models.Session.updateOne = async () => ({ acknowledged: true });
models.ActivityLog.create = async (e) => e;
models.Settings.findOne = async () => ({ whatsappNumbers: [] });
availabilityService.checkMultipleRoomsAvailable = async () => ({ available: true, conflicts: [] });
availabilityService.createRoomBooking = async (roomId, bookingId, checkIn, checkOut, assignedBy) => ({
  _id: '507f1f77bcf86cd799439888',
  roomId,
  bookingId,
  checkInDate: checkIn,
  checkOutDate: checkOut,
  status: 'confirmed',
  assignedBy,
  populate: async () => {}
});
roomMapper.roomIdsToNumbers = async () => [];

let saveDelayMs = 0;
models.Booking.prototype.save = async function () {
  if (saveDelayMs > 0) await new Promise(r => setTimeout(r, saveDelayMs));
  const idStr = String(this._id);
  if (!bookingStore.has(idStr)) {
    bookingInsertCount++;
  }
  bookingStore.set(idStr, this.toObject ? this.toObject() : { ...this });
  return this;
};
models.Booking.findById = async (id) => bookingStore.get(String(id)) || null;
models.Booking.findByIdAndDelete = async (id) => {
  const doc = bookingStore.get(String(id)) || null;
  bookingStore.delete(String(id));
  return doc;
};

const roomNightLocks = [];
RoomNightLock.insertMany = async (docs) => {
  for (const d of docs) {
    const dup = roomNightLocks.find(x => String(x.roomId) === String(d.roomId) && x.night === d.night);
    if (dup) {
      const err = new Error('E11000 duplicate key');
      err.code = 11000;
      throw err;
    }
    roomNightLocks.push({ ...d });
  }
  return docs;
};
RoomNightLock.deleteMany = async ({ bookingId }) => {
  for (let i = roomNightLocks.length - 1; i >= 0; i--) {
    if (String(roomNightLocks[i].bookingId) === String(bookingId)) {
      roomNightLocks.splice(i, 1);
    }
  }
  return { deletedCount: 1 };
};
RoomReservation.updateMany = async () => ({ modifiedCount: 0 });

let failRoomLookup = false;
models.Room.find = () => ({ lean: async () => [] });
models.Room.findOne = async () => null;
models.Room.findById = async (id) => {
  if (failRoomLookup) throw new Error('Simulated RoomBooking dependency failure');
  return { _id: id, roomNumber: '101', capacity: 4 };
};

const bookingRoutes = require('../src/routes/bookingRoutes');
const pmsBookingRoutes = require('../src/routes/pmsBookingRoutes');
const errorHandler = require('../src/middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/bookings', bookingRoutes);
app.use('/api/pms', pmsBookingRoutes);
app.use(errorHandler);

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ FAIL: ${name}\n     ${err.message}`);
  }
}

async function reqJson(baseUrl, method, urlPath, body, token) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  return { status: res.status, json: await res.json() };
}

async function run() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const staffToken = jwt.sign({ id: 'staff_1', role: 'staff', jti: 'j1' }, jwtSecret, { expiresIn: '1h' });
  const validRoomId = '507f1f77bcf86cd799439022';

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('🔁 IDEMPOTENCY FAILURE RECOVERY REGRESSION SUITE');
  console.log('══════════════════════════════════════════════════════════════\n');

  // 1. Normal success
  await test('1. Booking save succeeds & idempotency completion succeeds (1 booking)', async () => {
    idempStore.clear();
    bookingStore.clear();
    bookingInsertCount = 0;
    failCompleteIdempotency = false;

    const payload = {
      customerName: 'Normal Guest',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      payment: { amount: 2000, mode: 'cash' },
      idempotencyKey: 'rec-normal-0001'
    };
    const r = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', payload, staffToken);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(bookingInsertCount, 1);
    assert.strictEqual(bookingStore.size, 1);
  });

  // 2 & 3 & 6. Booking save succeeds, completeIdempotency fails -> retry recovers without duplicate, then subsequent retry replays
  await test('2, 3 & 6. Booking save succeeds, completeIdempotency fails -> retry recovers persisted booking & subsequent retry replays (0 duplicates)', async () => {
    idempStore.clear();
    bookingStore.clear();
    bookingInsertCount = 0;
    failCompleteIdempotency = true;

    const payload = {
      customerName: 'Uncertain Guest',
      customerPhone: '9876543211',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      payment: { amount: 2000, mode: 'upi' },
      idempotencyKey: 'rec-fail-complete-0001'
    };

    const r1 = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', payload, staffToken);
    assert.strictEqual(r1.status, 500);
    assert.strictEqual(bookingInsertCount, 1);
    assert.strictEqual(bookingStore.size, 1);
    assert.strictEqual(idempStore.size, 1); // Lock preserved!

    // Now DB recovers; retry with same key recovers original booking without inserting a second one
    failCompleteIdempotency = false;
    const r2 = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', payload, staffToken);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.json.recovered, true);
    assert.strictEqual(bookingInsertCount, 1);
    assert.strictEqual(bookingStore.size, 1);

    // Scenario 6: Subsequent retry after recovery replays completed record cleanly
    const r3 = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', payload, staffToken);
    assert.strictEqual(r3.status, 200);
    assert.strictEqual(r3.json.booking._id, r2.json.booking._id);
    assert.strictEqual(bookingInsertCount, 1);
  });

  // 4. Retry after simulated process interruption (in_progress record with bookingId)
  await test('4. Retry after simulated process interruption recovers existing booking cleanly', async () => {
    idempStore.clear();
    bookingStore.clear();
    bookingInsertCount = 0;

    const payload = {
      customerName: 'Crashed Mid-Flight',
      customerPhone: '9876543212',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      payment: { amount: 5500, mode: 'card' },
      idempotencyKey: 'rec-crash-0001'
    };

    // Simulate process having persisted booking & attached bookingId before crashing
    const { computeBookingPayloadHash } = require('../src/services/idempotencyService');
    const hash = computeBookingPayloadHash(payload);
    bookingStore.set('507f1f77bcf86cd799439199', { _id: '507f1f77bcf86cd799439199', customerName: 'Crashed Mid-Flight', totalAmount: 5500 });
    idempStore.set('staff_1:POST:/api/bookings/manual-booking:rec-crash-0001', {
      scopeKey: 'staff_1:POST:/api/bookings/manual-booking:rec-crash-0001',
      status: 'in_progress',
      requestHash: hash,
      bookingId: '507f1f77bcf86cd799439199'
    });

    const r = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', payload, staffToken);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.recovered, true);
    assert.strictEqual(r.json.booking._id, '507f1f77bcf86cd799439199');
    assert.strictEqual(bookingInsertCount, 0);
  });

  // 5. Related RoomBooking write fails in /api/pms/bookings/manual -> rollback + lock released + retry succeeds
  await test('5. Related RoomBooking dependency failure rolls back booking, releases lock & allows clean retry', async () => {
    idempStore.clear();
    bookingStore.clear();
    bookingInsertCount = 0;
    failRoomLookup = true;

    const payload = {
      guestName: 'Room Fail Guest',
      guestPhone: '9876543213',
      bookingType: 'couple',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      adults: 2,
      roomIds: [validRoomId],
      payment: { amount: 2000, mode: 'cash' },
      idempotencyKey: 'rec-room-fail-0001'
    };

    const rFail = await reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', payload, staffToken);
    assert.strictEqual(rFail.status, 500);
    assert.strictEqual(bookingStore.size, 0); // Rolled back
    assert.strictEqual(idempStore.size, 0);   // Lock released

    failRoomLookup = false;
    const rOk = await reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', payload, staffToken);
    assert.strictEqual(rOk.status, 201);
    assert.strictEqual(bookingStore.size, 1);
  });

  // 7. Concurrent retry during in-progress booking creation
  await test('7. Concurrent retry during in-progress creation rejects duplicate with 409 IDEMPOTENCY_IN_PROGRESS', async () => {
    idempStore.clear();
    bookingStore.clear();
    bookingInsertCount = 0;
    failCompleteIdempotency = false;
    saveDelayMs = 60;

    const payload = {
      customerName: 'Concurrent Recovery',
      customerPhone: '9876543214',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      payment: { amount: 5500, mode: 'cash' },
      idempotencyKey: 'rec-concurrent-0001'
    };

    const [r1, r2] = await Promise.all([
      reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', payload, staffToken),
      reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', payload, staffToken)
    ]);
    saveDelayMs = 0;
    const statuses = [r1.status, r2.status].sort();
    assert.deepStrictEqual(statuses, [200, 409]);
    assert.strictEqual(bookingInsertCount, 1);
    assert.strictEqual(bookingStore.size, 1);
  });

  server.close();
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`IDEMPOTENCY RECOVERY SUITE SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
