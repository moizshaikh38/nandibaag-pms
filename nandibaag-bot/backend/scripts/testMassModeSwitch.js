require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Chat, Settings } = require('../src/models');
const { massUpdateAllChatMode } = require('../src/services/settingsService');

const testMassSwitch = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nandibaag';
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(mongoUri);

    console.log('\n═════════════════════════════════════════════════════════');
    console.log('🧪 TESTING MASS MODE SWITCH (PAST + FUTURE CHATS)');
    console.log('═════════════════════════════════════════════════════════\n');

    // Show before state
    const before = await Chat.find().select('mode').lean();
    const aiCount = before.filter(c => c.mode === 'ai' || c.mode === 'auto').length;
    const staffCount = before.filter(c => c.mode === 'staff' || c.mode === 'human').length;

    console.log('BEFORE:');
    console.log('  AI Chats:', aiCount);
    console.log('  Staff/Human Chats:', staffCount);
    console.log('  Total Chats:', before.length);

    // Mass update to STAFF
    console.log('\n🔄 Executing mass switch to STAFF mode...');
    const resultStaff = await massUpdateAllChatMode('staff', 'TestScript', 'Automated test mass switch to staff');

    console.log('\n✅ RESULT (Staff Mode):');
    console.log('  Message:', resultStaff.message);
    console.log('  Modified Chats:', resultStaff.stats.modifiedChats);
    console.log('  Default Mode For New Chats:', (await Settings.findOne())?.defaultModeForNewChats);

    // Verify after state
    const afterStaff = await Chat.find().select('mode').lean();
    const staffCountAfter = afterStaff.filter(c => c.mode === 'staff' || c.mode === 'human').length;
    console.log('  Verified Staff/Human Chats in DB:', staffCountAfter);

    // Mass update back to AI
    console.log('\n🔄 Executing mass switch back to AI mode...');
    const resultAi = await massUpdateAllChatMode('ai', 'TestScript', 'Automated test mass switch to AI');

    console.log('\n✅ RESULT (AI Mode):');
    console.log('  Message:', resultAi.message);
    console.log('  Modified Chats:', resultAi.stats.modifiedChats);
    console.log('  Default Mode For New Chats:', (await Settings.findOne())?.defaultModeForNewChats);

    const afterAi = await Chat.find().select('mode').lean();
    const aiCountAfter = afterAi.filter(c => c.mode === 'ai' || c.mode === 'auto').length;
    console.log('  Verified AI Chats in DB:', aiCountAfter);

    console.log('\n═════════════════════════════════════════════════════════');
    console.log('🎉 ALL MASS MODE SWITCH TESTS PASSED SUCCESSFULLY!');
    console.log('═════════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during mass switch test:', error.message);
    process.exit(1);
  }
};

testMassSwitch();
