const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { Series, Room, RoomBooking, Booking } = require('../models');
const { logActivity } = require('../utils/activityLogger');

const router = express.Router();

const statusEnum = Joi.string().valid('active', 'maintenance', 'deleted');

const createSeriesSchema = Joi.object({
  name: Joi.string().trim().min(1).required()
});

const patchSeriesSchema = Joi.object({
  name: Joi.string().trim().min(1),
  status: statusEnum,
  notes: Joi.string().allow('')
}).min(1);

const createRoomSchema = Joi.object({
  seriesId: Joi.string().hex().length(24).required(),
  roomNumber: Joi.string().trim().min(1).required(),
  capacity: Joi.number().integer().min(1).required()
});

const patchRoomSchema = Joi.object({
  capacity: Joi.number().integer().min(1),
  status: statusEnum,
  notes: Joi.string().allow('')
}).min(1);

const patchRoomStatusSchema = Joi.object({
  status: statusEnum.valid('active', 'maintenance').required(),
  notes: Joi.string().allow('')
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

function notifyInventoryChange(req) {
  const io = req.app.get('io');
  if (io) {
    io.emit('inventory:updated', { timestamp: new Date() });
    io.emit('availability:updated', { timestamp: new Date() });
  }
}

async function attachRoomCounts(seriesList) {
  const seriesIds = seriesList.map((s) => s._id);

  const counts = await Room.aggregate([
    { $match: { seriesId: { $in: seriesIds }, status: { $ne: 'deleted' } } },
    {
      $group: {
        _id: '$seriesId',
        roomCount: { $sum: 1 },
        activeRoomCount: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        }
      }
    }
  ]);

  const countMap = Object.fromEntries(
    counts.map((c) => [c._id.toString(), c])
  );

  return seriesList.map((series) => {
    const doc = series.toObject ? series.toObject() : series;
    const stats = countMap[doc._id.toString()] || { roomCount: 0, activeRoomCount: 0 };
    return {
      ...doc,
      roomCount: stats.roomCount,
      activeRoomCount: stats.activeRoomCount
    };
  });
}

/**
 * GET /api/inventory/series
 */
router.get('/series', verifyToken, async (req, res, next) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const filter = includeDeleted ? {} : { status: { $ne: 'deleted' } };

    const seriesList = await Series.find(filter).sort({ name: 1 });
    const seriesWithCounts = await attachRoomCounts(seriesList);

    res.json({
      success: true,
      series: seriesWithCounts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/inventory/series
 */
router.post('/series', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { error, value } = validateBody(createSeriesSchema, req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const existing = await Series.findOne({ name: value.name });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A series with this name already exists'
      });
    }

    const series = new Series({ name: value.name });
    await series.save();

    notifyInventoryChange(req);

    res.status(201).json({
      success: true,
      series: { ...series.toObject(), roomCount: 0, activeRoomCount: 0 }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/inventory/series/:id
 */
router.patch('/series/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid series ID' });
    }

    const { error, value } = validateBody(patchSeriesSchema, req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    if (value.name) {
      const duplicate = await Series.findOne({
        name: value.name,
        _id: { $ne: req.params.id }
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: 'A series with this name already exists'
        });
      }
    }

    const series = await Series.findByIdAndUpdate(
      req.params.id,
      { $set: value },
      { new: true, runValidators: true }
    );

    if (!series) {
      return res.status(404).json({ success: false, message: 'Series not found' });
    }

    const [seriesWithCounts] = await attachRoomCounts([series]);

    res.json({
      success: true,
      series: seriesWithCounts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/inventory/series/:id
 * Soft-delete series and cascade to all rooms.
 */
router.delete('/series/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid series ID' });
    }

    const series = await Series.findById(req.params.id);
    if (!series) {
      return res.status(404).json({ success: false, message: 'Series not found' });
    }

    if (series.status === 'deleted') {
      return res.status(400).json({ success: false, message: 'Series is already deleted' });
    }

    // TODO Phase B: Block deletion if any room under this series has an active/future RoomBooking.
    // Return an error before soft-deleting when RoomBooking model exists.

    series.status = 'deleted';
    await series.save();

    const cascadeResult = await Room.updateMany(
      { seriesId: series._id, status: { $ne: 'deleted' } },
      { $set: { status: 'deleted' } }
    );

    res.json({
      success: true,
      message: 'Series and its rooms have been soft-deleted',
      roomsAffected: cascadeResult.modifiedCount
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/inventory/series/:id/rooms
 * Alias for fetching rooms by series ID
 */
router.get('/series/:id/rooms', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid series ID' });
    }
    const rooms = await Room.find({ seriesId: req.params.id, status: { $ne: 'deleted' } }).sort({ roomNumber: 1 });
    res.json({
      success: true,
      rooms
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/inventory/rooms
 */
router.get('/rooms', verifyToken, async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    } else {
      filter.status = { $ne: 'deleted' };
    }

    if (req.query.seriesId) {
      if (!isValidObjectId(req.query.seriesId)) {
        return res.status(400).json({ success: false, message: 'Invalid seriesId' });
      }
      filter.seriesId = req.query.seriesId;
    }

    const rooms = await Room.find(filter)
      .populate('seriesId', 'name status')
      .sort({ roomNumber: 1 });

    res.json({
      success: true,
      rooms
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/inventory/rooms
 */
router.post('/rooms', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { error, value } = validateBody(createRoomSchema, req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const series = await Series.findById(value.seriesId);
    if (!series || series.status === 'deleted') {
      return res.status(400).json({
        success: false,
        message: 'Series does not exist or has been deleted'
      });
    }

    const existing = await Room.findOne({
      seriesId: value.seriesId,
      roomNumber: value.roomNumber
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Room ${value.roomNumber} already exists in this series`
      });
    }

    const room = new Room({
      seriesId: value.seriesId,
      roomNumber: value.roomNumber,
      capacity: value.capacity
    });
    await room.save();
    await room.populate('seriesId', 'name status');

    notifyInventoryChange(req);

    res.status(201).json({
      success: true,
      room
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/inventory/rooms/:id
 */
router.patch('/rooms/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }

    const { error, value } = validateBody(patchRoomSchema, req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { $set: value },
      { new: true, runValidators: true }
    ).populate('seriesId', 'name status');

    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    notifyInventoryChange(req);
    logActivity(req.user.id, 'room_status_changed', `Updated Room ${room.roomNumber} status to ${value.status || room.status}`, req);

    res.json({
      success: true,
      room
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/inventory/series/:id/rooms (Alias for room creation)
 */
router.post('/series/:id/rooms', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const seriesId = req.params.id;
    const { roomNumber, capacity } = req.body;
    if (!roomNumber) {
      return res.status(400).json({ success: false, message: 'roomNumber is required' });
    }

    const existing = await Room.findOne({ seriesId, roomNumber });
    if (existing) {
      return res.status(409).json({ success: false, message: `Room ${roomNumber} already exists in this series` });
    }

    const room = new Room({
      seriesId,
      roomNumber,
      capacity: Number(capacity) || 4
    });
    await room.save();
    await room.populate('seriesId', 'name status');

    notifyInventoryChange(req);

    res.status(201).json({
      success: true,
      room
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/inventory/rooms/:id
 */
router.delete('/rooms/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }

    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    if (room.status === 'deleted') {
      return res.status(400).json({ success: false, message: 'Room is already deleted' });
    }

    // TODO Phase B: Block deletion if this room has an active/future RoomBooking.

    room.status = 'deleted';
    await room.save();

    res.json({
      success: true,
      message: 'Room has been soft-deleted'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/inventory/rooms/:id/status
 */
router.patch('/rooms/:id/status', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }

    const { error, value } = validateBody(patchRoomStatusSchema, req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const update = { status: value.status };
    if (value.notes !== undefined) {
      update.notes = value.notes;
    }

    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    ).populate('seriesId', 'name status');

    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    res.json({
      success: true,
      room
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/inventory/summary
 */
router.get('/summary', verifyToken, async (req, res, next) => {
  try {
    const nonDeletedRooms = await Room.find({ status: { $ne: 'deleted' } });

    const byStatus = { active: 0, maintenance: 0 };
    let totalActiveCapacity = 0;

    for (const room of nonDeletedRooms) {
      if (byStatus[room.status] !== undefined) {
        byStatus[room.status]++;
      }
      if (room.status === 'active') {
        totalActiveCapacity += room.capacity;
      }
    }

    const seriesList = await Series.find({ status: { $ne: 'deleted' } }).sort({ name: 1 });
    const seriesWithCounts = await attachRoomCounts(seriesList);

    const bySeries = seriesWithCounts.map((s) => ({
      seriesId: s._id,
      name: s.name,
      count: s.roomCount,
      activeCount: s.activeRoomCount
    }));

    res.json({
      success: true,
      summary: {
        totalRooms: nonDeletedRooms.length,
        totalActiveCapacity,
        byStatus,
        bySeries
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/inventory/availability-by-date
 * Returns booking status for all rooms on a specific date
 */
router.get('/availability-by-date', verifyToken, async (req, res, next) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date parameter is required' });
    }

    // Parse the date and set time to start of day
    const queryDate = new Date(date);
    if (isNaN(queryDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }

    const startOfDay = new Date(queryDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(queryDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all non-deleted rooms with series info
    const rooms = await Room.find({ status: { $ne: 'deleted' } })
      .populate('seriesId', 'name status')
      .sort({ 'seriesId.name': 1, roomNumber: 1 });

    // Get all active room bookings that overlap with the query date
    const activeBookings = await RoomBooking.find({
      status: { $in: ['confirmed', 'checked_in'] },
      checkInDate: { $lte: endOfDay },
      checkOutDate: { $gt: startOfDay }
    }).populate('bookingId', 'customerName customerPhone');

    // Create a map of roomId -> booking info for quick lookup
    const bookingMap = {};
    for (const booking of activeBookings) {
      bookingMap[booking.roomId.toString()] = {
        bookingId: booking.bookingId._id,
        customerName: booking.bookingId?.customerName || 'Unknown',
        customerPhone: booking.bookingId?.customerPhone || '',
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
        status: booking.status
      };
    }

    // Build response with room availability status
    const roomAvailability = rooms.map(room => {
      const booking = bookingMap[room._id.toString()];
      return {
        roomId: room._id,
        roomNumber: room.roomNumber,
        seriesName: room.seriesId?.name || 'Unknown',
        seriesStatus: room.seriesId?.status,
        capacity: room.capacity,
        status: room.status,
        isBooked: !!booking,
        booking: booking || null
      };
    });

    res.json({
      success: true,
      date: date,
      roomAvailability
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/inventory/seed
 * Seed / re-seed default 57 cottage rooms inventory across 4 series
 */
router.post('/seed', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { seed } = require('../scripts/seedRoomInventory');
    await seed();
    notifyInventoryChange(req);
    res.json({
      success: true,
      message: 'Successfully seeded 57 cottage rooms into MongoDB Atlas inventory!'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
