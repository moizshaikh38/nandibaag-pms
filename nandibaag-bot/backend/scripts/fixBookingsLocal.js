const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { Booking, RoomBooking } = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  
  const bookings = await Booking.find({});
  let skippedNoArray = 0;
  let needsUpdateCount = 0;
  let hasRbs = 0;

  for (const booking of bookings) {
    if (!Array.isArray(booking.roomIds)) {
      skippedNoArray++;
      continue;
    }

    let needsUpdate = false;
    for (const rId of booking.roomIds) {
      if (!mongoose.Types.ObjectId.isValid(rId)) {
        needsUpdate = true;
        break;
      }
    }

    if (needsUpdate || booking.roomIds.length === 0) {
      needsUpdateCount++;
      const rbs = await RoomBooking.find({ bookingId: booking._id });
      if (rbs.length > 0) {
        hasRbs++;
      } else {
        console.log(`Booking ${booking._id} (${booking.customerName}) needs update but HAS NO RoomBookings. Current roomIds:`, booking.roomIds);
      }
    }
  }

  console.log(`Total: ${bookings.length}, skipped (no array): ${skippedNoArray}, needs update: ${needsUpdateCount}, has RoomBookings: ${hasRbs}`);
  process.exit(0);
}

check().catch(console.error);
