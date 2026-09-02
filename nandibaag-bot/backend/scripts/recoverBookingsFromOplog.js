const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });

async function recover() {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  const localDb = conn.useDb('local');
  const targetDb = conn.useDb('nandibaag-pms');

  // Find all insert operations for nandibaag-pms.bookings
  const insertOps = await localDb.collection('oplog.rs').find({
    ns: 'nandibaag-pms.bookings',
    op: 'i'
  }).sort({ ts: 1 }).toArray();

  console.log(`Found ${insertOps.length} insert operations in oplog.`);

  // Find all delete operations
  const deleteOps = await localDb.collection('oplog.rs').find({
    ns: 'nandibaag-pms.bookings',
    op: 'd'
  }).toArray();
  const deletedIds = new Set(deleteOps.map(d => String(d.o._id)));
  console.log(`Found ${deleteOps.length} delete operations in oplog.`);

  // Map of latest documents by ID
  const bookingsMap = new Map();

  for (const op of insertOps) {
    const doc = op.o;
    const idStr = String(doc._id);
    if (!deletedIds.has(idStr)) {
      bookingsMap.set(idStr, doc);
    }
  }

  console.log(`Active (non-deleted) bookings count: ${bookingsMap.size}`);
  for (const [id, doc] of bookingsMap.entries()) {
    console.log(`- ${id}: ${doc.customerName} (${doc.date || doc.checkInDate}), Room(s): ${doc.roomId || doc.roomIds}, Total: ₹${doc.totalAmount}`);
  }

  process.exit(0);
}
recover().catch(err => { console.error('Error:', err); process.exit(1); });
