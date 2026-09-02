const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });

async function check() {
  const client = await mongoose.connect(process.env.MONGODB_URI);
  const db = client.connection.db;
  console.log('Connected DB Name:', db.databaseName);
  const collections = await db.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));

  const allBookings = await db.collection('bookings').find({}).toArray();
  console.log('Total bookings in', db.databaseName, ':', allBookings.length);
  for (const b of allBookings) {
    console.log('Booking:', b._id, b.customerName, b.date, b.roomIds, b.status);
  }
  process.exit(0);
}
check().catch(err => { console.error('Error:', err); process.exit(1); });
