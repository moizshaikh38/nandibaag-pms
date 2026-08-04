const { calculatePricing } = require('../services/pricingService');
const { extractBookingDetails } = require('../services/messageHandler');

function runPricingTests() {
  console.log('====================================================');
  console.log('RUNNING PRICING FIX TEST SUITE');
  console.log('====================================================\n');

  // Test dates: Thursday Aug 6, 2026 and Friday Aug 7, 2026
  const thuDate = '2026-08-06'; // Thursday (Weekday)
  const friDate = '2026-08-07'; // Friday (Weekend)
  const satDate = '2026-08-08'; // Saturday (Weekend)

  // TEST 1: 2 adults + 2 kids (age 5) - Thursday to Friday (2 nights: Thu & Fri)
  console.log('--- TEST 1: 2 adults + 2 kids (age 5) - Thursday to Friday (Thu & Fri nights) ---');
  const text1 = "2 adults + 2 kids (age 5)";
  const extracted1 = extractBookingDetails(text1);
  console.log('Extracted 1:', JSON.stringify(extracted1));
  const res1 = calculatePricing(thuDate, satDate, extracted1.adults, extracted1.kids, 'couple');
  console.log('Result 1 Grand Total:', res1.raw.grandTotal);
  console.log(res1.formatted);
  console.log('\n----------------------------------------------------\n');

  // TEST 2: 2 adults + 2 kids (age 6) - Thursday to Friday
  console.log('--- TEST 2: 2 adults + 2 kids (age 6) - Thursday to Friday ---');
  const text2 = "2 adults + 2 kids (age 6)";
  const extracted2 = extractBookingDetails(text2);
  console.log('Extracted 2:', JSON.stringify(extracted2));
  // 1 night Thu + 1 night Fri room rates + 1 night kids (2x1000) = 5000 + 6500 + 2000 = 13500
  // Or 2 nights total:
  const res2 = calculatePricing(thuDate, satDate, extracted2.adults, extracted2.kids, 'couple');
  console.log('Result 2 Grand Total (2 nights):', res2.raw.grandTotal);
  console.log(res2.formatted);
  console.log('\n----------------------------------------------------\n');

  // TEST 3: 4 adults + 1 kid (age 5) - 1 night weekday
  console.log('--- TEST 3: 4 adults + 1 kid (age 5) - 1 night weekday ---');
  const text3 = "4 adults + 1 kid (age 5)";
  const extracted3 = extractBookingDetails(text3);
  console.log('Extracted 3:', JSON.stringify(extracted3));
  const res3 = calculatePricing(thuDate, friDate, extracted3.adults, extracted3.kids, 'couple');
  console.log('Result 3 Grand Total:', res3.raw.grandTotal);
  console.log(res3.formatted);
  console.log('\n----------------------------------------------------\n');

  // TEST 4: 2 adults + 1 kid (age 12) - 1 night weekday
  console.log('--- TEST 4: 2 adults + 1 kid (age 12) - 1 night weekday ---');
  const text4 = "2 adults + 1 kid (age 12)";
  const extracted4 = extractBookingDetails(text4);
  console.log('Extracted 4:', JSON.stringify(extracted4));
  const res4 = calculatePricing(thuDate, friDate, extracted4.adults, extracted4.kids, 'couple');
  console.log('Result 4 Grand Total:', res4.raw.grandTotal);
  console.log(res4.formatted);
  console.log('\n----------------------------------------------------');
}

runPricingTests();
