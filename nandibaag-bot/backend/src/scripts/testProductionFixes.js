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

  // ── TEST 1: Friday is Weekday, Weekend is Sat+Sun ──
  const fri = new Date('2026-08-01T00:00:00'); // Fri (Wait: 2026-08-01 is Saturday! Let's get real dates)
  // In 2026:
  // Aug 1 2026 = Saturday (6)
  // Aug 2 2026 = Sunday (0)
  // Aug 7 2026 = Friday (5)
  // Aug 8 2026 = Saturday (6)
  const friDate = new Date(2026, 7, 7); // Friday Aug 7 2026 (day 5)
  const satDate = new Date(2026, 7, 8); // Saturday Aug 8 2026 (day 6)
  const sunDate = new Date(2026, 7, 9); // Sunday Aug 9 2026 (day 0)

  assert(!isWeekend(friDate), 'TEST 1a: Friday (Aug 7) is NOT a weekend', `isWeekend(Fri) = ${isWeekend(friDate)}`);
  assert(isWeekend(satDate), 'TEST 1b: Saturday (Aug 8) IS a weekend', `isWeekend(Sat) = ${isWeekend(satDate)}`);
  assert(isWeekend(sunDate), 'TEST 1c: Sunday (Aug 9) IS a weekend', `isWeekend(Sun) = ${isWeekend(sunDate)}`);

  // ── TEST 2: Pricing Calculation (1 Friday + 1 Saturday + 1 Sunday = 1 Weekday + 2 Weekend nights) ──
  const pricing = calculatePricing('2026-08-07', '2026-08-10', 5); // 5 guests, Fri Aug 7 to Mon Aug 10 (3 nights)
  assert(pricing.raw.weekdayNights === 1, 'TEST 2a: Fri-Mon pricing has 1 weekday night', `weekdayNights = ${pricing.raw.weekdayNights}`);
  assert(pricing.raw.weekendNights === 2, 'TEST 2b: Fri-Mon pricing has 2 weekend nights', `weekendNights = ${pricing.raw.weekendNights}`);
  assert(pricing.raw.weekdayTotal === 10000, 'TEST 2c: Weekday total = 1 night * 5 guests * 2000 = 10,000', `weekdayTotal = ${pricing.raw.weekdayTotal}`);
  assert(pricing.raw.weekendTotal === 24000, 'TEST 2d: Weekend total = 2 nights * 5 guests * 2400 = 24,000', `weekendTotal = ${pricing.raw.weekendTotal}`);
  assert(pricing.raw.grandTotal === 34000, 'TEST 2e: Grand total = 34,000', `grandTotal = ${pricing.raw.grandTotal}`);
  assert(pricing.formatted.includes('BOOKING SUMMARY'), 'TEST 2f: Formatted string contains BOOKING SUMMARY', pricing.formatted);

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
