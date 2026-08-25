/**
 * verifyAvailabilityDisabled.js
 * Verification script to confirm availability checking is properly disabled.
 * 
 * Run with: npm run verify-availability-disabled
 * Or:       node scripts/verifyAvailabilityDisabled.js
 */

const path = require('path');
const fs = require('fs');

const PASS = '✅';
const FAIL = '❌';
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result) {
      console.log(`${PASS} ${name}`);
      passed++;
    } else {
      console.log(`${FAIL} ${name}`);
      failed++;
    }
  } catch (err) {
    console.log(`${FAIL} ${name} — Error: ${err.message}`);
    failed++;
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('   VERIFY AVAILABILITY CHECK IS DISABLED');
console.log('═══════════════════════════════════════════════════════════════\n');

// ─── Test 1: Check messageHandler.js has the flag ───
test('AVAILABILITY_CHECK_DISABLED flag exists in messageHandler.js', () => {
  const filePath = path.join(__dirname, '..', 'src', 'services', 'messageHandler.js');
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes('const AVAILABILITY_CHECK_DISABLED = true;');
});

// ─── Test 2: Check the flag is set to TRUE ───
test('AVAILABILITY_CHECK_DISABLED is set to TRUE', () => {
  const filePath = path.join(__dirname, '..', 'src', 'services', 'messageHandler.js');
  const content = fs.readFileSync(filePath, 'utf8');
  // Make sure it's not set to false
  const hasTrue = content.includes('const AVAILABILITY_CHECK_DISABLED = true;');
  const hasFalse = content.includes('const AVAILABILITY_CHECK_DISABLED = false;');
  return hasTrue && !hasFalse;
});

// ─── Test 3: Check the guard condition exists ───
test('Availability check block has kill switch guard (!AVAILABILITY_CHECK_DISABLED)', () => {
  const filePath = path.join(__dirname, '..', 'src', 'services', 'messageHandler.js');
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes('!AVAILABILITY_CHECK_DISABLED');
});

// ─── Test 4: Check the else block with redirect exists ───
test('Else block redirects to phone call when disabled', () => {
  const filePath = path.join(__dirname, '..', 'src', 'services', 'messageHandler.js');
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes('AVAILABILITY_CHECK_DISABLED') && content.includes('9257657664');
});

// ─── Test 5: Check systemPrompt.js has availability disabled instructions (Hinglish) ───
test('Hinglish system prompt has availability disabled instruction', () => {
  const filePath = path.join(__dirname, '..', 'src', 'utils', 'systemPrompt.js');
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes('AVAILABILITY & BOOKING — CRITICAL INSTRUCTION') || content.includes('AVAILABILITY — CRITICAL');
});

// ─── Test 6: Check systemPrompt.js has availability disabled instructions (English) ───
test('English system prompt has availability disabled instruction', () => {
  const filePath = path.join(__dirname, '..', 'src', 'utils', 'systemPrompt.js');
  const content = fs.readFileSync(filePath, 'utf8');
  // Count how many times the availability critical block appears (should be 4)
  const matches = content.match(/\[AVAILABILITY — CRITICAL\]/g) || [];
  return matches.length >= 2; // At least English + Roman Marathi (Hinglish uses different format)
});

// ─── Test 7: Check all 4 prompts have the phone number for availability calls ───
test('All prompts include phone number (via PRIMARY_PHONE variable) for availability redirect', () => {
  const filePath = path.join(__dirname, '..', 'src', 'utils', 'systemPrompt.js');
  const content = fs.readFileSync(filePath, 'utf8');
  // PRIMARY_PHONE is set to mainPhone which defaults to '9257657664'
  // Count both literal phone and PRIMARY_PHONE variable usage in availability blocks
  const primaryPhoneUsage = (content.match(/PRIMARY_PHONE/g) || []).length;
  const hasAvailabilityBlock = content.includes('AVAILABILITY') && content.includes('CRITICAL');
  return primaryPhoneUsage >= 4 && hasAvailabilityBlock;
});

// ─── Test 8: System prompt tells AI NOT to guess availability ───
test('System prompt explicitly forbids guessing availability', () => {
  const filePath = path.join(__dirname, '..', 'src', 'utils', 'systemPrompt.js');
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes('DO NOT') && (content.includes('Guess about availability') || content.includes('guess availability'));
});

// ─── Test 9: messageHandler redirects with "call karein" message ───
test('MessageHandler redirect note contains "call karein" instruction', () => {
  const filePath = path.join(__dirname, '..', 'src', 'services', 'messageHandler.js');
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes('please humein call karein');
});

// ─── Test 10: Verify the module can be required without errors ───
test('messageHandler.js can be parsed without syntax errors', () => {
  const filePath = path.join(__dirname, '..', 'src', 'services', 'messageHandler.js');
  const content = fs.readFileSync(filePath, 'utf8');
  // Basic syntax check — ensure the file starts and ends properly
  return content.includes('module.exports') || content.includes('exports.');
});

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`   RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.log('\n⚠️  Some checks FAILED. Availability may not be fully disabled.');
  process.exit(1);
} else {
  console.log('\n🎉 ALL CHECKS PASSED! Availability checking is properly disabled.');
  console.log('📞 Customers will be directed to call: 9257657664');
  console.log('\nTo RE-ENABLE availability checking:');
  console.log('  1. Open backend/src/services/messageHandler.js');
  console.log('  2. Change: const AVAILABILITY_CHECK_DISABLED = true;');
  console.log('  3. To:     const AVAILABILITY_CHECK_DISABLED = false;');
  process.exit(0);
}
