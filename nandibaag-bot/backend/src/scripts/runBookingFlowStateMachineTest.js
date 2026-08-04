const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { Chat, Settings } = require('../models');
const { handleMessage } = require('../services/messageHandler');
const channelManager = require('../services/channelManager');

async function testFullBookingFlow() {
  console.log('====================================================');
  console.log('   RUNNING FULL STATE MACHINE & MEMORY TEST        ');
  console.log('====================================================\n');

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('[STEP 1] Connected to DB Atlas.');

    // Ensure Settings document exists
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ globalMode: 'ai', fallbackContactPhone: '+919257657665' });
    }

    const testPhone = '919999888777';
    await Chat.deleteMany({ customerPhone: testPhone });
    await Chat.create({ customerPhone: testPhone, mode: 'ai' });
    console.log(`[STEP 2] Clean test chat initialized for ${testPhone}.\n`);

    const capturedReplies = [];
    // Mock channelManager.sendMessageViaChannel
    channelManager.sendMessageViaChannel = async (jid, text) => {
      capturedReplies.push(text);
      console.log(`\n[BOT ACTUAL REPLY TO MESSAGE ${capturedReplies.length}]:`);
      console.log('----------------------------------------------------');
      console.log(text);
      console.log('----------------------------------------------------');
      return true;
    };

    const messages = [
      { step: 1, text: "Hi, 5 aug couple stay 1 day" },
      { step: 2, text: "No kids" },
      { step: 3, text: "Ready to confirm" },
      { step: 4, text: "Moiz" }
    ];

    for (const msg of messages) {
      console.log(`\n====================================================`);
      console.log(`SENDING MESSAGE ${msg.step}: "${msg.text}"`);
      console.log(`====================================================`);

      const rawMsg = {
        key: { remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
        message: { conversation: msg.text },
        messageTimestamp: Math.floor(Date.now() / 1000)
      };

      await handleMessage('primary', rawMsg, 'whatsapp-web');

      const updatedChat = await Chat.findOne({ customerPhone: testPhone }).lean();
      console.log(`[DB VERIFICATION Step ${msg.step}]:`);
      console.log(`- Messages stored in DB: ${updatedChat.messages.length}`);
      console.log(`- Booking Draft State:`, JSON.stringify({
        date: updatedChat.bookingDraft?.date,
        nights: updatedChat.bookingDraft?.nights,
        adults: updatedChat.bookingDraft?.adults,
        kidsSpecified: updatedChat.bookingDraft?.kidsSpecified,
        availabilityConfirmed: updatedChat.bookingDraft?.availabilityConfirmed,
        customerName: updatedChat.customerName || updatedChat.bookingDraft?.customerName,
        bookingStep: updatedChat.bookingDraft?.bookingStep
      }, null, 2));
    }

    console.log('\n====================================================');
    console.log('            FINAL COMPLIANCE VERIFICATION           ');
    console.log('====================================================');

    const reply1 = capturedReplies[0] || '';
    const reply2 = capturedReplies[1] || '';
    const reply3 = capturedReplies[2] || '';
    const reply4 = capturedReplies[3] || '';

    const testResults = {
      step1AskKids: reply1.toLowerCase().includes('kids') || reply1.toLowerCase().includes('bache') || reply1.toLowerCase().includes('mule'),
      step2ShowPricing: reply2.includes('BOOKING SUMMARY') || reply2.includes('TOTAL: ₹'),
      step3AskName: reply3.toLowerCase().includes('naam') || reply3.toLowerCase().includes('name'),
      step4FinalSummary: reply4.includes('FINAL BOOKING CONFIRMATION') || (reply4.includes('Moiz') && reply4.includes('9257657665'))
    };

    console.log('1. Step 1 asks about kids before pricing:', testResults.step1AskKids ? '✅ PASS' : '❌ FAIL');
    console.log('2. Step 2 shows pricing breakdown:', testResults.step2ShowPricing ? '✅ PASS' : '❌ FAIL');
    console.log('3. Step 3 asks for customer name on confirm intent:', testResults.step3AskName ? '✅ PASS' : '❌ FAIL');
    console.log('4. Step 4 presents final summary with name + 9257657665:', testResults.step4FinalSummary ? '✅ PASS' : '❌ FAIL');

    await Chat.deleteMany({ customerPhone: testPhone });
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error during test:', err);
  }
}

testFullBookingFlow();
