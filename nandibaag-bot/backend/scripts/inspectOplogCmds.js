const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });

async function check() {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  const localDb = conn.useDb('local');
  const ops = await localDb.collection('oplog.rs').find({
    ns: { $in: ['nandibaag-pms.$cmd', 'admin.$cmd', 'test.$cmd'] }
  }).sort({ ts: -1 }).limit(20).toArray();

  console.log('Commands count:', ops.length);
  for (const op of ops) {
    console.log(op.wall, op.op, op.ns, JSON.stringify(op.o));
  }
  process.exit(0);
}
check().catch(err => { console.error('Error:', err); process.exit(1); });
