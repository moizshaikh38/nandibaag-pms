const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { Room, Series, RoomBooking, Booking } = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models');
const RoomMaintenance = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models/RoomMaintenance');

async function checkSep2() {
  await mongoose.connect(process.env.MONGODB_URI);

  const checkInDate = '2026-09-02';
  const checkOutDate = '2026-09-03';
  const checkInObj = new Date(checkInDate);
  const checkOutObj = new Date(checkOutDate);

  console.log('--- 1. All Bookings in DB with 2026-09-02 ---');
  const allB = await Booking.find({
    $or: [
      { checkInDate: { $lte: new Date('2026-09-02T23:59:59.999Z') }, checkOutDate: { $gte: new Date('2026-09-02T00:00:00.000Z') } },
      { date: '2026-09-02' }
    ]
  }).lean();

  for (const b of allB) {
    console.log(JSON.stringify({
      id: b._id,
      customerName: b.customerName,
      date: b.date,
      checkInDate: b.checkInDate,
      checkOutDate: b.checkOutDate,
      roomIds: b.roomIds,
      roomId: b.roomId,
      status: b.status
    }, null, 2));
  }

  console.log('\n--- 2. Room IDs in 500 Series vs Bankim Parmar ---');
  const rooms500 = await Room.find({ roomNumber: { $in: ['511', '512', '112'] } }).populate('seriesId', 'name').lean();
  for (const r of rooms500) {
    console.log(`Room ${r.roomNumber} (${r.seriesId?.name}) -> _id: ${r._id}`);
  }

  console.log('\n--- 3. Exact Grid Output for 2 Sep 2026 ---');
  const series = await Series.find({ status: 'active' }).sort({ name: 1 });
  const rooms = await Room.find({ 
    seriesId: { $in: series.map(s => s._id) }
  }).populate('seriesId', 'name status').sort({ 'seriesId.name': 1, roomNumber: 1 });

  const overlappingBookings = await RoomBooking.find({
    status: { $in: ['confirmed', 'checked_in'] },
    checkInDate: { $lt: checkOutObj },
    checkOutDate: { $gt: checkInObj }
  }).populate('bookingId', 'customerName customerPhone');

  const activeMainBookings = await Booking.find({
    status: { $in: ['pending_payment', 'confirmed', 'checked_in'] },
    checkInDate: { $lt: checkOutObj },
    checkOutDate: { $gt: checkInObj }
  }).lean();

  const bookingMap = {};
  overlappingBookings.forEach(rb => {
    bookingMap[rb.roomId.toString()] = {
      bookingId: rb.bookingId?._id || rb.bookingId,
      customerName: rb.bookingId?.customerName || 'Guest',
      status: rb.status
    };
  });

  activeMainBookings.forEach(b => {
    const ids = Array.isArray(b.roomIds) ? b.roomIds : [b.roomId];
    ids.forEach(id => {
      if (id) {
        bookingMap[String(id)] = {
          bookingId: b._id,
          customerName: b.customerName || 'Guest',
          status: b.status
        };
      }
    });
  });

  const bookedRooms = [];
  const availableRooms = [];

  for (const room of rooms) {
    const roomIdStr = room._id.toString();
    const roomNumStr = String(room.roomNumber);
    const bookObj = bookingMap[roomIdStr] || bookingMap[roomNumStr];
    if (bookObj) {
      bookedRooms.push({
        roomNumber: room.roomNumber,
        series: room.seriesId?.name,
        bookedBy: bookObj.customerName
      });
    } else {
      availableRooms.push({
        roomNumber: room.roomNumber,
        series: room.seriesId?.name
      });
    }
  }

  console.log('Booked rooms on 2 Sep 2026:', JSON.stringify(bookedRooms, null, 2));
  console.log(`Total Booked: ${bookedRooms.length}, Total Available: ${availableRooms.length}`);

  process.exit(0);
}
checkSep2().catch(console.error);
