const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });

async function check() {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  const admin = conn.db.admin();
  const dbs = await admin.listDatabases();

  for (const dbInfo of dbs.databases) {
    const db = conn.useDb(dbInfo.name);
    const collections = await db.db.listCollections().toArray();
    console.log(`=== DB: ${dbInfo.name} ===`);
    for (const c of collections) {
      const count = await db.collection(c.name).countDocuments();
      console.log(`  - ${c.name}: ${count}`);
    }
  }
  process.exit(0);
}
check().catch(err => { console.error('Error:', err); process.exit(1); });
