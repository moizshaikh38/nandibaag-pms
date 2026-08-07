const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { Chat, Settings } = require('../models');
const { handleMessage } = require('../services/messageHandler');
const channelManager = require('../services/channelManager');

async function runTest() {
  console.log('====================================================');
  console.log('      RUNNING MEDIA ACKNOWLEDGMENT TEST SUITE      ');
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

    const testPhone = '918888777666';
    await Chat.deleteMany({ customerPhone: testPhone });
    await Chat.create({ customerPhone: testPhone, mode: 'ai' });

    let lastSentText = '';
    channelManager.sendMessageViaChannel = async (jid, text) => {
      lastSentText = (text || '').trim();
      return true;
    };

    console.log('--- TEST 1: Customer sends photo (NO caption) ---');
    await handleMessage('primary', {
      key: { id: 'media_test_1', remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { imageMessage: { url: 'https://example.com/photo.jpg' } },
      messageTimestamp: Math.floor(Date.now() / 1000)
    }, 'whatsapp-web');

    const pass1 = lastSentText.includes('📸 Photo mil gayi!');
    console.log('Bot Reply:', lastSentText);
    console.log(`TEST 1 RESULT: ${pass1 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 2: Customer sends photo WITH caption ("15 Aug couple booking") ---');
    await handleMessage('primary', {
      key: { id: 'media_test_2', remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { imageMessage: { url: 'https://example.com/photo.jpg', caption: '15 Aug couple booking' } },
      messageTimestamp: Math.floor(Date.now() / 1000) + 5
    }, 'whatsapp-web');

    const pass2 = !lastSentText.includes('mil gayi') && (lastSentText.includes('BOOKING') || lastSentText.includes('pricing') || lastSentText.includes('kids') || lastSentText.includes('available'));
    console.log('Bot Reply:', lastSentText.slice(0, 100) + '...');
    console.log(`TEST 2 RESULT: ${pass2 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 3: Customer sends PDF (NO caption) ---');
    await handleMessage('primary', {
      key: { id: 'media_test_3', remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { documentMessage: { url: 'https://example.com/voucher.pdf' } },
      messageTimestamp: Math.floor(Date.now() / 1000) + 10
    }, 'whatsapp-web');

    const pass3 = lastSentText.includes('📄 Document mil gayi!');
    console.log('Bot Reply:', lastSentText);
    console.log(`TEST 3 RESULT: ${pass3 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 4: Customer sends audio / voice note (NO caption) ---');
    await handleMessage('primary', {
      key: { id: 'media_test_4', remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { url: 'https://example.com/voice.ogg' } },
      messageTimestamp: Math.floor(Date.now() / 1000) + 15
    }, 'whatsapp-web');

    const pass4 = lastSentText.includes('🎙️ Voice note mil gayi!');
    console.log('Bot Reply:', lastSentText);
    console.log(`TEST 4 RESULT: ${pass4 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('--- TEST 5: Customer sends video (NO caption) ---');
    await handleMessage('primary', {
      key: { id: 'media_test_5', remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { videoMessage: { url: 'https://example.com/video.mp4' } },
      messageTimestamp: Math.floor(Date.now() / 1000) + 20
    }, 'whatsapp-web');

    const pass5 = lastSentText.includes('🎥 Video mil gayi!');
    console.log('Bot Reply:', lastSentText);
    console.log(`TEST 5 RESULT: ${pass5 ? '✅ PASS' : '❌ FAIL'}\n`);

    console.log('====================================================');
    console.log('                 SUMMARY OF TESTS                   ');
    console.log('====================================================');
    console.log(`TEST 1 (Photo NO caption): ${pass1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 2 (Photo WITH caption): ${pass2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 3 (PDF NO caption): ${pass3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 4 (Voice note NO caption): ${pass4 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TEST 5 (Video NO caption): ${pass5 ? '✅ PASS' : '❌ FAIL'}`);

    await Chat.deleteMany({ customerPhone: testPhone });
    await mongoose.disconnect();
  } catch (err) {
    console.error('Test error:', err);
  }
}

runTest();
