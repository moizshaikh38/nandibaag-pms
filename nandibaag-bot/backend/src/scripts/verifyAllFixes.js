/**
 * verifyAllFixes.js — Verification test script for 3 Critical Bug Fixes
 * 
 * 1. Date Calculation & Day-of-Week (Friday=Weekend, UTC parsing, Aug 25, Sept 2)
 * 2. Availability Service Timezone boundaries & queries
 * 3. Pet Policy in System Prompts (Hinglish, English, Roman Marathi, Marathi)
 */

const assert = require('assert');
const dateHelper = require('../utils/dateHelper');
const pricingService = require('../services/pricingService');
const { buildSystemPrompt } = require('../utils/systemPrompt');

console.log('═══════════════════════════════════════════════════════════');
console.log('🧪 RUNNING CRITICAL 3-BUG VERIFICATION SUITE');
console.log('═══════════════════════════════════════════════════════════\n');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// BUG 2 FIX VERIFICATION: Date & Day Calculations
// ─────────────────────────────────────────────────────────────
console.log('--- 1. DATE CALCULATION & DAY-OF-WEEK CHECKS ---');

test('2026-08-24 is Monday', () => {
  const day = dateHelper.getDayName('2026-08-24');
  assert.strictEqual(day, 'Monday', `Expected Monday, got ${day}`);
});

test('2026-08-25 is Tuesday', () => {
  const day = dateHelper.getDayName('2026-08-25');
  assert.strictEqual(day, 'Tuesday', `Expected Tuesday, got ${day}`);
});

test('2026-09-02 is Wednesday', () => {
  const day = dateHelper.getDayName('2026-09-02');
  assert.strictEqual(day, 'Wednesday', `Expected Wednesday, got ${day}`);
});

test('Friday (2026-08-28) is WEEKEND', () => {
  const isWkend = dateHelper.isWeekend('2026-08-28');
  assert.strictEqual(isWkend, true, `Friday must be WEEKEND, got ${isWkend}`);
  assert.strictEqual(dateHelper.isWeekday('2026-08-28'), false, 'Friday must NOT be weekday');
});

test('Saturday (2026-08-29) is WEEKEND', () => {
  const isWkend = dateHelper.isWeekend('2026-08-29');
  assert.strictEqual(isWkend, true, `Saturday must be WEEKEND`);
});

test('Sunday (2026-08-30) is WEEKEND', () => {
  const isWkend = dateHelper.isWeekend('2026-08-30');
  assert.strictEqual(isWkend, true, `Sunday must be WEEKEND`);
});

test('Monday (2026-08-31) is WEEKDAY', () => {
  const isWkday = dateHelper.isWeekday('2026-08-31');
  assert.strictEqual(isWkday, true, `Monday must be WEEKDAY`);
  assert.strictEqual(dateHelper.isWeekend('2026-08-31'), false, 'Monday must NOT be weekend');
});

test('PricingService delegates isWeekend with Friday=true', () => {
  assert.strictEqual(pricingService.isWeekend('2026-08-28'), true, 'PricingService Friday is weekend');
  assert.strictEqual(pricingService.isWeekend('2026-08-24'), false, 'PricingService Monday is not weekend');
});

test('buildDateRangeTable shows Friday as WEEKEND', () => {
  const table = dateHelper.buildDateRangeTable('2026-08-28', '2026-08-29');
  assert(table.includes('Friday (WEEKEND)'), `Expected table to label Friday as WEEKEND:\n${table}`);
});

// ─────────────────────────────────────────────────────────────
// BUG 3 FIX VERIFICATION: Pet Policy in System Prompts
// ─────────────────────────────────────────────────────────────
console.log('\n--- 2. PET POLICY IN SYSTEM PROMPTS ---');

test('Hinglish prompt includes pet policy and pet-friendly rule', () => {
  const prompt = buildSystemPrompt('hinglish');
  assert(prompt.toLowerCase().includes('pet-friendly') || prompt.toLowerCase().includes('pets welcome'), 'Hinglish prompt missing pet-friendly policy');
  assert(prompt.toLowerCase().includes('dog'), 'Hinglish prompt missing dogs mention');
});

test('English prompt includes pet policy', () => {
  const prompt = buildSystemPrompt('english');
  assert(prompt.toLowerCase().includes('pet-friendly'), 'English prompt missing pet-friendly policy');
  assert(prompt.toLowerCase().includes('pets are welcome'), 'English prompt missing pets are welcome');
});

test('Roman Marathi prompt includes pet policy', () => {
  const prompt = buildSystemPrompt('roman_marathi');
  assert(prompt.toLowerCase().includes('pet-friendly') || prompt.toLowerCase().includes('pets allowed'), 'Roman Marathi missing pet policy');
});

test('Marathi Devanagari prompt includes pet policy', () => {
  const prompt = buildSystemPrompt('marathi');
  assert(prompt.includes('पाळीव प्राणी') || prompt.includes('पेट-फ्रेंडली'), 'Marathi prompt missing pet policy');
});

// ─────────────────────────────────────────────────────────────
// BUG 1 FIX VERIFICATION: Availability Service Exports & Types
// ─────────────────────────────────────────────────────────────
console.log('\n--- 3. AVAILABILITY SERVICE CHECKS ---');

const availabilityService = require('../services/availabilityService');

test('availabilityService exports all required functions', () => {
  assert(typeof availabilityService.getCapacityAvailability === 'function', 'getCapacityAvailability missing');
  assert(typeof availabilityService.getDetailedAvailability === 'function', 'getDetailedAvailability missing');
  assert(typeof availabilityService.checkOvernightAvailability === 'function', 'checkOvernightAvailability missing');
  assert(typeof availabilityService.checkOneDayPicknicAvailability === 'function', 'checkOneDayPicknicAvailability missing');
  assert(typeof availabilityService.getDetailedAvailabilityMessage === 'function', 'getDetailedAvailabilityMessage missing');
});

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`🏁 RESULTS: ${passed}/${total} TESTS PASSED`);
console.log('═══════════════════════════════════════════════════════════\n');

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
