const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { Room, Series, RoomBooking, Booking } = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models');
const RoomMaintenance = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models/RoomMaintenance');

async function testGridForDates() {
  await mongoose.connect(process.env.MONGODB_URI);

  const testDates = [
    { name: 'Sakshi kothari (104,105,106)', checkIn: '2026-08-24', checkOut: '2026-08-25', expectedRooms: ['104', '105', '106'] },
    { name: 'Vishnu Sarap (503)', checkIn: '2026-08-28', checkOut: '2026-08-29', expectedRooms: ['503'] },
    { name: 'Rajkumar saboo (515)', checkIn: '2026-08-31', checkOut: '2026-09-01', expectedRooms: ['515'] },
    { name: 'bankim Parmar (511,512)', checkIn: '2026-09-02', checkOut: '2026-09-03', expectedRooms: ['511', '512'] },
    { name: 'Akshata (109)', checkIn: '2026-09-06', checkOut: '2026-09-07', expectedRooms: ['109'] },
    { name: 'Kubernath gupta (501,502,503,504)', checkIn: '2026-09-26', checkOut: '2026-09-27', expectedRooms: ['501', '502', '503', '504'] }
  ];

  const series = await Series.find({ status: 'active' }).sort({ name: 1 });
  const rooms = await Room.find({ 
    seriesId: { $in: series.map(s => s._id) }
  }).populate('seriesId', 'name status').sort({ 'seriesId.name': 1, roomNumber: 1 });

  console.log('Total active series:', series.length, 'Total rooms in grid:', rooms.length);

  for (const t of testDates) {
    const checkInObj = new Date(t.checkIn);
    const checkOutObj = new Date(t.checkOut);

    const overlappingMaintenance = await RoomMaintenance.find({
      status: 'active',
      startDate: { $lt: checkOutObj },
      endDate: { $gt: checkInObj }
    }).lean();

    const maintenanceMap = {};
    overlappingMaintenance.forEach(m => {
      maintenanceMap[String(m.roomId)] = m;
    });

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

    console.log(`\n======================================================`);
    console.log(`Testing Date: ${t.checkIn} to ${t.checkOut} (${t.name})`);
    console.log(`Active Main Bookings in DB for this date range: ${activeMainBookings.length}`);
    activeMainBookings.forEach(b => console.log(`  -> Booking: ${b.customerName}, checkIn: ${b.checkInDate}, checkOut: ${b.checkOutDate}, roomIds: ${JSON.stringify(b.roomIds)}`));

    // Check status for each expected room
    for (const expRoomNum of t.expectedRooms) {
      const targetRoom = rooms.find(r => String(r.roomNumber) === expRoomNum);
      if (!targetRoom) {
        console.log(`  [x] Room ${expRoomNum} NOT FOUND in active rooms!`);
        continue;
      }
      const roomIdStr = targetRoom._id.toString();
      const roomNumStr = String(targetRoom.roomNumber);

      const isMaintenance = !!(maintenanceMap[roomIdStr] || maintenanceMap[roomNumStr]);
      const bookObj = bookingMap[roomIdStr] || bookingMap[roomNumStr];
      const status = isMaintenance ? 'maintenance' : (bookObj ? 'booked' : 'available');

      console.log(`  Result for Room ${expRoomNum} (${targetRoom.seriesId?.name}): [${status.toUpperCase()}] ${bookObj ? '(Booked by: ' + bookObj.customerName + ')' : ''}`);
    }
  }
  process.exit(0);
}
testGridForDates().catch(console.error);
