require('dotenv').config({ path: __dirname + '/../../.env' });
const mongoose = require('mongoose');

async function cleanHistory() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI is missing in .env');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB Atlas...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const targetCollections = [
    'chats',
    'bookings',
    'roombookings',
    'roomreservations',
    'leads',
    'followups',
    'messagelogs',
    'failedmessages',
    'messagequeues',
    'activitylogs'
  ];

  console.log('\n📊 RECORD COUNTS BEFORE CLEANUP:');
  const results = {};
  for (const name of targetCollections) {
    try {
      const count = await db.collection(name).countDocuments();
      results[name] = count;
      console.log(` - ${name}: ${count} records`);
    } catch (e) {
      results[name] = 0;
      console.log(` - ${name}: 0 records`);
    }
  }

  console.log('\n🧹 DELETING ALL CHATS, MESSAGES, AND BOOKING HISTORY...');
  for (const name of targetCollections) {
    try {
      const res = await db.collection(name).deleteMany({});
      console.log(` ✅ Cleared ${name}: Deleted ${res.deletedCount} items.`);
    } catch (e) {
      console.error(` ⚠️ Failed clearing ${name}:`, e.message);
    }
  }

  console.log('\n🎉 CLEANUP COMPLETE! Starting a fresh journey.');
  await mongoose.disconnect();
}

cleanHistory().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
