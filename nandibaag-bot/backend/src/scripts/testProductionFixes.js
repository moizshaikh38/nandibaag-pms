const { isWeekend, calculatePricing } = require('../services/pricingService');
const { detectLanguage, isReplyValid } = require('../services/aiService');
const { buildSystemPrompt } = require('../utils/systemPrompt');

function runTests() {
  console.log('====================================================');
  console.log('   RUNNING PRODUCTION FIXES & COMPLIANCE SUITE      ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, name, details = '') {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      if (details) console.log(`   └─ ${details}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name}`);
      if (details) console.error(`   └─ ${details}`);
    }
  }

  // ── TEST 1: Friday, Saturday, Sunday ARE Weekend ──
  const friDate = new Date(2026, 7, 7); // Friday Aug 7 2026 (day 5)
  const satDate = new Date(2026, 7, 8); // Saturday Aug 8 2026 (day 6)
  const sunDate = new Date(2026, 7, 9); // Sunday Aug 9 2026 (day 0)
  const thuDate = new Date(2026, 7, 6); // Thursday Aug 6 2026 (day 4)

  assert(isWeekend(friDate), 'TEST 1a: Friday (Aug 7) IS a weekend', `isWeekend(Fri) = ${isWeekend(friDate)}`);
  assert(isWeekend(satDate), 'TEST 1b: Saturday (Aug 8) IS a weekend', `isWeekend(Sat) = ${isWeekend(satDate)}`);
  assert(isWeekend(sunDate), 'TEST 1c: Sunday (Aug 9) IS a weekend', `isWeekend(Sun) = ${isWeekend(sunDate)}`);
  assert(!isWeekend(thuDate), 'TEST 1d: Thursday (Aug 6) is NOT a weekend', `isWeekend(Thu) = ${isWeekend(thuDate)}`);

  // ── TEST 2: Group Pricing Calculation (Fri, Sat, Sun = 3 Weekend nights @ 3000/person/night for 5 guests) ──
  const pricing = calculatePricing('2026-08-07', '2026-08-10', 5); // 5 guests, Fri Aug 7 to Mon Aug 10 (3 nights)
  assert(pricing.raw.weekdayNights === 0, 'TEST 2a: Fri-Mon pricing has 0 weekday nights', `weekdayNights = ${pricing.raw.weekdayNights}`);
  assert(pricing.raw.weekendNights === 3, 'TEST 2b: Fri-Mon pricing has 3 weekend nights', `weekendNights = ${pricing.raw.weekendNights}`);
  assert(pricing.raw.weekendTotal === 45000, 'TEST 2c: Weekend total = 3 nights * 5 guests * 3000 = 45,000', `weekendTotal = ${pricing.raw.weekendTotal}`);
  assert(pricing.raw.grandTotal === 45000, 'TEST 2d: Grand total = 45,000', `grandTotal = ${pricing.raw.grandTotal}`);
  assert(pricing.formatted.includes('BOOKING SUMMARY'), 'TEST 2e: Formatted string contains BOOKING SUMMARY', pricing.formatted);

  // ── TEST 3: Language Detection ──
  assert(detectLanguage('room available aahe ka?') === 'roman_marathi', 'TEST 3a: "room available aahe ka?" -> roman_marathi');
  assert(detectLanguage('weekend la 5 janansathi booking pahije') === 'roman_marathi', 'TEST 3b: "weekend la 5 janansathi..." -> roman_marathi');
  assert(detectLanguage('रूम उपलब्ध आहे का?') === 'marathi', 'TEST 3c: "रूम उपलब्ध आहे का?" -> marathi');
  assert(detectLanguage('Weekend ka room kitne ka hai?') === 'hinglish', 'TEST 3d: "Weekend ka room kitne ka hai?" -> hinglish');
  assert(detectLanguage('What is the price for a family stay?') === 'english', 'TEST 3e: "What is the price for a family stay?" -> english');
  assert(detectLanguage('Weekend la 5 guests sathi room available aahe ka?') === 'roman_marathi', 'TEST 3f: Mixed "Weekend la 5 guests..." -> roman_marathi');

  // ── TEST 4: Booking Confirmation Safety in isReplyValid ──
  assert(!isReplyValid('Your booking is confirmed. Check-in tomorrow!'), 'TEST 4a: Rejects "Your booking is confirmed"');
  assert(!isReplyValid('Room book ho gaya, aajaoge!'), 'TEST 4b: Rejects "Room book ho gaya"');
  assert(!isReplyValid('Booking zali aahe, staff room prepare karat aahet'), 'TEST 4c: Rejects "Booking zali aahe"');
  assert(!isReplyValid('Cottage 603 booked'), 'TEST 4d: Rejects room number leak "Cottage 603"');

  // ── TEST 5: System Prompt Generation ──
  const promptRoman = buildSystemPrompt('roman_marathi');
  assert(promptRoman.includes('ROMAN MARATHI'), 'TEST 5a: System prompt builds Roman Marathi instructions');
  assert(promptRoman.includes('9257657665'), 'TEST 5b: System prompt contains primary phone number');

  console.log('\n====================================================');
  console.log(`   TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('====================================================');
}

runTests();
