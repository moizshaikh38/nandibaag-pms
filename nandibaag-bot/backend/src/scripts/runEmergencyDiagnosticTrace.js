const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { Chat, Settings } = require('../models');
const { handleMessage } = require('../services/messageHandler');
const channelManager = require('../services/channelManager');

async function testDiagnosticTrace() {
  console.log('====================================================');
  console.log('   RUNNING EMERGENCY PIPELINE DIAGNOSTIC TRACE     ');
  console.log('====================================================\n');

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('[STEP 1] Connected to DB.');

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ globalMode: 'ai', fallbackContactPhone: '+919257657665' });
    }

    const testPhone = '919999111222';
    await Chat.deleteMany({ customerPhone: testPhone });
    await Chat.create({ customerPhone: testPhone, mode: 'ai' });

    let sendCaptured = false;
    channelManager.sendMessageViaChannel = async (jid, text, channel) => {
      console.log('[Send:ENTRY] Sending message');
      console.log('[Send:ENTRY] Channel:', channel);
      console.log('[Send:ENTRY] To:', jid);
      console.log('[Send:ENTRY] Text length:', text?.length);
      console.log('[Send:SUCCESS] Message sent via test mock');
      sendCaptured = true;
      return true;
    };

    console.log('\n[TESTING STAGE 1-4 TRACE] Sending test message: "Hi test"\n');

    const testMsg = {
      key: { remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Hi test" },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    await handleMessage('primary', testMsg, 'whatsapp-web');

    console.log('\n====================================================');
    console.log('         EMERGENCY PIPELINE TRACE COMPLETE          ');
    console.log('====================================================');
    console.log('Captured Send:', sendCaptured ? '✅ YES' : '❌ NO');

    await Chat.deleteMany({ customerPhone: testPhone });
    await mongoose.disconnect();
  } catch (err) {
    console.error('Diagnostic error:', err);
  }
}

testDiagnosticTrace();
