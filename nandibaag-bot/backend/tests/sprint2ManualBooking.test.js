/**
 * Sprint 2 Automated Test Suite: Manual Booking Integration, Rate Overrides,
 * Discounts, Warning Enforcement, Payment Collection, Audit Trail & Screenshot Boundary
 * (100% Isolated, Zero Live DB)
 *
 * Run: NODE_ENV=test node tests/sprint2ManualBooking.test.js
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-ephemeral-secret-for-sprint2';

const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../src/config/env');
const models = require('../src/models');
const availabilityService = require('../src/services/availabilityService');
const roomMapper = require('../src/utils/roomMapper');
const {
  validateScreenshotPayload,
  uploadPaymentScreenshot,
  getSignedScreenshotAccess,
  StorageValidationError,
  StorageNotConfiguredError
} = require('../src/services/receiptStorageService');

// Stubs before requiring routes
models.User.findById = (id) => ({
  select: () => ({
    lean: async () => (String(id) === 'staff_1'
      ? { _id: 'staff_1', name: 'Staff Member', email: 'staff@nandibaag.com', role: 'staff', isActive: true }
      : null)
  })
});
models.Session.findOne = async () => ({ _id: 's1', jti: 'j1', isActive: true });
models.Session.updateOne = async () => ({ acknowledged: true });

const savedBookings = [];
const auditLogs = [];
models.ActivityLog.create = async (entry) => {
  auditLogs.push(entry);
  return entry;
};
models.Booking.prototype.save = async function () {
  if (!this._id) this._id = '507f1f77bcf86cd799439011';
  savedBookings.push(this.toObject ? this.toObject() : { ...this });
  return this;
};
models.Room.find = () => ({ lean: async () => [] });
models.Room.findOne = async () => null;
models.Room.findById = async () => null;
models.Settings.findOne = async () => ({ whatsappNumbers: [] });

availabilityService.checkMultipleRoomsAvailable = async () => ({ available: true, conflicts: [] });
roomMapper.roomIdsToNumbers = async () => [];

const bookingRoutes = require('../src/routes/bookingRoutes');
const pmsBookingRoutes = require('../src/routes/pmsBookingRoutes');
const errorHandler = require('../src/middleware/errorHandler');

const app = express();
app.use(express.json({ limit: '10mb' }));
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

async function reqJson(baseUrl, method, path, body, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
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

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('🧾 SPRINT 2 MANUAL BOOKING, PAYMENT & OVERRIDE TEST SUITE');
  console.log('══════════════════════════════════════════════════════════════\n');

  const validRoomId = '507f1f77bcf86cd799439022';

  // 1. Authoritative server pricing & client totalAmount ignored (both endpoints)
  await test('POST /api/bookings/manual-booking ignores client totalAmount & persists server quote + snapshot', async () => {
    savedBookings.length = 0;
    auditLogs.length = 0;
    const r = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Aarav',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari', staffId: 'staff_1' },
      roomIds: [validRoomId],
      totalAmount: 1,
      remainingPayment: 0,
      paymentStatus: 'paid',
      payment: { amount: 2000, mode: 'upi', utr: 'UTR123456' }
    }, staffToken);

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.booking.totalAmount, 5500);
    assert.strictEqual(r.json.booking.advancePayment, 2000);
    assert.strictEqual(r.json.booking.advancePaid, 2000);
    assert.strictEqual(r.json.booking.remainingPayment, 3500);
    assert.strictEqual(r.json.booking.paymentStatus, 'partially_paid');
    assert.strictEqual(r.json.booking.payments[0].mode, 'upi');
    assert.strictEqual(r.json.booking.payments[0].utr, 'UTR123456');
    assert.strictEqual(r.json.booking.payments[0].collectedBy.email, 'staff@nandibaag.com');
    assert.ok(r.json.booking.pricingSnapshot);
    assert.ok(auditLogs.some(a => a.action === 'pricing_snapshot_generated'));
    assert.ok(auditLogs.some(a => a.action === 'initial_payment_recorded'));
  });

  await test('POST /api/pms/bookings/manual enforces same authoritative pricing & snapshot', async () => {
    const r = await reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', {
      guestName: 'Meera',
      guestPhone: '9876543211',
      bookingType: 'group',
      checkInDate: '2026-11-27', // Friday weekend
      checkOutDate: '2026-11-28',
      adults: 3,
      childrenAges: [8, 12], // 12+ promoted to adult => 4 effective adults * 3000 + 1000 = 13000
      totalAmount: 100,
      payment: { amount: 13000, mode: 'cash' }
    }, staffToken);

    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.booking.totalAmount, 13000);
    assert.strictEqual(r.json.booking.paymentStatus, 'paid');
    assert.strictEqual(r.json.booking.remainingPayment, 0);
    assert.ok(r.json.booking.pricingSnapshot);
  });

  // 2. Couple 3/5 adult warnings enforced server-side
  await test('Direct API bypass of Couple 3-adult & 5-adult warnings rejected (400 COUPLE_WARNING_ACK_REQUIRED)', async () => {
    const r3 = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Guest 3',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 3, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      payment: { amount: 2000, mode: 'cash' }
    }, staffToken);
    assert.strictEqual(r3.status, 400);
    assert.strictEqual(r3.json.code, 'COUPLE_WARNING_ACK_REQUIRED');

    // Stale acknowledgment code (3 -> 5 adults) rejected
    const rStale = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Guest 5',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 5, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      acknowledgeCoupleWarning: true,
      acknowledgedCoupleWarningCode: 'COUPLE_3_ADULTS',
      payment: { amount: 2000, mode: 'cash' }
    }, staffToken);
    assert.strictEqual(rStale.status, 400);
    assert.strictEqual(rStale.json.code, 'COUPLE_WARNING_ACK_REQUIRED');

    // Valid acknowledgment succeeds
    const rOk = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Guest 5',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 5, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      acknowledgeCoupleWarning: true,
      acknowledgedCoupleWarningCode: 'COUPLE_5_ADULTS',
      payment: { amount: 2000, mode: 'cash' }
    }, staffToken);
    assert.strictEqual(rOk.status, 200);
    assert.strictEqual(rOk.json.booking.totalAmount, 13500);
    assert.strictEqual(rOk.json.booking.acknowledgments.coupleWarningAcknowledged, true);
  });

  // 3. Zero-advance warning enforced server-side
  await test('Zero advance requires acknowledgment; direct API bypass rejected; acknowledged booking stays Unpaid', async () => {
    const rFail = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Zero Adv',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      payment: { amount: 0, mode: 'cash' }
    }, staffToken);
    assert.strictEqual(rFail.status, 400);
    assert.strictEqual(rFail.json.code, 'ZERO_ADVANCE_ACK_REQUIRED');

    const rOk = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Zero Adv Ok',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      acknowledgeZeroAdvance: true,
      payment: { amount: 0, mode: 'cash' }
    }, staffToken);
    assert.strictEqual(rOk.status, 200);
    assert.strictEqual(rOk.json.booking.paymentStatus, 'unpaid');
    assert.strictEqual(rOk.json.booking.remainingPayment, 5500);
    assert.strictEqual(rOk.json.booking.acknowledgments.zeroAdvanceAcknowledged, true);
  });

  // 4. Rate override validation, preservation & audit
  await test('Rate override requires reason, preserves originalTotal, recalculates server-side & logs audit', async () => {
    auditLogs.length = 0;
    const rMissingReason = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Override Fail',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      rateOverrides: { coupleBaseRate: 5000 },
      payment: { amount: 1000, mode: 'cash' }
    }, staffToken);
    assert.strictEqual(rMissingReason.status, 400);
    assert.strictEqual(rMissingReason.json.code, 'OVERRIDE_REASON_REQUIRED');

    const rOk = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Override Ok',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      rateOverrides: { coupleBaseRate: 5000, reason: 'Corporate negotiated rate' },
      payment: { amount: 1000, mode: 'card' }
    }, staffToken);
    assert.strictEqual(rOk.status, 200);
    assert.strictEqual(rOk.json.booking.totalAmount, 5000);
    assert.strictEqual(rOk.json.booking.pricingSnapshot.originalTotal, 5500);
    assert.strictEqual(rOk.json.booking.rateOverrides[0].originalRate, 5500);
    assert.strictEqual(rOk.json.booking.rateOverrides[0].overriddenRate, 5000);
    assert.ok(auditLogs.some(a => a.action === 'rate_override_applied'));
  });

  // 5. Discounts (fixed, percentage, missing reason, excessive)
  await test('Discounts enforce reason & limits, compute server-side total & log audit', async () => {
    const rExcess = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Excess Disc',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      discount: { type: 'fixed', value: 9000, reason: 'Too high' },
      payment: { amount: 0, mode: 'cash' },
      acknowledgeZeroAdvance: true
    }, staffToken);
    assert.strictEqual(rExcess.status, 400);
    assert.strictEqual(rExcess.json.code, 'EXCESSIVE_DISCOUNT');

    const rPct = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Pct Disc',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId],
      discount: { type: 'percentage', value: 10, reason: 'Repeat guest 10%' },
      payment: { amount: 1950, mode: 'bank_transfer', utr: 'NEFT9988' }
    }, staffToken);
    assert.strictEqual(rPct.status, 200);
    // 5500 - 10% (550) = 4950
    assert.strictEqual(rPct.json.booking.totalAmount, 4950);
    assert.strictEqual(rPct.json.booking.remainingPayment, 3000);
    assert.strictEqual(rPct.json.booking.discount.amount, 550);
  });

  // 6. Payment validation & One Day add-on + IST midnight check
  await test('Invalid payment mode, negative payment, excessive payment & raw Base64 screenshot rejected (400)', async () => {
    const base = {
      customerName: 'Pay Test',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: [validRoomId]
    };

    const rMode = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', { ...base, payment: { amount: 500, mode: 'crypto' } }, staffToken);
    const rNeg = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', { ...base, payment: { amount: -100, mode: 'cash' } }, staffToken);
    const rOver = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', { ...base, payment: { amount: 9000, mode: 'cash' } }, staffToken);
    const rB64 = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', { ...base, payment: { amount: 500, mode: 'upi', screenshotRef: 'data:image/png;base64,AAA' } }, staffToken);

    assert.strictEqual(rMode.status, 400);
    assert.strictEqual(rNeg.status, 400);
    assert.strictEqual(rOver.status, 400);
    assert.strictEqual(rB64.status, 400);
    assert.strictEqual(rB64.json.code, 'RAW_BASE64_DISALLOWED');
  });

  await test('One Day B->D + ₹2,000 room add-on + IST UTC midnight conversion works accurately', async () => {
    const r = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Picnic IST',
      customerPhone: '9876543210',
      checkInDate: '2026-08-14T18:30:00.000Z', // 2026-08-15 Saturday (Weekend) in IST!
      packageType: 'oneDay',
      mealOption: 'B->D',
      roomAddon: true,
      guestComposition: { adults: 4, children: 0 },
      bookedBy: { name: 'Kadambari' },
      payment: { amount: 8000, mode: 'other' }
    }, staffToken);

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.booking.date, '2026-08-15');
    assert.strictEqual(r.json.booking.isWeekend, true);
    // 4 * 1500 + 2000 = 8000
    assert.strictEqual(r.json.booking.totalAmount, 8000);
    assert.strictEqual(r.json.booking.paymentStatus, 'paid');
  });

  // 7. Screenshot storage boundary tests
  await test('Screenshot storage validates MIME, magic bytes, 5MB limit, private adapter & 503 when unconfigured', async () => {
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const v = validateScreenshotPayload({ buffer: validPng, mimeType: 'image/png', originalName: 'receipt.png' });
    assert.ok(v.safeKey.startsWith('receipts/'));

    // Disallowed MIME
    assert.throws(
      () => validateScreenshotPayload({ buffer: validPng, mimeType: 'image/svg+xml', originalName: 'x.svg' }),
      StorageValidationError
    );
    // Spoofed magic bytes (text disguised as PNG)
    assert.throws(
      () => validateScreenshotPayload({ buffer: Buffer.from('not-a-png'), mimeType: 'image/png', originalName: 'bad.png' }),
      StorageValidationError
    );
    // Oversized (>5MB)
    assert.throws(
      () => validateScreenshotPayload({ buffer: Buffer.alloc(5 * 1024 * 1024 + 10, 0xff), mimeType: 'image/jpeg', originalName: 'big.jpg' }),
      StorageValidationError
    );

    // Private adapter upload & signed access
    let storedAcl = null;
    const mockAdapter = {
      putObject: async ({ acl }) => { storedAcl = acl; },
      getSignedUrl: async (ref) => `https://private.example.com/${ref}?sig=123`
    };
    const up = await uploadPaymentScreenshot({ buffer: validPng, mimeType: 'image/png', originalName: 'r.png' }, mockAdapter);
    assert.strictEqual(storedAcl, 'private');
    assert.strictEqual(up.privateAccess, true);
    const access = await getSignedScreenshotAccess(up.screenshotRef, mockAdapter);
    assert.ok(access.url.includes('sig=123'));

    // Missing storage config returns 503 via API
    const apiRes = await reqJson(baseUrl, 'POST', '/api/pms/uploads/payment-screenshot', {
      fileBase64: validPng.toString('base64'),
      mimeType: 'image/png',
      originalName: 'receipt.png'
    }, staffToken);
    assert.strictEqual(apiRes.status, 503);
    assert.strictEqual(apiRes.json.code, 'STORAGE_NOT_CONFIGURED');
  });

  await test('One Day Picnic B->T: Mongoose schema accepts breakfast_tea & breakfast_dinner, rejects invalid mealOption', () => {
    const validOptions = ['breakfast_tea', 'breakfast_dinner', 'breakfast-to-tea', 'breakfast-to-dinner', 'B->D', 'B->T', 'B->L', 'none', null];
    for (const opt of validOptions) {
      const doc = new models.Booking({
        customerName: 'Meal Test',
        customerPhone: '9876543210',
        date: '2026-11-28',
        totalAmount: 2500,
        packageType: 'oneDay',
        mealOption: opt
      });
      const err = doc.validateSync();
      assert.strictEqual(err, undefined, `Expected mealOption=${opt} to pass validation`);
    }

    const badDoc = new models.Booking({
      customerName: 'Bad Meal',
      customerPhone: '9876543210',
      date: '2026-11-28',
      totalAmount: 2500,
      packageType: 'oneDay',
      mealOption: 'invalid_meal'
    });
    const badErr = badDoc.validateSync();
    assert.ok(badErr && badErr.errors && badErr.errors.mealOption, 'Invalid mealOption must fail Mongoose validation');
  });

  await test('One Day Picnic B->T manual booking succeeds end-to-end with weekend ₹1,250/pp & weekday ₹1,000/pp', async () => {
    savedBookings.length = 0;
    // Weekend (Saturday 2026-11-28): 2 adults × ₹1,250 = ₹2,500
    const wkendRes = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Picnic Weekend',
      customerPhone: '9876543210',
      checkInDate: '2026-11-28',
      checkOutDate: '2026-11-28',
      packageType: 'oneDay',
      mealOption: 'B->T',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Ravi', staffId: 'staff_1' },
      payment: { amount: 1000, mode: 'cash' }
    }, staffToken);
    assert.strictEqual(wkendRes.status, 200);
    assert.strictEqual(wkendRes.json.booking.mealOption, 'breakfast_tea');
    assert.strictEqual(wkendRes.json.booking.totalAmount, 2500);
    assert.strictEqual(wkendRes.json.booking.pricingSnapshot.originalTotal, 2500);
    assert.strictEqual(wkendRes.json.booking.pricingSnapshot.ratesApplied.oneDayPerPersonRate, 1250);
    assert.strictEqual(wkendRes.json.booking.remainingPayment, 1500);

    // Ensure Mongoose validateSync() passes on the persisted fields
    const persistedCheck = new models.Booking({
      customerName: wkendRes.json.booking.customerName,
      customerPhone: wkendRes.json.booking.customerPhone,
      date: wkendRes.json.booking.date,
      packageType: wkendRes.json.booking.packageType,
      mealOption: wkendRes.json.booking.mealOption,
      totalAmount: wkendRes.json.booking.totalAmount
    });
    assert.strictEqual(persistedCheck.validateSync(), undefined);

    // Weekday (Tuesday 2026-11-24): 3 adults + 2 children = 5 guests × ₹1,000 = ₹5,000
    const wkdayRes = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Picnic Weekday',
      customerPhone: '9876543211',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-24',
      packageType: 'oneDay',
      mealOption: 'B->T',
      guestComposition: { adults: 3, children: 2 },
      childrenAges: [4, 9],
      bookedBy: { name: 'Ravi', staffId: 'staff_1' },
      payment: { amount: 5000, mode: 'upi' }
    }, staffToken);
    assert.strictEqual(wkdayRes.status, 200);
    assert.strictEqual(wkdayRes.json.booking.mealOption, 'breakfast_tea');
    assert.strictEqual(wkdayRes.json.booking.totalAmount, 5000);
    assert.strictEqual(wkdayRes.json.booking.paymentStatus, 'paid');
  });

  await test('One Day Picnic B->T rate override preserves originalTotal and rejects invalid mealOption via API', async () => {
    const previewRes = await reqJson(baseUrl, 'POST', '/api/pms/pricing/preview', {
      packageType: 'oneDay',
      checkInDate: '2026-11-28',
      adults: 2,
      mealOption: 'B->T',
      rateOverrides: { oneDayPerPersonRate: '1100', reason: 'Regular guest' }
    }, staffToken);
    assert.strictEqual(previewRes.status, 200);
    assert.strictEqual(previewRes.json.quote.originalTotal, 2500);
    assert.strictEqual(previewRes.json.quote.totalAmount, 2200);
    assert.strictEqual(previewRes.json.quote.dailyBreakdown[0].perPersonRate, 1100);

    const badMealRes = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Invalid Meal',
      customerPhone: '9876543210',
      checkInDate: '2026-11-28',
      packageType: 'oneDay',
      mealOption: 'invalid_meal',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Ravi' },
      payment: { amount: 1000, mode: 'cash' }
    }, staffToken);
    assert.strictEqual(badMealRes.status, 400);
  });

  server.close();
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`SPRINT 2 TEST SUITE SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
