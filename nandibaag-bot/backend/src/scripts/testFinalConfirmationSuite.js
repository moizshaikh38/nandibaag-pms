const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { Chat, Settings } = require('../models');
const { handleMessage } = require('../services/messageHandler');
const channelManager = require('../services/channelManager');

async function testFinalConfirmation() {
  console.log('====================================================');
  console.log('    RUNNING FINAL BOOKING CONFIRMATION TEST SUITE   ');
  console.log('====================================================\n');

  try {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    } catch (_) {
      await mongoose.connect('mongodb://127.0.0.1:27017/nandibaag-pms-test', { serverSelectionTimeoutMS: 3000 });
    }

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ globalMode: 'ai', fallbackContactPhone: '+919257657665' });
    }

    const testPhone = '919999888777';
    await Chat.deleteMany({ customerPhone: testPhone });
    await Chat.create({ customerPhone: testPhone, mode: 'ai' });

    let lastSentText = '';
    channelManager.sendMessageViaChannel = async (jid, text) => {
      const finalText = (text || '')
        .replace(/\\n\\n/g, '\n\n')
        .replace(/\\n/g, '\n')
        .trim();
      lastSentText = finalText;
      return true;
    };

    console.log('--- TURN 1: "13-15 Aug couple booking, 2 people" ---');
    await handleMessage('primary', {
      key: { remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "13-15 Aug couple booking, 2 people" },
      messageTimestamp: Math.floor(Date.now() / 1000)
    }, 'whatsapp-web');
    console.log('Bot Reply Turn 1:\n' + lastSentText + '\n');

    console.log('--- TURN 2: "No kids" ---');
    await handleMessage('primary', {
      key: { remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "No kids" },
      messageTimestamp: Math.floor(Date.now() / 1000) + 5
    }, 'whatsapp-web');
    console.log('Bot Reply Turn 2:\n' + lastSentText + '\n');

    console.log('--- TURN 3: "Confirm kardo" ---');
    await handleMessage('primary', {
      key: { remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Confirm kardo" },
      messageTimestamp: Math.floor(Date.now() / 1000) + 10
    }, 'whatsapp-web');
    console.log('Bot Reply Turn 3:\n' + lastSentText + '\n');

    console.log('--- TURN 4: "Moiz" ---');
    await handleMessage('primary', {
      key: { remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Moiz" },
      messageTimestamp: Math.floor(Date.now() / 1000) + 15
    }, 'whatsapp-web');
    console.log('Bot Reply Turn 4:\n' + lastSentText + '\n');

    console.log('====================================================');
    console.log('                 VERIFICATION PASS                  ');
    console.log('====================================================');

    const hasTeamConnectText = lastSentText.includes('All details taken') && lastSentText.includes('connect karegi');
    const hasNoCallUs = !lastSentText.includes('Call: 9257657665') && !lastSentText.includes('Call staff');

    console.log(`Contains "All details taken / connect karegi": ${hasTeamConnectText ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`NO "Call us / Call 9257657665" directive: ${hasNoCallUs ? '✅ PASS' : '❌ FAIL'}`);

    await Chat.deleteMany({ customerPhone: testPhone });
    await mongoose.disconnect();
  } catch (err) {
    console.error('Test error:', err);
  }
}

testFinalConfirmation();
