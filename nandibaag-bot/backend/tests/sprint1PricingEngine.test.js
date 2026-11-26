/**
 * Sprint 1 Automated Test Suite: Authoritative Pricing Engine, Date Logic,
 * Pricing Preview API & Legacy Compatibility (100% Isolated, Zero Live DB)
 *
 * Run: NODE_ENV=test node tests/sprint1PricingEngine.test.js
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-ephemeral-secret-for-sprint1';

const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../src/config/env');
const models = require('../src/models');
const dateHelper = require('../src/utils/dateHelper');
const {
  PRICING_RULE_VERSION,
  PricingValidationError,
  getRateConfig,
  calculateBookingQuote,
  calculatePricing,
  calculateBookingPrice
} = require('../src/services/pricingService');
const pmsBookingRoutes = require('../src/routes/pmsBookingRoutes');
const errorHandler = require('../src/middleware/errorHandler');

// In-memory auth stubs for API tests
models.User.findById = (id) => ({
  select: () => ({
    lean: async () => (String(id) === 'staff_1'
      ? { _id: 'staff_1', name: 'Staff', email: 'staff@nandibaag.com', role: 'staff', isActive: true }
      : null)
  })
});
models.Session.findOne = async () => ({ _id: 's1', jti: 'j1', isActive: true });
models.Session.updateOne = async () => ({ acknowledged: true });

let bookingCreateSpy = 0;
const origSave = models.Booking.prototype.save;
models.Booking.prototype.save = async function () {
  bookingCreateSpy++;
  return origSave.apply(this, arguments);
};

const app = express();
app.use(express.json());
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

async function postJson(baseUrl, path, body, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
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
  console.log('💰 SPRINT 1 AUTHORITATIVE PRICING ENGINE TEST SUITE');
  console.log('══════════════════════════════════════════════════════════════\n');

  // ── 1. COUPLE STAY ──────────────────────────────────────────────────────
  // 2026-11-24 = Tuesday (Weekday), 2026-11-27 = Friday (Weekend)
  await test('Couple 2 adults weekday = ₹5,500, no warning', () => {
    const q = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 2 });
    assert.strictEqual(q.totalAmount, 5500);
    assert.strictEqual(q.warnings.length, 0);
  });

  await test('Couple 3 adults weekday = ₹5,500 + ₹2,500 = ₹8,000 + COUPLE_3_ADULTS warning', () => {
    const q = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 3 });
    assert.strictEqual(q.totalAmount, 8000);
    assert.strictEqual(q.warnings.length, 1);
    assert.strictEqual(q.warnings[0].code, 'COUPLE_3_ADULTS');
    assert.strictEqual(q.warnings[0].requiresAcknowledgment, true);
  });

  await test('Couple 3 adults weekend = ₹6,500 + ₹3,000 = ₹9,500 + warning', () => {
    const q = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-27', checkOutDate: '2026-11-28', adults: 3, acknowledgeCoupleWarning: true });
    assert.strictEqual(q.totalAmount, 9500);
    assert.strictEqual(q.snapshot.warningAcknowledged, true);
  });

  await test('Couple 4 adults weekday = 2 × ₹5,500 = ₹11,000, no warning', () => {
    const q = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 4 });
    assert.strictEqual(q.totalAmount, 11000);
    assert.strictEqual(q.warnings.length, 0);
  });

  await test('Couple 5 adults weekday = 2×₹5,500 + ₹2,500 = ₹13,500 + COUPLE_5_ADULTS warning', () => {
    const q = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 5 });
    assert.strictEqual(q.totalAmount, 13500);
    assert.strictEqual(q.warnings[0].code, 'COUPLE_5_ADULTS');
  });

  await test('Couple 5 adults weekend = 2×₹6,500 + ₹3,000 = ₹16,000 + warning', () => {
    const q = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-27', checkOutDate: '2026-11-28', adults: 5 });
    assert.strictEqual(q.totalAmount, 16000);
    assert.strictEqual(q.warnings[0].code, 'COUPLE_5_ADULTS');
  });

  await test('Couple children: ages 0 and 5 are FREE; ages 6 and 15 are ₹1,500 each', () => {
    const q = calculateBookingQuote({
      packageType: 'couple',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-25',
      adults: 2,
      childrenAges: [0, 5, 6, 15]
    });
    assert.strictEqual(q.totalAmount, 5500 + 3000);
    assert.strictEqual(q.guestSummary.freeChildren, 2);
    assert.strictEqual(q.guestSummary.chargeableChildren, 2);
  });

  await test('Couple invalid child age (-1 or 16) throws PricingValidationError', () => {
    assert.throws(
      () => calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 2, childrenAges: [-1] }),
      PricingValidationError
    );
    assert.throws(
      () => calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 2, childrenAges: [16] }),
      PricingValidationError
    );
  });

  // ── 2. GROUP / FAMILY STAY ──────────────────────────────────────────────
  await test('Group weekday adult = ₹2,000/adult; weekend adult = ₹3,000/adult', () => {
    const wkday = calculateBookingQuote({ packageType: 'group', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 4 });
    const wkend = calculateBookingQuote({ packageType: 'group', checkInDate: '2026-11-27', checkOutDate: '2026-11-28', adults: 4 });
    assert.strictEqual(wkday.totalAmount, 8000);
    assert.strictEqual(wkend.totalAmount, 12000);
  });

  await test('Group children: 0 & 5 free, 6 & 10 = ₹1,000, 11/15/18 normalized to adults', () => {
    const q = calculateBookingQuote({
      packageType: 'group',
      checkInDate: '2026-11-24', // Tuesday (weekday: adult ₹2,000)
      checkOutDate: '2026-11-25',
      adults: 2,
      childrenAges: [0, 5, 6, 10, 11, 15, 18]
    });
    // Effective adults = 2 + 3 (ages 11,15,18) = 5 -> 5 * 2000 = 10000
    // Chargeable children (6-10) = 2 -> 2 * 1000 = 2000
    // Free children (0-5) = 2 -> 0
    assert.strictEqual(q.guestSummary.effectiveAdults, 5);
    assert.strictEqual(q.guestSummary.chargeableChildren, 2);
    assert.strictEqual(q.guestSummary.freeChildren, 2);
    assert.strictEqual(q.totalAmount, 12000);
  });

  // ── 3. ONE DAY STAY ─────────────────────────────────────────────────────
  await test('One Day B->T weekday = ₹1,000/pp; weekend = ₹1,250/pp (age-independent)', () => {
    const wkday = calculateBookingQuote({ packageType: 'oneDay', mealOption: 'B->T', checkInDate: '2026-11-24', adults: 2, childrenAges: [0, 5, 8, 14] });
    const wkend = calculateBookingQuote({ packageType: 'oneDay', mealOption: 'breakfast_tea', checkInDate: '2026-11-27', adults: 2, childrenAges: [0, 5, 8, 14] });
    assert.strictEqual(wkday.totalAmount, 6 * 1000);
    assert.strictEqual(wkend.totalAmount, 6 * 1250);
  });

  await test('One Day B->D weekday = ₹1,250/pp; weekend = ₹1,500/pp + optional ₹2,000 room add-on', () => {
    const wkday = calculateBookingQuote({ packageType: 'oneDay', mealOption: 'B->D', checkInDate: '2026-11-24', adults: 4, roomAddon: false });
    const wkendAddon = calculateBookingQuote({ packageType: 'oneDay', mealOption: 'breakfast-to-dinner', checkInDate: '2026-11-27', adults: 4, roomAddon: true });
    assert.strictEqual(wkday.totalAmount, 5000);
    assert.strictEqual(wkendAddon.totalAmount, 4 * 1500 + 2000);
    assert.strictEqual(wkendAddon.addOns.smallRoom.enabled, true);
    assert.strictEqual(wkendAddon.addOns.smallRoom.amount, 2000);
  });

  // ── 4. DATE LOGIC & MULTI-DAY TRANSITIONS ───────────────────────────────
  await test('Mon & Thu are Weekday; Fri, Sat, Sun are Weekend', () => {
    assert.strictEqual(dateHelper.isWeekend('2026-11-23'), false); // Mon
    assert.strictEqual(dateHelper.isWeekend('2026-11-26'), false); // Thu
    assert.strictEqual(dateHelper.isWeekend('2026-11-27'), true);  // Fri
    assert.strictEqual(dateHelper.isWeekend('2026-11-28'), true);  // Sat
    assert.strictEqual(dateHelper.isWeekend('2026-11-29'), true);  // Sun
  });

  await test('Multi-day Thu->Fri->Sat (3 nights) calculates date-by-date correctly', () => {
    // 2026-11-26 (Thu:5500) + 2026-11-27 (Fri:6500) + 2026-11-28 (Sat:6500) = 18500
    const q = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-26', checkOutDate: '2026-11-29', adults: 2 });
    assert.strictEqual(q.nights, 3);
    assert.strictEqual(q.weekdayNights, 1);
    assert.strictEqual(q.weekendNights, 2);
    assert.strictEqual(q.totalAmount, 18500);
  });

  await test('Month boundary (Aug 31 -> Sep 2) & Year boundary (Dec 31 -> Jan 2)', () => {
    const monthCross = calculateBookingQuote({ packageType: 'group', checkInDate: '2026-08-31', checkOutDate: '2026-09-02', adults: 2 });
    // Aug 31 (Mon: 4000) + Sep 1 (Tue: 4000) = 8000
    assert.strictEqual(monthCross.nights, 2);
    assert.strictEqual(monthCross.totalAmount, 8000);

    const yearCross = calculateBookingQuote({ packageType: 'group', checkInDate: '2026-12-31', checkOutDate: '2027-01-02', adults: 2 });
    // Dec 31 (Thu: 4000) + Jan 1 (Fri: 6000) = 10000
    assert.strictEqual(yearCross.nights, 2);
    assert.strictEqual(yearCross.totalAmount, 10000);
  });

  await test('IST UTC timestamp 2026-08-14T18:30:00.000Z resolves to 2026-08-15 (Saturday IST)', () => {
    assert.strictEqual(dateHelper.toISTDateString('2026-08-14T18:30:00.000Z'), '2026-08-15');
    assert.strictEqual(dateHelper.getDayName('2026-08-14T18:30:00.000Z'), 'Saturday');
    assert.strictEqual(dateHelper.isWeekend('2026-08-14T18:30:00.000Z'), true);
    const today = dateHelper.getTodayIST();
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(today.dateStr));
  });

  // ── 5. RATE CONFIG & API PREVIEW ────────────────────────────────────────
  await test('Missing/invalid rate configuration throws PricingValidationError', () => {
    assert.throws(() => getRateConfig({ couple: { weekdayBase: -10 } }), PricingValidationError);
  });

  await test('POST /api/pms/pricing/preview rejects unauthenticated (401)', async () => {
    const r = await postJson(baseUrl, '/api/pms/pricing/preview', { packageType: 'couple', checkInDate: '2026-11-24', adults: 2 });
    assert.strictEqual(r.status, 401);
  });

  await test('POST /api/pms/pricing/preview validates invalid package, missing dates, invalid range, invalid ages (400)', async () => {
    const r1 = await postJson(baseUrl, '/api/pms/pricing/preview', { packageType: 'villa_unknown', checkInDate: '2026-11-24', adults: 2 }, staffToken);
    const r2 = await postJson(baseUrl, '/api/pms/pricing/preview', { packageType: 'couple', adults: 2 }, staffToken);
    const r3 = await postJson(baseUrl, '/api/pms/pricing/preview', { packageType: 'couple', checkInDate: '2026-11-26', checkOutDate: '2026-11-24', adults: 2 }, staffToken);
    const r4 = await postJson(baseUrl, '/api/pms/pricing/preview', { packageType: 'couple', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 0 }, staffToken);
    const r5 = await postJson(baseUrl, '/api/pms/pricing/preview', { packageType: 'group', checkInDate: '2026-11-24', checkOutDate: '2026-11-25', adults: 2, childrenAges: [150] }, staffToken);
    for (const r of [r1, r2, r3, r4, r5]) assert.strictEqual(r.status, 400);
  });

  await test('POST /api/pms/pricing/preview ignores client-injected totalAmount & creates zero bookings', async () => {
    bookingCreateSpy = 0;
    const r = await postJson(baseUrl, '/api/pms/pricing/preview', {
      packageType: 'couple',
      checkInDate: '2026-11-26',
      checkOutDate: '2026-11-28',
      adults: 3,
      totalAmount: 1
    }, staffToken);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.quote.totalAmount, (5500 + 2500) + (6500 + 3000));
    assert.strictEqual(r.json.pricingSnapshot.pricingRuleVersion, PRICING_RULE_VERSION);
    assert.strictEqual(r.json.warnings.length, 1);
    assert.strictEqual(bookingCreateSpy, 0);
  });

  // ── 6. LEGACY COMPATIBILITY ─────────────────────────────────────────────
  await test('Legacy Booking document without pricingSnapshot loads cleanly with legacy fields intact', () => {
    const legacyBooking = new models.Booking({
      customerName: 'Legacy Guest',
      customerPhone: '9876543210',
      date: '2026-09-02',
      totalAmount: 5500,
      advancePayment: 2000,
      advancePaid: 2000,
      remainingPayment: 3500,
      paymentStatus: 'partially_paid'
    });
    assert.strictEqual(legacyBooking.pricingSnapshot, null);
    assert.strictEqual(legacyBooking.totalAmount, 5500);
    assert.strictEqual(legacyBooking.advancePayment, 2000);
    assert.strictEqual(legacyBooking.advancePaid, 2000);

    const legacyPricing = calculatePricing('2026-11-24', '2026-11-25', 2, [], 'couple');
    assert.strictEqual(legacyPricing.raw.grandTotal, 5500);
    const legacyPrice2 = calculateBookingPrice('2026-11-24', '2026-11-25', 'group', 3, [8]);
    assert.strictEqual(legacyPrice2.totalPrice, 7000);
  });

  server.close();
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`SPRINT 1 PRICING SUITE SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
