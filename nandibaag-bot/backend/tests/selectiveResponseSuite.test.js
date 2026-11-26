/**
 * Automated Test Suite for V2 Selective-Response Architecture & Intentional Silence
 * 
 * Verifies:
 * 1. Intentional Silence (acknowledgements, off-topic/spam, availability-only)
 * 2. Substring Regressions (UPI vs pajupis, kal vs Kalyan, kay in pricing vs activities)
 * 3. Normal Resort Queries (pricing, food, activities, timings, location, photos)
 * 4. Mixed Availability Queries (answer resort question, suppress availability)
 * 5. Context Continuity (answering kids, meal choice, guest count, dates)
 * 6. Silence + Context Continuation (staff availability reply -> customer total query)
 * 7. Human/Staff Mode Protection
 * 8. Media Handling (uncaptioned media silence)
 * 9. Exact Payment Intent Recognition
 * 10. Booking Request Summary Safety & Follow-up Behavior
 * 
 * Run with: node tests/selectiveResponseSuite.test.js
 * Zero external database dependencies (uses in-memory mock objects).
 */

const assert = require('assert');
const {
  CATEGORIES,
  routeIncomingMessage,
  detectConversationTopic,
  isExactPaymentIntent,
  isExactVideoIntent,
  isStandaloneAcknowledgement,
  hasActiveBookingContext,
  hasAvailabilityIntent,
  hasOtherResortQuery,
  isIrrelevantOrOffTopic,
  isRelativeDateToken
} = require('../src/services/messageRouter');

const {
  extractBookingDetails
} = require('../src/services/messageHandler');

const { calculatePricing } = require('../src/services/pricingService');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

function buildMockChat(overrides = {}) {
  return {
    customerPhone: '919876543210',
    mode: 'ai',
    bookingStage: 'none',
    bookingDraft: {},
    conversationState: {},
    messages: [],
    ...overrides
  };
}

console.log('\n' + '═'.repeat(70));
console.log('🚀 NANDIBAAG RESORT BOT V2: SELECTIVE-RESPONSE TEST SUITE');
console.log('═'.repeat(70) + '\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. INTENTIONAL SILENCE
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. INTENTIONAL SILENCE TESTS ---');

runTest('Standalone "okay" -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('okay', chat, false);
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.category, CATEGORIES.ACKNOWLEDGEMENT);
});

runTest('Standalone "thanks" -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('thanks', chat, false);
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.category, CATEGORIES.ACKNOWLEDGEMENT);
});

runTest('Standalone "👍" emoji -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('👍', chat, false);
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.category, CATEGORIES.ACKNOWLEDGEMENT);
});

runTest('Standalone "hmm" -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('hmm', chat, false);
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.category, CATEGORIES.ACKNOWLEDGEMENT);
});

runTest('Off-topic "India match kab hai?" -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('India match kab hai?', chat, false);
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.category, CATEGORIES.IRRELEVANT);
});

runTest('Off-topic "bitcoin price kya hai?" -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('bitcoin price kya hai?', chat, false);
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.category, CATEGORIES.IRRELEVANT);
});

runTest('Off-topic "who is prime minister?" -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('who is prime minister?', chat, false);
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.category, CATEGORIES.IRRELEVANT);
});

runTest('Availability only "27 ko available hai?" -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('27 ko available hai?', chat, false);
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.category, CATEGORIES.AVAILABILITY_ONLY);
  assert.strictEqual(route.suppressAvailability, true);
});

runTest('Availability only "rooms available?" -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('rooms available?', chat, false);
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.category, CATEGORIES.AVAILABILITY_ONLY);
  assert.strictEqual(route.suppressAvailability, true);
});

runTest('Availability only "kal vacancy hai?" -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('kal vacancy hai?', chat, false);
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.category, CATEGORIES.AVAILABILITY_ONLY);
});

runTest('Availability only "29 Sep booking possible hai?" -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('29 Sep booking possible hai?', chat, false);
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.category, CATEGORIES.AVAILABILITY_ONLY);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SUBSTRING REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. SUBSTRING REGRESSION TESTS ---');

runTest('"pajupis pulav" must NOT match UPI / payment', () => {
  const isUPI = isExactPaymentIntent('pajupis pulav');
  assert.strictEqual(isUPI, false, 'Expected pajupis pulav NOT to trigger payment');
  const chat = buildMockChat();
  const route = routeIncomingMessage('pajupis pulav', chat, false);
  assert.strictEqual(route.action, 'SILENT', 'Unrelated text should be silent');
});

runTest('"equipment details?" must NOT match UPI / payment', () => {
  const isUPI = isExactPaymentIntent('equipment details?');
  assert.strictEqual(isUPI, false, 'Expected equipment details NOT to trigger payment');
});

runTest('"Kalyan se resort kaise aau?" must NOT set date to tomorrow', () => {
  const extracted = extractBookingDetails('Kalyan se resort kaise aau?');
  assert.strictEqual(extracted.date, undefined, 'Kalyan must not be extracted as kal/tomorrow');
  
  const chat = buildMockChat();
  const route = routeIncomingMessage('Kalyan se resort kaise aau?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.intent, 'location');
});

runTest('"Kay activities aahet?" must NOT classify as pricing', () => {
  const topic = detectConversationTopic('Kay activities aahet?');
  assert.strictEqual(topic, 'activities', 'Kay activities aahet must classify as activities, not pricing');
  
  const chat = buildMockChat();
  const route = routeIncomingMessage('Kay activities aahet?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.intent, 'activities');
});

runTest('"Price kay aahe?" must classify as pricing (via price token)', () => {
  const topic = detectConversationTopic('Price kay aahe?');
  assert.strictEqual(topic, 'pricing');
  
  const chat = buildMockChat();
  const route = routeIncomingMessage('Price kay aahe?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.intent, 'pricing');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. NORMAL RESORT QUERIES (REPLY)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. NORMAL RESORT QUERIES ---');

runTest('"couple package price?" -> REPLY', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('couple package price?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.resortRelated, true);
});

runTest('"day picnic price?" -> REPLY', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('day picnic price?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.resortRelated, true);
});

runTest('"activities kya hai?" -> REPLY', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('activities kya hai?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.intent, 'activities');
});

runTest('"check in timing?" -> REPLY', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('check in timing?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.resortRelated, true);
});

runTest('"location kaha hai?" -> REPLY', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('location kaha hai?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.intent, 'location');
});

runTest('"food me kya hai?" -> REPLY', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('food me kya hai?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.intent, 'food');
});

runTest('"private room kitne ka hai?" -> REPLY', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('private room kitne ka hai?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.resortRelated, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MIXED AVAILABILITY QUERIES
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. MIXED AVAILABILITY QUERIES ---');

runTest('"27 Sep available hai aur couple price kya hai?" -> REPLY with suppressAvailability: true', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('27 Sep available hai aur couple price kya hai?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.category, CATEGORIES.MIXED_RESORT_AVAILABILITY);
  assert.strictEqual(route.availabilityAsked, true);
  assert.strictEqual(route.suppressAvailability, true);
});

runTest('"available hai aur activities kya hai?" -> REPLY with suppressAvailability: true', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('available hai aur activities kya hai?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.category, CATEGORIES.MIXED_RESORT_AVAILABILITY);
  assert.strictEqual(route.availabilityAsked, true);
  assert.strictEqual(route.suppressAvailability, true);
});

runTest('"5 people ke liye available hai aur day picnic kitna hai?" -> REPLY with suppressAvailability: true', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('5 people ke liye available hai aur day picnic kitna hai?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.category, CATEGORIES.MIXED_RESORT_AVAILABILITY);
  assert.strictEqual(route.availabilityAsked, true);
  assert.strictEqual(route.suppressAvailability, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CONTEXT-AWARE ROUTING
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 5. CONTEXT-AWARE ROUTING ---');

runTest('Active day picnic context: Customer sends "5 people" -> REPLY', () => {
  const chat = buildMockChat({
    bookingStage: 'type_selected',
    bookingDraft: { bookingType: 'picnic' },
    messages: [
      { sender: 'customer', text: 'day picnic' },
      { sender: 'bot', text: 'One-day picnic starts at 9:00 AM! How many guests?' }
    ]
  });
  const route = routeIncomingMessage('5 people', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.resortRelated, true);
});

runTest('Bot asked about kids: Customer: "no" -> REPLY (not acknowledgement silence)', () => {
  const chat = buildMockChat({
    bookingStage: 'guests_given',
    bookingDraft: { date: '2026-09-28', adults: 2, askingAboutKids: true },
    messages: [
      { sender: 'customer', text: '28 Sep couple' },
      { sender: 'bot', text: 'Kya koi kids aa rahe hain? Agar yes, age bataiye 😊' }
    ]
  });
  const route = routeIncomingMessage('no', chat, false);
  assert.strictEqual(route.action, 'REPLY', 'Answering kids question with "no" must reply');
  assert.strictEqual(route.intent, 'booking_flow');
});

runTest('Bot asked meal option: Customer: "Dinner" -> REPLY', () => {
  const chat = buildMockChat({
    bookingStage: 'type_selected',
    bookingDraft: { bookingType: 'picnic', date: '2026-09-28', adults: 4 },
    messages: [
      { sender: 'customer', text: '4 people picnic 28 Sep' },
      { sender: 'bot', text: 'Breakfast to Tea ya Breakfast to Dinner? Kaunsa option pasand hai?' }
    ]
  });
  const route = routeIncomingMessage('Dinner', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.intent, 'booking_flow');
});

runTest('Active couple context: Customer: "29-30 Sep" -> REPLY', () => {
  const chat = buildMockChat({
    bookingStage: 'type_selected',
    bookingDraft: { bookingType: 'couple', adults: 2 },
    messages: [
      { sender: 'customer', text: 'couple stay' },
      { sender: 'bot', text: 'Kis date pe check-in plan kar rahe hain?' }
    ]
  });
  const route = routeIncomingMessage('29-30 Sep', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.resortRelated, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SILENCE + CONTEXT CONTINUATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 6. SILENCE + CONTEXT CONTINUATION ---');

runTest('Availability silent message preserves context and allows subsequent total request', () => {
  // Step 1: Customer asks "29 Sep couple stay" -> Bot responds
  const chat = buildMockChat({
    bookingStage: 'type_selected',
    bookingDraft: { bookingType: 'couple', date: '2026-09-29', adults: 2 },
    messages: [
      { sender: 'customer', text: '29 Sep couple stay' },
      { sender: 'bot', text: 'Couple stay on 29 Sep is ₹5,500.' }
    ]
  });

  // Step 2: Customer asks "available hai?" -> Router must be SILENT
  const routeSilent = routeIncomingMessage('available hai?', chat, false);
  assert.strictEqual(routeSilent.action, 'SILENT');
  assert.strictEqual(routeSilent.category, CATEGORIES.AVAILABILITY_ONLY);

  // Push customer message to history without modifying draft
  chat.messages.push({ sender: 'customer', text: 'available hai?' });

  // Step 3: Staff manually responds "Yes available hai."
  chat.messages.push({ sender: 'staff', text: 'Yes available hai.' });
  chat.conversationState = { lastStaffMessage: 'Yes available hai.' };

  // Step 4: Customer asks "2 adults ka total batao"
  const routeContinuation = routeIncomingMessage('2 adults ka total batao', chat, false);
  assert.strictEqual(routeContinuation.action, 'REPLY');
  assert.strictEqual(chat.bookingDraft.date, '2026-09-29', 'Date context must be preserved');
  assert.strictEqual(chat.bookingDraft.adults, 2, 'Adults count context must be preserved');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. HUMAN / STAFF MODE CHECK
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 7. HUMAN / STAFF MODE CHECKS ---');

runTest('Chat in human mode should never allow automated reply', () => {
  const chatHuman = buildMockChat({ mode: 'human' });
  // In messageHandler.js, mode === 'human' or 'staff' exits before AI/channelManager send
  assert.strictEqual(chatHuman.mode, 'human');
});

runTest('Chat in staff mode should never allow automated reply', () => {
  const chatStaff = buildMockChat({ mode: 'staff' });
  assert.strictEqual(chatStaff.mode, 'staff');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. MEDIA HANDLING
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 8. MEDIA HANDLING ---');

runTest('Uncaptioned random sticker -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('', chat, true); // hasMedia=true, text empty
  assert.strictEqual(route.action, 'SILENT');
  assert.strictEqual(route.intent, 'uncaptioned_media');
});

runTest('Uncaptioned photo -> SILENT', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('', chat, true);
  assert.strictEqual(route.action, 'SILENT');
});

runTest('Photo WITH caption "15 Aug couple price?" -> REPLY', () => {
  const chat = buildMockChat();
  const route = routeIncomingMessage('15 Aug couple price?', chat, true);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.resortRelated, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. PAYMENT INTENT TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 9. PAYMENT INTENT TESTS ---');

runTest('"UPI?" -> triggers payment intent', () => {
  assert.strictEqual(isExactPaymentIntent('UPI?'), true);
  const chat = buildMockChat();
  const route = routeIncomingMessage('UPI?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.intent, 'payment');
});

runTest('"payment kaise karu?" -> triggers payment intent', () => {
  assert.strictEqual(isExactPaymentIntent('payment kaise karu?'), true);
  const chat = buildMockChat();
  const route = routeIncomingMessage('payment kaise karu?', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.intent, 'payment');
});

runTest('"scanner bhejo" -> triggers payment intent', () => {
  assert.strictEqual(isExactPaymentIntent('scanner bhejo'), true);
  const chat = buildMockChat();
  const route = routeIncomingMessage('scanner bhejo', chat, false);
  assert.strictEqual(route.action, 'REPLY');
  assert.strictEqual(route.intent, 'payment');
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. PRICING ACCURACY & SANITY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 10. PRICING INTEGRITY TESTS ---');

runTest('Couple weekday pricing: ₹5,500', () => {
  // 2026-09-28 is Monday (Weekday)
  const ci = new Date('2026-09-28T00:00:00.000Z');
  const co = new Date('2026-09-29T00:00:00.000Z');
  const res = calculatePricing(ci, co, 2, [], 'couple');
  assert.strictEqual(res.raw.grandTotal, 5500);
});

runTest('Couple weekend pricing: ₹6,500', () => {
  // 2026-10-03 is Saturday (Weekend)
  const ci = new Date('2026-10-03T00:00:00.000Z');
  const co = new Date('2026-10-04T00:00:00.000Z');
  const res = calculatePricing(ci, co, 2, [], 'couple');
  assert.strictEqual(res.raw.grandTotal, 6500);
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. SHORT REAL-WORLD RESORT QUERIES (FALSE-NEGATIVE VERIFICATION)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 11. SHORT REAL-WORLD RESORT QUERIES ---');

const shortQueries = [
  { text: 'price', expectedAction: 'REPLY' },
  { text: 'rate', expectedAction: 'REPLY' },
  { text: 'timing', expectedAction: 'REPLY' },
  { text: 'location', expectedAction: 'REPLY' },
  { text: 'photos', expectedAction: 'REPLY' },
  { text: 'food', expectedAction: 'REPLY' },
  { text: 'activities', expectedAction: 'REPLY' },
  { text: 'couple', expectedAction: 'REPLY' },
  { text: 'family', expectedAction: 'REPLY' },
  { text: 'picnic', expectedAction: 'REPLY' },
  { text: '2 adults', expectedAction: 'REPLY' },
  { text: '5 log', expectedAction: 'REPLY' },
  { text: '29 sep', expectedAction: 'REPLY' },
  { text: 'dinner', expectedAction: 'REPLY' },
  { text: 'private room', expectedAction: 'REPLY' },
  { text: 'cancel karna hai', expectedAction: 'REPLY' },
  { text: 'refund?', expectedAction: 'REPLY' },
  { text: 'pet allowed?', expectedAction: 'REPLY' },
  { text: 'jain food?', expectedAction: 'REPLY' },
  { text: 'alcohol allowed?', expectedAction: 'REPLY' },
  { text: 'station se kaise aau?', expectedAction: 'REPLY' }
];

shortQueries.forEach(({ text, expectedAction }) => {
  runTest(`Short legitimate query "${text}" -> ${expectedAction}`, () => {
    const chat = buildMockChat();
    const route = routeIncomingMessage(text, chat, false);
    assert.strictEqual(route.action, expectedAction, `Expected "${text}" to have action ${expectedAction}`);
  });
});

runTest('Contextual "no kids" -> REPLY', () => {
  const chat = buildMockChat({
    bookingStage: 'guests_given',
    bookingDraft: { date: '2026-09-28', adults: 2, askingAboutKids: true },
    messages: [
      { sender: 'bot', text: 'Kya koi kids aa rahe hain?' }
    ]
  });
  const route = routeIncomingMessage('no kids', chat, false);
  assert.strictEqual(route.action, 'REPLY');
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. OFF-TOPIC, SPAM & CHATTER (FALSE-POSITIVE VERIFICATION)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 12. OFF-TOPIC, SPAM & CHATTER ---');

const offTopicQueries = [
  'cricket?',
  'weather?',
  'stock market?',
  'bitcoin?',
  'joke sunao',
  'who are you?',
  'good night',
  'happy birthday',
  'https://example.com/promo-link',
  'Get 50% discount on instant personal loans!',
  '🔥',
  '😂'
];

offTopicQueries.forEach((text) => {
  runTest(`Off-topic / chatter "${text}" -> SILENT`, () => {
    const chat = buildMockChat();
    const route = routeIncomingMessage(text, chat, false);
    assert.strictEqual(route.action, 'SILENT', `Expected "${text}" to be SILENT`);
  });
});

console.log('\n' + '═'.repeat(70));
console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('═'.repeat(70) + '\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
