const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { Booking } = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const bookings = await Booking.find({ customerName: 'Vishnu Sarap' }).lean();
  console.log('Vishnu Sarap Bookings:', bookings.map(b => ({
    id: b._id,
    roomIds: b.roomIds,
    status: b.status,
    checkInDate: b.checkInDate,
    checkOutDate: b.checkOutDate
  })));
  process.exit(0);
}

check().catch(console.error);
