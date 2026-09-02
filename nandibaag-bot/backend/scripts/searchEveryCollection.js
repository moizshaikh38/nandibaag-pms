const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });

async function check() {
  const client = await mongoose.connect(process.env.MONGODB_URI);
  const db = client.connection.db;
  const collections = await db.listCollections().toArray();

  for (const col of collections) {
    const sample = await db.collection(col.name).findOne({ customerName: { $exists: true } });
    const count = await db.collection(col.name).countDocuments();
    if (sample || count > 0) {
      console.log(`Collection: ${col.name} (count: ${count}), has customerName: ${!!sample}`);
      if (sample) {
        console.log(`  Sample:`, sample.customerName, sample._id);
      }
    }
  }
  process.exit(0);
}
check().catch(err => { console.error('Error:', err); process.exit(1); });
