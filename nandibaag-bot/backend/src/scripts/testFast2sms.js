/**
 * Test script for the Fast2SMS channel.
 *
 * Usage:
 *   npm run test-fast2sms
 *
 * Sends a hardcoded test message to a test number (set TEST_FAST2SMS_NUMBER
 * or falls back to RESORT_CONTACT_1). Requires FAST2SMS_API_KEY in .env.
 */

require('dotenv').config();

const TEST_TEXT = 'Test message from Nandibaag bot - Fast2SMS integration check';

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('   Fast2SMS Channel Test');
  console.log('══════════════════════════════════════════════════\n');

  const { fast2smsApiKey } = require('../config/env');
  if (!fast2smsApiKey) {
    console.log('❌ FAIL: FAST2SMS_API_KEY is not set.');
    console.log('   Add FAST2SMS_API_KEY to backend/.env (see .env.example) and retry.');
    process.exit(1);
  }

  console.log('✅ FAST2SMS_API_KEY is set.');
  console.log('Connecting to MongoDB...');
  const connectDB = require('../config/db');
  await connectDB();
  console.log('✅ MongoDB connected.\n');

  const fast2smsService = require('../services/fast2smsService');
  const initResult = fast2smsService.initialize();
  console.log(`ℹ️  Init result: ${JSON.stringify(initResult)}`);

  if (fast2smsService.getStatus() !== 'connected') {
    console.log('❌ FAIL: Fast2SMS service is not connected.');
    process.exit(1);
  }

  const testNumber = process.env.TEST_FAST2SMS_NUMBER || process.env.RESORT_CONTACT_1 || '9257657665';
  console.log(`\n📤 Sending test message to ${testNumber}: "${TEST_TEXT}"\n`);

  const success = await fast2smsService.sendMessage(testNumber, TEST_TEXT);

  console.log('\n══════════════════════════════════════════════════');
  if (success) {
    console.log('✅ PASS: Test message sent via Fast2SMS.');
    process.exit(0);
  } else {
    console.log('❌ FAIL: Test message could not be sent via Fast2SMS.');
    console.log('   Check the Fast2SMS response logs above (API key validity,');
    console.log('   phone_number_id / sender numbers, recipient opt-in, etc.).');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ FAIL: Test crashed:', err.message);
  process.exit(1);
});
