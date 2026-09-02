const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { Booking } = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models');

async function checkToday() {
  await mongoose.connect(process.env.MONGODB_URI);
  const todayStart = new Date('2026-08-27T00:00:00.000Z');
  const todayEnd = new Date('2026-08-28T00:00:00.000Z');

  const bookings = await Booking.find({
    status: { $in: ['pending_payment', 'confirmed', 'checked_in'] },
    checkInDate: { $lt: todayEnd },
    checkOutDate: { $gt: todayStart }
  }).lean();

  console.log('Bookings overlapping Today (27 Aug 2026):', bookings.length);
  for (const b of bookings) {
    console.log(`- ${b.customerName} (${b.checkInDate} to ${b.checkOutDate}), roomIds:`, b.roomIds);
  }
  process.exit(0);
}
checkToday().catch(console.error);
