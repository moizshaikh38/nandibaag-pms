const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { Chat, FollowUp, Lead, Settings } = require('../models');
const { handleMessage } = require('../services/messageHandler');
const { runFollowUpJob } = require('../services/followUpCron');
const channelManager = require('../services/channelManager');

async function runTest() {
  console.log('====================================================');
  console.log('       RUNNING FOLLOW-UP & HOT LEADS TEST SUITE     ');
  console.log('====================================================\n');

  try {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    } catch (_) {
      await mongoose.connect('mongodb://127.0.0.1:27017/nandibaag-pms-test', { serverSelectionTimeoutMS: 3000 });
    }

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ globalMode: 'ai', followUpEnabled: true, fallbackContactPhone: '+919257657665' });
    } else if (!settings.followUpEnabled) {
      settings.followUpEnabled = true;
      await settings.save();
    }

    const testPhone = '917219311866';

    // Cleanup previous test data
    const existingChat = await Chat.findOne({ customerPhone: testPhone });
    if (existingChat) {
      await FollowUp.deleteMany({ chatId: existingChat._id });
      await Lead.deleteMany({ chatId: existingChat._id });
      await Chat.deleteMany({ customerPhone: testPhone });
    }

    // Pre-create chat explicitly in AI mode
    await Chat.create({ customerPhone: testPhone, mode: 'ai' });

    channelManager.sendMessageViaChannel = async () => true;

    console.log('--- STEP 1: Sending message "Hi, 15 Aug couple booking" ---');

    await handleMessage('primary', {
      key: { remoteJid: `${testPhone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Hi, 15 Aug couple booking" },
      messageTimestamp: Math.floor(Date.now() / 1000)
    }, 'whatsapp-web');

    const createdChat = await Chat.findOne({ customerPhone: testPhone });
    console.log('\nChat document found:', Boolean(createdChat));

    if (createdChat) {
      const followUps = await FollowUp.find({ chatId: createdChat._id }).lean();
      console.log('\n--- STEP 2: Checking FollowUp Documents in DB ---');
      console.log('Pending FollowUps count:', followUps.length);
      console.log('Stages scheduled:', followUps.map(f => ({ stage: f.stage, status: f.status, scheduledFor: f.scheduledFor })));

      const lead = await Lead.findOne({ chatId: createdChat._id }).lean();
      console.log('\n--- STEP 3: Checking Lead Document in DB ---');
      console.log('Lead score:', lead?.score);
      console.log('Lead status:', lead?.status);
      console.log('Score factors:', lead?.scoreFactors?.map(s => s.factor));

      console.log('\n--- STEP 4: Running FollowUp Cron Job Check ---');
      await runFollowUpJob();

      console.log('\n====================================================');
      console.log('                 TEST SUITE SUMMARY                 ');
      console.log('====================================================');
      console.log(`FollowUp documents count > 0: ${followUps.length > 0 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`Lead document created: ${lead ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`Lead score: ${lead?.score} (Status: ${lead?.status})`);

      // Cleanup test data
      await FollowUp.deleteMany({ chatId: createdChat._id });
      await Lead.deleteMany({ chatId: createdChat._id });
      await Chat.deleteMany({ customerPhone: testPhone });
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Test error:', err);
  }
}

runTest();
