/**
 * Sprint 2.1 Hardening Test Suite:
 * - Durable Idempotency across BOTH manual booking endpoints (replay, concurrent,
 *   payload mismatch, failure recovery, Couple/Group/OneDay)
 * - ManualBookingForm.jsx stale-quote, out-of-order, and full-reset verification
 * - systemPrompt.js Couple & Group FAQ child pricing rules
 *
 * Run: NODE_ENV=test node tests/sprint2_1Hardening.test.js
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-ephemeral-secret-for-sprint21';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../src/config/env');
const models = require('../src/models');
const availabilityService = require('../src/services/availabilityService');
const roomMapper = require('../src/utils/roomMapper');

// In-memory durable IdempotencyRecord store simulating MongoDB unique index
const idempStore = new Map();
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

// Auth & Booking stubs
models.User.findById = (id) => ({
  select: () => ({
    lean: async () => (String(id) === 'staff_1'
      ? { _id: 'staff_1', name: 'Staff Member', email: 'staff@nandibaag.com', role: 'staff', isActive: true }
      : null)
  })
});
models.Session.findOne = async () => ({ _id: 's1', jti: 'j1', isActive: true });
models.Session.updateOne = async () => ({ acknowledged: true });
models.ActivityLog.create = async (e) => e;
models.Room.find = () => ({ lean: async () => [] });
models.Room.findOne = async () => null;
models.Room.findById = async () => null;
models.Settings.findOne = async () => ({ whatsappNumbers: [] });
availabilityService.checkMultipleRoomsAvailable = async () => ({ available: true, conflicts: [] });
roomMapper.roomIdsToNumbers = async () => [];

let bookingSaveCount = 0;
let saveDelayMs = 0;
let forceSaveError = false;
models.Booking.prototype.save = async function () {
  if (saveDelayMs > 0) await new Promise(r => setTimeout(r, saveDelayMs));
  if (forceSaveError) throw new Error('Simulated transient DB error');
  bookingSaveCount++;
  if (!this._id) this._id = `507f1f77bcf86cd7994390${String(bookingSaveCount).padStart(2, '0')}`;
  return this;
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

async function reqJson(baseUrl, method, urlPath, body, token, headers = {}) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function run() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const staffToken = jwt.sign({ id: 'staff_1', role: 'staff', jti: 'j1' }, jwtSecret, { expiresIn: '1h' });
  const validRoomId = '507f1f77bcf86cd799439022';

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('🛡️ SPRINT 2.1 HARDENING & IDEMPOTENCY TEST SUITE');
  console.log('══════════════════════════════════════════════════════════════\n');

  // 1. Same key submitted twice — Couple Stay (/api/bookings/manual-booking)
  await test('Idempotency: Couple Stay same key submitted twice creates 1 booking & replays original response', async () => {
    idempStore.clear();
    bookingSaveCount = 0;
    const payload = {
      customerName: 'Couple Retry',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      payment: { amount: 2000, mode: 'upi', utr: 'UTR1001' },
      idempotencyKey: 'idem-couple-0001'
    };
    const r1 = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', payload, staffToken);
    const r2 = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', payload, staffToken);
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(bookingSaveCount, 2); // 1 initial save + 1 sms-init save in single request
    assert.strictEqual(r2.json.booking._id, r1.json.booking._id);
  });

  // 2. Same key submitted twice — One Day without roomIds (/api/bookings/manual-booking)
  await test('Idempotency: One Day without roomIds retry creates only 1 booking', async () => {
    idempStore.clear();
    bookingSaveCount = 0;
    const payload = {
      customerName: 'Picnic Retry',
      customerPhone: '9876543211',
      checkInDate: '2026-11-24',
      packageType: 'oneDay',
      mealOption: 'B->T',
      guestComposition: { adults: 3, children: 0 },
      bookedBy: { name: 'Kadambari' },
      payment: { amount: 3000, mode: 'cash' },
      idempotencyKey: 'idem-oneday-0001'
    };
    const r1 = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', payload, staffToken);
    const r2 = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', payload, staffToken);
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.json.booking._id, r1.json.booking._id);
    assert.strictEqual(bookingSaveCount, 2);
  });

  // 3. Same key submitted twice — Group Stay (/api/pms/bookings/manual)
  await test('Idempotency: Group Stay on /api/pms/bookings/manual retry returns original 201', async () => {
    idempStore.clear();
    bookingSaveCount = 0;
    const payload = {
      guestName: 'Group Retry',
      guestPhone: '9876543212',
      bookingType: 'group',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      adults: 4,
      payment: { amount: 4000, mode: 'cash' },
      idempotencyKey: 'idem-group-0001'
    };
    const r1 = await reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', payload, staffToken);
    const r2 = await reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', payload, staffToken);
    assert.strictEqual(r1.status, 201);
    assert.strictEqual(r2.status, 201);
    assert.strictEqual(bookingSaveCount, 1);
    assert.strictEqual(r2.json.booking._id, r1.json.booking._id);
  });

  // 4. Concurrent requests with the same key
  await test('Idempotency: Concurrent requests with same key allow only 1 booking & reject duplicate with 409', async () => {
    idempStore.clear();
    bookingSaveCount = 0;
    saveDelayMs = 60;
    const payload = {
      guestName: 'Concurrent Guest',
      guestPhone: '9876543213',
      bookingType: 'couple',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      adults: 2,
      payment: { amount: 5500, mode: 'upi' },
      idempotencyKey: 'idem-concurrent-0001'
    };
    const [r1, r2] = await Promise.all([
      reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', payload, staffToken),
      reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', payload, staffToken)
    ]);
    saveDelayMs = 0;
    const statuses = [r1.status, r2.status].sort();
    assert.deepStrictEqual(statuses, [201, 409]);
    assert.strictEqual(bookingSaveCount, 1);
  });

  // 5. Same key with different payload -> 409 mismatch
  await test('Idempotency: Reusing same key with different payload returns 409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD', async () => {
    idempStore.clear();
    const p1 = {
      guestName: 'Guest A',
      guestPhone: '9876543214',
      bookingType: 'couple',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      adults: 2,
      payment: { amount: 2000, mode: 'cash' },
      idempotencyKey: 'idem-mismatch-0001'
    };
    const p2 = { ...p1, adults: 4 };
    const r1 = await reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', p1, staffToken);
    const r2 = await reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', p2, staffToken);
    assert.strictEqual(r1.status, 201);
    assert.strictEqual(r2.status, 409);
    assert.strictEqual(r2.json.code, 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
  });

  // 6. Failed initial attempt releases lock so retry succeeds
  await test('Idempotency: Failed initial attempt releases lock and allows safe retry with same key', async () => {
    idempStore.clear();
    bookingSaveCount = 0;
    forceSaveError = true;
    const payload = {
      guestName: 'Retry Recover',
      guestPhone: '9876543215',
      bookingType: 'couple',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      adults: 2,
      payment: { amount: 2000, mode: 'cash' },
      idempotencyKey: 'idem-recover-0001'
    };
    const rFail = await reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', payload, staffToken);
    assert.strictEqual(rFail.status, 500);
    assert.strictEqual(idempStore.size, 0); // Lock released cleanly

    forceSaveError = false;
    const rOk = await reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', payload, staffToken);
    assert.strictEqual(rOk.status, 201);
    assert.strictEqual(bookingSaveCount, 1);
  });

  // 7. ManualBookingForm.jsx stale-preview, out-of-order, and full-reset verification
  await test('ManualBookingForm.jsx sets quoteState.loading immediately before debounce & resets all Sprint 2 states on success only', () => {
    const formSrc = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/ManualBookingForm.jsx'), 'utf8');
    const previewIdx = formSrc.indexOf('const seq = ++previewSeqRef.current;');
    const loadingIdx = formSrc.indexOf('setQuoteState(prev => ({ ...prev, loading: true', previewIdx);
    const timeoutIdx = formSrc.indexOf('const timer = setTimeout(async () => {', previewIdx);
    assert.ok(previewIdx > 0 && loadingIdx > previewIdx && loadingIdx < timeoutIdx, 'loading must be set synchronously BEFORE setTimeout');
    assert.ok(formSrc.includes('if (seq !== previewSeqRef.current) return;'), 'Out-of-order preview guard present');
    assert.ok(formSrc.includes('setChildrenAges([]);'), 'Resets childrenAges on success');
    assert.ok(formSrc.includes('setRoomAddon(false);'), 'Resets roomAddon on success');
    assert.ok(formSrc.includes('setAcknowledgeZeroAdvance(false);'), 'Resets acknowledgeZeroAdvance on success');
    assert.ok(formSrc.includes('idempotencyKeyRef.current = generateIdempotencyKey();'), 'Regenerates idempotencyKey on success');
  });

  // 8. systemPrompt.js Couple & Group FAQ child pricing rules
  await test('systemPrompt.js FAQ & critical rules accurately distinguish Couple (6-15 ₹1,500) vs Group (6-10 ₹1,000, 11+ adult)', () => {
    const promptSrc = fs.readFileSync(path.join(__dirname, '../src/utils/systemPrompt.js'), 'utf8');
    assert.ok(promptSrc.includes('Couple Stay: 0–5 yrs FREE, 6–15 yrs ₹1,500/night, 16+ Adult rate'));
    assert.ok(promptSrc.includes('Group/Family Stay: 0–5 yrs FREE, 6–10 yrs ₹1,000/night, 11+ Adult rate'));
    assert.ok(!promptSrc.includes('Below 5: FREE. 6-10: ₹1,000. Above 10: adult rate.'));
  });

  server.close();
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`SPRINT 2.1 HARDENING SUITE SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
