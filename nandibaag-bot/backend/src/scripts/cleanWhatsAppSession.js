require('dotenv').config();
const connectDB = require('../config/db');
const BaileysAuth = require('../models/BaileysAuth');
const Settings = require('../models/Settings');

async function cleanAllSessions() {
  console.log('====================================================');
  console.log('   WIPING STALE BAILEYS SESSIONS FOR FRESH QR       ');
  console.log('====================================================\n');

  try {
    await connectDB();

    console.log('1. Clearing BaileysAuth collection in MongoDB Atlas...');
    const deletedAuth = await BaileysAuth.deleteMany({});
    console.log(`   ✓ Deleted ${deletedAuth.deletedCount} auth records.`);

    console.log('2. Resetting whatsappNumbers in Settings model...');
    const settings = await Settings.findOne();
    if (settings) {
      settings.whatsappNumbers = [];
      await settings.save();
      console.log('   ✓ Cleared whatsappNumbers array.');
    }

    console.log('\n✅ ALL STALE SESSIONS WIPED SUCCESSFULLY!');
    console.log('Now click "Connect" or "Add Number" on the dashboard, and a FRESH QR CODE will be emitted instantly!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error cleaning sessions:', error.message);
    process.exit(1);
  }
}

cleanAllSessions();