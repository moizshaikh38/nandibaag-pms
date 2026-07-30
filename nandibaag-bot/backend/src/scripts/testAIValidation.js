/**
 * AI Validation Test Script
 * 
 * This script tests the AI validation rules to identify why valid responses
 * might be getting rejected.
 */

const { isReplyValid } = require('../services/aiService');

console.log('\n╔════════════════════════════════════════╗');
console.log('║  AI VALIDATION TEST                     ║');
console.log('╚════════════════════════════════════════╝\n');

// Test cases that should be valid
const validTestCases = [
  'Namaste! Welcome to Nandibaag Resort. Are you planning for a Couple Stay, Family Group Stay, or Day Picnic?',
  'Available for your dates! Rates: Couple ₹5,000 (weekday), Group ₹2,000/person. Contact: 9257657665',
  'Photos available at: https://nandibaag.com/rooms 📷',
  'Location: Karjat, Maharashtra. Maps: https://maps.app.goo.gl/h6PB4y4G4oSWyFxdA',
  'Sorry, rooms are full for these dates. Please try different dates.',
  'Okay, let me check availability for you.',
  'Sure! I can help you with booking.',
  'Yes, we have availability.',
  'Please share your check-in date and total guests.',
  'आपचे स्वागत आहे! कपल स्टे, फॅमिली स्टे की वन डे पिकनिक — कोणतं बुकिंग हवं आहे?',
  'हो जी, उपलब्ध आहे!',
  'कृपया तारखा सांगा.'
];

// Test cases that should be invalid
const invalidTestCases = [
  'Booking is confirmed!', // Unauthorized confirmation
  'Room number 101 is available.', // Room number leak
  'Call 9876543210 for booking.', // Unauthorized phone number
  ' kripya', // Banned word
  '```code block```', // Markdown
  '<html>tag</html>', // HTML
  'a' * 2500, // Too long
  'ab' // Too short
];

console.log('TESTING VALID RESPONSES:\n');
let validPassed = 0;
let validFailed = 0;

validTestCases.forEach((test, i) => {
  const isValid = isReplyValid(test);
  
  if (isValid) {
    console.log(`✓ Test ${i + 1}: PASSED`);
    validPassed++;
  } else {
    console.log(`✗ Test ${i + 1}: FAILED`);
    console.log(`  Text: "${test.substring(0, 50)}..."`);
    validFailed++;
  }
});

console.log(`\nValid Tests: ${validPassed}/${validTestCases.length} passed`);

console.log('\nTESTING INVALID RESPONSES:\n');
let invalidPassed = 0;
let invalidFailed = 0;

invalidTestCases.forEach((test, i) => {
  const isValid = isReplyValid(test);
  
  if (!isValid) {
    console.log(`✓ Test ${i + 1}: CORRECTLY REJECTED`);
    invalidPassed++;
  } else {
    console.log(`✗ Test ${i + 1}: INCORRECTLY ACCEPTED`);
    invalidFailed++;
  }
});

console.log(`\nInvalid Tests: ${invalidPassed}/${invalidTestCases.length} correctly rejected`);

console.log('\n╔════════════════════════════════════════╗');
console.log('║  TEST SUMMARY                          ║');
console.log('╚════════════════════════════════════════╝\n');

console.log(`Valid responses: ${validPassed}/${validTestCases.length} passed`);
console.log(`Invalid responses: ${invalidPassed}/${invalidTestCases.length} correctly rejected`);

if (validFailed > 0) {
  console.log(`\n⚠️  WARNING: ${validFailed} valid responses are being rejected!`);
  console.log('This is likely why users are not getting AI replies.');
}

if (invalidFailed > 0) {
  console.log(`\n⚠️  WARNING: ${invalidFailed} invalid responses are being accepted!`);
}

process.exit(validFailed > 0 ? 1 : 0);