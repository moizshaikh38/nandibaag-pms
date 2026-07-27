#!/usr/bin/env node

/**
 * Production-Grade Comprehensive AI Reply & Heuristics Test Suite for Nandibaag Bot
 * 
 * Directly calls aiService.getAIResponse() and isReplyValid() with scripted conversations
 * to verify AI behavior, anti-hallucination, banned words, room number deflection, and date parsing.
 * 
 * Usage: npm run test-ai
 */

require('dotenv').config();

const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { getAIResponse, isReplyValid } = require('../services/aiService');

// ── Mock resort settings (matches real config) ────────────────────────
const MOCK_RESORT_SETTINGS = {
  whatsappNumbers: [
    { number: '9257657665', isActive: true, isPrimary: true },
    { number: '9257657664', isActive: true, isPrimary: false },
    { number: '9257657663', isActive: true, isPrimary: false }
  ],
  globalMode: 'ai',
  followUpEnabled: true
};

const BANNED_WORDS = ['kripya', 'sahayta', 'tithi', 'dastur', 'niyojan', 'pradan', 'vivaran', 'krupaya', 'sahayya', 'dinank'];

// ── Helpers ────────────────────────────────────────────────────────────

function buildMockChat(messages = [], bookingStage = 'none') {
  return {
    messages: messages.map(m => ({
      sender: m.sender || 'customer',
      text: m.text,
      timestamp: new Date()
    })),
    bookingStage,
    customerPhone: '919876543210',
    mode: 'ai'
  };
}

function checkKeywords(reply, keywords) {
  const lowerReply = reply.toLowerCase();
  const found = [];
  const missing = [];
  for (const kw of keywords) {
    if (lowerReply.includes(kw.toLowerCase())) {
      found.push(kw);
    } else {
      missing.push(kw);
    }
  }
  return { found, missing };
}

// ── Test Scenarios ─────────────────────────────────────────────────────

const scenarios = [
  {
    id: '1',
    name: 'PART 3.1: Exact failing conversation ("Hello" -> "Rooms kab available hai?" -> "28 august 5 guest 4 adult and 1 kid")',
    message: '28 august 5 guest 4 adult and 1 kid',
    history: [
      { sender: 'customer', text: 'Hello' },
      { sender: 'bot', text: 'Namaste! Welcome to Nandibaag Resort 🌿 Aapko Couple Stay, Group Stay ya One Day Picnic kis type ki booking ke baare me jankari chahiye?' },
      { sender: 'customer', text: 'Rooms kab available hai?' },
      { sender: 'bot', text: 'Namaste! Check-in date aur total guests (adults + kids) batayein!' }
    ],
    bookingStage: 'none',
    systemNotes: '[SYSTEM NOTE: Availability confirmed for 5 guests on 2026-08-28 to 2026-08-29. 4 room(s) available at this capacity. Proceed with booking flow normally.]',
    expectedKeywords: ['28'],
    rejectKeywords: ['kripya', '919588685396'],
    description: 'Bot must parse natural language date & guest count and proceed to availability-grounded reply instead of re-asking'
  },
  {
    id: '2',
    name: 'PART 3.2: Phone number request',
    message: 'Resort team se baat karne ke liye contact number kya hai?',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['9257657665'],
    rejectKeywords: ['919588685396', 'kripya'],
    description: 'Assert contact number in reply matches exact real resort primary number (9257657665)'
  },
  {
    id: '3',
    name: 'PART 3.3: Room photo request',
    message: 'Room photos aur cottage details dikhao',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['nandibaag.com/rooms'],
    rejectKeywords: ['kripya'],
    description: 'Assert room gallery link https://nandibaag.com/rooms is included'
  },
  {
    id: '5',
    name: 'PART 3.5: Direct room number request',
    message: 'Mujhe room number 104 milega ya kaunsa room number milega?',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['staff', 'confirm'],
    rejectKeywords: ['room 104', 'room 101', 'room 402', 'cottage 5', 'kripya'],
    description: 'Direct room number request — confirm proper deflection without leaking any room number'
  },
  {
    id: '6a',
    name: 'PART 3.6a: Ambiguous date phrasing ("kal")',
    message: 'Kal ke liye room available hai kya 4 adults?',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['availability', 'kal'],
    rejectKeywords: ['kripya'],
    description: 'Extracts relative date ("kal") and prompts/checks availability cleanly'
  },
  {
    id: '6b',
    name: 'PART 3.6b: Ambiguous date phrasing ("next weekend")',
    message: 'Next weekend couple stay ka price kya hai?',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['couple'],
    rejectKeywords: ['kripya'],
    description: 'Extracts "next weekend" and asks for date/guest count or provides weekend rate structure'
  },
  {
    id: '6c',
    name: 'PART 3.6c: Date range phrasing ("15-17 dec")',
    message: '15-17 dec 3 adults stay option',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['15', 'december'],
    rejectKeywords: ['kripya'],
    description: 'Extracts date range (15 to 17 December) and guest count (3 adults) cleanly'
  },
  {
    id: '7',
    name: 'PART 3.7: Vulgar / abusive message',
    message: 'Faltu resort bakwas services hai tumhari',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['bhasha', 'help'],
    rejectKeywords: ['bakwas', 'faltu', 'kripya'],
    description: 'Vulgar message — confirm calm respectful warning without mirroring rudeness'
  },
  {
    id: '8a',
    name: 'PART 3.8a: FAQ - Location & directions',
    message: 'Resort ka address aur Google Maps location link bhejdo',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['goo.gl', 'karjat'],
    rejectKeywords: ['kripya'],
    description: 'Location FAQ — confirm exact Google Maps link is provided'
  },
  {
    id: '8b',
    name: 'PART 3.8b: FAQ - Reviews & ratings',
    message: 'Resort ke ratings aur reviews kaise hain?',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['4.4', 'reviews'],
    rejectKeywords: ['kripya'],
    description: 'Reviews FAQ — confirm 4.4★ and 4500+ reviews mentioned'
  },
  {
    id: '8c',
    name: 'PART 3.8c: FAQ - Pet policy',
    message: 'Kya hum pet dog sath me laa sakte hain?',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['pet'],
    rejectKeywords: ['kripya'],
    description: 'Pet policy FAQ — confirm pet friendly status confirmed'
  },
  {
    id: '8d',
    name: 'PART 3.8d: FAQ - Jain food',
    message: 'Pure Jain food milta hai kya bina pyaz lahsun ka?',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['jain', 'veg'],
    rejectKeywords: ['kripya'],
    description: 'Jain food FAQ — confirm pure veg & Jain food availability confirmed'
  },
  {
    id: 'a',
    name: 'Pre-existing: Hinglish couple booking inquiry',
    message: 'Namaste, couple booking chahiye',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['couple'],
    description: 'Should respond warmly and start the couple booking flow'
  },
  {
    id: 'b',
    name: 'Pre-existing: Pure Marathi inquiry',
    message: 'Namaskar, aamhala couple room pahije, kadhi milel?',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['couple'],
    description: 'Should reply in Marathi (or Marathi-mix) and start booking flow'
  },
  {
    id: 'c',
    name: 'Pre-existing: Pure English weekend booking',
    message: 'Hi, I want to book for a couple this weekend',
    history: [],
    bookingStage: 'none',
    expectedKeywords: ['couple'],
    description: 'Should reply in English and ask for specific date'
  }
];

// ── Main ───────────────────────────────────────────────────────────────

function runReplyValidationTests() {
  console.log('── Running Reply Validation Heuristics Tests ────────────────');
  console.log('');
  
  const testCases = [
    {
      name: 'Verifier corruption example (Exact User String)',
      text: 'Kaunse tarah ka booking karna chah verifier? Group, Couple, Picnic, ya koi event?',
      expectedValid: false
    },
    {
      name: 'Repeated word bug ("chahiye chahiye")',
      text: 'Bilkul, aapko kis tarah ki booking chahiye chahiye? Hamare paas couple aur group rates hain.',
      expectedValid: false
    },
    {
      name: 'Markdown leak leakage (**Couple Room**)',
      text: 'Aap **Couple Room** book karna chahte hain ya group package?',
      expectedValid: false
    },
    {
      name: 'Truncated mid-word consonant cluster ("de sakt")',
      text: 'Hum group bookings ke liye discount de sakt hain.',
      expectedValid: false
    },
    {
      name: 'Clean valid Hinglish reply (No false-positives)',
      text: 'Namaste! Nandibaag Resort me aapka swagat hai. Aap Couple ya Group booking ke liye enquiry kar rahe hain? 😊',
      expectedValid: true
    },
    {
      name: 'Policy sentence test 1 ("married couples allowed")',
      text: 'Ji, couple stay sirf married couples ke liye allowed hai aur check-in par valid ID proof required hota hai.',
      expectedValid: true
    },
    {
      name: 'BUG 3 Regression: Banned word "kripya" must be REJECTED',
      text: 'Live availability check karne ke liye kripya date batayein.',
      expectedValid: false
    },
    {
      name: 'BUG 1 Regression: Unauthorized phone number 919588685396 must be REJECTED',
      text: 'Humari team se baat karein: 919588685396',
      expectedValid: false
    },
    {
      name: 'BUG 1 Regression: Authorized phone number 9257657665 must be ACCEPTED',
      text: 'Humari team se baat karein: 9257657665 📞',
      expectedValid: true
    },
    {
      name: 'HARD BUSINESS RULE: Specific room number leak ("room 104") must be REJECTED',
      text: 'Aapko room 104 milega check-in ke time.',
      expectedValid: false
    }
  ];

  let passedAll = true;
  for (const tc of testCases) {
    const isValid = isReplyValid(tc.text);
    const passed = isValid === tc.expectedValid;
    console.log(`  ${passed ? '✅' : '❌'} [${tc.name}]:`);
    console.log(`     Input: "${tc.text}"`);
    console.log(`     Expected Valid: ${tc.expectedValid} | Got: ${isValid}`);
    if (!passed) passedAll = false;
  }
  
  if (passedAll) {
    console.log('');
    console.log('  🎉 All validation heuristic test cases passed successfully!');
    console.log('');
  } else {
    console.log('');
    console.log('  ❌ Some validation test cases failed.');
    console.log('');
    process.exit(1);
  }
}

async function main() {
  runReplyValidationTests();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║      🤖 Nandibaag Production AI Test Suite (All Features)   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('  ⏳ Connecting to MongoDB...');
  try {
    await mongoose.connect(mongoUri);
    console.log('  ✅ MongoDB connected\n');
  } catch (err) {
    console.log(`  ❌ MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const scenario of scenarios) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Scenario ${scenario.id}) ${scenario.name}`);
    console.log(`  📝 ${scenario.description}`);
    console.log(`  💬 Customer: "${scenario.message}"`);
    console.log('');

    try {
      const chat = buildMockChat(scenario.history, scenario.bookingStage);
      const systemNotes = scenario.systemNotes || '';
      const reply = await getAIResponse(chat, scenario.message, MOCK_RESORT_SETTINGS, systemNotes);

      if (systemNotes) {
        console.log(`  📋 System Note injected: "${systemNotes.substring(0, 80)}..."`);
      }

      console.log(`  🤖 AI Reply:`);
      console.log(`  ┌─────────────────────────────────────────────────────────`);
      reply.split('\n').forEach(line => {
        console.log(`  │ ${line}`);
      });
      console.log(`  └─────────────────────────────────────────────────────────`);

      let scenarioPassed = true;

      // 1. Assert absence of ALL banned words across EVERY scenario
      const lowerReply = reply.toLowerCase();
      const bannedFound = BANNED_WORDS.filter(w => lowerReply.includes(w));
      if (bannedFound.length > 0) {
        console.log(`  ❌ BANNED WORD DETECTED IN REPLY: ${bannedFound.join(', ')}`);
        scenarioPassed = false;
      } else {
        console.log(`  ✅ Banned words check passed (0 banned words present)`);
      }

      // 2. Assert absence of room number leaks
      const roomLeak = /(?:room|cottage)\s*(?:no\.?|number)?\s*\d{1,4}\b/i.test(reply);
      if (roomLeak) {
        console.log(`  ❌ ROOM NUMBER LEAK DETECTED IN REPLY: "${reply.match(/(?:room|cottage)\s*(?:no\.?|number)?\s*\d{1,4}\b/i)[0]}"`);
        scenarioPassed = false;
      } else {
        console.log(`  ✅ Room number deflection check passed (no room numbers leaked)`);
      }

      // 3. Keyword checks
      if (scenario.expectedKeywords && scenario.expectedKeywords.length > 0) {
        const { found, missing } = checkKeywords(reply, scenario.expectedKeywords);
        if (missing.length > 0) {
          console.log(`  ⚠️  MISSING expected keywords: ${missing.map(k => `"${k}"`).join(', ')}`);
          warnCount++;
          scenarioPassed = false;
        } else {
          console.log(`  ✅ Expected keywords found: ${found.map(k => `"${k}"`).join(', ')}`);
        }
      }

      if (scenario.rejectKeywords && scenario.rejectKeywords.length > 0) {
        const badMatches = scenario.rejectKeywords.filter(k => lowerReply.includes(k.toLowerCase()));
        if (badMatches.length > 0) {
          console.log(`  ⚠️  Reply CONTAINS rejected keywords: ${badMatches.map(k => `"${k}"`).join(', ')}`);
          warnCount++;
          scenarioPassed = false;
        } else {
          console.log(`  ✅ Correctly avoided rejected keywords`);
        }
      }

      if (scenarioPassed) {
        passCount++;
      } else {
        failCount++;
      }
    } catch (err) {
      console.log(`  ❌ ERROR: ${err.message}`);
      failCount++;
    }

    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('── Summary ─────────────────────────────────────────────────');
  console.log(`  Total:  ${scenarios.length}`);
  console.log(`  ✅ Clean pass:    ${passCount}`);
  console.log(`  ⚠️  Needs review: ${warnCount}`);
  console.log(`  ❌ Errors:        ${failCount}`);
  console.log('');

  await mongoose.disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

main();
