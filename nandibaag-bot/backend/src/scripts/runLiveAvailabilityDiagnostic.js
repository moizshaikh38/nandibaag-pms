const { extractBookingDetails } = require('../services/messageHandler');
const { calculatePricing } = require('../services/pricingService');

function testFixes() {
  console.log('====================================================');
  console.log('   VERIFYING FIX 1, FIX 2, AND FIX 3');
  console.log('====================================================\n');

  // TEST 1: Extract "5 Aug for 1 day, 2 adults"
  console.log('--- TEST 1: Extract "5 Aug for 1 day, 2 adults" ---');
  const msg1 = "5 Aug for 1 day, 2 adults";
  const ext1 = extractBookingDetails(msg1);
  console.log('Extracted 1:', JSON.stringify(ext1, null, 2));

  console.log('\n--- VERIFYING FIX 3 (Nights calculation) ---');
  console.log('Check-in Date:', ext1.date);
  console.log('Nights:', ext1.nights);
  console.log('Adults:', ext1.adults);
  console.log('Kids Specified:', ext1.kidsSpecified || false);

  if (ext1.nights === 1 && ext1.adults === 2) {
    console.log('✅ PASS: "5 Aug for 1 day, 2 adults" correctly extracted as 1 night, 2 adults (1 couple)');
  } else {
    console.log('❌ FAIL: Nights or adults calculation incorrect');
  }

  // TEST 2: Price Calculation for 1 night weekend (e.g. Aug 7 2026 - Friday)
  console.log('\n--- VERIFYING FIX 1 (1 couple × ₹6,500 = ₹6,500, NOT ₹13,000) ---');
  const friDate = '2026-08-07';
  const satDate = '2026-08-08';
  const priceRes = calculatePricing(friDate, satDate, ext1.adults, [], 'couple');
  console.log('1 Night Weekend Grand Total:', priceRes.raw.grandTotal);
  console.log('Formatted Breakdown:\n' + priceRes.formatted);

  if (priceRes.raw.grandTotal === 6500) {
    console.log('✅ PASS: 1 couple for 1 weekend night = ₹6,500 (NOT ₹13,000)');
  } else {
    console.log(`❌ FAIL: Expected ₹6,500, got ₹${priceRes.raw.grandTotal}`);
  }

  // TEST 3: "No kids" response
  console.log('\n--- TEST 3: Extract "No kids" ---');
  const msg2 = "No kids";
  const ext2 = extractBookingDetails(msg2);
  console.log('Extracted 2:', JSON.stringify(ext2, null, 2));
  if (ext2.kidsSpecified === true && ext2.kids.length === 0) {
    console.log('✅ PASS: "No kids" correctly sets kidsSpecified = true and kids = []');
  } else {
    console.log('❌ FAIL: "No kids" flag not set correctly');
  }

  console.log('\n====================================================');
}

testFixes();
