const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });

async function check() {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  const localDb = conn.useDb('local');
  const oplog = await localDb.collection('oplog.rs').find({
    $or: [
      { ns: /^nandibaag-pms\.bookings/ },
      { ns: 'nandibaag-pms.$cmd' }
    ]
  }).sort({ ts: -1 }).limit(30).toArray();

  for (const op of oplog) {
    console.log(op.wall, op.op, op.ns, JSON.stringify(op.o));
  }
  process.exit(0);
}
check().catch(err => { console.error('Error:', err); process.exit(1); });
