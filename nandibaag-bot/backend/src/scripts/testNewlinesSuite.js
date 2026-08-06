const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { Chat, Settings } = require('../models');
const { handleMessage } = require('../services/messageHandler');
const channelManager = require('../services/channelManager');

async function testNewlines() {
  console.log('====================================================');
  console.log('       RUNNING NEWLINE PRESERVATION TEST SUITE      ');
  console.log('====================================================\n');

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ globalMode: 'ai', fallbackContactPhone: '+919257657665' });
    }

    const testPhone = '919999222333';
    await Chat.deleteMany({ customerPhone: testPhone });
    await Chat.create({ customerPhone: testPhone, mode: 'ai' });

    let lastSentText = '';
    channelManager.sendMessageViaChannel = async (jid, text, channel) => {
      const finalText = (text || '')
        .replace(/\\n\\n/g, '\n\n')
        .replace(/\\n/g, '\n')
        .trim();

      lastSentText = finalText;
      const newlineCount = (finalText.match(/\n/g) || []).length;

      console.log('\n[Send:DEBUG] Character breakdown:');
      console.log('Text length:', finalText.length);
      console.log('Newline count:', newlineCount);
      console.log('First 300 chars:\n' + finalText.substring(0, 300));

      return true;
    };

    console.log('\n--- TURN 1: Sending "Group booking 13-15 Aug 4 adults" ---');
    await handleMessage('primary', {
      key: { remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Group booking 13-15 Aug 4 adults" },
      messageTimestamp: Math.floor(Date.now() / 1000)
    }, 'whatsapp-web');

    console.log('\n--- TURN 2: Sending "No kids" ---');
    await handleMessage('primary', {
      key: { remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "No kids" },
      messageTimestamp: Math.floor(Date.now() / 1000) + 10
    }, 'whatsapp-web');

    const newlineCount = (lastSentText.match(/\n/g) || []).length;

    console.log('\n====================================================');
    console.log('               NEWLINE TEST SUMMARY                 ');
    console.log('====================================================');
    console.log(`Sent text length: ${lastSentText.length}`);
    console.log(`Newline count: ${newlineCount}`);
    console.log(`Newline count > 10: ${newlineCount > 10 ? '✅ YES' : '❌ NO'}`);

    if (newlineCount > 10) {
      console.log('✅ [PASS] Message contains preserved, un-cramped line breaks!');
    } else {
      console.log('❌ [FAIL] Message line breaks were stripped or insufficient.');
    }

    await Chat.deleteMany({ customerPhone: testPhone });
    await mongoose.disconnect();
  } catch (err) {
    console.error('Test error:', err);
  }
}

testNewlines();
