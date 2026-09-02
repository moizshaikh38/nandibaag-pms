const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { Room, Series } = require('/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/src/models');

async function checkRooms() {
  await mongoose.connect(process.env.MONGODB_URI);
  const rooms = await Room.find({ status: { $ne: 'deleted' } }).populate('seriesId').sort({ roomNumber: 1 }).lean();
  console.log('Total rooms:', rooms.length);
  const seriesGroups = {};
  for (const r of rooms) {
    const sName = r.seriesId?.name || 'Unknown';
    if (!seriesGroups[sName]) seriesGroups[sName] = [];
    seriesGroups[sName].push({ id: r._id, num: r.roomNumber });
  }
  for (const [s, rms] of Object.entries(seriesGroups)) {
    console.log(`Series: ${s} (${rms.length} rooms) -> ${rms.map(x => x.num).join(', ')}`);
  }
  process.exit(0);
}
checkRooms().catch(console.error);
