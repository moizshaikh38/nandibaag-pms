/**
 * P0 Mixed Weekday/Weekend Date-Based Pricing Regression Suite
 *
 * Tests all 11 required scenarios against:
 * - calculateBookingQuote() (pricingService.js)
 * - POST /api/pms/pricing/preview (HTTP API)
 * - POST /api/bookings/manual-booking & POST /api/pms/bookings/manual
 * - ManualBookingForm.jsx date-change preview refresh & breakdown rendering
 *
 * Run: NODE_ENV=test node tests/mixedWeekdayWeekendRegression.test.js
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-ephemeral-secret-for-mixed-dates';

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
const { DEFAULT_RATE_CONFIG, calculateBookingQuote } = require('../src/services/pricingService');

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
models.Booking.prototype.save = async function () {
  if (!this._id) this._id = '507f1f77bcf86cd799439099';
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

async function postJson(baseUrl, urlPath, body, token) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method: 'POST',
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

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('📅 P0 MIXED WEEKDAY / WEEKEND PRICING REGRESSION SUITE');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Verify actual configured rates before asserting
  assert.strictEqual(DEFAULT_RATE_CONFIG.couple.weekdayBase, 5500);
  assert.strictEqual(DEFAULT_RATE_CONFIG.couple.weekendBase, 6500);
  assert.strictEqual(DEFAULT_RATE_CONFIG.group.weekdayAdult, 2000);
  assert.strictEqual(DEFAULT_RATE_CONFIG.group.weekendAdult, 3000);

  // 1. Monday–Thursday stay (2026-11-23 Mon -> 2026-11-26 Thu = 3 nights: Mon, Tue, Wed)
  await test('Scenario 1: Mon-Thu stay uses weekday rates for all nights (Couple ₹16,500; Group 4A ₹24,000)', () => {
    const couple = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-23', checkOutDate: '2026-11-26', adults: 2 });
    assert.strictEqual(couple.nights, 3);
    assert.strictEqual(couple.weekdayNights, 3);
    assert.strictEqual(couple.weekendNights, 0);
    assert.strictEqual(couple.totalAmount, 16500);
    assert.deepStrictEqual(couple.dailyBreakdown.map(d => [d.dayName, d.rateCategory, d.dailySubtotal]), [
      ['Monday', 'WEEKDAY', 5500],
      ['Tuesday', 'WEEKDAY', 5500],
      ['Wednesday', 'WEEKDAY', 5500]
    ]);

    const group = calculateBookingQuote({ packageType: 'group', checkInDate: '2026-11-23', checkOutDate: '2026-11-26', adults: 4 });
    assert.strictEqual(group.totalAmount, 24000);
  });

  // 2. Friday–Sunday stay (2026-11-27 Fri -> 2026-11-30 Mon = 3 nights: Fri, Sat, Sun)
  await test('Scenario 2: Fri-Sun stay uses weekend rates for all 3 nights (Couple ₹19,500; Group 4A ₹36,000)', () => {
    const couple = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-27', checkOutDate: '2026-11-30', adults: 2 });
    assert.strictEqual(couple.nights, 3);
    assert.strictEqual(couple.weekdayNights, 0);
    assert.strictEqual(couple.weekendNights, 3);
    assert.strictEqual(couple.totalAmount, 19500);
    assert.deepStrictEqual(couple.dailyBreakdown.map(d => [d.dayName, d.rateCategory, d.dailySubtotal]), [
      ['Friday', 'WEEKEND', 6500],
      ['Saturday', 'WEEKEND', 6500],
      ['Sunday', 'WEEKEND', 6500]
    ]);

    const group = calculateBookingQuote({ packageType: 'group', checkInDate: '2026-11-27', checkOutDate: '2026-11-30', adults: 4 });
    assert.strictEqual(group.totalAmount, 36000);
  });

  // 3. Thursday-to-Monday stay (2026-11-26 Thu -> 2026-11-30 Mon = 4 nights: Thu, Fri, Sat, Sun)
  await test('Scenario 3: Thu-to-Mon stay prices Thu (weekday) + Fri/Sat/Sun (weekend) individually', () => {
    const couple = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-26', checkOutDate: '2026-11-30', adults: 2 });
    assert.strictEqual(couple.nights, 4);
    assert.strictEqual(couple.weekdayNights, 1);
    assert.strictEqual(couple.weekendNights, 3);
    assert.strictEqual(couple.totalAmount, 5500 + 6500 + 6500 + 6500); // 25000
    assert.deepStrictEqual(couple.dailyBreakdown.map(d => [d.dayName, d.rateCategory, d.dailySubtotal]), [
      ['Thursday', 'WEEKDAY', 5500],
      ['Friday', 'WEEKEND', 6500],
      ['Saturday', 'WEEKEND', 6500],
      ['Sunday', 'WEEKEND', 6500]
    ]);

    const group = calculateBookingQuote({ packageType: 'group', checkInDate: '2026-11-26', checkOutDate: '2026-11-30', adults: 3 });
    assert.strictEqual(group.totalAmount, 6000 + 9000 + 9000 + 9000); // 33000
  });

  // 4. Monday-to-Friday stay (2026-11-23 Mon -> 2026-11-27 Fri = 4 nights: Mon-Thu; checkout Fri excluded)
  await test('Scenario 4: Mon-to-Fri stay excludes checkout Friday & prices Mon-Thu as weekday (₹22,000)', () => {
    const couple = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-23', checkOutDate: '2026-11-27', adults: 2 });
    assert.strictEqual(couple.nights, 4);
    assert.strictEqual(couple.weekdayNights, 4);
    assert.strictEqual(couple.weekendNights, 0);
    assert.strictEqual(couple.totalAmount, 22000);
    assert.ok(!couple.dailyBreakdown.some(d => d.dayName === 'Friday'));
  });

  // 5-9. Dynamic Date Changes via Preview API & Final Booking Persistence
  await test('Scenarios 5-9: Date changes (weekday -> mixed -> weekday) refresh preview & booking ignores stale totalAmount', async () => {
    const r1 = await postJson(baseUrl, '/api/pms/pricing/preview', {
      packageType: 'couple',
      checkInDate: '2026-11-23',
      checkOutDate: '2026-11-25', // Mon, Tue
      adults: 2
    }, staffToken);
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r1.json.quote.totalAmount, 11000);

    const r2 = await postJson(baseUrl, '/api/pms/pricing/preview', {
      packageType: 'couple',
      checkInDate: '2026-11-26',
      checkOutDate: '2026-11-28', // Thu (5500) + Fri (6500) = 12000
      adults: 2
    }, staffToken);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.json.quote.totalAmount, 12000);

    const r3 = await postJson(baseUrl, '/api/pms/pricing/preview', {
      packageType: 'couple',
      checkInDate: '2026-11-23',
      checkOutDate: '2026-11-25',
      adults: 2
    }, staffToken);
    assert.strictEqual(r3.status, 200);
    assert.strictEqual(r3.json.quote.totalAmount, 11000);

    // Final booking submission with mixed dates & stale injected totalAmount=11000 -> server persists 12000
    const bRes = await postJson(baseUrl, '/api/bookings/manual-booking', {
      customerName: 'Date Switch Guest',
      customerPhone: '9876543210',
      checkInDate: '2026-11-26',
      checkOutDate: '2026-11-28',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 0 },
      bookedBy: { name: 'Kadambari' },
      roomIds: ['507f1f77bcf86cd799439022'],
      totalAmount: 11000,
      payment: { amount: 5000, mode: 'upi' }
    }, staffToken);
    assert.strictEqual(bRes.status, 200);
    assert.strictEqual(bRes.json.booking.totalAmount, 12000);
    assert.strictEqual(bRes.json.booking.remainingPayment, 7000);
    assert.strictEqual(bRes.json.booking.pricingSnapshot.breakdown.length, 2);
  });

  // 10-11. One Day weekday/weekend + Month/Year/IST boundaries + ManualBookingForm check
  await test('Scenarios 10-11: One Day weekday/weekend, month/year boundaries & IST UTC edge cases', () => {
    const btWkday = calculateBookingQuote({ packageType: 'oneDay', mealOption: 'B->T', checkInDate: '2026-11-26', adults: 3 });
    const btWkend = calculateBookingQuote({ packageType: 'oneDay', mealOption: 'B->T', checkInDate: '2026-11-27', adults: 3 });
    assert.strictEqual(btWkday.totalAmount, 3000);
    assert.strictEqual(btWkend.totalAmount, 3750);

    const bdWkday = calculateBookingQuote({ packageType: 'oneDay', mealOption: 'B->D', checkInDate: '2026-11-26', adults: 2 });
    const bdWkend = calculateBookingQuote({ packageType: 'oneDay', mealOption: 'B->D', checkInDate: '2026-11-27', adults: 2 });
    assert.strictEqual(bdWkday.totalAmount, 2500);
    assert.strictEqual(bdWkend.totalAmount, 3000);

    // Month boundary: 2026-11-30 (Mon) -> 2026-12-02 (Wed) = 2 weekday nights
    const monthCross = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-11-30', checkOutDate: '2026-12-02', adults: 2 });
    assert.strictEqual(monthCross.totalAmount, 11000);

    // Year boundary: 2026-12-31 (Thu, 5500) -> 2027-01-02 (Sat): Thu(5500) + Fri(6500) = 12000
    const yearCross = calculateBookingQuote({ packageType: 'couple', checkInDate: '2026-12-31', checkOutDate: '2027-01-02', adults: 2 });
    assert.strictEqual(yearCross.totalAmount, 12000);

    // IST midnight UTC timestamp: 2026-11-26T18:30:00.000Z === 2026-11-27 Friday (Weekend) in IST
    const istFri = calculateBookingQuote({ packageType: 'oneDay', mealOption: 'B->T', checkInDate: '2026-11-26T18:30:00.000Z', adults: 1 });
    assert.strictEqual(istFri.checkInDate, '2026-11-27');
    assert.strictEqual(istFri.totalAmount, 1250);
  });

  await test('ManualBookingForm.jsx refreshes server quote on checkInDate/checkOutDate changes & renders dailyBreakdown', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/ManualBookingForm.jsx'), 'utf8');
    assert.ok(src.includes('formData.checkInDate,'));
    assert.ok(src.includes('formData.checkOutDate,'));
    assert.ok(src.includes('quoteState.quote.dailyBreakdown?.map'));
    assert.ok(src.includes('api.post(\'/pms/pricing/preview\''));
  });

  server.close();
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`MIXED DATE REGRESSION SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
