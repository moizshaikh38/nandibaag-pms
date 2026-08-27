const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });
const { Booking, RoomBooking } = require('../models');

async function fixBookings() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  
  const bookings = await Booking.find({});
  let updatedCount = 0;

  for (const booking of bookings) {
    let needsUpdate = false;
    let newRoomIds = [];

    // Check if any roomId in roomIds is not a valid ObjectId
    for (const rId of booking.roomIds) {
      if (!mongoose.Types.ObjectId.isValid(rId)) {
        needsUpdate = true;
        break;
      }
    }

    if (needsUpdate || booking.roomIds.length === 0) {
      // Find RoomBookings for this booking
      const rbs = await RoomBooking.find({ bookingId: booking._id });
      if (rbs.length > 0) {
        newRoomIds = rbs.map(rb => rb.roomId.toString());
        
        // Ensure uniqueness
        newRoomIds = [...new Set(newRoomIds)];
        
        if (JSON.stringify(booking.roomIds) !== JSON.stringify(newRoomIds)) {
          console.log(`Booking ${booking._id} (customer: ${booking.customerName}) roomIds updated from ${JSON.stringify(booking.roomIds)} to ${JSON.stringify(newRoomIds)}`);
          booking.roomIds = newRoomIds;
          booking.roomId = newRoomIds.join(', ');
          await booking.save();
          updatedCount++;
        }
      }
    }
  }

  console.log(`Finished. Updated ${updatedCount} bookings.`);
  process.exit(0);
}

fixBookings().catch(console.error);
