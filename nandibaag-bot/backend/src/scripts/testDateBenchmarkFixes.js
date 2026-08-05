const { extractBookingDetails } = require('../services/messageHandler');
const { calculatePricing, isWeekend, getDayName } = require('../services/pricingService');

function runBenchmarkTests() {
  console.log('====================================================');
  console.log('   RUNNING BENCHMARK DATE & DAY OF WEEK TEST SUITE  ');
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

  // TEST CASE 1: Tomorrow
  console.log('----------------------------------------------------');
  console.log('TEST CASE 1: "Tomorrow couple stay 1 day"');
  console.log('----------------------------------------------------');
  const ext1 = extractBookingDetails("Tomorrow couple stay 1 day");
  console.log('Extracted:', ext1);
  assert(ext1.date === '2026-08-06', `Check-in date is 2026-08-06 (Thu), got ${ext1.date}`);
  assert(getDayName(ext1.date) === 'Thursday', `Day of week is Thursday, got ${getDayName(ext1.date)}`);
  assert(isWeekend(ext1.date) === false, `2026-08-06 is WEEKDAY`);
  
  const price1 = calculatePricing(ext1.date, null, ext1.adults || 2, [], 'couple');
  console.log('Price Total:', price1.raw.grandTotal);
  assert(price1.raw.grandTotal === 5000, `Pricing for 1 weekday couple night is ₹5,000, got ₹${price1.raw.grandTotal}`);

  // TEST CASE 2: Explicit date "15 aug couple stay 1 day"
  console.log('\n----------------------------------------------------');
  console.log('TEST CASE 2: "15 aug couple stay 1 day"');
  console.log('----------------------------------------------------');
  const ext2 = extractBookingDetails("15 aug couple stay 1 day");
  console.log('Extracted:', ext2);
  assert(ext2.date === '2026-08-15', `Check-in date is 2026-08-15 (Sat), got ${ext2.date}`);
  assert(getDayName(ext2.date) === 'Saturday', `Day of week is Saturday, got ${getDayName(ext2.date)}`);
  assert(isWeekend(ext2.date) === true, `2026-08-15 is WEEKEND`);

  const price2 = calculatePricing(ext2.date, null, ext2.adults || 2, [], 'couple');
  console.log('Price Total:', price2.raw.grandTotal);
  assert(price2.raw.grandTotal === 6500, `Pricing for 1 weekend couple night is ₹6,500, got ₹${price2.raw.grandTotal}`);

  // TEST CASE 3: 2-night booking "6-8 aug couple" (Thu & Fri)
  console.log('\n----------------------------------------------------');
  console.log('TEST CASE 3: "6-8 aug couple" (Thu 6th & Fri 7th = 2 nights)');
  console.log('----------------------------------------------------');
  const ext3 = extractBookingDetails("6-8 aug couple");
  console.log('Extracted:', ext3);
  assert(ext3.date === '2026-08-06', `Check-in date is 2026-08-06 (Thu), got ${ext3.date}`);
  assert(ext3.nights === 2, `Nights is 2, got ${ext3.nights}`);

  const price3 = calculatePricing('2026-08-06', '2026-08-08', 2, [], 'couple');
  console.log('Price Total:', price3.raw.grandTotal);
  console.log('Formatted Breakdown:\n' + price3.formatted);
  assert(price3.raw.grandTotal === 11500, `Pricing for Thu (₹5,000) + Fri (₹6,500) is ₹11,500, got ₹${price3.raw.grandTotal}`);

  // TEST CASE 4: Next week
  console.log('\n----------------------------------------------------');
  console.log('TEST CASE 4: "Next week couple 1 day"');
  console.log('----------------------------------------------------');
  const ext4 = extractBookingDetails("Next week couple 1 day");
  console.log('Extracted:', ext4);
  assert(ext4.date === '2026-08-12', `Check-in date is 2026-08-12 (Wed), got ${ext4.date}`);
  assert(getDayName(ext4.date) === 'Wednesday', `Day of week is Wednesday, got ${getDayName(ext4.date)}`);
  assert(isWeekend(ext4.date) === false, `2026-08-12 is WEEKDAY`);

  const price4 = calculatePricing(ext4.date, null, ext4.adults || 2, [], 'couple');
  console.log('Price Total:', price4.raw.grandTotal);
  assert(price4.raw.grandTotal === 5000, `Pricing for 1 weekday couple night is ₹5,000, got ₹${price4.raw.grandTotal}`);

  console.log('\n====================================================');
  console.log(`   BENCHMARK TEST SUMMARY: ${passed} / ${total} PASSED`);
  console.log('====================================================');
}

runBenchmarkTests();
