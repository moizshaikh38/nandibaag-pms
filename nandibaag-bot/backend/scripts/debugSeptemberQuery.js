const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { Booking } = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models');

async function debug() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Test various date ranges across September
  const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-06', '2026-09-15', '2026-09-26'];

  for (const day of days) {
    const checkIn = new Date(day);
    const checkOut = new Date(new Date(day).getTime() + 86400000);
    const checkInStr = checkIn.toISOString().split('T')[0];

    const activeMainBookings = await Booking.find({
      status: { $in: ['pending_payment', 'confirmed', 'checked_in'] },
      $and: [
        {
          $or: [
            { checkInDate: { $lt: checkOut }, checkOutDate: { $gt: checkIn } },
            { date: checkInStr }
          ]
        },
        {
          $or: [
            { roomIds: { $exists: true, $ne: [] } },
            { roomId: { $exists: true, $ne: null } }
          ]
        }
      ]
    }).select('customerName date checkInDate checkOutDate roomId roomIds').lean();

    console.log(`\nDate: ${day} -> Found ${activeMainBookings.length} matching bookings:`);
    for (const b of activeMainBookings) {
      console.log(`  - ${b.customerName} (date: ${b.date}, in: ${b.checkInDate?.toISOString().slice(0,10)}, out: ${b.checkOutDate?.toISOString().slice(0,10)}), roomIds: ${JSON.stringify(b.roomIds)}`);
    }
  }

  process.exit(0);
}
debug().catch(console.error);
