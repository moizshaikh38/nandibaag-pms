const { Room } = require('../models');

async function mapRoomIdsToNumbers(bookings) {
  try {
    const rooms = await Room.find({}).select('roomNumber _id').lean();
    const roomMap = {};
    rooms.forEach(r => roomMap[String(r._id)] = r.roomNumber);

    return bookings.map(b => {
      const obj = b.toObject ? b.toObject() : b;
      if (obj.roomIds && Array.isArray(obj.roomIds)) {
        obj.roomIds = obj.roomIds.map(id => roomMap[String(id)] || id);
      }
      if (obj.roomId) {
        if (typeof obj.roomId === 'string' && obj.roomId.includes(',')) {
          obj.roomId = obj.roomId.split(',').map(s => roomMap[s.trim()] || s.trim()).join(', ');
        } else {
          obj.roomId = roomMap[String(obj.roomId)] || obj.roomId;
        }
      }
      return obj;
    });
  } catch (error) {
    console.error('Error mapping room IDs:', error);
    return bookings;
  }
}

module.exports = { mapRoomIdsToNumbers };
