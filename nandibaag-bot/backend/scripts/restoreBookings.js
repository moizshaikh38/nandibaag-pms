const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });

async function restore() {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  const localDb = conn.useDb('local');
  const targetDb = conn.useDb('nandibaag-pms');

  // Fetch all insert operations for bookings
  const insertOps = await localDb.collection('oplog.rs').find({
    ns: 'nandibaag-pms.bookings',
    op: 'i'
  }).sort({ ts: 1 }).toArray();

  // Fetch all delete operations for bookings
  const deleteOps = await localDb.collection('oplog.rs').find({
    ns: 'nandibaag-pms.bookings',
    op: 'd'
  }).toArray();
  const deletedIds = new Set(deleteOps.map(d => String(d.o._id)));

  // Fetch all update operations for bookings
  const updateOps = await localDb.collection('oplog.rs').find({
    ns: 'nandibaag-pms.bookings',
    op: 'u'
  }).sort({ ts: 1 }).toArray();

  const bookingsMap = new Map();

  for (const op of insertOps) {
    const doc = op.o;
    const idStr = String(doc._id);
    if (!deletedIds.has(idStr)) {
      bookingsMap.set(idStr, { ...doc });
    }
  }

  // Apply updates
  for (const op of updateOps) {
    const idStr = String(op.o2?._id || op.o?._id);
    if (bookingsMap.has(idStr)) {
      const current = bookingsMap.get(idStr);
      if (op.o?.$v === 2 && op.o?.diff?.u) {
        Object.assign(current, op.o.diff.u);
      } else if (op.o?.$set) {
        Object.assign(current, op.o.$set);
      } else if (op.o && !op.o.$v) {
        Object.assign(current, op.o);
      }
    }
  }

  console.log(`Reconstructed ${bookingsMap.size} bookings from oplog.`);

  const docsToInsert = Array.from(bookingsMap.values());
  for (const doc of docsToInsert) {
    // Ensure _id is MongoDB ObjectId if it's 24 hex chars
    if (typeof doc._id === 'string' && /^[0-9a-fA-F]{24}$/.test(doc._id)) {
      doc._id = new mongoose.Types.ObjectId(doc._id);
    }
    // Re-insert or replace in target collection
    await targetDb.collection('bookings').replaceOne(
      { _id: doc._id },
      doc,
      { upsert: true }
    );
    console.log(`Restored booking: ${doc.customerName} (${doc._id})`);
  }

  const finalCount = await targetDb.collection('bookings').countDocuments();
  console.log(`Successfully restored! Total bookings in DB now: ${finalCount}`);
  process.exit(0);
}

restore().catch(err => { console.error('Error during restore:', err); process.exit(1); });
