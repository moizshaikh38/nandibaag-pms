const Room = require('../models/Room');

/**
 * Convert a single room ObjectId to its roomNumber.
 */
const roomIdToNumber = async (roomId) => {
  try {
    if (!roomId) return 'Unknown';

    const room = await Room.findById(roomId).select('roomNumber').lean();
    return room ? room.roomNumber : 'Unknown';
  } catch (error) {
    console.error('[RoomMapper] Error:', error.message);
    return 'Unknown';
  }
};

/**
 * Convert an array of room ObjectIds to their roomNumbers.
 * Returns an array of roomNumber strings in the same order.
 */
const roomIdsToNumbers = async (roomIds) => {
  try {
    if (!roomIds || roomIds.length === 0) return [];

    const rooms = await Room.find({ _id: { $in: roomIds } })
      .select('_id roomNumber')
      .lean();

    // Build a lookup map so we preserve the original order
    const idToNum = {};
    rooms.forEach(r => {
      idToNum[r._id.toString()] = r.roomNumber;
    });

    return roomIds.map(id => idToNum[id.toString()] || 'Unknown');
  } catch (error) {
    console.error('[RoomMapper] Error:', error.message);
    return [];
  }
};

module.exports = {
  roomIdToNumber,
  roomIdsToNumbers
};
