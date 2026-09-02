const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { RoomReservation } = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const res = await RoomReservation.find({}).lean();
  console.log('Total RoomReservation in DB:', res.length);
  for (const r of res) {
    console.log(r);
  }
  process.exit(0);
}
check().catch(console.error);
