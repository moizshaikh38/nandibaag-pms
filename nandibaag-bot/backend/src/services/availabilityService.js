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

/**
 * b) getCapacityAvailability — THE FUNCTION THE WHATSAPP BOT USES
 * Returns ONLY a count. NEVER room numbers, IDs, or identifying info.
 * Also returns breakdown by capacity tier for suggestion logic.
 */
async function getCapacityAvailability(checkInDate, checkOutDate, minCapacity = 1) {
  // Find all active rooms with capacity >= minCapacity
  const eligibleRooms = await Room.find({
    status: 'active',
    capacity: { $gte: minCapacity }
  }).select('_id capacity');

  let availableCount = 0;
  const capacityBreakdown = {};

  for (const room of eligibleRooms) {
    const isBlocked = await checkOverlap(room._id, checkInDate, checkOutDate);
    if (!isBlocked) {
      availableCount++;
      const tier = `capacity${room.capacity}`;
      if (!capacityBreakdown[tier]) {
        capacityBreakdown[tier] = { capacity: room.capacity, available: 0 };
      }
      capacityBreakdown[tier].available++;
    }
  }

  return {
    available: availableCount > 0,
    availableCount,
    breakdown: capacityBreakdown
  };
}

/**
 * c) getDetailedAvailability — THE FUNCTION STAFF DASHBOARD USES
 * Returns full list of specific available rooms with room numbers, series names, etc.
 */
async function getDetailedAvailability(checkInDate, checkOutDate, minCapacity = 0) {
  // Find all active rooms (optionally filtered by minCapacity)
  const filter = { status: 'active' };
  if (minCapacity > 0) {
    filter.capacity = { $gte: minCapacity };
  }

  const rooms = await Room.find(filter)
    .populate('seriesId', 'name status')
    .sort({ 'seriesId.name': 1, roomNumber: 1 });

  const availableRooms = [];

  for (const room of rooms) {
    // Skip rooms in deleted/maintenance series
    if (room.seriesId && room.seriesId.status === 'deleted') continue;

    const isBlocked = await checkOverlap(room._id, checkInDate, checkOutDate);
    if (!isBlocked) {
      availableRooms.push({
        roomId: room._id,
        roomNumber: room.roomNumber,
        seriesName: room.seriesId?.name || 'Unknown',
        capacity: room.capacity
      });
    }
  }

  return availableRooms;
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

    if (useTransaction && session) {
      session.startTransaction();
      try {
        await roomBooking.save({ session });
        await session.commitTransaction();
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        await session.endSession();
      }
    } else {
      await roomBooking.save();
    }

    return roomBooking;
  } catch (error) {
    if (session) await session.endSession();
    throw error;
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

module.exports = {
  checkOverlap,
  getCapacityAvailability,
  getDetailedAvailability,
  suggestRoomCombinations,
  createRoomBooking,
  cancelRoomBooking,
  rescheduleRoomBooking
};
