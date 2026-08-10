const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
  getCapacityAvailability,
  getDetailedAvailability,
  suggestRoomCombinations,
  createRoomBooking,
  cancelRoomBooking,
  rescheduleRoomBooking,
  checkOverlap
} = require('../services/availabilityService');
const { RoomBooking, Room, Series, Booking } = require('../models');

const router = express.Router();

// ── Validation Schemas ────────────────────────────────────────────────

const dateSchema = Joi.string().isoDate().required();
const checkCapacitySchema = Joi.object({
  checkInDate: dateSchema,
  checkOutDate: dateSchema,
  minCapacity: Joi.number().integer().min(1).default(1)
});

const createRoomBookingSchema = Joi.object({
  roomId: Joi.string().hex().length(24).required(),
  bookingId: Joi.string().hex().length(24).required(),
  checkInDate: dateSchema,
  checkOutDate: dateSchema
});

const rescheduleSchema = Joi.object({
  newCheckInDate: dateSchema,
  newCheckOutDate: dateSchema
});

const statusTransitionSchema = Joi.object({
  status: Joi.string().valid('confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show').required()
});

const cancelSchema = Joi.object({
  reason: Joi.string().allow('').default('')
});

function validateBody(schema, body) {
  const { error, value } = schema.validate(body);
  if (error) {
    return { error: error.details[0].message };
  }
  return { value };
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function validateDateRange(checkIn, checkOut) {
  const ci = new Date(checkIn);
  const co = new Date(checkOut);
  if (co <= ci) {
    return 'checkOutDate must be after checkInDate';
  }
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────

/**
 * GET /api/availability/public
 * Public unauthenticated CORS-enabled API for external resort website integration.
 * Query params: ?checkInDate=YYYY-MM-DD&checkOutDate=YYYY-MM-DD
 */
router.get('/public', async (req, res, next) => {
  try {
    const checkInDate = req.query.checkInDate || new Date().toISOString().split('T')[0];
    const checkOutDate = req.query.checkOutDate || new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const result = await getCapacityAvailability(checkInDate, checkOutDate, 1);
    const detailed = await getDetailedAvailability(checkInDate, checkOutDate);

    const seriesMap = {};
    detailed.forEach(r => {
      if (!seriesMap[r.seriesName]) {
        seriesMap[r.seriesName] = { seriesName: r.seriesName, totalRooms: 0, availableRooms: 0 };
      }
      seriesMap[r.seriesName].totalRooms++;
      if (r.status === 'available') seriesMap[r.seriesName].availableRooms++;
    });

    res.json({
      success: true,
      resortName: 'Nandibaag Resort',
      checkInDate,
      checkOutDate,
      totalAvailable: result.availableCount,
      isAvailable: result.available,
      capacityBreakdown: result.breakdown,
      seriesAvailability: Object.values(seriesMap)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/availability/check-capacity
 * Capacity-level availability check (for bot/internal use).
 * Returns ONLY counts, never room numbers.
 * Protected by verifyToken (same as other internal API calls).
 */
router.post('/check-capacity', verifyToken, async (req, res, next) => {
  try {
    const { error, value } = validateBody(checkCapacitySchema, req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const dateError = validateDateRange(value.checkInDate, value.checkOutDate);
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    const result = await getCapacityAvailability(
      value.checkInDate,
      value.checkOutDate,
      value.minCapacity
    );

    res.json({
      success: true,
      availability: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/availability/rooms
 * Detailed room-level availability for staff dashboard.
 * Returns specific room numbers, series names, capacities.
 */
router.get('/rooms', verifyToken, async (req, res, next) => {
  try {
    const { checkInDate, checkOutDate, minCapacity } = req.query;

    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        message: 'checkInDate and checkOutDate query parameters are required'
      });
    }

    const dateError = validateDateRange(checkInDate, checkOutDate);
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    const rooms = await getDetailedAvailability(
      checkInDate,
      checkOutDate,
      minCapacity ? parseInt(minCapacity) : 0
    );

    res.json({
      success: true,
      rooms
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/availability/suggestions
 * Room combination suggestions for a given guest count.
 */
router.get('/suggestions', verifyToken, async (req, res, next) => {
  try {
    const { checkInDate, checkOutDate, requiredCapacity } = req.query;

    if (!checkInDate || !checkOutDate || !requiredCapacity) {
      return res.status(400).json({
        success: false,
        message: 'checkInDate, checkOutDate, and requiredCapacity query parameters are required'
      });
    }

    const dateError = validateDateRange(checkInDate, checkOutDate);
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    const result = await suggestRoomCombinations(
      checkInDate,
      checkOutDate,
      parseInt(requiredCapacity)
    );

    res.json({
      success: true,
      suggestions: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/availability/room-bookings
 * Create a room booking. Staff and admin can both do this.
 */
router.post('/room-bookings', verifyToken, async (req, res, next) => {
  try {
    const { error, value } = validateBody(createRoomBookingSchema, req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const dateError = validateDateRange(value.checkInDate, value.checkOutDate);
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    if (!isValidObjectId(value.roomId) || !isValidObjectId(value.bookingId)) {
      return res.status(400).json({ success: false, message: 'Invalid roomId or bookingId' });
    }

    const roomBooking = await createRoomBooking(
      value.roomId,
      value.bookingId,
      value.checkInDate,
      value.checkOutDate,
      req.user.id // assignedBy from JWT
    );

    await roomBooking.populate('roomId', 'roomNumber capacity');
    await roomBooking.populate('bookingId', 'customerName customerPhone');
    await roomBooking.populate('assignedBy', 'name email');

    res.status(201).json({
      success: true,
      roomBooking
    });
  } catch (error) {
    if (error.message.includes('no longer available')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    next(error);
  }
});

/**
 * PATCH /api/availability/room-bookings/:id/cancel
 * Cancel a room booking.
 */
router.patch('/room-bookings/:id/cancel', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room booking ID' });
    }

    const { error, value } = validateBody(cancelSchema, req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const roomBooking = await cancelRoomBooking(req.params.id, value.reason);
    await roomBooking.populate('roomId', 'roomNumber capacity');

    res.json({
      success: true,
      roomBooking
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
});

/**
 * PATCH /api/availability/room-bookings/:id/reschedule
 * Reschedule a room booking to new dates.
 */
router.patch('/room-bookings/:id/reschedule', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room booking ID' });
    }

    const { error, value } = validateBody(rescheduleSchema, req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const dateError = validateDateRange(value.newCheckInDate, value.newCheckOutDate);
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    const roomBooking = await rescheduleRoomBooking(
      req.params.id,
      value.newCheckInDate,
      value.newCheckOutDate
    );

    await roomBooking.populate('roomId', 'roomNumber capacity');

    res.json({
      success: true,
      roomBooking
    });
  } catch (error) {
    if (error.message.includes('not available') || error.message.includes('not found')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    next(error);
  }
});

/**
 * PATCH /api/availability/room-bookings/:id/status
 * Update room booking status (check-in, check-out, no-show).
 */
router.patch('/room-bookings/:id/status', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room booking ID' });
    }

    const { error, value } = validateBody(statusTransitionSchema, req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const roomBooking = await RoomBooking.findByIdAndUpdate(
      req.params.id,
      { $set: { status: value.status } },
      { new: true, runValidators: true }
    );

    if (!roomBooking) {
      return res.status(404).json({ success: false, message: 'Room booking not found' });
    }

    await roomBooking.populate('roomId', 'roomNumber capacity');

    res.json({
      success: true,
      roomBooking
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/availability/grid
 * Full grid availability for all rooms across all series for a date range.
 * Returns rooms grouped by series with computed status (available/booked/maintenance).
 */
router.get('/grid', verifyToken, async (req, res, next) => {
  try {
    const { checkInDate, checkOutDate } = req.query;

    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        message: 'checkInDate and checkOutDate query parameters are required'
      });
    }

    const dateError = validateDateRange(checkInDate, checkOutDate);
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    // Fetch all active series
    const series = await Series.find({ status: 'active' }).sort({ name: 1 });

    // Fetch all rooms for active series
    const rooms = await Room.find({ 
      seriesId: { $in: series.map(s => s._id) }
    }).populate('seriesId', 'name status').sort({ 'seriesId.name': 1, roomNumber: 1 });

    // Fetch all active maintenance locks overlapping the date range
    const RoomMaintenance = require('../models/RoomMaintenance');
    const checkInObj = new Date(checkInDate);
    const checkOutObj = new Date(checkOutDate);

    const overlappingMaintenance = await RoomMaintenance.find({
      status: 'active',
      startDate: { $lt: checkOutObj },
      endDate: { $gt: checkInObj }
    }).lean();

    const maintenanceMap = {};
    overlappingMaintenance.forEach(m => {
      maintenanceMap[String(m.roomId)] = m;
    });

    // Get all active bookings that overlap the date range
    const overlappingBookings = await RoomBooking.find({
      status: { $in: ['confirmed', 'checked_in'] },
      checkInDate: { $lt: checkOutObj },
      checkOutDate: { $gt: checkInObj }
    }).populate('bookingId', 'customerName customerPhone');

    // Also get all active Bookings from main collection
    const activeMainBookings = await Booking.find({
      status: { $in: ['pending_payment', 'confirmed', 'checked_in'] },
      checkInDate: { $lt: checkOutObj },
      checkOutDate: { $gt: checkInObj }
    }).lean();

    // Create a map of roomId -> booking info
    const bookingMap = {};
    overlappingBookings.forEach(rb => {
      bookingMap[rb.roomId.toString()] = {
        bookingId: rb.bookingId?._id || rb.bookingId,
        customerName: rb.bookingId?.customerName || 'Guest',
        customerPhone: rb.bookingId?.customerPhone || '',
        checkInDate: rb.checkInDate,
        checkOutDate: rb.checkOutDate,
        status: rb.status
      };
    });

    activeMainBookings.forEach(b => {
      const ids = Array.isArray(b.roomIds) ? b.roomIds : [b.roomId];
      ids.forEach(id => {
        if (id) {
          bookingMap[String(id)] = {
            bookingId: b._id,
            customerName: b.customerName || 'Guest',
            customerPhone: b.customerPhone || '',
            checkInDate: b.checkInDate,
            checkOutDate: b.checkOutDate,
            status: b.status
          };
        }
      });
    });

    // Group rooms by series and compute status
    const seriesMap = series.map(s => ({
      _id: s._id,
      name: s.name,
      rooms: []
    }));

    const seriesMapObj = {};
    seriesMap.forEach(s => {
      seriesMapObj[s._id.toString()] = s;
    });

    for (const room of rooms) {
      const seriesId = room.seriesId._id.toString();
      if (!seriesMapObj[seriesId]) continue;

      let status = 'available';
      let booking = null;
      let maintenance = null;

      const roomIdStr = room._id.toString();
      const roomNumStr = String(room.roomNumber);

      // Check if room is in active maintenance
      const maintObj = maintenanceMap[roomIdStr] || maintenanceMap[roomNumStr];
      if (maintObj || room.status === 'maintenance') {
        status = 'maintenance';
        maintenance = maintObj ? {
          type: maintObj.maintenanceType,
          reason: maintObj.reason,
          until: maintObj.endDate
        } : { type: 'maintenance', reason: 'Under servicing' };
      }
      // Check if room has overlapping booking
      else if (bookingMap[roomIdStr] || bookingMap[roomNumStr]) {
        status = 'booked';
        booking = bookingMap[roomIdStr] || bookingMap[roomNumStr];
      }

      seriesMapObj[seriesId].rooms.push({
        _id: room._id,
        roomNumber: room.roomNumber,
        capacity: room.capacity,
        status,
        booking,
        maintenance
      });
    }

    res.json({
      success: true,
      grid: seriesMap.filter(s => s.rooms.length > 0)
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
