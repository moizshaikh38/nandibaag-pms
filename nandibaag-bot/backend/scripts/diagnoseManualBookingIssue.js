const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { getRoomsWithReservationStatus } = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/services/availabilityService');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);

  const datesToTest = [
    { checkIn: '2026-09-02', checkOut: '2026-09-03' },
    { checkIn: '2026-09-10', checkOut: '2026-09-11' },
    { checkIn: '2026-09-15', checkOut: '2026-09-16' }
  ];

  for (const d of datesToTest) {
    console.log(`\n======================================================`);
    console.log(`Testing Manual Booking Availability for: ${d.checkIn} to ${d.checkOut}`);
    const rooms = await getRoomsWithReservationStatus(d.checkIn, d.checkOut);

    const bookedRooms = rooms.filter(r => r.status === 'booked');
    console.log(`Total rooms booked: ${bookedRooms.length}`);
    for (const br of bookedRooms) {
      console.log(`  -> Room ${br.roomNumber} (${br.seriesName}): status = ${br.status}, bookedBy = ${br.bookedBy}`);
    }
  }

  process.exit(0);
}
test().catch(console.error);
