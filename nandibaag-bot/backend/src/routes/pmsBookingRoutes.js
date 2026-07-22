const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
  getDetailedAvailability,
  createRoomBooking,
  cancelRoomBooking,
  rescheduleRoomBooking,
  checkOverlap
} = require('../services/availabilityService');
const { Chat, Booking, Room, RoomBooking } = require('../models');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function validateBody(schema, body) {
  const { error, value } = schema.validate(body);
  if (error) return { error: error.details[0].message };
  return { value };
}

function validateDateRange(checkIn, checkOut) {
  const ci = new Date(checkIn);
  const co = new Date(checkOut);
  if (co <= ci) return 'checkOutDate must be after checkInDate';
  return null;
}

// ── Joi Schemas ──────────────────────────────────────────────────────

const createBookingFromChatSchema = Joi.object({
  chatId: Joi.string().hex().length(24).required(),
  guestName: Joi.string().trim().min(1).required(),
  guestPhone: Joi.string().trim().min(5).required(),
  guestAddress: Joi.string().allow('', null).optional(),
  guestIdProofType: Joi.string().valid('aadhaar', 'pan', 'license').allow(null).optional(),
  specialRequests: Joi.string().allow('', null).optional()
});

const assignRoomSchema = Joi.object({
  roomId: Joi.string().hex().length(24).required()
});

const cancelBookingSchema = Joi.object({
  reason: Joi.string().allow('', null).default('')
});

const rescheduleBookingSchema = Joi.object({
  newCheckInDate: Joi.string().isoDate().required(),
  newCheckOutDate: Joi.string().isoDate().required()
});

const moveRoomSchema = Joi.object({
  newRoomId: Joi.string().hex().length(24).required()
});

const statusSchema = Joi.object({
  status: Joi.string().valid('confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show').required()
});

const manualBookingSchema = Joi.object({
  guestName: Joi.string().trim().min(1).required(),
  guestPhone: Joi.string().trim().min(5).required(),
  guestAddress: Joi.string().allow('', null).optional(),
  guestIdProofType: Joi.string().valid('aadhaar', 'pan', 'license').allow(null).optional(),
  bookingType: Joi.string().valid('couple', 'group', 'picnic').required(),
  checkInDate: Joi.string().isoDate().required(),
  checkOutDate: Joi.string().isoDate().required(),
  adults: Joi.number().integer().min(1).required(),
  kids: Joi.array().items(Joi.object({ age: Joi.number().integer().min(0), rate: Joi.number().min(0) })).default([]),
  totalAmount: Joi.number().min(0).required(),
  priceBreakdown: Joi.string().allow('', null).optional(),
  specialRequests: Joi.string().allow('', null).optional(),
  roomId: Joi.string().hex().length(24).allow(null).optional(),
  roomIds: Joi.array().items(Joi.string().hex().length(24)).optional()
});

// ── Routes ───────────────────────────────────────────────────────────

/**
 * GET /api/pms/pending-handovers
 * List all Chat documents where bookingStage === 'handed_over'
 * and no Booking has been finalized yet.
 */
router.get('/pending-handovers', verifyToken, async (req, res, next) => {
  try {
    // Find chats in handover state
    const chats = await Chat.find({ bookingStage: 'handed_over' })
      .sort({ lastMessageAt: -1 })
      .select('customerPhone customerName bookingStage bookingDraft lastMessageAt');

    // Filter out chats that already have a confirmed/pending booking
    const chatIds = chats.map(c => c._id);
    const existingBookings = await Booking.find({
      chatId: { $in: chatIds },
      status: { $nin: ['cancelled'] }
    }).select('chatId status');
    const bookedChatIds = new Set(existingBookings.map(b => b.chatId.toString()));

    const pendingHandovers = chats
      .filter(c => !bookedChatIds.has(c._id.toString()))
      .map(c => ({
        _id: c._id,
        customerPhone: c.customerPhone,
        customerName: c.customerName,
        bookingDraft: {
          bookingType: c.bookingDraft?.bookingType,
          date: c.bookingDraft?.date,
          nights: c.bookingDraft?.nights,
          adults: c.bookingDraft?.adults,
          kids: c.bookingDraft?.kids || [],
          calculatedPrice: c.bookingDraft?.calculatedPrice,
          priceBreakdown: c.bookingDraft?.priceBreakdown,
          specialRequests: c.bookingDraft?.specialRequests,
          availabilityChecked: c.bookingDraft?.availabilityChecked,
          availabilityConfirmed: c.bookingDraft?.availabilityConfirmed,
          roomPreference: c.bookingDraft?.roomPreference,
          suggestedCombination: c.bookingDraft?.suggestedCombination
        },
        lastMessageAt: c.lastMessageAt
      }));

    res.json({
      success: true,
      count: pendingHandovers.length,
      handovers: pendingHandovers
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pms/bookings
 * Create a Booking from a handed-off chat.
 */
router.post('/bookings', verifyToken, async (req, res, next) => {
  try {
    const { error, value } = validateBody(createBookingFromChatSchema, req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const chat = await Chat.findById(value.chatId);
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    if (chat.bookingStage !== 'handed_over') {
      return res.status(400).json({ success: false, message: 'Chat is not in handover state' });
    }

    // Check if a non-cancelled booking already exists for this chat
    const existingBooking = await Booking.findOne({
      chatId: chat._id,
      status: { $nin: ['cancelled'] }
    });
    if (existingBooking) {
      return res.status(409).json({ success: false, message: 'Booking already exists for this chat' });
    }

    const draft = chat.bookingDraft || {};
    const booking = new Booking({
      chatId: chat._id,
      customerName: value.guestName,
      customerPhone: value.guestPhone,
      guestAddress: value.guestAddress || null,
      guestIdProofType: value.guestIdProofType || null,
      specialRequests: value.specialRequests || draft.specialRequests || '',
      bookingType: draft.bookingType || 'group',
      date: draft.date || new Date().toISOString().split('T')[0],
      checkInDate: draft.date ? new Date(draft.date) : new Date(),
      checkOutDate: draft.date && draft.nights
        ? new Date(new Date(draft.date).getTime() + (draft.nights || 1) * 86400000)
        : new Date(Date.now() + 86400000),
      isWeekend: [0, 6].includes(new Date(draft.date || Date.now()).getDay()),
      adults: draft.adults || 1,
      kids: (draft.kids || []).map(k => ({ age: k.age, rate: 0 })),
      totalAmount: draft.calculatedPrice || 0,
      priceBreakdown: draft.priceBreakdown || '',
      status: 'pending_payment',
      createdBy: 'staff'
    });

    await booking.save();

    // Update chat stage to completed
    chat.bookingStage = 'completed';
    await chat.save();

    res.status(201).json({ success: true, booking });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pms/bookings/:id/available-rooms
 * Detailed availability scoped to booking's dates/guest count.
 */
router.get('/bookings/:id/available-rooms', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const checkIn = booking.checkInDate || new Date(booking.date);
    const checkOut = booking.checkOutDate || new Date(checkIn.getTime() + 86400000);
    const minCapacity = 0; // show all rooms, let staff decide

    const rooms = await getDetailedAvailability(
      checkIn.toISOString(),
      checkOut.toISOString(),
      minCapacity
    );

    const guestCount = (booking.adults || 1) + (booking.kids || []).length;

    res.json({
      success: true,
      rooms,
      guestCount,
      checkInDate: checkIn,
      checkOutDate: checkOut
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pms/bookings/:id/check-room/:roomId
 * Quick single-room availability check for the booking's dates.
 * Used by frontend to verify a room is still free at the moment of selection
 * (safety net against stale data if another staff booked it in the meantime).
 */
router.get('/bookings/:id/check-room/:roomId', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id) || !isValidObjectId(req.params.roomId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const checkIn = booking.checkInDate || new Date(booking.date);
    const checkOut = booking.checkOutDate || new Date(checkIn.getTime() + 86400000);

    // Exclude this booking's own existing room booking from overlap check
    const hasOverlap = await checkOverlap(req.params.roomId, checkIn.toISOString(), checkOut.toISOString(), booking.roomBookingId || null);

    res.json({
      success: true,
      roomId: req.params.roomId,
      roomNumber: room.roomNumber,
      available: !hasOverlap,
      checkInDate: checkIn,
      checkOutDate: checkOut
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pms/bookings/:id/assign-room
 * Assign a room to a booking — creates RoomBooking, sets status to confirmed.
 * Returns capacity-mismatch warning if applicable (soft warning, not a hard block).
 */
router.post('/bookings/:id/assign-room', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const { error, value } = validateBody(assignRoomSchema, req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (booking.roomBookingId) {
      return res.status(409).json({ success: false, message: 'Room already assigned. Use move-room to change.' });
    }

    const room = await Room.findById(value.roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const checkIn = booking.checkInDate || new Date(booking.date);
    const checkOut = booking.checkOutDate || new Date(checkIn.getTime() + 86400000);

    // Capacity mismatch soft-warning
    const guestCount = (booking.adults || 1) + (booking.kids || []).length;
    let warning = null;
    if (room.capacity < guestCount) {
      warning = `Guest count (${guestCount}) exceeds room capacity (${room.capacity})`;
    }

    // Create the room booking
    const roomBooking = await createRoomBooking(
      value.roomId,
      booking._id,
      checkIn.toISOString(),
      checkOut.toISOString(),
      req.user.id
    );

    // Link to booking and confirm
    booking.roomBookingId = roomBooking._id;
    booking.status = 'confirmed';
    await booking.save();
    // Phase F+G: lifecycleMessageCron will automatically pick up this booking
    // on its next run (queries bookings with roomBookingId + confirmed status)

    await roomBooking.populate('roomId', 'roomNumber capacity seriesId');

    res.json({
      success: true,
      warning,
      booking,
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
 * PATCH /api/pms/bookings/:id/cancel
 * Cancel booking and its linked RoomBooking.
 */
router.patch('/bookings/:id/cancel', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const { error, value } = validateBody(cancelBookingSchema, req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Cancel linked RoomBooking if one exists
    if (booking.roomBookingId) {
      try {
        await cancelRoomBooking(booking.roomBookingId, value.reason || 'Booking cancelled by staff');
      } catch (err) {
        // Room booking may already be cancelled — continue
      }
    }

    booking.status = 'cancelled';
    await booking.save();

    res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/pms/bookings/:id/reschedule
 * Reschedule to new dates. If the current room isn't free, returns error.
 */
router.patch('/bookings/:id/reschedule', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const { error, value } = validateBody(rescheduleBookingSchema, req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const dateError = validateDateRange(value.newCheckInDate, value.newCheckOutDate);
    if (dateError) return res.status(400).json({ success: false, message: dateError });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Reschedule the linked RoomBooking if one exists
    if (booking.roomBookingId) {
      await rescheduleRoomBooking(
        booking.roomBookingId,
        value.newCheckInDate,
        value.newCheckOutDate
      );
    }

    booking.checkInDate = new Date(value.newCheckInDate);
    booking.checkOutDate = new Date(value.newCheckOutDate);
    booking.date = value.newCheckInDate.split('T')[0];
    booking.isWeekend = [0, 6].includes(new Date(value.newCheckInDate).getDay());
    await booking.save();

    res.json({ success: true, booking });
  } catch (error) {
    if (error.message.includes('not available') || error.message.includes('not found')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    next(error);
  }
});

/**
 * PATCH /api/pms/bookings/:id/move-room
 * Cancel old RoomBooking, create new one for different room. All-or-nothing.
 */
router.patch('/bookings/:id/move-room', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const { error, value } = validateBody(moveRoomSchema, req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const newRoom = await Room.findById(value.newRoomId);
    if (!newRoom) return res.status(404).json({ success: false, message: 'New room not found' });

    const checkIn = booking.checkInDate || new Date(booking.date);
    const checkOut = booking.checkOutDate || new Date(checkIn.getTime() + 86400000);

    // Verify new room is available BEFORE cancelling old one
    const hasOverlap = await checkOverlap(value.newRoomId, checkIn.toISOString(), checkOut.toISOString());
    if (hasOverlap) {
      return res.status(409).json({ success: false, message: 'New room is not available for these dates' });
    }

    // Capacity mismatch soft-warning
    const guestCount = (booking.adults || 1) + (booking.kids || []).length;
    let warning = null;
    if (newRoom.capacity < guestCount) {
      warning = `Guest count (${guestCount}) exceeds room capacity (${newRoom.capacity})`;
    }

    // Create new room booking first
    const newRoomBooking = await createRoomBooking(
      value.newRoomId,
      booking._id,
      checkIn.toISOString(),
      checkOut.toISOString(),
      req.user.id
    );

    // Cancel old room booking if exists
    if (booking.roomBookingId) {
      try {
        await cancelRoomBooking(booking.roomBookingId, 'Room moved to different room');
      } catch (err) {
        // Old booking may already be cancelled
      }
    }

    booking.roomBookingId = newRoomBooking._id;
    await booking.save();

    await newRoomBooking.populate('roomId', 'roomNumber capacity seriesId');

    res.json({ success: true, warning, booking, roomBooking: newRoomBooking });
  } catch (error) {
    if (error.message.includes('no longer available') || error.message.includes('not available')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    next(error);
  }
});

/**
 * PATCH /api/pms/bookings/:id/status
 * Status transitions (check-in, check-out, no-show) on linked RoomBooking.
 */
router.patch('/bookings/:id/status', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const { error, value } = validateBody(statusSchema, req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Update linked RoomBooking status if one exists
    if (booking.roomBookingId && ['checked_in', 'checked_out', 'no_show'].includes(value.status)) {
      await RoomBooking.findByIdAndUpdate(booking.roomBookingId, { status: value.status });
    }

    booking.status = value.status;
    await booking.save();

    res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/pms/bookings/:id/stop-messages
 * Toggle messagesStopped flag.
 */
router.patch('/bookings/:id/stop-messages', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    booking.messagesStopped = !booking.messagesStopped;
    await booking.save();

    res.json({ success: true, messagesStopped: booking.messagesStopped });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pms/bookings/manual
 * Create a booking not from WhatsApp (walk-in, phone, etc.).
 */
router.post('/bookings/manual', verifyToken, async (req, res, next) => {
  try {
    const { error, value } = validateBody(manualBookingSchema, req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const dateError = validateDateRange(value.checkInDate, value.checkOutDate);
    if (dateError) return res.status(400).json({ success: false, message: dateError });

    const booking = new Booking({
      customerName: value.guestName,
      customerPhone: value.guestPhone,
      guestAddress: value.guestAddress || null,
      guestIdProofType: value.guestIdProofType || null,
      bookingType: value.bookingType,
      date: value.checkInDate.split('T')[0],
      checkInDate: new Date(value.checkInDate),
      checkOutDate: new Date(value.checkOutDate),
      isWeekend: [0, 6].includes(new Date(value.checkInDate).getDay()),
      adults: value.adults,
      kids: value.kids || [],
      totalAmount: value.totalAmount,
      priceBreakdown: value.priceBreakdown || '',
      specialRequests: value.specialRequests || '',
      status: 'pending_payment',
      createdBy: 'staff'
    });

    await booking.save();

    // Handle room assignment - either single roomId or multiple roomIds
    let warning = null;
    const roomBookings = [];
    const createdRoomBookingIds = [];

    // If roomIds array provided, create multiple RoomBookings (all-or-nothing)
    if (value.roomIds && value.roomIds.length > 0) {
      const session = mongoose.connection.client.startSession ? await mongoose.connection.client.startSession() : null;
      let useTransaction = false;

      if (session && session.client && mongoose.connection.readyState === 1) {
        try {
          const adminDb = mongoose.connection.db.admin ? mongoose.connection.db.admin() : null;
          if (adminDb) {
            await adminDb.command({ ping: 1 });
            useTransaction = true;
          }
        } catch (err) {
          useTransaction = false;
        }
      }

      try {
        if (useTransaction && session) {
          session.startTransaction();
        }

        // Create RoomBooking for each roomId
        for (const roomId of value.roomIds) {
          const room = await Room.findById(roomId);
          if (!room) {
            if (useTransaction && session) await session.abortTransaction();
            if (session) await session.endSession();
            return res.status(404).json({ success: false, message: `Room not found: ${roomId}` });
          }

          const guestCount = value.adults + (value.kids || []).length;
          if (room.capacity < guestCount && !warning) {
            warning = `Guest count (${guestCount}) exceeds room capacity (${room.capacity}) for some rooms`;
          }

          const roomBooking = await createRoomBooking(
            roomId,
            booking._id,
            value.checkInDate,
            value.checkOutDate,
            req.user.id
          );

          roomBookings.push(roomBooking);
          createdRoomBookingIds.push(roomBooking._id);
        }

        if (useTransaction && session) {
          await session.commitTransaction();
        }

        // Link first room booking to booking for compatibility
        booking.roomBookingId = roomBookings[0]._id;
        booking.status = 'confirmed';
        await booking.save();

        // Populate room details
        await Promise.all(roomBookings.map(rb => rb.populate('roomId', 'roomNumber capacity seriesId')));

      } catch (error) {
        if (useTransaction && session) await session.abortTransaction();
        if (session) await session.endSession();
        
        // Rollback: delete any room bookings that were created
        if (createdRoomBookingIds.length > 0) {
          await RoomBooking.deleteMany({ _id: { $in: createdRoomBookingIds } });
        }
        
        if (error.message.includes('no longer available')) {
          return res.status(409).json({ success: false, message: error.message });
        }
        throw error;
      } finally {
        if (session) await session.endSession();
      }
    }
    // If single roomId provided (legacy behavior)
    else if (value.roomId) {
      const room = await Room.findById(value.roomId);
      if (!room) {
        return res.status(404).json({ success: false, message: 'Room not found' });
      }

      const guestCount = value.adults + (value.kids || []).length;
      if (room.capacity < guestCount) {
        warning = `Guest count (${guestCount}) exceeds room capacity (${room.capacity})`;
      }

      const roomBooking = await createRoomBooking(
        value.roomId,
        booking._id,
        value.checkInDate,
        value.checkOutDate,
        req.user.id
      );

      booking.roomBookingId = roomBooking._id;
      booking.status = 'confirmed';
      await booking.save();

      await roomBooking.populate('roomId', 'roomNumber capacity seriesId');
      roomBookings.push(roomBooking);
    }

    res.status(201).json({ success: true, warning, booking, roomBookings });
  } catch (error) {
    if (error.message.includes('no longer available')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    next(error);
  }
});

/**
 * GET /api/pms/bookings
 * List bookings with filters: ?status=, ?date=, ?search=
 */
router.get('/bookings', verifyToken, async (req, res, next) => {
  try {
    const { status, date, dateFrom, dateTo, search, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (date) {
      const d = new Date(date);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      filter.checkInDate = { $gte: d, $lt: nextDay };
    }
    // Date range filter: finds bookings whose stay period overlaps [dateFrom, dateTo]
    if (dateFrom || dateTo) {
      if (dateFrom && dateTo) {
        filter.checkInDate = { $lte: new Date(dateTo + 'T23:59:59.999Z') };
        filter.checkOutDate = { $gte: new Date(dateFrom) };
      } else if (dateFrom) {
        filter.checkOutDate = { $gte: new Date(dateFrom) };
      } else if (dateTo) {
        filter.checkInDate = { $lte: new Date(dateTo + 'T23:59:59.999Z') };
      }
    }
    if (search) {
      filter.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } }
      ];
    }

    const bookings = await Booking.find(filter)
      .populate('roomBookingId')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Populate room details if roomBookingId exists
    const populated = await Promise.all(
      bookings.map(async (b) => {
        const obj = b.toObject();
        if (b.roomBookingId && b.roomBookingId.roomId) {
          const room = await Room.findById(b.roomBookingId.roomId).select('roomNumber capacity seriesId');
          if (room) {
            await room.populate('seriesId', 'name');
            obj.room = room;
          }
        }
        return obj;
      })
    );

    const total = await Booking.countDocuments(filter);

    res.json({
      success: true,
      bookings: populated,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
