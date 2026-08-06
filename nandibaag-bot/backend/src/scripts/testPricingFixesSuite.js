const { isWeekend, isWeekday, getDayName, calculatePricing, parseLocalDate } = require('../services/pricingService');

function runPricingFixesSuite() {
  console.log('====================================================');
  console.log('   RUNNING PRICING & DAY CALCULATION FIXES SUITE   ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.log(`❌ [FAIL] ${message}`);
    }
  }

  // ----------------------------------------------------
  // FIX 1: DAY CALCULATION VERIFICATION
  // ----------------------------------------------------
  console.log('----------------------------------------------------');
  console.log('FIX 1: VERIFYING DAY CALCULATION (AUGUST 2026)');
  console.log('----------------------------------------------------');

  const d11 = getDayName('2026-08-11');
  assert(d11 === 'Tuesday', `11 Aug 2026 is Tuesday (got: ${d11})`);

  const d12 = getDayName('2026-08-12');
  assert(d12 === 'Wednesday', `12 Aug 2026 is Wednesday (got: ${d12})`);

  const d13 = getDayName('2026-08-13');
  assert(d13 === 'Thursday', `13 Aug 2026 is Thursday (got: ${d13})`);

  const d8 = getDayName('2026-08-08');
  assert(d8 === 'Saturday', `8 Aug 2026 is Saturday (got: ${d8})`);

  const d9 = getDayName('2026-08-09');
  assert(d9 === 'Sunday', `9 Aug 2026 is Sunday (got: ${d9})`);

  const d22 = getDayName('2026-08-22');
  assert(d22 === 'Saturday', `22 Aug 2026 is Saturday (got: ${d22})`);

  const d23 = getDayName('2026-08-23');
  assert(d23 === 'Sunday', `23 Aug 2026 is Sunday (got: ${d23})`);

  // ----------------------------------------------------
  // FIX 2: WEEKDAY / WEEKEND DETECTION
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('FIX 2: WEEKDAY / WEEKEND DETECTION');
  console.log('----------------------------------------------------');

  assert(isWeekend('2026-08-11') === false, `11 Aug 2026 is NOT a weekend`);
  assert(isWeekday('2026-08-11') === true, `11 Aug 2026 IS a weekday`);
  assert(isWeekend('2026-08-08') === true, `8 Aug 2026 IS a weekend`);
  assert(isWeekday('2026-08-08') === false, `8 Aug 2026 is NOT a weekday`);

  // ----------------------------------------------------
  // TEST CASE 1: 11-13 Aug, 4 adults, GROUP
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('TEST CASE 1: 11-13 Aug, 4 adults, GROUP (2 Weekday nights)');
  console.log('----------------------------------------------------');
  const p1 = calculatePricing('2026-08-11', '2026-08-13', 4, [], 'group');
  console.log('Calculated Breakdown:\n' + p1.formatted);
  assert(p1.raw.grandTotal === 16000, `11-13 Aug (Mon-Tue) 4 adults group pricing is ₹16,000 (got ₹${p1.raw.grandTotal})`);
  assert(p1.raw.weekdayNights === 2, `Weekday nights count is 2 (got ${p1.raw.weekdayNights})`);
  assert(p1.raw.weekendNights === 0, `Weekend nights count is 0 (got ${p1.raw.weekendNights})`);

  // ----------------------------------------------------
  // TEST CASE 2: 8-9 Aug, 4 adults, GROUP (1 Weekend night)
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('TEST CASE 2: 8-9 Aug, 4 adults, GROUP (1 Weekend night - Sat)');
  console.log('----------------------------------------------------');
  const p2 = calculatePricing('2026-08-08', '2026-08-09', 4, [], 'group');
  console.log('Calculated Breakdown:\n' + p2.formatted);
  assert(p2.raw.grandTotal === 12000, `8-9 Aug (Sat) 4 adults group pricing is ₹12,000 (got ₹${p2.raw.grandTotal})`);
  assert(p2.raw.weekendNights === 1, `Weekend nights count is 1 (got ${p2.raw.weekendNights})`);

  // ----------------------------------------------------
  // TEST CASE 3: Day Picnic (4 people)
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('TEST CASE 3: Day Picnic, 4 people');
  console.log('----------------------------------------------------');
  const p3_dinner = calculatePricing('2026-08-11', null, 4, [], 'picnic', { mealOption: 'breakfast_dinner' });
  console.log('Breakfast-Dinner Breakdown:\n' + p3_dinner.formatted);
  assert(p3_dinner.raw.grandTotal === 4800, `4 people Breakfast-Dinner Day Picnic is ₹4,800 (got ₹${p3_dinner.raw.grandTotal})`);

  const p3_tea = calculatePricing('2026-08-11', null, 4, [], 'picnic', { mealOption: 'breakfast_tea' });
  console.log('Breakfast-Tea Breakdown:\n' + p3_tea.formatted);
  assert(p3_tea.raw.grandTotal === 4000, `4 people Breakfast-Tea Day Picnic is ₹4,000 (got ₹${p3_tea.raw.grandTotal})`);

  // ----------------------------------------------------
  // TEST CASE 4: Multi-Room Couple Pricing
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('TEST CASE 4: 4 adults, 2 couple rooms, 1 Weekend night (Sat 8 Aug)');
  console.log('----------------------------------------------------');
  const p4 = calculatePricing('2026-08-08', '2026-08-09', 4, [], 'couple');
  console.log('Multi-Room Couple Breakdown:\n' + p4.formatted);
  assert(p4.raw.grandTotal === 13000, `4 adults in 2 couple rooms on weekend is ₹13,000 (got ₹${p4.raw.grandTotal})`);
  assert(p4.raw.coupleCount === 2, `Couple room count is 2 (got ${p4.raw.coupleCount})`);

  console.log('\n====================================================');
  console.log(`   PRICING FIXES SUITE SUMMARY: ${passed} / ${total} PASSED`);
  console.log('====================================================');
}

runPricingFixesSuite();
