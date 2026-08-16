require('dotenv').config({ path: __dirname + '/../../.env' });
const mongoose = require('mongoose');

async function testAvailabilitySync() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected.');

  const { Room, Booking, RoomBooking, RoomMaintenance, Series } = require('../models');
  const { getRoomsWithReservationStatus, getDetailedAvailability } = require('../services/availabilityService');

  const testDates = [
    { in: '2026-08-15', out: '2026-08-16' },
    { in: '2026-08-20', out: '2026-08-21' },
    { in: '2026-09-01', out: '2026-09-02' }
  ];

  console.log('\n=== TESTING AVAILABILITY SYNC ACROSS DATES ===');
  for (const d of testDates) {
    const rooms = await getRoomsWithReservationStatus(d.in, d.out);
    const availableCount = rooms.filter(r => r.status === 'available').length;
    const bookedCount = rooms.filter(r => r.status === 'booked').length;
    const maintenanceCount = rooms.filter(r => r.status === 'maintenance').length;
    console.log(`📅 Date: ${d.in} ➔ ${d.out} | Total: ${rooms.length} | Available: ${availableCount} | Booked: ${bookedCount} | Maintenance: ${maintenanceCount}`);
  }

  await mongoose.disconnect();
  console.log('\n🎉 Test completed successfully!');
}

testAvailabilitySync().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
