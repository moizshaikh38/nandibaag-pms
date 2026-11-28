/**
 * Custom Final Total Override Regression Suite
 *
 * Tests authoritative pricingService, manualBookingProcessor, bookingRoutes,
 * pmsBookingRoutes (preview, create, PATCH /bookings/:id/total), paymentSyncService,
 * and Mongoose Booking schema validation with in-memory DB stubs (zero live DB writes).
 *
 * Run: NODE_ENV=test node tests/customTotalOverride.test.js
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-ephemeral-secret-for-custom-total';

const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../src/config/env');
const models = require('../src/models');
const availabilityService = require('../src/services/availabilityService');
const roomMapper = require('../src/utils/roomMapper');
const { calculateBookingQuote, PricingValidationError } = require('../src/services/pricingService');
const { computePaymentSummary } = require('../src/services/paymentSyncService');

// In-memory store simulating MongoDB Booking persistence
const dbStore = new Map();
const auditLogs = [];

models.User.findById = (id) => ({
  select: () => ({
    lean: async () => (String(id) === '507f1f77bcf86cd799439099'
      ? { _id: '507f1f77bcf86cd799439099', name: 'Ravi', email: 'ravi@nandibaag.com', role: 'staff', isActive: true }
      : null)
  })
});
models.Session.findOne = async () => ({ _id: 's1', jti: 'j1', isActive: true });
models.Session.updateOne = async () => ({ acknowledged: true });
models.ActivityLog.create = async (entry) => {
  auditLogs.push(entry);
  return entry;
};
models.Room.find = () => ({ lean: async () => [] });
models.Room.findOne = async () => null;
models.Room.findById = async () => null;
models.Settings.findOne = async () => ({ whatsappNumbers: [] });
availabilityService.checkMultipleRoomsAvailable = async () => ({ available: true, conflicts: [] });
roomMapper.roomIdsToNumbers = async () => [];

models.Booking.prototype.save = async function () {
  const err = this.validateSync();
  if (err) throw err;
  if (!this._id) this._id = new models.Booking()._id;
  const plain = this.toObject();
  dbStore.set(String(this._id), plain);
  return this;
};

models.Booking.findById = async (id) => {
  const raw = dbStore.get(String(id));
  if (!raw) return null;
  const doc = new models.Booking(raw);
  doc.isNew = false;
  return doc;
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
  const staffToken = jwt.sign({ id: '507f1f77bcf86cd799439099', role: 'staff', jti: 'j1' }, jwtSecret, { expiresIn: '1h' });
  const validRoomId = '507f1f77bcf86cd799439022';

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('💳 CUSTOM FINAL TOTAL OVERRIDE REGRESSION SUITE');
  console.log('══════════════════════════════════════════════════════════════\n');

  await test('1. Default calculated total remains unchanged when customTotal is omitted', () => {
    const q = calculateBookingQuote({
      packageType: 'couple',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-26',
      adults: 2
    });
    assert.strictEqual(q.calculatedTotal, 11000);
    assert.strictEqual(q.totalAmount, 11000);
    assert.strictEqual(q.customTotalApplied, false);
    assert.strictEqual(q.manualTotalAdjustment, 0);
  });

  await test('2. Admin can decrease, increase, or set arbitrary customTotal across packages', () => {
    // Decrease ₹10,000 (Group 5A weekday) -> ₹7,000
    const dec = calculateBookingQuote({
      packageType: 'group',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      adults: 5,
      customTotal: 7000
    });
    assert.strictEqual(dec.calculatedTotal, 10000);
    assert.strictEqual(dec.totalAmount, 7000);
    assert.strictEqual(dec.manualTotalAdjustment, -3000);
    assert.strictEqual(dec.customTotalApplied, true);
    assert.ok(dec.formatted.includes('Manual Adjustment: -₹3,000'));
    assert.ok(dec.formatted.includes('TOTAL: ₹7,000'));

    // Increase ₹10,000 -> ₹12,500
    const inc = calculateBookingQuote({
      packageType: 'group',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      adults: 5,
      customTotal: 12500
    });
    assert.strictEqual(inc.totalAmount, 12500);
    assert.strictEqual(inc.manualTotalAdjustment, 2500);
    assert.ok(inc.formatted.includes('Manual Adjustment: +₹2,500'));

    // Significantly lower ₹1,000 & significantly higher ₹95,000 on One Day B->T
    const low = calculateBookingQuote({ packageType: 'oneDay', mealOption: 'B->T', checkInDate: '2026-11-28', adults: 2, customTotal: 1000 });
    assert.strictEqual(low.originalTotal, 2500);
    assert.strictEqual(low.totalAmount, 1000);
    assert.strictEqual(low.manualTotalAdjustment, -1500);

    const high = calculateBookingQuote({ packageType: 'oneDay', mealOption: 'B->T', checkInDate: '2026-11-28', adults: 2, customTotal: 95000 });
    assert.strictEqual(high.originalTotal, 2500);
    assert.strictEqual(high.totalAmount, 95000);
    assert.strictEqual(high.manualTotalAdjustment, 92500);
  });

  await test('3. Invalid customTotal (negative, NaN, Infinity) is rejected', () => {
    assert.throws(() => calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 2, customTotal: -100 }), PricingValidationError);
    assert.throws(() => calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 2, customTotal: 'abc' }), PricingValidationError);
    assert.throws(() => calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 2, customTotal: Infinity }), PricingValidationError);
  });

  let createdBookingId = null;

  await test('4. POST /api/bookings/manual-booking persists customTotal, preserves originalTotal, & recalculates balance', async () => {
    dbStore.clear();
    auditLogs.length = 0;

    // Preview first
    const prev = await reqJson(baseUrl, 'POST', '/api/pms/pricing/preview', {
      packageType: 'couple',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      adults: 2,
      customTotal: 7000
    }, staffToken);
    assert.strictEqual(prev.status, 200);
    assert.strictEqual(prev.json.quote.originalTotal, 5500);
    assert.strictEqual(prev.json.quote.totalAmount, 7000);
    assert.strictEqual(prev.json.quote.manualTotalAdjustment, 1500);

    // Submit with partial payment ₹2,000
    const res = await reqJson(baseUrl, 'POST', '/api/bookings/manual-booking', {
      customerName: 'Custom Total Guest',
      customerPhone: '9876543210',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Ravi', staffId: 'staff_1' },
      roomIds: [validRoomId],
      customTotal: 7000,
      payment: { amount: 2000, mode: 'upi', utr: 'UTR7000' }
    }, staffToken);

    assert.strictEqual(res.status, 200);
    const b = res.json.booking;
    createdBookingId = String(b._id);
    assert.strictEqual(b.totalAmount, 7000);
    assert.strictEqual(b.pricingSnapshot.originalTotal, 5500);
    assert.strictEqual(b.pricingSnapshot.customTotal, 7000);
    assert.strictEqual(b.pricingSnapshot.manualTotalAdjustment, 1500);
    assert.strictEqual(b.advancePaid, 2000);
    assert.strictEqual(b.remainingPayment, 5000);
    assert.strictEqual(b.paymentStatus, 'partially_paid');
    assert.strictEqual(b.payments.length, 1);
    assert.ok(b.priceBreakdown.includes('TOTAL: ₹7,000'));
    assert.ok(auditLogs.some(a => a.action === 'custom_total_applied'));

    // Re-read from simulated DB
    const reopened = await models.Booking.findById(createdBookingId);
    assert.strictEqual(reopened.totalAmount, 7000);
    assert.strictEqual(reopened.pricingSnapshot.originalTotal, 5500);
  });

  await test('5. PATCH /api/pms/bookings/:id/total updates total, preserves recorded payments, and recalculates balance', async () => {
    // Increase total 7000 -> 12500 while payment remains 2000
    const incRes = await reqJson(baseUrl, 'PATCH', `/api/pms/bookings/${createdBookingId}/total`, {
      totalAmount: 12500
    }, staffToken);
    assert.strictEqual(incRes.status, 200);
    assert.strictEqual(incRes.json.booking.totalAmount, 12500);
    assert.strictEqual(incRes.json.booking.payments.length, 1);
    assert.strictEqual(incRes.json.booking.payments[0].amount, 2000);
    assert.strictEqual(incRes.json.booking.advancePaid, 2000);
    assert.strictEqual(incRes.json.booking.remainingPayment, 10500);
    assert.strictEqual(incRes.json.booking.paymentStatus, 'partially_paid');
    assert.strictEqual(incRes.json.overpaidAmount, 0);

    // Decrease total below already-paid amount (12500 -> 1500 while paid=2000):
    // Must preserve payment 2000, not create refund, set remaining=0, report overpaidAmount=500 + warning
    const decRes = await reqJson(baseUrl, 'PATCH', `/api/pms/bookings/${createdBookingId}/total`, {
      totalAmount: 1500
    }, staffToken);
    assert.strictEqual(decRes.status, 200);
    assert.strictEqual(decRes.json.booking.totalAmount, 1500);
    assert.strictEqual(decRes.json.booking.payments.length, 1);
    assert.strictEqual(decRes.json.booking.payments[0].amount, 2000);
    assert.strictEqual(decRes.json.booking.remainingPayment, 0);
    assert.strictEqual(decRes.json.booking.paymentStatus, 'paid');
    assert.strictEqual(decRes.json.overpaidAmount, 500);
    assert.ok(decRes.json.warning);

    const summary = computePaymentSummary(await models.Booking.findById(createdBookingId));
    assert.strictEqual(summary.totalAmount, 1500);
    assert.strictEqual(summary.paidAmount, 2000);
    assert.strictEqual(summary.remainingAmount, 0);
  });

  await test('6. Unauthorized requests to PATCH /api/pms/bookings/:id/total are rejected (401) & invalid inputs rejected (400)', async () => {
    const unauth = await reqJson(baseUrl, 'PATCH', `/api/pms/bookings/${createdBookingId}/total`, { totalAmount: 5000 });
    assert.strictEqual(unauth.status, 401);

    const badNeg = await reqJson(baseUrl, 'PATCH', `/api/pms/bookings/${createdBookingId}/total`, { totalAmount: -50 }, staffToken);
    assert.strictEqual(badNeg.status, 400);

    const badNan = await reqJson(baseUrl, 'PATCH', `/api/pms/bookings/${createdBookingId}/total`, { totalAmount: 'not-a-number' }, staffToken);
    assert.strictEqual(badNan.status, 400);
  });

  await test('7. Effective rate recalculates accurately across per-person (oneDay/group), non-per-person (couple), decimals, & 0-guest guard', async () => {
    const { computeEffectiveRateSummary } = require('../src/services/pricingService');
    const { pathToFileURL } = require('url');
    const path = require('path');
    const { computeEffectiveRate } = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/effectiveRate.js')).href);

    // 7a. Group 4 adults (10000 -> 8000 => 2000/adult; original 2500/adult)
    const gQuote = calculateBookingQuote({
      packageType: 'group',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      adults: 4,
      rateOverrides: { groupAdultRateWeekday: 2500 },
      customTotal: 8000
    });
    assert.strictEqual(gQuote.effectiveRateSummary.pricingModel, 'per_person');
    assert.strictEqual(gQuote.effectiveRateSummary.applicableGuestCount, 4);
    assert.strictEqual(gQuote.effectiveRateSummary.originalRate, 2500);
    assert.strictEqual(gQuote.effectiveRateSummary.effectiveRate, 2000);
    assert.ok(gQuote.formatted.includes('Effective Rate: ₹2,000 / adult'));

    // Frontend helper parity on repeated edits & equal/higher/reset
    const feLower = computeEffectiveRate({ quote: gQuote, packageType: 'group', adults: 4, childrenAges: [], finalTotal: 8000 });
    assert.strictEqual(feLower.effectiveRate, 2000);
    const feHigher = computeEffectiveRate({ quote: gQuote, packageType: 'group', adults: 4, childrenAges: [], finalTotal: 12000 });
    assert.strictEqual(feHigher.effectiveRate, 3000);
    const feEqual = computeEffectiveRate({ quote: gQuote, packageType: 'group', adults: 4, childrenAges: [], finalTotal: 10000 });
    assert.strictEqual(feEqual.effectiveRate, feEqual.originalRate);

    // 7b. Group with free children (ages 2, 4) & 11yo promoted adult:
    // 2 adults + [2, 4, 12] -> effectiveAdults=3, freeChildren=2 -> denominator MUST be 3, NOT 5!
    const gKidsQuote = calculateBookingQuote({
      packageType: 'group',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      adults: 2,
      childrenAges: [2, 4, 12],
      customTotal: 4500
    });
    assert.strictEqual(gKidsQuote.effectiveRateSummary.applicableGuestCount, 3);
    assert.strictEqual(gKidsQuote.effectiveRateSummary.effectiveRate, 1500);
    const feKids = computeEffectiveRate({ quote: gKidsQuote, packageType: 'group', adults: 2, childrenAges: [2, 4, 12], finalTotal: 4500 });
    assert.strictEqual(feKids.applicableGuestCount, 3);
    assert.strictEqual(feKids.effectiveRate, 1500);

    // 7c. One Day B->T decimal custom total: 3 guests, customTotal=5000 -> 1666.67 / person
    const oneDayDec = calculateBookingQuote({
      packageType: 'oneDay',
      mealOption: 'B->T',
      checkInDate: '2026-11-28',
      adults: 3,
      customTotal: 5000
    });
    assert.strictEqual(oneDayDec.effectiveRateSummary.applicableGuestCount, 3);
    assert.strictEqual(oneDayDec.effectiveRateSummary.originalRate, 1250);
    assert.strictEqual(oneDayDec.effectiveRateSummary.effectiveRate, 1666.67);

    // 7d. Couple Stay uses package_per_night (NOT per-person)
    const coupleQuote = calculateBookingQuote({
      packageType: 'couple',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-26', // 2 nights
      adults: 2,
      customTotal: 9000
    });
    assert.strictEqual(coupleQuote.effectiveRateSummary.pricingModel, 'package_per_night');
    assert.strictEqual(coupleQuote.effectiveRateSummary.applicableGuestCount, null);
    assert.strictEqual(coupleQuote.effectiveRateSummary.originalRate, 5500);
    assert.strictEqual(coupleQuote.effectiveRateSummary.effectiveRate, 4500);

    // 7e. Zero guest denominator safety (no NaN / Infinity)
    const zeroSafe = computeEffectiveRateSummary({ packageType: 'oneDay', totalAmount: 2000, guestSummary: { effectiveAdults: 0 } }, 1500);
    assert.strictEqual(zeroSafe.effectiveRate, null);
  });

  server.close();
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`CUSTOM TOTAL OVERRIDE SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
