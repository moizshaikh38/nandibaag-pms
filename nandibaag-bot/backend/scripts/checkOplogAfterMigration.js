const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });

async function check() {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  const localDb = conn.useDb('local');
  const oplog = await localDb.collection('oplog.rs').find({
    wall: { $gte: new Date('2026-08-27T07:36:30.000Z') }
  }).sort({ ts: 1 }).toArray();

  console.log('Total ops after migration:', oplog.length);
  for (const op of oplog) {
    if (op.ns.includes('booking') || op.op === 'd' || op.op === 'c' || op.ns.includes('$cmd')) {
      console.log(op.wall, op.op, op.ns, JSON.stringify(op.o));
    }
  }
  process.exit(0);
}
check().catch(err => { console.error('Error:', err); process.exit(1); });
