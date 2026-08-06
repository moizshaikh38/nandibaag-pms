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
  // TEST CASE: 13-15 Aug, 4 adults (2 couples), COUPLE STAY
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('TEST CASE: 13-15 Aug, 4 adults (2 couples), COUPLE STAY');
  console.log('----------------------------------------------------');
  const p13_15 = calculatePricing('2026-08-13', '2026-08-15', 4, [], 'couple');
  console.log('Calculated Breakdown:\n' + p13_15.formatted);
  assert(p13_15.raw.grandTotal === 24000, `13-15 Aug (Thu Wkday ₹11k + Fri Wknd ₹13k) 2 couples pricing is ₹24,000 (got ₹${p13_15.raw.grandTotal})`);
  assert(p13_15.formatted.includes('✅ BOOKING QUOTE / SUMMARY'), 'Output template contains clean header');
  assert(p13_15.formatted.includes('Call: 9257657665'), 'Output template contains contact phone');

  // ----------------------------------------------------
  // TEST CASE: 11-13 Aug, 4 adults, GROUP (2 Weekday nights)
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('TEST CASE: 11-13 Aug, 4 adults, GROUP (2 Weekday nights)');
  console.log('----------------------------------------------------');
  const p1 = calculatePricing('2026-08-11', '2026-08-13', 4, [], 'group');
  console.log('Calculated Breakdown:\n' + p1.formatted);
  assert(p1.raw.grandTotal === 16000, `11-13 Aug (Tue-Wed) 4 adults group pricing is ₹16,000 (got ₹${p1.raw.grandTotal})`);

  // ----------------------------------------------------
  // TEST CASE: Day Picnic (4 people, Weekday 11 Aug)
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('TEST CASE: Day Picnic, 4 people (Weekday)');
  console.log('----------------------------------------------------');
  const p3_dinner = calculatePricing('2026-08-11', null, 4, [], 'picnic', { mealOption: 'breakfast_dinner' });
  console.log('Breakfast-Dinner Breakdown:\n' + p3_dinner.formatted);
  assert(p3_dinner.raw.grandTotal === 5000, `4 people Weekday Breakfast-Dinner Day Picnic is ₹5,000 (got ₹${p3_dinner.raw.grandTotal})`);

  const p3_tea = calculatePricing('2026-08-11', null, 4, [], 'picnic', { mealOption: 'breakfast_tea' });
  console.log('Breakfast-Tea Breakdown:\n' + p3_tea.formatted);
  assert(p3_tea.raw.grandTotal === 4000, `4 people Weekday Breakfast-Tea Day Picnic is ₹4,000 (got ₹${p3_tea.raw.grandTotal})`);

  console.log('\n====================================================');
  console.log(`   PRICING FIXES SUITE SUMMARY: ${passed} / ${total} PASSED`);
  console.log('====================================================');
}

runPricingFixesSuite();
