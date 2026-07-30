const mongoose = require('mongoose');
require('dotenv').config();
const { Chat, Settings } = require('../models');
const { getAIResponse, detectLanguage } = require('../services/aiService');
const { calculatePricing } = require('../services/pricingService');
const { buildSystemPrompt } = require('../utils/systemPrompt');
const connectDB = require('../config/db');

async function runHistoryVerificationTest() {
  console.log('====================================================');
  console.log('   CHAT HISTORY & MULTI-TURN AI FLOW VERIFICATION   ');
  console.log('====================================================\n');

  try {
    await connectDB();
    console.log('[STEP 1: DB CONNECTION] Connected to MongoDB Atlas\n');

    const testPhone = '919876543210';
    await Chat.deleteMany({ customerPhone: testPhone });

    let chat = new Chat({
      customerPhone: testPhone,
      customerName: 'Test Customer',
      mode: 'ai',
      language: 'hinglish',
      messages: [],
      bookingStage: 'none',
      bookingDraft: {}
    });
    await chat.save();
    console.log('[STEP 2: CHAT INITIALIZATION] Created fresh test chat document for:', testPhone);

    const settings = await Settings.findOne() || { globalMode: 'ai' };

    // ── MESSAGE 1: "Hello" ───────────────────────────────────────────
    console.log('\n----------------------------------------------------');
    console.log('TURN 1: Customer sends: "Hello"');
    console.log('----------------------------------------------------');
    
    chat.messages.push({
      sender: 'customer',
      text: 'Hello',
      timestamp: new Date()
    });
    await chat.save();

    const reply1 = await getAIResponse(chat, 'Hello', settings, '');
    chat.messages.push({
      sender: 'bot',
      text: reply1,
      timestamp: new Date()
    });
    await chat.save();

    console.log(`[TURN 1 COMPLETED] Bot Reply: "${reply1.substring(0, 100)}..."`);
    console.log(`[DB CHECK] Chat message count in DB: ${chat.messages.length}`);

    // ── MESSAGE 2: "Group booking, 1-3 aug, 5 people" ──────────────────
    console.log('\n----------------------------------------------------');
    console.log('TURN 2: Customer sends: "Group booking, 1-3 aug, 5 people"');
    console.log('----------------------------------------------------');

    chat.messages.push({
      sender: 'customer',
      text: 'Group booking, 1-3 aug, 5 people',
      timestamp: new Date()
    });
    chat.bookingDraft = {
      bookingType: 'group',
      date: '2026-08-01',
      nights: 2,
      adults: 5
    };
    chat.bookingStage = 'guests_given';
    await chat.save();

    const pricingResult = calculatePricing('2026-08-01', '2026-08-03', 5, 'group');
    const systemNotes = `[SYSTEM NOTE: Availability confirmed for 5 guests.\nPRICING BREAKDOWN:\n${pricingResult.formatted}]`;

    const reply2 = await getAIResponse(chat, 'Group booking, 1-3 aug, 5 people', settings, systemNotes);
    chat.messages.push({
      sender: 'bot',
      text: reply2,
      timestamp: new Date()
    });
    await chat.save();

    console.log(`[TURN 2 COMPLETED] Bot Reply:\n${reply2}`);
    console.log(`[DB CHECK] Chat message count in DB: ${chat.messages.length}`);

    // ── MESSAGE 3: "Photos dikha sakte?" ──────────────────────────────
    console.log('\n----------------------------------------------------');
    console.log('TURN 3: Customer sends: "Photos dikha sakte?"');
    console.log('----------------------------------------------------');

    chat.messages.push({
      sender: 'customer',
      text: 'Photos dikha sakte?',
      timestamp: new Date()
    });
    await chat.save();

    const reply3 = await getAIResponse(chat, 'Photos dikha sakte?', settings, '');
    chat.messages.push({
      sender: 'bot',
      text: reply3,
      timestamp: new Date()
    });
    await chat.save();

    console.log(`[TURN 3 COMPLETED] Bot Reply: "${reply3}"`);
    console.log(`[DB CHECK] Final Chat message count in DB: ${chat.messages.length}`);

    // ── FINAL DB RETRIEVAL CHECK ──────────────────────────────────────
    console.log('\n====================================================');
    console.log('   FINAL MONGODB DB RETRIEVAL CHECK                 ');
    console.log('====================================================');
    const finalDbChat = await Chat.findOne({ customerPhone: testPhone }).lean();
    console.log('MongoDB Chat document found:');
    console.log(`- customerPhone: ${finalDbChat.customerPhone}`);
    console.log(`- Total messages in DB array: ${finalDbChat.messages.length}`);
    console.log('- Messages transcript:');
    finalDbChat.messages.forEach((m, idx) => {
      console.log(`  [${idx + 1}] ${m.sender.toUpperCase()}: ${m.text.substring(0, 70)}`);
    });

    await Chat.deleteMany({ customerPhone: testPhone });
    await mongoose.disconnect();
    console.log('\n✅ CHAT HISTORY VERIFICATION COMPLETED SUCCESSFULLY!');
  } catch (error) {
    console.error('❌ Error during chat history verification:', error);
    process.exit(1);
  }
}

runHistoryVerificationTest();
