const {
  getCheckInCheckOutTimes,
  formatBookingMessageForCustomer,
  formatBookingConfirmationMessage
} = require('../src/utils/bookingMessageFormatter');
const { buildSystemPrompt } = require('../src/utils/systemPrompt');
const { SYSTEM_PROMPT } = require('../src/services/messageHandler');

function runTests() {
  console.log('\n═════════════════════════════════════════════════════════');
  console.log('🧪 TESTING TIMINGS AND CONFIRMATION MESSAGE FIXES');
  console.log('═════════════════════════════════════════════════════════\n');

  // Test 1: Overnight timings
  console.log('1️⃣ Testing Overnight Stay Timings:');
  const overnightTimes = getCheckInCheckOutTimes('couple', null);
  console.log('   Couple Check-in:', overnightTimes.checkInTime);
  console.log('   Couple Check-out:', overnightTimes.checkOutTime);
  if (overnightTimes.checkInTime === '12:00 PM' && overnightTimes.checkOutTime === '10:30 AM') {
    console.log('   ✅ PASS: Overnight timings match 12:00 PM - 10:30 AM');
  } else {
    throw new Error('❌ FAIL: Overnight timings incorrect');
  }

  // Test 2: One-Day Picnic B->T
  console.log('\n2️⃣ Testing Day Picnic (Breakfast-to-Tea) Timings:');
  const picnicBtTimes = getCheckInCheckOutTimes('one-day-picnic', 'breakfast-to-tea');
  console.log('   B->T Check-in:', picnicBtTimes.checkInTime);
  console.log('   B->T Check-out:', picnicBtTimes.checkOutTime);
  if (picnicBtTimes.checkInTime === '9:00 AM' && picnicBtTimes.checkOutTime === '6:30 PM') {
    console.log('   ✅ PASS: Day Picnic B->T timings match 9:00 AM - 6:30 PM');
  } else {
    throw new Error('❌ FAIL: Day Picnic B->T timings incorrect');
  }

  // Test 3: One-Day Picnic B->D
  console.log('\n3️⃣ Testing Day Picnic (Breakfast-to-Dinner) Timings:');
  const picnicBdTimes = getCheckInCheckOutTimes('one-day-picnic', 'breakfast-to-dinner');
  console.log('   B->D Check-in:', picnicBdTimes.checkInTime);
  console.log('   B->D Check-out:', picnicBdTimes.checkOutTime);
  if (picnicBdTimes.checkInTime === '9:00 AM' && picnicBdTimes.checkOutTime === '9:30 PM') {
    console.log('   ✅ PASS: Day Picnic B->D timings match 9:00 AM - 9:30 PM');
  } else {
    throw new Error('❌ FAIL: Day Picnic B->D timings incorrect');
  }

  // Test 4: Format Booking Confirmation Message for Picnic
  console.log('\n4️⃣ Testing Booking Confirmation Message Formatter (Day Picnic):');
  const samplePicnicBooking = {
    customerName: 'Rahul Sharma',
    customerPhone: '9876543210',
    checkInDate: new Date('2026-08-29T09:00:00.000Z'),
    checkOutDate: new Date('2026-08-29T18:30:00.000Z'),
    guestComposition: { adults: 4, children: 0 },
    roomIds: ['P1', 'P2'],
    packageType: 'one-day-picnic',
    mealOption: 'breakfast-to-tea',
    totalAmount: 4000,
    advancePayment: 1000,
    bookedBy: 'Staff John'
  };
  const picnicMsg = formatBookingMessageForCustomer(samplePicnicBooking);
  console.log('\n' + picnicMsg + '\n');
  if (picnicMsg.includes('Check in: 9:00 AM') && picnicMsg.includes('Check out: 6:30 PM')) {
    console.log('   ✅ PASS: Picnic confirmation message contains 9:00 AM - 6:30 PM');
  } else {
    throw new Error('❌ FAIL: Picnic confirmation message missing correct timing');
  }

  // Test 5: System Prompt Validation
  console.log('\n5️⃣ Testing System Prompt Text:');
  const generatedPrompt = buildSystemPrompt('hinglish');
  if (
    generatedPrompt.includes('9:00 AM') &&
    generatedPrompt.includes('6:30 PM') &&
    generatedPrompt.includes('9:30 PM') &&
    generatedPrompt.includes('Option A: Breakfast → Tea (B→T)') &&
    generatedPrompt.includes('Option B: Breakfast → Dinner (B→D)')
  ) {
    console.log('   ✅ PASS: System prompt contains complete and accurate day picnic timings');
  } else {
    throw new Error('❌ FAIL: System prompt missing picnic timings');
  }

  if (SYSTEM_PROMPT && SYSTEM_PROMPT.includes('9:00 AM - 6:30 PM')) {
    console.log('   ✅ PASS: messageHandler.js exports SYSTEM_PROMPT correctly');
  } else {
    throw new Error('❌ FAIL: messageHandler.js SYSTEM_PROMPT export incorrect');
  }

  console.log('\n═════════════════════════════════════════════════════════');
  console.log('🎉 ALL TIMINGS & FORMATTER TESTS PASSED SUCCESSFULLY!');
  console.log('═════════════════════════════════════════════════════════\n');
}

runTests();
