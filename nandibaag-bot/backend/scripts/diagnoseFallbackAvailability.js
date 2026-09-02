const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { Room, Booking, RoomBooking } = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models');
const RoomMaintenance = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models/RoomMaintenance');

async function testFallback() {
  await mongoose.connect(process.env.MONGODB_URI);

  const checkIn = new Date('2026-09-02');
  const checkOut = new Date('2026-09-03');

  let allRooms = await Room.find({ status: { $ne: 'deleted' } })
    .populate('seriesId', 'name')
    .lean();

  console.log('Testing /api/rooms/availability query logic for 2026-09-02...');

  const conflictRooms = [];

  for (const room of allRooms) {
    const identifier = String(room.number || room.roomNumber || room._id);

    const bookingConflict = await Booking.findOne({
      $or: [
        { roomIds: identifier },
        { roomId: identifier },
        { roomIds: String(room._id) },
        { roomId: String(room._id) }
      ],
      checkInDate: { $lt: checkOut },
      checkOutDate: { $gt: checkIn },
      status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }
    });

    if (bookingConflict) {
      conflictRooms.push({
        roomNumber: room.roomNumber,
        series: room.seriesId?.name,
        conflictWith: bookingConflict.customerName,
        bookingCheckIn: bookingConflict.checkInDate,
        bookingCheckOut: bookingConflict.checkOutDate
      });
    }
  }

  console.log('Conflicts found by /api/rooms/availability:', conflictRooms);

  process.exit(0);
}
testFallback().catch(console.error);
