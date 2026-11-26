/**
 * Database-Enforced Room-Night Lock Service
 *
 * Prevents concurrent double-booking of the same room on overlapping nights
 * using a unique compound index { roomId: 1, night: 1 } in MongoDB.
 */

const RoomNightLock = require('../models/RoomNightLock');
const { toISTDateString } = require('../utils/dateHelper');

class RoomConflictError extends Error {
  constructor(message = 'Selected room(s) are already booked for the requested dates', statusCode = 409, code = 'ROOM_UNAVAILABLE') {
    super(message);
    this.name = 'RoomConflictError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getOccupiedNights(checkInDate, checkOutDate, packageType) {
  const startStr = toISTDateString(new Date(checkInDate));
  const endStr = toISTDateString(new Date(checkOutDate));
  if (!startStr) return [];
  if (packageType === 'oneDay' || !endStr || endStr <= startStr) {
    return [startStr];
  }

  const nights = [];
  let cur = new Date(`${startStr}T00:00:00.000Z`);
  const end = new Date(`${endStr}T00:00:00.000Z`);
  let guard = 0;
  while (cur < end && guard < 366) {
    nights.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }
  return nights.length > 0 ? nights : [startStr];
}

async function claimRoomNights({ roomIds, checkInDate, checkOutDate, packageType, bookingId }) {
  if (!Array.isArray(roomIds) || roomIds.length === 0 || !bookingId) return;
  const nights = getOccupiedNights(checkInDate, checkOutDate, packageType);
  if (nights.length === 0) return;

  const docs = [];
  for (const roomId of roomIds) {
    for (const night of nights) {
      docs.push({ roomId, night, bookingId });
    }
  }

  try {
    await RoomNightLock.insertMany(docs, { ordered: true });
  } catch (err) {
    // Roll back any partial locks inserted for this bookingId
    await RoomNightLock.deleteMany({ bookingId }).catch(() => {});
    if (err.code === 11000 || String(err.message || '').includes('duplicate key')) {
      throw new RoomConflictError();
    }
    throw err;
  }
}

async function releaseRoomNights({ bookingId }) {
  if (!bookingId) return;
  await RoomNightLock.deleteMany({ bookingId });
}

module.exports = {
  RoomConflictError,
  getOccupiedNights,
  claimRoomNights,
  releaseRoomNights
};
