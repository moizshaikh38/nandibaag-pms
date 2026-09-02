const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { Booking } = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models');

async function checkRaw() {
  const client = await mongoose.connect(process.env.MONGODB_URI);
  const db = client.connection.db;
  const docs = await db.collection('bookings').find({ customerName: { $in: ['Akshata', 'Kubernath gupta'] } }).toArray();

  for (const b of docs) {
    console.log(b.customerName, {
      date: b.date,
      dateType: typeof b.date,
      checkInDate: b.checkInDate,
      checkInType: typeof b.checkInDate,
      checkInIsDate: b.checkInDate instanceof Date,
      checkOutDate: b.checkOutDate,
      checkOutType: typeof b.checkOutDate,
      checkOutIsDate: b.checkOutDate instanceof Date
    });
  }
  process.exit(0);
}
checkRaw().catch(console.error);
