#!/usr/bin/env node

/**
 * Test Suite: Date Helper Service
 * 
 * Validates that dateHelper.js correctly computes day-of-week,
 * weekday/weekend classification, date range tables, calendar references,
 * and prompt formatting — ensuring the LLM never needs to guess.
 * 
 * Usage: node backend/src/scripts/testDateHelperSuite.js
 */

const {
  getTodayIST,
  getDayName,
  getShortDayName,
  isWeekday,
  isWeekend,
  normalizeDate,
  buildDateRangeTable,
  buildCalendarReference,
  formatDateTableForPrompt
} = require('../services/dateHelper');

const { calculatePricing } = require('../services/pricingService');

let passed = 0;
let failed = 0;
const results = [];

function assert(testName, condition, detail = '') {
  if (condition) {
    passed++;
    results.push({ name: testName, status: '✅ PASS', detail });
    console.log(`  ✅ ${testName}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    results.push({ name: testName, status: '❌ FAIL', detail });
    console.log(`  ❌ ${testName}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('\n====================================================');
console.log('       RUNNING DATE HELPER SUITE                    ');
console.log('====================================================\n');

// ─── TEST 1: Known dates → correct day names ─────────────────────
console.log('--- TEST 1: Known Date → Day Name Mapping ---');
// 2026-08-10 is a Monday
assert('10 Aug 2026 = Monday', getDayName('2026-08-10') === 'Monday', getDayName('2026-08-10'));
// 2026-08-11 is a Tuesday
assert('11 Aug 2026 = Tuesday', getDayName('2026-08-11') === 'Tuesday', getDayName('2026-08-11'));
// 2026-08-12 is a Wednesday
assert('12 Aug 2026 = Wednesday', getDayName('2026-08-12') === 'Wednesday', getDayName('2026-08-12'));
// 2026-08-13 is a Thursday
assert('13 Aug 2026 = Thursday', getDayName('2026-08-13') === 'Thursday', getDayName('2026-08-13'));
// 2026-08-14 is a Friday
assert('14 Aug 2026 = Friday', getDayName('2026-08-14') === 'Friday', getDayName('2026-08-14'));
// 2026-08-15 is a Saturday
assert('15 Aug 2026 = Saturday', getDayName('2026-08-15') === 'Saturday', getDayName('2026-08-15'));
// 2026-08-16 is a Sunday
assert('16 Aug 2026 = Sunday', getDayName('2026-08-16') === 'Sunday', getDayName('2026-08-16'));

// ─── TEST 2: Weekday/Weekend classification ──────────────────────
console.log('\n--- TEST 2: Weekday/Weekend Classification ---');
assert('Monday is WEEKDAY', isWeekday('2026-08-10') === true);
assert('Tuesday is WEEKDAY', isWeekday('2026-08-11') === true);
assert('Wednesday is WEEKDAY', isWeekday('2026-08-12') === true);
assert('Thursday is WEEKDAY', isWeekday('2026-08-13') === true);
assert('Friday is WEEKEND', isWeekend('2026-08-14') === true, 'Fri = WEEKEND ✓');
assert('Saturday is WEEKEND', isWeekend('2026-08-15') === true);
assert('Sunday is WEEKEND', isWeekend('2026-08-16') === true);
assert('Monday NOT weekend', isWeekend('2026-08-10') === false);

// ─── TEST 3: buildDateRangeTable (11-13 Aug, all weekdays) ───────
console.log('\n--- TEST 3: buildDateRangeTable (11-13 Aug = Tue/Wed) ---');
const range1 = buildDateRangeTable('2026-08-11', '2026-08-13');
assert('Range has 2 nights', range1.length === 2, `Got ${range1.length}`);
assert('Night 1 = Tuesday', range1[0].dayName === 'Tuesday', range1[0].dayName);
assert('Night 2 = Wednesday', range1[1].dayName === 'Wednesday', range1[1].dayName);
assert('Both WEEKDAY', range1.every(n => n.type === 'WEEKDAY'), range1.map(n => n.type).join(', '));

// ─── TEST 4: buildDateRangeTable spanning Thu→Sun (mixed) ────────
console.log('\n--- TEST 4: buildDateRangeTable (13-16 Aug = Thu/Fri/Sat) ---');
const range2 = buildDateRangeTable('2026-08-13', '2026-08-16');
assert('Range has 3 nights', range2.length === 3, `Got ${range2.length}`);
assert('Night 1 = Thursday (WEEKDAY)', range2[0].dayName === 'Thursday' && range2[0].type === 'WEEKDAY');
assert('Night 2 = Friday (WEEKEND)', range2[1].dayName === 'Friday' && range2[1].type === 'WEEKEND');
assert('Night 3 = Saturday (WEEKEND)', range2[2].dayName === 'Saturday' && range2[2].type === 'WEEKEND');

// ─── TEST 5: Cross-month boundary (30 Aug - 2 Sep) ──────────────
console.log('\n--- TEST 5: Cross-month boundary (30 Aug - 2 Sep 2026) ---');
const range3 = buildDateRangeTable('2026-08-30', '2026-09-02');
assert('Range has 3 nights', range3.length === 3, `Got ${range3.length}`);
assert('30 Aug = Sunday', range3[0].dayName === 'Sunday', range3[0].dayName);
assert('31 Aug = Monday', range3[1].dayName === 'Monday', range3[1].dayName);
assert('1 Sep = Tuesday', range3[2].dayName === 'Tuesday', range3[2].dayName);

// ─── TEST 6: formatDateTableForPrompt output ─────────────────────
console.log('\n--- TEST 6: formatDateTableForPrompt output ---');
const table = formatDateTableForPrompt('2026-08-11', '2026-08-13');
assert('Table contains Tuesday', table.includes('Tuesday'));
assert('Table contains Wednesday', table.includes('Wednesday'));
assert('Table contains WEEKDAY', table.includes('WEEKDAY'));
assert('Table contains "Total nights: 2"', table.includes('Total nights: 2'));
assert('Table contains "DO NOT recalculate"', table.includes('DO NOT recalculate'));

// ─── TEST 7: buildCalendarReference generates 30 days ────────────
console.log('\n--- TEST 7: buildCalendarReference (30-day dynamic calendar) ---');
const cal = buildCalendarReference('2026-08-10');
const calLines = cal.split('\n').filter(l => l.startsWith('-'));
assert('Calendar has 30 day entries', calLines.length === 30, `Got ${calLines.length}`);
assert('First line contains 10 Aug', calLines[0].includes('10 Aug'));
assert('Contains couple/group rates', calLines[0].includes('couple') && calLines[0].includes('group'));

// ─── TEST 8: Pricing uses same day names as dateHelper ───────────
console.log('\n--- TEST 8: Pricing ↔ dateHelper consistency (11-13 Aug) ---');
const pricingResult = calculatePricing('2026-08-11', '2026-08-13', 4, [], 'group');
// Extract day names from the per-night breakdown lines (format: "DayName (DateStr) - TYPE:")
const breakdownLineRegex = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \(/gm;
const pricingDayNames = [];
let match;
while ((match = breakdownLineRegex.exec(pricingResult.formatted)) !== null) {
  pricingDayNames.push(match[1]);
}
const dateHelperDayNames = range1.map(n => n.dayName);
assert(
  'Pricing day names match dateHelper',
  pricingDayNames.length === dateHelperDayNames.length &&
    pricingDayNames.every((d, i) => d === dateHelperDayNames[i]),
  `Pricing: [${pricingDayNames}] vs Helper: [${dateHelperDayNames}]`
);

// ─── TEST 9: Mixed weekday/weekend pricing consistency ───────────
console.log('\n--- TEST 9: Pricing consistency for Thu→Sat (mixed) ---');
const pricingMixed = calculatePricing('2026-08-13', '2026-08-15', 2, [], 'couple');
assert('Total = 1 weekday + 1 weekend = ₹5,500 + ₹6,500 = ₹12,000',
  pricingMixed.raw.grandTotal === 12000,
  `Got ₹${pricingMixed.raw.grandTotal.toLocaleString('en-IN')}`
);
assert('1 weekday night', pricingMixed.raw.weekdayNights === 1);
assert('1 weekend night', pricingMixed.raw.weekendNights === 1);

// ─── TEST 10: getTodayIST returns today ──────────────────────────
console.log('\n--- TEST 10: getTodayIST returns current IST date ---');
const todayIST = getTodayIST();
const todayName = getDayName(todayIST);
assert('getTodayIST returns valid Date', todayIST instanceof Date && !isNaN(todayIST.getTime()));
assert('getDayName(today) returns a day name', ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].includes(todayName), todayName);

// ─── SUMMARY ────────────────────────────────────────────────────
console.log('\n====================================================');
console.log('                 SUMMARY OF TESTS                   ');
console.log('====================================================');
results.forEach(r => {
  console.log(`${r.status} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
});
console.log(`\nTotal: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);

if (failed > 0) {
  console.log('\n⚠️  SOME TESTS FAILED — review above\n');
  process.exit(1);
} else {
  console.log('\n🎉 ALL TESTS PASSED\n');
  process.exit(0);
}
