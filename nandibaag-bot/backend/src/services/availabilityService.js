/**
 * Availability Service — Phase B
 *
 * Core logic for determining room availability.
 * ZERO caching — all queries hit the database live.
 *
 * Business rule: WhatsApp bot ONLY sees capacity-level counts (never room numbers).
 * Staff dashboard sees full room-level detail.
 */

const mongoose = require('mongoose');
const { Room, RoomBooking } = require('../models');
const logger = require('../config/logger');
const { formatDateToISO } = require('../utils/dateUtils');

// Statuses that BLOCK a room (active bookings)
const BLOCKING_STATUSES = ['confirmed', 'checked_in'];

/**
 * a) checkOverlap — internal helper
 * Returns true if the room has any active RoomBooking that overlaps the given range.
 * Standard date-range overlap: existing.checkIn < new.checkOut AND existing.checkOut > new.checkIn
 */
async function checkOverlap(roomId, checkInDate, checkOutDate, excludeBookingId = null) {
  const query = {
    roomId,
    status: { $in: BLOCKING_STATUSES },
    checkInDate: { $lt: new Date(checkOutDate) },
    checkOutDate: { $gt: new Date(checkInDate) }
  };

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const overlapping = await RoomBooking.findOne(query);
  return !!overlapping;
}

let roomStructureCache = null;
let lastRoomStructureFetch = 0;

async function getActiveRoomStructure() {
  const now = Date.now();
  if (roomStructureCache && (now - lastRoomStructureFetch < 30000)) {
    return roomStructureCache;
  }
  try {
    const { Series } = require('../models');
    const seriesList = await Series.find({ status: { $ne: 'deleted' } }).lean();
    const seriesMap = new Map(seriesList.map(s => [s._id.toString(), s.name]));
    const seriesIds = seriesList.map(s => s._id);

    const rooms = await Room.find({ status: 'active', seriesId: { $in: seriesIds } }).lean();

    const roomData = rooms.map(r => ({
      _id: r._id,
      roomId: r._id,
      roomNumber: r.roomNumber,
      seriesName: seriesMap.get(r.seriesId?.toString()) || 'Other Cottages',
      capacity: r.capacity || 2
    }));

    roomData.sort((a, b) => a.seriesName.localeCompare(b.seriesName, undefined, { numeric: true }) || a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));

    roomStructureCache = roomData;
    lastRoomStructureFetch = now;
    return roomData;
  } catch (err) {
    logger.error(`Error fetching room structure: ${err.message}`);
    return [];
  }
}

/**
 * b) getCapacityAvailability — THE FUNCTION THE WHATSAPP BOT USES
 * Returns ONLY a count. NEVER room numbers, IDs, or identifying info.
 * Also returns breakdown by capacity tier for suggestion logic.
 */
async function getCapacityAvailability(checkInDate, checkOutDate, minCapacity = 1) {
  console.log('[Availability:DEBUG] Input params:', {
    checkInDate,
    checkOutDate,
    minCapacity
  });

  const rooms = await getActiveRoomStructure();
  const eligibleRooms = rooms.filter(r => r.capacity >= minCapacity);

  // Fetch all overlapping bookings for this date range in ONE single DB query
  const overlappingBookings = await RoomBooking.find({
    status: { $in: BLOCKING_STATUSES },
    checkInDate: { $lt: new Date(checkOutDate) },
    checkOutDate: { $gt: new Date(checkInDate) }
  }).select('roomId').lean();

  const blockedRoomIds = new Set(overlappingBookings.map(b => b.roomId.toString()));

  let availableCount = 0;
  const capacityBreakdown = {};

  for (const room of eligibleRooms) {
    const isBlocked = blockedRoomIds.has(room._id.toString());
    if (!isBlocked) {
      availableCount++;
      const tier = `capacity${room.capacity}`;
      if (!capacityBreakdown[tier]) {
        capacityBreakdown[tier] = { capacity: room.capacity, available: 0 };
      }
      capacityBreakdown[tier].available++;
    }
  }

  const result = {
    available: availableCount > 0,
    availableCount,
    breakdown: capacityBreakdown
  };

  console.log('[Availability:DEBUG] Result:', {
    available: result.available,
    availableCount: result.availableCount,
    breakdown: result.breakdown
  });

  return result;
}

/**
 * c) getDetailedAvailability — THE FUNCTION STAFF DASHBOARD USES
 * Returns full list of specific available rooms with room numbers, series names, etc.
 */
async function getDetailedAvailability(checkInDate, checkOutDate, minCapacity = 0) {
  const rooms = await getActiveRoomStructure();

  // Fetch all overlapping bookings for this date range in ONE single DB query
  const overlappingBookings = await RoomBooking.find({
    status: { $in: BLOCKING_STATUSES },
    checkInDate: { $lt: new Date(checkOutDate) },
    checkOutDate: { $gt: new Date(checkInDate) }
  }).select('roomId').lean();

  const blockedRoomIds = new Set(overlappingBookings.map(b => b.roomId.toString()));

  return rooms.filter(r => (
    (minCapacity === 0 || r.capacity >= minCapacity) &&
    !blockedRoomIds.has(r._id.toString())
  ));
}

/**
 * d) suggestRoomCombinations
 * Given a total guest count, find valid single-room OR multi-room combinations.
 * Returns capacity-level suggestions only (no room numbers).
 * Prioritizes fewer rooms first.
 */
async function suggestRoomCombinations(checkInDate, checkOutDate, requiredCapacity) {
  // Get all available rooms with their capacities
  const allRooms = await Room.find({ status: 'active' })
    .select('_id capacity')
    .sort({ capacity: -1 });

  const availableRooms = [];
  for (const room of allRooms) {
    const isBlocked = await checkOverlap(room._id, checkInDate, checkOutDate);
    if (!isBlocked) {
      availableRooms.push(room.capacity);
    }
  }

  if (availableRooms.length === 0) {
    return { available: false, suggestions: [] };
  }

  const suggestions = [];

  // Option 1: Single room that fits everyone
  const singleRoomCap = availableRooms.find((cap) => cap >= requiredCapacity);
  if (singleRoomCap) {
    suggestions.push({
      rooms: 1,
      description: `1 room of capacity ${singleRoomCap}`,
      capacities: [singleRoomCap],
      totalCapacity: singleRoomCap
    });
  }

  // Option 2: Two rooms that together fit
  if (suggestions.length < 3) {
    for (let i = 0; i < availableRooms.length; i++) {
      let found = false;
      for (let j = i + 1; j < availableRooms.length; j++) {
        const total = availableRooms[i] + availableRooms[j];
        if (total >= requiredCapacity) {
          suggestions.push({
            rooms: 2,
            description: `1 room of capacity ${availableRooms[i]} + 1 room of capacity ${availableRooms[j]}`,
            capacities: [availableRooms[i], availableRooms[j]],
            totalCapacity: total
          });
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }

  // Option 3: Three rooms if needed
  if (suggestions.length < 3 && availableRooms.length >= 3) {
    let total3 = availableRooms[0] + availableRooms[1] + availableRooms[2];
    if (total3 >= requiredCapacity) {
      suggestions.push({
        rooms: 3,
        description: `3 rooms (capacities: ${availableRooms[0]} + ${availableRooms[1]} + ${availableRooms[2]})`,
        capacities: [availableRooms[0], availableRooms[1], availableRooms[2]],
        totalCapacity: total3
      });
    }
  }

  return {
    available: suggestions.length > 0,
    suggestions: suggestions.slice(0, 3)
  };
}

/**
 * e) createRoomBooking — THE ONLY WAY a RoomBooking should be created
 * Re-validates via checkOverlap right before creating (race condition protection).
 * Uses MongoDB transaction if replica set is available.
 */
async function createRoomBooking(roomId, bookingId, checkInDate, checkOutDate, assignedByUserId) {
  // Fetch room for error message
  const room = await Room.findById(roomId);
  if (!room) {
    throw new Error('Room not found');
  }

  // Final overlap check before creation
  const hasOverlap = await checkOverlap(roomId, checkInDate, checkOutDate);
  if (hasOverlap) {
    throw new Error(`Room ${room.roomNumber} is no longer available for these dates`);
  }

  // Check if MongoDB supports transactions (replica set)
  const session = mongoose.connection.client.startSession ? await mongoose.connection.client.startSession() : null;
  let useTransaction = false;

  if (session && session.client && mongoose.connection.readyState === 1) {
    try {
      // Check if replica set is available
      const adminDb = mongoose.connection.db.admin ? mongoose.connection.db.admin() : null;
      if (adminDb) {
        await adminDb.command({ ping: 1 });
        useTransaction = true;
      }
    } catch (err) {
      // Standalone MongoDB — transactions not supported, rely on re-validation check
      logger.warn('MongoDB transaction not available, relying on re-validation check for race condition protection');
      useTransaction = false;
    }
  }

  try {
    const roomBooking = new RoomBooking({
      roomId,
      bookingId,
      checkInDate: new Date(checkInDate),
      checkOutDate: new Date(checkOutDate),
      status: 'confirmed',
      assignedBy: assignedByUserId
    });

    try {
      if (session && session.client) {
        session.startTransaction();
        await roomBooking.save({ session });
        await session.commitTransaction();
        return roomBooking;
      }
    } catch (txErr) {
      if (session) {
        try { await session.abortTransaction(); } catch (_) {}
      }
    }

    // Fallback for standalone MongoDB
    await roomBooking.save();
    return roomBooking;
  } finally {
    if (session) {
      try { await session.endSession(); } catch (_) {}
    }
  }
}

/**
 * f) cancelRoomBooking — sets status to 'cancelled', freeing the room
 */
async function cancelRoomBooking(roomBookingId, reason = '') {
  const roomBooking = await RoomBooking.findById(roomBookingId);
  if (!roomBooking) {
    throw new Error('Room booking not found');
  }

  roomBooking.status = 'cancelled';
  await roomBooking.save();

  logger.info(`Room booking ${roomBookingId} cancelled. Reason: ${reason || 'not specified'}`);
  return roomBooking;
}

/**
 * g) rescheduleRoomBooking — validates the same room is free for new dates
 * Uses excludeBookingId to ignore its own current booking.
 * All-or-nothing: if not free, throws error and does NOT modify.
 */
async function rescheduleRoomBooking(roomBookingId, newCheckInDate, newCheckOutDate) {
  const roomBooking = await RoomBooking.findById(roomBookingId);
  if (!roomBooking) {
    throw new Error('Room booking not found');
  }

  // Check if the room is free for new dates (excluding this booking's own current booking)
  const hasOverlap = await checkOverlap(
    roomBooking.roomId,
    newCheckInDate,
    newCheckOutDate,
    roomBookingId
  );

  if (hasOverlap) {
    const room = await Room.findById(roomBooking.roomId);
    throw new Error(`Room ${room?.roomNumber || 'unknown'} is not available for the new dates`);
  }

  // Update dates
  roomBooking.checkInDate = new Date(newCheckInDate);
  roomBooking.checkOutDate = new Date(newCheckOutDate);
  await roomBooking.save();

  return roomBooking;
}

/**
 * Check availability for an array of roomIds (or room numbers) between checkInDate & checkOutDate.
 */
const checkMultipleRoomsAvailable = async (roomIds, checkInDate, checkOutDate, sessionId = null) => {
  try {
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    console.log('[Availability:MultiRoom] Checking rooms:', {
      roomIds,
      checkInDate: formatDateToISO(checkIn),
      checkOutDate: formatDateToISO(checkOut),
      sessionId
    });
    
    if (!roomIds || roomIds.length === 0) {
      console.log('[Availability:MultiRoom] No rooms to check');
      return { available: false, reason: 'No rooms selected' };
    }

    const { Booking, RoomBooking, Room } = require('../models');
    
    // Check each room
    const availabilityResults = await Promise.all(
      roomIds.map(async (roomId) => {
        const isValidObjectId = mongoose.Types.ObjectId.isValid(roomId);
        
        const roomDoc = await Room.findOne({
          $or: [
            ...(isValidObjectId ? [{ _id: roomId }] : []),
            { number: String(roomId) },
            { roomNumber: String(roomId) }
          ]
        }).lean();

        const roomObjectId = roomDoc ? roomDoc._id : (isValidObjectId ? roomId : null);
        const roomNumStr = String(roomId);

        const conflictsInBookings = await Booking.findOne({
          $or: [
            { roomIds: roomNumStr },
            { roomId: roomNumStr },
            ...(roomObjectId ? [{ roomIds: String(roomObjectId) }, { roomId: String(roomObjectId) }] : [])
          ],
          checkInDate: { $lt: new Date(checkOutDate) },
          checkOutDate: { $gt: new Date(checkInDate) },
          status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }
        });

        let conflictsInRoomBookings = null;
        if (roomObjectId) {
          conflictsInRoomBookings = await RoomBooking.findOne({
            roomId: roomObjectId,
            checkInDate: { $lt: new Date(checkOutDate) },
            checkOutDate: { $gt: new Date(checkInDate) },
            status: { $in: ['confirmed', 'checked_in'] }
          });
        }

        const conflict = conflictsInBookings || conflictsInRoomBookings;

        if (conflict) {
          return {
            roomId: roomNumStr,
            available: false,
            reason: 'booked',
            conflict: {
              customer: conflict.customerName || 'Reserved',
              dates: `${new Date(conflict.checkInDate).toLocaleDateString()} - ${new Date(conflict.checkOutDate).toLocaleDateString()}`
            }
          };
        }

        // Check for active reservations (EXCLUDING current session)
        const { RoomReservation } = require('../models');
        const now = new Date();
        const reservation = await RoomReservation.findOne({
          $or: [
            { roomId: roomNumStr },
            ...(roomObjectId ? [{ roomId: String(roomObjectId) }] : [])
          ],
          checkInDate: { $lt: new Date(checkOutDate) },
          checkOutDate: { $gt: new Date(checkInDate) },
          status: 'active',
          expiresAt: { $gt: now },
          ...(sessionId ? { sessionId: { $ne: sessionId } } : {})
        });

        if (reservation) {
          return {
            roomId: roomNumStr,
            available: false,
            reason: 'reserved',
            conflict: {
              reservedBy: reservation.reservedBy,
              expiresAt: reservation.expiresAt
            }
          };
        }
        
        return {
          roomId: roomNumStr,
          available: true
        };
      })
    );
    
    console.log('[Availability:MultiRoom] Results:', availabilityResults);
    
    const allAvailable = availabilityResults.every(r => r.available);
    const unavailableRooms = availabilityResults.filter(r => !r.available);
    
    if (!allAvailable) {
      return {
        available: false,
        reason: `Room(s) ${unavailableRooms.map(r => r.roomId).join(', ')} unavailable`,
        conflicts: unavailableRooms
      };
    }
    
    return {
      available: true,
      selectedRooms: roomIds,
      message: `All ${roomIds.length} room(s) available`
    };
    
  } catch (error) {
    console.error('[Availability:MultiRoom] Error:', error.message);
    return { available: false, reason: error.message };
  }
};

/**
 * Gets all active rooms with their real-time availability/reservation status
 * for a specific check-in/check-out date range and user session.
 */
const getRoomsWithReservationStatus = async (checkInDate, checkOutDate, sessionId = null) => {
  try {
    console.log('[Availability:RoomStatus] Fetching room status for:', { checkInDate, checkOutDate, sessionId });

    const { Booking, RoomReservation, Series } = require('../models');
    const allRooms = await Room.find({ status: { $ne: 'deleted' } }).lean();

    const seriesList = await Series.find({ status: { $ne: 'deleted' } }).lean();
    const seriesMap = new Map(seriesList.map(s => [s._id.toString(), s.name]));

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const now = new Date();

    const roomsWithStatus = await Promise.all(
      allRooms.map(async (room) => {
        const roomIdStr = room._id.toString();
        const roomNumStr = String(room.roomNumber);

        // 1. Check for confirmed bookings
        const booking = await Booking.findOne({
          $or: [
            { roomIds: roomIdStr },
            { roomIds: roomNumStr },
            { roomId: roomIdStr },
            { roomId: roomNumStr }
          ],
          checkInDate: { $lt: checkOut },
          checkOutDate: { $gt: checkIn },
          status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }
        });

        if (booking) {
          return {
            ...room,
            seriesName: seriesMap.get(room.seriesId?.toString()) || 'Other Cottages',
            status: 'booked',
            bookedBy: booking.customerName
          };
        }

        // 2. Check for active reservations
        const reservation = await RoomReservation.findOne({
          $or: [
            { roomId: roomIdStr },
            { roomId: roomNumStr }
          ],
          checkInDate: { $lt: checkOut },
          checkOutDate: { $gt: checkIn },
          status: 'active',
          expiresAt: { $gt: now }
        });

        if (reservation) {
          const isCurrentSession = sessionId && reservation.sessionId === sessionId;
          return {
            ...room,
            seriesName: seriesMap.get(room.seriesId?.toString()) || 'Other Cottages',
            status: isCurrentSession ? 'reserved_by_you' : 'reserved_by_other',
            reservedUntil: reservation.expiresAt,
            isYourReservation: isCurrentSession
          };
        }

        return {
          ...room,
          seriesName: seriesMap.get(room.seriesId?.toString()) || 'Other Cottages',
          status: 'available'
        };
      })
    );

    // Sort by seriesName and roomNumber
    roomsWithStatus.sort((a, b) => 
      (a.seriesName || '').localeCompare(b.seriesName || '', undefined, { numeric: true }) ||
      (String(a.roomNumber) || '').localeCompare(String(b.roomNumber) || '', undefined, { numeric: true })
    );

    return roomsWithStatus;
  } catch (error) {
    console.error('[Availability:RoomStatus] Error:', error.message);
    throw error;
  }
};

module.exports = {
  checkOverlap,
  getCapacityAvailability,
  getDetailedAvailability,
  suggestRoomCombinations,
  createRoomBooking,
  cancelRoomBooking,
  rescheduleRoomBooking,
  checkMultipleRoomsAvailable,
  getRoomsWithReservationStatus
};
