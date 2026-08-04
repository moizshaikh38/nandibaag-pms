const { extractBookingDetails } = require('../services/messageHandler');
const { calculatePricing } = require('../services/pricingService');
const { buildSystemPrompt } = require('../utils/systemPrompt');

function runLocalDiagnostic() {
  console.log('====================================================');
  console.log('   RUNNING COMPREHENSIVE AVAILABILITY TRACE DIAGNOSTIC');
  console.log('====================================================\n');

  // STEP 1: TEST EXTRACTOR
  console.log('----------------------------------------------------');
  console.log('STEP 1: TRACING EXTRACTOR ON: "Hi, I want to book 4-5 Aug, 2 adults"');
  console.log('----------------------------------------------------');
  const msgText = "Hi, I want to book 4-5 Aug, 2 adults";
  const extracted = extractBookingDetails(msgText);
  console.log('Extracted Details:', JSON.stringify(extracted, null, 2));

  const checkInDate = new Date(extracted.date);
  const nights = extracted.nights || 1;
  const checkOutDate = new Date(checkInDate);
  checkOutDate.setDate(checkOutDate.getDate() + nights);
  const guestCount = extracted.adults + (extracted.kids?.length || 0);

  console.log('\n[Extracted Check-in Date]:', checkInDate.toISOString().split('T')[0]);
  console.log('[Extracted Check-out Date]:', checkOutDate.toISOString().split('T')[0]);
  console.log('[Extracted Guest Count]:', guestCount);

  // STEP 2: SIMULATE getCapacityAvailability
  console.log('\n----------------------------------------------------');
  console.log('STEP 2: SIMULATING getCapacityAvailability()');
  console.log('----------------------------------------------------');

  // Case A: When 61 rooms available
  const resultAvailable = {
    available: true,
    availableCount: 61,
    breakdown: { capacity4: { capacity: 4, available: 55 }, capacity2: { capacity: 2, available: 6 } }
  };
  console.log('[Availability:DEBUG] Input params:', {
    checkInDate: checkInDate.toISOString().split('T')[0],
    checkOutDate: checkOutDate.toISOString().split('T')[0],
    guestCount
  });
  console.log('[Availability:DEBUG] Result (Available Case):', resultAvailable);

  // Case B: When fully booked (0 rooms)
  const resultFull = {
    available: false,
    availableCount: 0,
    breakdown: {}
  };
  console.log('[Availability:DEBUG] Result (Fully Booked Case):', resultFull);

  // STEP 3: MESSAGEHANDLER SYSTEM NOTE INJECTION
  console.log('\n----------------------------------------------------');
  console.log('STEP 3: TRACING MESSAGEHANDLER SYSTEM NOTE INJECTION');
  console.log('----------------------------------------------------');

  // If available:
  console.log('[MessageHandler:AVAILABILITY] ✅ ROOMS AVAILABLE');
  console.log('[MessageHandler:AVAILABILITY] Available count:', resultAvailable.availableCount);
  const pricingResult = calculatePricing(checkInDate, checkOutDate, extracted.adults || 2, extracted.kids || [], 'couple');
  const availableNote = `[SYSTEM NOTE: Availability confirmed.\nPRICING BREAKDOWN:\n${pricingResult.formatted}]`;
  console.log('Injected System Note (Available):');
  console.log(availableNote);

  // If full:
  console.log('\n[MessageHandler:AVAILABILITY] ❌ NO ROOMS AVAILABLE');
  console.log('[MessageHandler:AVAILABILITY] Result:', resultFull);
  const fullNote = '[SYSTEM NOTE: No availability for these dates. Ask customer to try another date.]';
  console.log('Injected System Note (Fully Booked):');
  console.log(fullNote);

  // STEP 4: AISERVICE INJECTION & SYSTEM PROMPT CHECK
  console.log('\n----------------------------------------------------');
  console.log('STEP 4: AISERVICE SYSTEM PROMPT & NOTES INJECTION');
  console.log('----------------------------------------------------');

  const basePrompt = buildSystemPrompt('hinglish');
  const finalPromptAvailable = basePrompt + '\n\n' + availableNote;
  const finalPromptFull = basePrompt + '\n\n' + fullNote;

  console.log('[AIService:DEBUG] System notes injected (Available):', {
    hasAvailabilityNote: finalPromptAvailable.includes('[SYSTEM NOTE'),
    noteContent: availableNote.slice(0, 100)
  });

  console.log('[AIService:DEBUG] System notes injected (Fully Booked):', {
    hasAvailabilityNote: finalPromptFull.includes('[SYSTEM NOTE'),
    noteContent: fullNote.slice(0, 100)
  });

  // STEP 5: BOT ACTUAL REPLY FORMAT
  console.log('\n----------------------------------------------------');
  console.log('STEP 5: BOT ACTUAL REPLY FORMAT (EXPECTED)');
  console.log('----------------------------------------------------');

  console.log('\n[BOT REPLY - SCENARIO A: AVAILABLE]:');
  console.log('----------------------------------------------------');
  console.log(`Ji, ye dates (4-5 Aug) available hain! 👍\n\n${pricingResult.formatted}`);
  console.log('----------------------------------------------------');

  console.log('\n[BOT REPLY - SCENARIO B: FULLY BOOKED]:');
  console.log('----------------------------------------------------');
  console.log('Sorry, 4-5 Aug ke liye sabhi rooms booked hain! 😔 Kya aap kisi aur date (jaise 6-7 Aug) ke liye check karna chahenge?');
  console.log('----------------------------------------------------');
}

runLocalDiagnostic();
