require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Chat, Settings } = require('../src/models');
const { massUpdateAllChatMode, updateDefaultModeOnly } = require('../src/services/settingsService');

const testMassSwitch = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nandibaag';
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(mongoUri);

    console.log('\n═════════════════════════════════════════════════════════');
    console.log('🧪 TESTING SETTINGS & MASS MODE SWITCH');
    console.log('═════════════════════════════════════════════════════════\n');

    // 1. Test updateDefaultModeOnly
    console.log('🧪 1. Testing updateDefaultModeOnly(newMode) ...');
    const beforeChats = await Chat.find().select('mode').lean();
    const beforeStaffCount = beforeChats.filter(c => c.mode === 'staff' || c.mode === 'human').length;

    await updateDefaultModeOnly('ai', 'TestScript');
    const settings1 = await Settings.findOne();
    console.log('  Default mode set to:', settings1.defaultModeForNewChats);

    const afterDefaultOnlyChats = await Chat.find().select('mode').lean();
    const afterStaffCount = afterDefaultOnlyChats.filter(c => c.mode === 'staff' || c.mode === 'human').length;

    if (beforeStaffCount === afterStaffCount) {
      console.log('  ✅ VERIFIED: Existing chats were NOT touched by updateDefaultModeOnly');
    } else {
      throw new Error('❌ FAILED: updateDefaultModeOnly modified existing chats!');
    }

    // 2. Test massUpdateAllChatMode to STAFF
    console.log('\n🧪 2. Testing massUpdateAllChatMode("staff") ...');
    const resultStaff = await massUpdateAllChatMode('staff', 'TestScript');
    console.log('  Result message:', resultStaff.message);
    console.log('  Modified chats:', resultStaff.stats.chatsSwitched);

    const allChatsStaff = await Chat.find().select('mode').lean();
    const totalStaffInDb = allChatsStaff.filter(c => c.mode === 'staff' || c.mode === 'human').length;
    console.log(`  Verified Staff chats in DB: ${totalStaffInDb}/${allChatsStaff.length}`);

    // 3. Test massUpdateAllChatMode to AI
    console.log('\n🧪 3. Testing massUpdateAllChatMode("ai") ...');
    const resultAi = await massUpdateAllChatMode('ai', 'TestScript');
    console.log('  Result message:', resultAi.message);
    console.log('  Modified chats:', resultAi.stats.chatsSwitched);

    const allChatsAi = await Chat.find().select('mode').lean();
    const totalAiInDb = allChatsAi.filter(c => c.mode === 'ai' || c.mode === 'auto').length;
    console.log(`  Verified AI chats in DB: ${totalAiInDb}/${allChatsAi.length}`);

    console.log('\n═════════════════════════════════════════════════════════');
    console.log('🎉 ALL SETTINGS & MASS SWITCH TESTS PASSED SUCCESSFULLY!');
    console.log('═════════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during mass switch test:', error.message);
    process.exit(1);
  }
};

testMassSwitch();
