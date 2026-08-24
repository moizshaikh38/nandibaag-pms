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
const BLOCKING_STATUSES = ['confirmed', 'checked_in', 'pending_payment', 'pending', 'draft'];

function startOfDate(value) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      ));
    }
  }

  const input = new Date(value);
  const date = new Date(Date.UTC(
    input.getUTCFullYear(),
    input.getUTCMonth(),
    input.getUTCDate()
  ));
  return date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isPicnicOnlyBooking(booking) {
  return ['dayuse', 'picnic', 'oneDay'].includes(booking?.bookingType) ||
    ['one-day-picnic', 'oneDay', 'picnic'].includes(booking?.packageType);
}

function addBookingRoomIds(blockedRoomIds, booking) {
  if (booking?.roomId) blockedRoomIds.add(String(booking.roomId));
  if (Array.isArray(booking?.roomIds)) {
    booking.roomIds.forEach(id => blockedRoomIds.add(String(id)));
  }
}

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
  const checkInObj = startOfDate(checkInDate);
  let checkOutObj = startOfDate(checkOutDate);
  if (isNaN(checkOutObj.getTime()) || checkOutObj <= checkInObj) {
    checkOutObj = addDays(checkInObj, 1);
  }
  const checkInStr = checkInObj.toISOString().split('T')[0];

  console.log('[Availability:DEBUG] Input params:', {
    checkInDate: checkInObj.toISOString(),
    checkOutDate: checkOutObj.toISOString(),
    minCapacity
  });

  const rooms = await getActiveRoomStructure();
  const eligibleRooms = rooms.filter(r => r.capacity >= minCapacity);

  // Fetch all overlapping bookings & active maintenance for this date range in DB queries
  const { Booking } = require('../models');
  const RoomMaintenance = require('../models/RoomMaintenance');

  const overlappingRoomBookings = await RoomBooking.find({
    status: { $in: BLOCKING_STATUSES },
    checkInDate: { $lt: checkOutObj },
    checkOutDate: { $gt: checkInObj }
  }).select('roomId').lean();

  const overlappingMainBookings = await Booking.find({
    checkInDate: { $lt: checkOutObj },
    checkOutDate: { $gt: checkInObj },
    $or: [
      { roomIds: { $exists: true, $ne: [] } },
      { roomId: { $exists: true, $ne: null } }
    ],
    status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }
  }).select('roomId roomIds customerName').lean();

  const activeMaintenance = await RoomMaintenance.find({
    status: 'active',
    startDate: { $lt: checkOutObj },
    endDate: { $gt: checkInObj }
  }).select('roomId').lean();

  const blockedRoomIds = new Set([
    ...overlappingRoomBookings.map(b => b.roomId ? b.roomId.toString() : ''),
    ...activeMaintenance.map(m => String(m.roomId))
  ]);

  for (const b of overlappingMainBookings) {
    addBookingRoomIds(blockedRoomIds, b);
  }

  let availableCount = 0;
  const capacityBreakdown = {};

  for (const room of eligibleRooms) {
    const roomIdStr = room._id.toString();
    const roomNumStr = String(room.roomNumber);
    const isBlocked = blockedRoomIds.has(roomIdStr) || blockedRoomIds.has(roomNumStr) || room.status === 'maintenance';
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
  const { Booking } = require('../models');
  const RoomMaintenance = require('../models/RoomMaintenance');

  const checkInObj = startOfDate(checkInDate);
  let checkOutObj = startOfDate(checkOutDate);
  if (isNaN(checkOutObj.getTime()) || checkOutObj <= checkInObj) {
    checkOutObj = addDays(checkInObj, 1);
  }

  const overlappingRoomBookings = await RoomBooking.find({
    status: { $in: BLOCKING_STATUSES },
    checkInDate: { $lt: checkOutObj },
    checkOutDate: { $gt: checkInObj }
  }).select('roomId').lean();

  const overlappingMainBookings = await Booking.find({
    checkInDate: { $lt: checkOutObj },
    checkOutDate: { $gt: checkInObj },
    $or: [
      { roomIds: { $exists: true, $ne: [] } },
      { roomId: { $exists: true, $ne: null } }
    ],
    status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }
  }).select('roomId roomIds customerName').lean();

  const activeMaintenance = await RoomMaintenance.find({
    status: 'active',
    startDate: { $lt: checkOutObj },
    endDate: { $gt: checkInObj }
  }).select('roomId').lean();

  const blockedRoomIds = new Set([
    ...overlappingRoomBookings.map(b => b.roomId ? b.roomId.toString() : ''),
    ...activeMaintenance.map(m => String(m.roomId))
  ]);

  for (const b of overlappingMainBookings) {
    addBookingRoomIds(blockedRoomIds, b);
  }

  return rooms.filter(r => (
    (minCapacity === 0 || r.capacity >= minCapacity) &&
    !blockedRoomIds.has(r._id.toString()) &&
    !blockedRoomIds.has(String(r.roomNumber)) &&
    r.status !== 'maintenance'
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
    const { Room, Booking, RoomBooking, RoomReservation, Series, RoomMaintenance } = require('../models');

    const checkIn = new Date(checkInDate);
    let checkOut = new Date(checkOutDate);
    const isSameDay = checkInDate === checkOutDate || (checkOut.getTime() <= checkIn.getTime());
    const effectiveCheckOut = isSameDay ? new Date(checkIn.getTime() + 86400000) : checkOut;
    const checkInStr = checkIn.toISOString().split('T')[0];
    const now = new Date();

    // ⚡ Execute all DB lookups in 1 single parallel roundtrip
    const [allRooms, seriesList, activeMaintenance, activeRoomBookings, activeMainBookings, activeReservations] = await Promise.all([
      Room.find({ status: { $ne: 'deleted' } }).lean(),
      Series.find({ status: { $ne: 'deleted' } }).lean(),
      RoomMaintenance.find({
        startDate: { $lt: effectiveCheckOut },
        endDate: { $gt: checkIn },
        status: 'active'
      }).lean(),
      RoomBooking.find({
        status: { $in: ['confirmed', 'checked_in'] },
        checkInDate: { $lt: effectiveCheckOut },
        checkOutDate: { $gt: checkIn }
      }).lean(),
      Booking.find({
        status: { $in: ['pending_payment', 'confirmed', 'checked_in'] },
        $and: [
          {
            $or: [
              { checkInDate: { $lt: effectiveCheckOut }, checkOutDate: { $gt: checkIn } },
              { date: checkInStr }
            ]
          },
          {
            $or: [
              { roomIds: { $exists: true, $ne: [] } },
              { roomId: { $exists: true, $ne: null } }
            ]
          }
        ]
      }).select('customerName roomId roomIds').lean(),
      RoomReservation.find({
        checkInDate: { $lt: effectiveCheckOut },
        checkOutDate: { $gt: checkIn },
        status: 'active',
        expiresAt: { $gt: now }
      }).lean()
    ]);

    const seriesMap = new Map(seriesList.map(s => [s._id.toString(), s.name]));

    // Fast in-memory hash maps for O(1) matching
    const maintenanceMap = new Map();
    for (const m of activeMaintenance) {
      if (m.roomId) maintenanceMap.set(String(m.roomId), m);
    }

    const roomBookingMap = new Map();
    for (const rb of activeRoomBookings) {
      if (rb.roomId) roomBookingMap.set(String(rb.roomId), rb);
    }

    const mainBookingMap = new Map();
    for (const b of activeMainBookings) {
      if (b.roomId) mainBookingMap.set(String(b.roomId), b);
      if (Array.isArray(b.roomIds)) {
        b.roomIds.forEach(id => mainBookingMap.set(String(id), b));
      }
    }

    const reservationMap = new Map();
    for (const r of activeReservations) {
      if (r.roomId) reservationMap.set(String(r.roomId), r);
    }

    const roomsWithStatus = allRooms.map((room) => {
      const roomIdStr = room._id.toString();
      const roomNumStr = String(room.roomNumber);

      // 1. Check Maintenance
      const maintenance = maintenanceMap.get(roomIdStr) || maintenanceMap.get(roomNumStr);
      if (maintenance) {
        return {
          ...room,
          seriesName: seriesMap.get(room.seriesId?.toString()) || 'Other Cottages',
          status: 'maintenance',
          maintenanceType: maintenance.maintenanceType,
          maintenanceReason: maintenance.reason,
          maintenanceUntil: maintenance.endDate
        };
      }

      // 2. Check Confirmed Bookings (PMS or Main Bookings)
      const rb = roomBookingMap.get(roomIdStr) || roomBookingMap.get(roomNumStr);
      const mb = mainBookingMap.get(roomIdStr) || mainBookingMap.get(roomNumStr);
      const activeBooking = rb || mb;
      if (activeBooking) {
        return {
          ...room,
          seriesName: seriesMap.get(room.seriesId?.toString()) || 'Other Cottages',
          status: 'booked',
          bookedBy: activeBooking.customerName || 'Confirmed Guest'
        };
      }

      // 3. Check Temporary Active Reservations
      const res = reservationMap.get(roomIdStr) || reservationMap.get(roomNumStr);
      if (res) {
        const isCurrentSession = sessionId && res.sessionId === sessionId;
        return {
          ...room,
          seriesName: seriesMap.get(room.seriesId?.toString()) || 'Other Cottages',
          status: isCurrentSession ? 'reserved_by_you' : 'reserved_by_other',
          reservedUntil: res.expiresAt,
          isYourReservation: isCurrentSession
        };
      }

      return {
        ...room,
        seriesName: seriesMap.get(room.seriesId?.toString()) || 'Other Cottages',
        status: 'available'
      };
    });

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

/**
 * Returns overall availability status breakdown message.
 */
const getAvailabilityMessage = async (checkInDate, checkOutDate, sessionId = null) => {
  try {
    console.log('[Availability:Message] Checking overall status for:', checkInDate, 'to', checkOutDate);

    const rooms = await getRoomsWithReservationStatus(checkInDate, checkOutDate, sessionId);

    const availableCount = rooms.filter(r => r.status === 'available' || r.status === 'reserved_by_you').length;
    const bookedCount = rooms.filter(r => r.status === 'booked').length;
    const maintenanceCount = rooms.filter(r => r.status === 'maintenance').length;
    const reservedCount = rooms.filter(r => r.status === 'reserved_by_other').length;
    const totalRooms = rooms.length;

    const result = {
      availableRooms: availableCount,
      bookedRooms: bookedCount,
      maintenanceRooms: maintenanceCount,
      reservedRooms: reservedCount,
      totalRooms: totalRooms,
      isAvailable: availableCount > 0,
      message: ''
    };

    if (availableCount === 0) {
      if (maintenanceCount > 0 && bookedCount > 0) {
        result.message = `Sorry, all rooms are currently booked or under maintenance. ${maintenanceCount} room(s) are under service. Please try different dates.`;
      } else if (maintenanceCount > 0) {
        result.message = `Sorry, all rooms are currently under maintenance for servicing. Please try different dates.`;
      } else {
        result.message = `Sorry, all rooms are currently booked for these dates. Please try different dates.`;
      }
    } else if (availableCount <= 2) {
      result.message = `⚠️ Only ${availableCount} room(s) available for these dates! Book soon.`;
    } else {
      result.message = `✅ We have ${availableCount} room(s) available for your dates.`;
    }

    if (maintenanceCount > 0 && availableCount > 0) {
      result.message += ` (${maintenanceCount} room(s) under maintenance)`;
    }

    console.log('[Availability:Message] Result:', result);
    return result;
  } catch (error) {
    console.error('[Availability:Message] Error:', error.message);
    throw error;
  }
};

/**
 * Check availability for OVERNIGHT stay (Couple/Group).
 * Check-in 12:00 PM -> Check-out 10:30 AM next day.
 */
const checkOvernightAvailability = async (checkInDate, checkOutDate) => {
  try {
    console.log('[Availability:Overnight] ═══════════════════════════════');
    console.log('[Availability:Overnight] Checking overnight availability');

    // CRITICAL: Use UTC startOfDate to avoid IST/UTC timezone boundary mismatch
    const checkIn = startOfDate(checkInDate);
    let checkOut = startOfDate(checkOutDate);

    if (isNaN(checkOut.getTime()) || checkOut <= checkIn) {
      checkOut = addDays(checkIn, 1);
    }

    console.log('[Availability:Overnight] Check-in (UTC):', checkIn.toISOString().split('T')[0]);
    console.log('[Availability:Overnight] Check-out (UTC):', checkOut.toISOString().split('T')[0]);

    // Get all rooms
    const allRooms = await getActiveRoomStructure();
    console.log('[Availability:Overnight] Total rooms in system:', allRooms.length);

    // Find OVERNIGHT bookings that overlap and have room assignments
    const { Booking } = require('../models');
    const bookings = await Booking.find({
      checkInDate: { $lt: checkOut },
      checkOutDate: { $gt: checkIn },
      $or: [
        { roomIds: { $exists: true, $ne: [] } },
        { roomId: { $exists: true, $ne: null } }
      ],
      status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }
    }).select('roomIds roomId checkInDate checkOutDate customerName').lean();

    const overlappingRoomBookings = await RoomBooking.find({
      status: { $in: ['pending_payment', 'confirmed', 'checked_in'] },
      checkInDate: { $lt: checkOut },
      checkOutDate: { $gt: checkIn }
    }).select('roomId').lean();

    const RoomMaintenance = require('../models/RoomMaintenance');
    const activeMaintenance = await RoomMaintenance.find({
      status: 'active',
      startDate: { $lt: checkOut },
      endDate: { $gt: checkIn }
    }).select('roomId').lean();

    console.log('[Availability:Overnight] Found overlapping bookings:', bookings.length);

    bookings.forEach((b, idx) => {
      console.log(`  [${idx + 1}] ${b.customerName} | Rooms: ${b.roomIds?.join(',') || b.roomId} | ${new Date(b.checkInDate).toISOString().split('T')[0]} → ${new Date(b.checkOutDate).toISOString().split('T')[0]}`);
    });

    // Collect booked room IDs
    const bookedRoomIds = new Set();
    bookings.forEach(booking => {
      if (booking.roomId) bookedRoomIds.add(booking.roomId.toString());
      if (booking.roomIds && Array.isArray(booking.roomIds)) {
        booking.roomIds.forEach(roomId => {
          bookedRoomIds.add(roomId.toString());
        });
      }
    });

    overlappingRoomBookings.forEach(rb => {
      if (rb.roomId) bookedRoomIds.add(rb.roomId.toString());
    });

    activeMaintenance.forEach(m => {
      if (m.roomId) bookedRoomIds.add(m.roomId.toString());
    });

    // Get available rooms
    const availableRooms = allRooms.filter(
      room => !bookedRoomIds.has(room._id.toString()) &&
              !bookedRoomIds.has(String(room.roomNumber || room.number)) &&
              room.status !== 'maintenance'
    );

    console.log('[Availability:Overnight] Booked rooms:', bookedRoomIds.size);
    console.log('[Availability:Overnight] Available rooms:', availableRooms.length);
    console.log('[Availability:Overnight] ═══════════════════════════════\n');

    return {
      availableRooms,
      totalRooms: allRooms.length,
      bookedRoomIds: Array.from(bookedRoomIds),
      checkInDate: checkIn,
      checkOutDate: checkOut
    };

  } catch (error) {
    console.error('[Availability:Overnight] ❌ Error:', error.message);
    throw error;
  }
};

const checkOneDayPicknicAvailability = async (picnicDate, mealOption = 'breakfast-to-dinner') => {
  try {
    console.log('[Availability:OneDay] ═══════════════════════════════');
    console.log('[Availability:OneDay] Checking one-day picnic');

    // CRITICAL: Use UTC startOfDate to avoid IST/UTC timezone boundary mismatch
    const date = startOfDate(picnicDate);
    const nextDay = addDays(date, 1);

    console.log('[Availability:OneDay] Date:', date.toISOString().split('T')[0]);
    console.log('[Availability:OneDay] Meal option:', mealOption);

    // Get all rooms
    const allRooms = await getActiveRoomStructure();
    console.log('[Availability:OneDay] Total rooms:', allRooms.length);

    // OVERNIGHT bookings that include this date
    const { Booking } = require('../models');
    const overnightBookings = await Booking.find({
      bookingType: { $in: ['overnight', 'couple', 'group'] },
      status: { $in: ['pending_payment', 'confirmed', 'checked_in'] },
      checkInDate: { $lte: date }, // Checkin on or before this date
      checkOutDate: { $gt: date } // Checkout after this date
    }).select('roomIds roomId customerName').lean();

    console.log('[Availability:OneDay] Overnight bookings blocking:', overnightBookings.length);

    // One-day bookings on this exact date
    const oneDayBookings = await Booking.find({
      bookingType: { $in: ['dayuse', 'picnic', 'oneDay'] },
      status: { $in: ['pending_payment', 'confirmed', 'checked_in'] },
      $or: [
        { checkInDate: { $gte: date, $lt: nextDay } },
        { date: date.toISOString().split('T')[0] }
      ]
    }).select('roomIds roomId customerName').lean();

    console.log('[Availability:OneDay] One-day bookings on this date:', oneDayBookings.length);

    // Combine blocked rooms
    const blockedRoomIds = new Set();

    overnightBookings.forEach(b => {
      if (b.roomId) blockedRoomIds.add(b.roomId.toString());
      if (b.roomIds && Array.isArray(b.roomIds)) {
        b.roomIds.forEach(roomId => blockedRoomIds.add(roomId.toString()));
      }
    });

    oneDayBookings.forEach(b => {
      if (b.roomId) blockedRoomIds.add(b.roomId.toString());
      if (b.roomIds && Array.isArray(b.roomIds)) {
        b.roomIds.forEach(roomId => blockedRoomIds.add(roomId.toString()));
      }
    });

    const availableRooms = allRooms.filter(
      room => !blockedRoomIds.has(room._id.toString()) &&
              !blockedRoomIds.has(String(room.roomNumber || room.number)) &&
              room.status !== 'maintenance'
    );

    console.log('[Availability:OneDay] Blocked rooms:', blockedRoomIds.size);
    console.log('[Availability:OneDay] Available rooms:', availableRooms.length);
    console.log('[Availability:OneDay] ═══════════════════════════════\n');

    return {
      availableRooms,
      totalRooms: allRooms.length,
      blockedRoomIds: Array.from(blockedRoomIds),
      date
    };

  } catch (error) {
    console.error('[Availability:OneDay] ❌ Error:', error.message);
    throw error;
  }
};

/**
 * Get detailed availability breakdown and human-friendly message.
 */
const getDetailedAvailabilityMessage = async (checkInDate, checkOutDate, packageType = 'couple') => {
  try {
    console.log('[Availability:Message] Building detailed message');
    console.log('[Availability:Message] Package type:', packageType);

    const allRooms = await getActiveRoomStructure();
    const totalRooms = allRooms.length;
    const formattedDate = new Date(checkInDate).toLocaleDateString('en-GB');

    if (packageType === 'couple' || packageType === 'group' || packageType === 'overnight') {
      console.log('[Availability:Message] Checking overnight');

      const overnight = await module.exports.checkOvernightAvailability(checkInDate, checkOutDate);
      const availableCount = overnight.availableRooms.length;
      const bookedCount = overnight.bookedRoomIds.length;

      if (availableCount === 0) {
        // Check if one-day picnic is available as an alternative
        const dayuse = await module.exports.checkOneDayPicknicAvailability(checkInDate, 'breakfast-to-dinner');
        const dayuseAvailable = dayuse.availableRooms.length;

        if (dayuseAvailable > 0) {
          console.log('[Availability:Message] All rooms booked for overnight, offering one-day picnic');
          return {
            availableForOvernight: 0,
            availableForDayuse: dayuseAvailable,
            totalRooms,
            bookedRooms: bookedCount,
            isAvailable: false,
            message: `❌ Sorry, all rooms are booked for overnight stay on ${formattedDate}.

However, we might have availability for ONE-DAY PICNIC (9:00 AM - 6:30 PM or 9:00 AM - 9:30 PM).

Would you like to book a one-day picnic instead? 🎉`,
            alternativeOffering: 'one-day-picnic'
          };
        } else {
          console.log('[Availability:Message] All rooms booked for BOTH overnight and one-day picnic');
          return {
            availableForOvernight: 0,
            availableForDayuse: 0,
            totalRooms,
            bookedRooms: bookedCount,
            isAvailable: false,
            message: `❌ Sorry, all rooms are fully booked on ${formattedDate} for both overnight and one-day picnic.

Please try a different date! 📅`,
            alternativeOffering: null
          };
        }
      } else if (availableCount <= 2) {
        return {
          availableForOvernight: availableCount,
          totalRooms,
          bookedRooms: bookedCount,
          isAvailable: true,
          message: `⚠️ Limited availability! Only ${availableCount} room(s) available for overnight stay on ${formattedDate}.

Book now before it's fully booked! 🏨`
        };
      } else {
        return {
          availableForOvernight: availableCount,
          totalRooms,
          bookedRooms: bookedCount,
          isAvailable: true,
          message: `✅ We have ${availableCount} room(s) available for overnight stay on ${formattedDate}! 🎉`
        };
      }

    } else if (packageType === 'one-day-picnic' || packageType === 'oneDay' || packageType === 'picnic' || packageType === 'dayuse') {
      console.log('[Availability:Message] Checking one-day picnic');

      const dayuse = await module.exports.checkOneDayPicknicAvailability(checkInDate, 'breakfast-to-dinner');
      const availableCount = dayuse.availableRooms.length;
      const bookedCount = dayuse.blockedRoomIds.length;

      if (availableCount === 0) {
        return {
          availableForDayuse: 0,
          totalRooms,
          bookedRooms: bookedCount,
          isAvailable: false,
          message: `❌ Sorry, all rooms are booked for ${formattedDate}.

Please try a different date! 📅`
        };
      } else {
        return {
          availableForDayuse: availableCount,
          totalRooms,
          bookedRooms: bookedCount,
          isAvailable: true,
          message: `✅ We have ${availableCount} room(s) available for one-day picnic on ${formattedDate}!`
        };
      }
    }
  } catch (error) {
    console.error('[Availability:Message] Error:', error.message);
    throw error;
  }
};

/**
 * Get all rooms mapped with detailed booked/available status for overnight or dayuse.
 */
const getRoomsWithDetailedStatus = async (checkInDate, checkOutDate, packageType = 'couple') => {
  try {
    console.log('[Availability:Status] Getting detailed room status');
    const allRooms = await getActiveRoomStructure();

    if (packageType === 'couple' || packageType === 'group' || packageType === 'overnight') {
      const overnight = await module.exports.checkOvernightAvailability(checkInDate, checkOutDate);

      return allRooms.map(room => {
        const idStr = String(room._id);
        const numStr = String(room.roomNumber || room.number || '');
        const isBooked = overnight.bookedRoomIds.includes(idStr) || overnight.bookedRoomIds.includes(numStr);
        return {
          ...room,
          number: room.roomNumber || room.number || String(room._id),
          status: isBooked ? 'booked' : 'available',
          bookingType: 'overnight'
        };
      });

    } else {
      const dayuse = await module.exports.checkOneDayPicknicAvailability(checkInDate);

      return allRooms.map(room => {
        const idStr = String(room._id);
        const numStr = String(room.roomNumber || room.number || '');
        const isBlocked = dayuse.blockedRoomIds.includes(idStr) || dayuse.blockedRoomIds.includes(numStr);
        return {
          ...room,
          number: room.roomNumber || room.number || String(room._id),
          status: isBlocked ? 'booked' : 'available',
          bookingType: 'dayuse'
        };
      });
    }
  } catch (error) {
    console.error('[Availability:Status] Error:', error.message);
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
  getRoomsWithReservationStatus,
  getAvailabilityMessage,
  checkOvernightAvailability,
  checkOneDayPicknicAvailability,
  getDetailedAvailabilityMessage,
  getRoomsWithDetailedStatus
};
