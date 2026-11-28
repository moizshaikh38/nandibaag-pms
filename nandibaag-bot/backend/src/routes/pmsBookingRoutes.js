const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const logger = require('../config/logger');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
  getDetailedAvailability,
  createRoomBooking,
  cancelRoomBooking,
  rescheduleRoomBooking,
  checkOverlap
} = require('../services/availabilityService');
const { Chat, Booking, Room, RoomBooking } = require('../models');
const { logActivity } = require('../utils/activityLogger');
const { calculateBookingQuote, isWeekend, PricingValidationError } = require('../services/pricingService');
const {
  VALID_PAYMENT_MODES,
  PaymentConcurrencyError,
  computePaymentSummary,
  syncBookingPaymentFields,
  attachPaymentSummary,
  persistPaymentAtomically
} = require('../services/paymentSyncService');
const {
  RoomConflictError,
  claimRoomNights,
  releaseRoomNights
} = require('../services/roomNightLockService');
const {
  BookingBusinessError,
  prepareAuthoritativeBookingData,
  logManualBookingAuditEvents
} = require('../services/manualBookingProcessor');
const {
  IdempotencyError,
  extractIdempotencyKey,
  acquireIdempotencyLock,
  attachBookingToIdempotency,
  completeIdempotency,
  releaseIdempotencyOnFailure
} = require('../services/idempotencyService');
const {
  uploadPaymentScreenshot,
  getSignedScreenshotAccess,
  StorageValidationError,
  StorageNotConfiguredError
} = require('../services/receiptStorageService');

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
  guestIdProofPhoto: Joi.string().allow('', null).optional(),
  bookingType: Joi.string().valid('couple', 'group', 'picnic', 'oneDay', 'one-day-picnic', 'overnight', 'dayuse').required(),
  packageType: Joi.string().valid('couple', 'group', 'picnic', 'oneDay', 'one-day-picnic', 'overnight', 'dayuse').optional(),
  mealOption: Joi.string().allow('', null).optional(),
  checkInDate: Joi.string().required(),
  checkOutDate: Joi.string().allow('', null).optional(),
  adults: Joi.number().integer().min(1).required(),
  childrenAges: Joi.array().items(Joi.number().integer().min(0).max(120)).optional(),
  kids: Joi.array().items(
    Joi.alternatives().try(
      Joi.number().integer().min(0).max(120),
      Joi.object({ age: Joi.number().integer().min(0).max(120), rate: Joi.number().min(0) }).unknown(true)
    )
  ).default([]),
  roomAddon: Joi.alternatives().try(Joi.boolean(), Joi.object({ enabled: Joi.boolean() }).unknown(true)).optional(),
  rateOverrides: Joi.object().unknown(true).allow(null).optional(),
  discount: Joi.object().unknown(true).allow(null).optional(),
  customTotal: Joi.number().min(0).allow(null, '').optional(),
  payment: Joi.object().unknown(true).allow(null).optional(),
  advancePayment: Joi.number().min(0).allow(null).optional(),
  paymentMode: Joi.string().allow('', null).optional(),
  utr: Joi.string().allow('', null).optional(),
  paymentScreenshotRef: Joi.string().allow('', null).optional(),
  acknowledgeCoupleWarning: Joi.boolean().optional(),
  acknowledgedCoupleWarningCode: Joi.string().allow('', null).optional(),
  acknowledgeZeroAdvance: Joi.boolean().optional(),
  priceBreakdown: Joi.string().allow('', null).optional(),
  specialRequests: Joi.string().allow('', null).optional(),
  roomId: Joi.string().hex().length(24).allow(null).optional(),
  roomIds: Joi.array().items(Joi.string().hex().length(24)).optional()
}).unknown(true);

const pricingPreviewSchema = Joi.object({
  packageType: Joi.string().trim().required(),
  checkInDate: Joi.string().trim().required(),
  checkOutDate: Joi.string().trim().allow('', null).optional(),
  adults: Joi.number().integer().min(1).required(),
  childrenAges: Joi.array().items(Joi.number().integer().min(0).max(120)).optional(),
  kids: Joi.array().items(
    Joi.alternatives().try(
      Joi.number().integer().min(0).max(120),
      Joi.object({ age: Joi.number().integer().min(0).max(120).required() }).unknown(true)
    )
  ).optional(),
  mealOption: Joi.string().trim().allow('', null).optional(),
  roomAddon: Joi.alternatives().try(
    Joi.boolean(),
    Joi.object({ enabled: Joi.boolean().required() }).unknown(true)
  ).optional(),
  acknowledgeCoupleWarning: Joi.boolean().optional()
}).unknown(true); // unknown(true) allows stripping/ignoring any client-injected totalAmount safely

// ── Routes ───────────────────────────────────────────────────────────

/**
 * POST /api/pms/pricing/preview
 * Authoritative server-side pricing preview (read-only, zero DB/availability mutations).
 * Ignores any client-provided totalAmount.
 */
router.post('/pricing/preview', verifyToken, (req, res, next) => {
  try {
    const { error, value } = pricingPreviewSchema.validate(req.body || {});
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const quote = calculateBookingQuote({
      packageType: value.packageType,
      checkInDate: value.checkInDate,
      checkOutDate: value.checkOutDate || undefined,
      adults: value.adults,
      childrenAges: value.childrenAges !== undefined ? value.childrenAges : value.kids,
      mealOption: value.mealOption || undefined,
      roomAddon: value.roomAddon,
      rateOverrides: value.rateOverrides || null,
      discount: value.discount || null,
      customTotal: value.customTotal,
      acknowledgeCoupleWarning: Boolean(value.acknowledgeCoupleWarning),
      actor: req.user ? { userId: req.user.id, name: req.user.name || req.user.email, email: req.user.email } : null
    });

    res.json({
      success: true,
      quote,
      pricingSnapshot: quote.snapshot,
      warnings: quote.warnings
    });
  } catch (err) {
    if (err instanceof PricingValidationError || err.name === 'PricingValidationError') {
      return res.status(400).json({ success: false, code: err.code, message: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/pms/uploads/payment-screenshot
 * Authenticated upload boundary for private payment screenshot storage.
 * Rejects invalid types/magic bytes/oversized files; returns 503 if cloud storage is not configured.
 */
router.post('/uploads/payment-screenshot', verifyToken, async (req, res, next) => {
  try {
    const { fileBase64, mimeType, originalName } = req.body || {};
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ success: false, code: 'EMPTY_FILE', message: 'fileBase64 is required' });
    }
    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const result = await uploadPaymentScreenshot({ buffer, mimeType, originalName });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    if (err instanceof StorageValidationError) {
      return res.status(err.statusCode).json({ success: false, code: err.code, message: err.message });
    }
    if (err instanceof StorageNotConfiguredError) {
      return res.status(err.statusCode).json({ success: false, code: err.code, message: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/pms/uploads/payment-screenshot
 * Authenticated signed access endpoint for private payment screenshots.
 */
router.get('/uploads/payment-screenshot', verifyToken, async (req, res, next) => {
  try {
    const ref = req.query.ref;
    const access = await getSignedScreenshotAccess(ref);
    res.json({ success: true, ...access });
  } catch (err) {
    if (err instanceof StorageValidationError || err instanceof StorageNotConfiguredError) {
      return res.status(err.statusCode).json({ success: false, code: err.code, message: err.message });
    }
    next(err);
  }
});

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
      isWeekend: isWeekend(draft.date || new Date()),
      adults: draft.adults || 1,
      kids: (draft.kids || []).map(k => ({ age: k.age, rate: 0 })),
      totalAmount: draft.calculatedPrice || 0,
      priceBreakdown: draft.priceBreakdown || '',
      status: 'pending_payment',
      createdBy: 'staff'
    });

    await booking.save();
    await releaseRoomNights({ bookingId: booking._id }).catch(() => {});

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
    await releaseRoomNights({ bookingId: booking._id }).catch(() => {});

    await roomBooking.populate('roomId', 'roomNumber capacity seriesId');
    logActivity(req.user.id, 'room_assigned', `Assigned room ${roomBooking.roomId?.roomNumber || 'room'} to booking for ${booking.customerName}`, req);

    // Emit Socket.io real-time updates so Availability grid auto-refreshes everywhere
    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      io.emit('availability:updated', { checkInDate: checkIn.toISOString(), checkOutDate: checkOut.toISOString() });
      io.emit('pms:booking_updated', { booking });
    } catch (socketErr) {
      logger.error(`Socket emit failed: ${socketErr.message}`);
    }

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
 * POST /api/pms/rooms/:roomId/unbook
 * Unbook / cancel active room booking for a room in a given date range.
 * Emits availability:updated real-time socket events.
 */
router.post('/rooms/:roomId/unbook', verifyToken, async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { checkInDate, checkOutDate } = req.body;

    const checkIn = new Date(checkInDate || Date.now());
    const checkOut = new Date(checkOutDate || (checkIn.getTime() + 86400000));

    // Resolve room by ObjectId or string roomNumber
    let room = null;
    if (isValidObjectId(roomId)) {
      room = await Room.findById(roomId);
    }
    if (!room) {
      room = await Room.findOne({ $or: [{ roomNumber: String(roomId) }, { number: String(roomId) }] });
    }

    const roomIdStr = room ? String(room._id) : String(roomId);
    const roomNumStr = room ? String(room.roomNumber) : String(roomId);

    let unbookedAny = false;

    // 1. Cancel active RoomBooking records (Filter ONLY valid ObjectIds to prevent Mongoose CastError)
    const validObjectIds = [roomIdStr, roomNumStr, roomId].filter(id => isValidObjectId(id));

    if (validObjectIds.length > 0) {
      const roomBookings = await RoomBooking.find({
        roomId: { $in: validObjectIds },
        status: { $in: ['confirmed', 'checked_in'] },
        checkInDate: { $lt: checkOut },
        checkOutDate: { $gt: checkIn }
      });

      for (const rb of roomBookings) {
        rb.status = 'cancelled';
        await rb.save();
        unbookedAny = true;

        if (rb.bookingId) {
          await Booking.findByIdAndUpdate(rb.bookingId, { status: 'cancelled' });
        }
      }
    }

    // 2. Cancel active main Booking records (String matching allowed)
    const mainBookings = await Booking.find({
      $or: [
        { roomIds: roomIdStr },
        { roomIds: roomNumStr },
        { roomId: roomIdStr },
        { roomId: roomNumStr }
      ],
      status: { $in: ['pending_payment', 'confirmed', 'checked_in'] },
      checkInDate: { $lt: checkOut },
      checkOutDate: { $gt: checkIn }
    });

    for (const b of mainBookings) {
      b.status = 'cancelled';
      await b.save();
      unbookedAny = true;
    }

    if (!unbookedAny) {
      return res.status(404).json({
        success: false,
        message: `No active booking found for Room ${roomNumStr}`
      });
    }

    // Broadcast Socket.io real-time updates
    try {
      const io = req.app?.get?.('io') || (require('../sockets').getIO ? require('../sockets').getIO() : null);
      if (io) {
        const payload = { checkInDate, checkOutDate, roomId: roomIdStr, roomNumber: roomNumStr };
        io.emit('availability_updated', payload);
        io.emit('availability:updated', payload);
        io.emit('pms:booking_updated', { status: 'cancelled' });
      }
    } catch (socketErr) {
      logger.error(`Socket emit failed for unbook: ${socketErr.message}`);
    }

    res.json({ success: true, message: `Room ${roomNumStr} unbooked successfully` });
  } catch (error) {
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
    await releaseRoomNights({ bookingId: booking._id }).catch(() => {});
    logActivity(req.user.id, 'booking_cancelled', `Cancelled booking for ${booking.customerName}`, req);

    // Emit Socket.io real-time updates so Availability grid auto-refreshes everywhere
    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      io.emit('availability:updated', { checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate });
      io.emit('pms:booking_updated', { booking });
    } catch (socketErr) {
      logger.error(`Socket emit failed: ${socketErr.message}`);
    }

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
    booking.isWeekend = isWeekend(value.newCheckInDate);
    await booking.save();
    await releaseRoomNights({ bookingId: booking._id }).catch(() => {});

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
    await releaseRoomNights({ bookingId: booking._id }).catch(() => {});

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
    await releaseRoomNights({ bookingId: booking._id }).catch(() => {});

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
    await releaseRoomNights({ bookingId: booking._id }).catch(() => {});

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
  let booking = null;
  let idempotencyScopeKey = null;
  let bookingAndRoomsCommitted = false;
  try {
    const idempotencyKey = extractIdempotencyKey(req);
    const idempLock = await acquireIdempotencyLock({
      key: idempotencyKey,
      userId: req.user?.id || req.user?.email || 'staff',
      endpoint: 'POST:/api/pms/bookings/manual',
      payload: req.body
    });
    if (idempLock.enabled) {
      if (idempLock.replay) {
        return res.status(idempLock.statusCode).json(idempLock.responseBody);
      }
      idempotencyScopeKey = idempLock.scopeKey;
    }

    const { error, value } = validateBody(manualBookingSchema, req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const prepared = prepareAuthoritativeBookingData({
      ...req.body,
      packageType: value.packageType || value.bookingType,
      checkInDate: value.checkInDate,
      checkOutDate: value.checkOutDate
    }, req.user);

    booking = new Booking({
      customerName: value.guestName,
      customerPhone: value.guestPhone,
      guestAddress: value.guestAddress || null,
      guestIdProofType: value.guestIdProofType || null,
      guestIdProofPhoto: value.guestIdProofPhoto || null,
      bookingType: prepared.quote.packageType === 'oneDay' ? 'picnic' : prepared.quote.packageType,
      packageType: prepared.quote.packageType,
      mealOption: prepared.quote.mealOption,
      date: prepared.date,
      checkInDate: prepared.checkInDate,
      checkOutDate: prepared.checkOutDate,
      isWeekend: prepared.isWeekend,
      adults: prepared.adults,
      guestComposition: prepared.guestComposition,
      kids: prepared.kids,
      totalAmount: prepared.totalAmount,
      pricingSnapshot: prepared.pricingSnapshot,
      rateOverrides: prepared.rateOverrides,
      discount: prepared.discount,
      advancePayment: prepared.advancePayment,
      advancePaid: prepared.advancePaid,
      remainingPayment: prepared.remainingPayment,
      paymentStatus: prepared.paymentStatus,
      payments: prepared.payments,
      acknowledgments: prepared.acknowledgments,
      priceBreakdown: prepared.priceBreakdown,
      specialRequests: value.specialRequests || '',
      status: 'pending_payment',
      createdBy: 'staff',
      roomIds: value.roomIds || []
    });

    await booking.save();
    await releaseRoomNights({ bookingId: booking._id }).catch(() => {});
    const targetRoomIds = (value.roomIds && value.roomIds.length > 0)
      ? value.roomIds
      : (value.roomId ? [value.roomId] : []);
    if (targetRoomIds.length > 0) {
      await claimRoomNights({
        roomIds: targetRoomIds,
        checkInDate: prepared.checkInDate,
        checkOutDate: prepared.checkOutDate,
        packageType: prepared.packageType,
        bookingId: booking._id
      });
    }
    await attachBookingToIdempotency({ scopeKey: idempotencyScopeKey, bookingId: booking._id });
    await logManualBookingAuditEvents(req.user?.id, booking, prepared, req);

    // Handle room assignment - either single roomId or multiple roomIds
    let warning = null;
    const roomBookings = [];
    const createdRoomBookingIds = [];

    // If roomIds array provided, create multiple RoomBookings (all-or-nothing)
    if (value.roomIds && value.roomIds.length > 0) {
      let useTransaction = false;
      let session = null;

      try {
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
    await releaseRoomNights({ bookingId: booking._id }).catch(() => {});

        // Populate room details
        await Promise.all(roomBookings.map(rb => rb.populate('roomId', 'roomNumber capacity seriesId')));

      } catch (error) {
        if (useTransaction && session) await session.abortTransaction();
        if (session) await session.endSession();
        
        // Rollback: delete created booking & any room bookings if overlap occurred
        if (booking && booking._id) {
          await Booking.findByIdAndDelete(booking._id).catch(() => {});
        }
        if (createdRoomBookingIds.length > 0) {
          await RoomBooking.deleteMany({ _id: { $in: createdRoomBookingIds } }).catch(() => {});
        }
        
        if (error.message.includes('no longer available') || error.message.includes('overlap') || error.message.includes('booked')) {
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
    await releaseRoomNights({ bookingId: booking._id }).catch(() => {});

      await roomBooking.populate('roomId', 'roomNumber capacity seriesId');
      roomBookings.push(roomBooking);
    }

    // Emit Socket.io real-time updates to all connected dashboard & availability clients
    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      if (io) {
        io.emit('availability:updated', { checkInDate: value.checkInDate, checkOutDate: value.checkOutDate });
        io.emit('pms:booking_created', { booking });
      }
    } catch (socketErr) {
      logger.error(`Socket emit failed for booking creation: ${socketErr.message}`);
    }

    // Send automated WhatsApp confirmation message if WhatsApp session is connected
    try {
      const { sendMessage, activeSockets } = require('../services/whatsappService');
      const { Settings } = require('../models');
      const { resortContact1 } = require('../config/env');
      const settings = await Settings.findOne();
      const activeNumber = settings?.whatsappNumbers?.find(n => n.status === 'connected');
      
      if (activeNumber && (activeNumber.label || activeNumber.number)) {
        const sessionId = activeNumber.label || activeNumber.number;
        if (activeSockets.has(sessionId)) {
          const targetPhone = value.guestPhone && value.guestPhone.length >= 10 ? value.guestPhone : resortContact1;
          const text = `🏨 *Nandibaag Resort — Booking Confirmed!*\n\n• Guest: ${value.guestName}\n• Room: Room ${roomBookings[0]?.roomId?.roomNumber || 'Assigned'}\n• Dates: ${booking.date} to ${prepared.quote.checkOutDate}\n• Amount: ₹${booking.totalAmount}\n• Status: Confirmed`;
          
          sendMessage(sessionId, targetPhone, text).catch(err => {
            logger.warn(`WhatsApp notification send error: ${err.message}`);
          });
        }
      }
    } catch (waErr) {
      logger.warn(`WhatsApp notification check error: ${waErr.message}`);
    }

    const responseBody = { success: true, warning, booking, roomBookings };
    bookingAndRoomsCommitted = true;
    await completeIdempotency({
      scopeKey: idempotencyScopeKey,
      statusCode: 201,
      responseBody,
      bookingId: booking._id
    });

    res.status(201).json(responseBody);
  } catch (error) {
    if (error instanceof IdempotencyError || error.name === 'IdempotencyError') {
      return res.status(error.statusCode || 409).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }
    if (error instanceof BookingBusinessError || error.name === 'BookingBusinessError') {
      await releaseIdempotencyOnFailure({ scopeKey: idempotencyScopeKey });
      return res.status(error.statusCode || 400).json({
        success: false,
        code: error.code,
        message: error.message,
        ...(error.extra || {})
      });
    }
    if (error instanceof RoomConflictError || error.name === 'RoomConflictError') {
      if (booking && booking._id) {
        await releaseRoomNights({ bookingId: booking._id }).catch(() => {});
        await Booking.findByIdAndDelete(booking._id).catch(() => {});
      }
      await releaseIdempotencyOnFailure({ scopeKey: idempotencyScopeKey });
      return res.status(error.statusCode || 409).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }
    if (!bookingAndRoomsCommitted) {
      if (booking && booking._id) {
        await releaseRoomNights({ bookingId: booking._id }).catch(() => {});
        await Booking.findByIdAndDelete(booking._id).catch(() => {});
      }
      await releaseIdempotencyOnFailure({ scopeKey: idempotencyScopeKey });
    }
    if (error.message.includes('no longer available') || error.message.includes('overlap') || error.message.includes('booked')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    next(error);
  }
});

/**
 * DELETE /api/pms/bookings/:id
 * Delete a booking and release any linked RoomBookings.
 * Emits availability:updated and pms:booking_deleted real-time socket events.
 */
router.delete('/bookings/:id', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const checkInDate = booking.checkInDate;
    const checkOutDate = booking.checkOutDate;

    // Delete linked RoomBookings
    if (booking.roomBookingId) {
      await RoomBooking.deleteMany({
        $or: [
          { _id: booking.roomBookingId },
          { bookingId: booking._id }
        ]
      });
    } else {
      await RoomBooking.deleteMany({ bookingId: booking._id });
    }

    await Booking.findByIdAndDelete(req.params.id);

    // Broadcast Socket.io real-time update so Availability grid refreshes everywhere
    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      if (io) {
        io.emit('availability:updated', { checkInDate, checkOutDate });
        io.emit('pms:booking_deleted', { bookingId: req.params.id });
      }
    } catch (socketErr) {
      logger.error(`Socket emit failed for delete booking: ${socketErr.message}`);
    }

    res.json({ success: true, message: 'Booking deleted & room released successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pms/bookings/:id/payments
 * Record a partial or full payment against an existing booking.
 * Server-authoritative totals, idempotency protection, and audit logging.
 */
router.post('/bookings/:id/payments', verifyToken, async (req, res, next) => {
  let idempotencyScopeKey = null;
  let paymentPersisted = false;
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const amount = Number(req.body?.amount);
    const mode = String(req.body?.mode || '').trim().toLowerCase();
    const utr = typeof req.body?.utr === 'string' ? req.body.utr.trim() : '';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
    const screenshotRef = typeof req.body?.screenshotRef === 'string' ? req.body.screenshotRef.trim() : '';

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });
    }
    if (!VALID_PAYMENT_MODES.includes(mode)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment mode. Allowed modes: ${VALID_PAYMENT_MODES.join(', ')}`
      });
    }
    if (screenshotRef && screenshotRef.startsWith('data:')) {
      return res.status(400).json({
        success: false,
        message: 'Raw Base64 receipt data is not allowed; provide a valid receipt reference'
      });
    }

    const idempotencyKey = extractIdempotencyKey(req);
    if (idempotencyKey) {
      const lock = await acquireIdempotencyLock({
        key: idempotencyKey,
        endpoint: `POST:/api/pms/bookings/${req.params.id}/payments`,
        userId: req.user?.id || req.user?._id || 'staff',
        payload: { bookingId: req.params.id, amount, mode, utr, notes, screenshotRef }
      });
      if (lock.replay) {
        return res.status(lock.statusCode || 200).json(lock.responseBody);
      }
      idempotencyScopeKey = lock.scopeKey;
    }

    const atomicResult = await persistPaymentAtomically(Booking, req.params.id, (booking, currentSummary) => {
      if (currentSummary.remainingAmount <= 0) {
        return { error: { status: 400, message: 'Booking is already fully paid' } };
      }
      if (amount > currentSummary.remainingAmount) {
        return {
          error: {
            status: 400,
            message: `Payment amount (₹${amount}) exceeds remaining balance (₹${currentSummary.remainingAmount})`
          }
        };
      }

      const nextPayments = Array.isArray(booking.payments) ? [...booking.payments] : [];
      const legacyAdvance = Number(booking.advancePaid ?? booking.advancePayment ?? 0);
      if (nextPayments.length === 0 && Number.isFinite(legacyAdvance) && legacyAdvance > 0) {
        nextPayments.push({
          amount: legacyAdvance,
          mode: 'other',
          utr: '',
          screenshotRef: '',
          paidAt: booking.createdAt || new Date(),
          collectedBy: {
            userId: null,
            name: booking.bookedBy?.name || 'Legacy Record',
            email: ''
          },
          notes: 'Legacy advance payment'
        });
      }

      nextPayments.push({
        amount,
        mode,
        utr,
        screenshotRef,
        paidAt: new Date(),
        collectedBy: {
          userId: req.user?.id || req.user?._id || null,
          name: req.user?.name || req.user?.email || 'Staff',
          email: req.user?.email || ''
        },
        notes
      });

      return { nextPayments };
    });

    if (atomicResult.notFound) {
      if (idempotencyScopeKey) await releaseIdempotencyOnFailure({ scopeKey: idempotencyScopeKey });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (atomicResult.validationError) {
      if (idempotencyScopeKey) await releaseIdempotencyOnFailure({ scopeKey: idempotencyScopeKey });
      return res.status(atomicResult.validationError.status).json({
        success: false,
        message: atomicResult.validationError.message
      });
    }

    const { booking, updatedSummary } = atomicResult;
    paymentPersisted = true;

    if (idempotencyScopeKey) {
      await attachBookingToIdempotency({ scopeKey: idempotencyScopeKey, bookingId: booking._id });
    }

    const addedPayment = booking.payments[booking.payments.length - 1];

    try {
      await logActivity(req.user?.id || req.user?._id, 'booking_payment_recorded', {
        bookingId: booking._id,
        paymentId: addedPayment?._id || null,
        amount,
        mode,
        utr,
        remainingBalance: updatedSummary.remainingAmount,
        paymentStatus: updatedSummary.paymentStatus
      }, req.ip);
    } catch (auditErr) {
      logger.warn(`Audit log failed for payment on booking ${booking._id}: ${auditErr.message}`);
    }

    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      if (io) {
        io.emit('pms:booking_updated', { booking: attachPaymentSummary(booking.toObject ? booking.toObject() : booking) });
      }
    } catch (socketErr) {
      logger.error(`Socket emit failed for partial payment: ${socketErr.message}`);
    }

    const responseBody = {
      success: true,
      message: 'Payment recorded successfully',
      payment: addedPayment,
      paymentSummary: updatedSummary,
      booking: attachPaymentSummary(booking.toObject ? booking.toObject() : booking)
    };

    if (idempotencyScopeKey) {
      await completeIdempotency({
        scopeKey: idempotencyScopeKey,
        statusCode: 201,
        responseBody,
        bookingId: booking._id
      });
    }

    return res.status(201).json(responseBody);
  } catch (error) {
    if (error instanceof IdempotencyError || error instanceof PaymentConcurrencyError) {
      if (!paymentPersisted && idempotencyScopeKey && error instanceof PaymentConcurrencyError) {
        await releaseIdempotencyOnFailure({ scopeKey: idempotencyScopeKey });
      }
      return res.status(error.statusCode || 409).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }
    if (!paymentPersisted && idempotencyScopeKey) {
      await releaseIdempotencyOnFailure({ scopeKey: idempotencyScopeKey });
    }
    next(error);
  }
});

/**
 * PATCH /api/pms/bookings/:id/total
 * Update a booking's custom final total without modifying recorded payments.
 * Recalculates remainingPayment & paymentStatus via paymentSyncService.
 */
router.patch('/bookings/:id/total', verifyToken, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const rawTotal = req.body?.totalAmount ?? req.body?.customTotal;
    if (rawTotal === undefined || rawTotal === null || rawTotal === '') {
      return res.status(400).json({ success: false, message: 'Valid non-negative totalAmount is required' });
    }
    const parsedTotal = Number(rawTotal);
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      return res.status(400).json({ success: false, message: 'totalAmount must be a non-negative finite number' });
    }

    const nextTotal = Math.round(parsedTotal * 100) / 100;
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const previousTotal = Number(booking.totalAmount || 0);
    const existingSnap = booking.pricingSnapshot && typeof booking.pricingSnapshot === 'object'
      ? booking.pricingSnapshot
      : {};
    const calculatedTotal = existingSnap.calculatedTotal ?? existingSnap.originalTotal ?? previousTotal;
    const originalTotal = existingSnap.originalTotal ?? calculatedTotal;
    const manualTotalAdjustment = Math.round((nextTotal - calculatedTotal) * 100) / 100;

    booking.totalAmount = nextTotal;
    booking.pricingSnapshot = {
      ...existingSnap,
      originalTotal,
      calculatedTotal,
      customTotal: nextTotal,
      manualTotalAdjustment,
      customTotalApplied: true,
      customTotalSetBy: {
        userId: req.user?.id || req.user?._id || null,
        name: req.user?.name || req.user?.email || 'Staff',
        email: req.user?.email || ''
      },
      customTotalSetAt: new Date().toISOString(),
      quotedTotal: nextTotal
    };

    const summary = syncBookingPaymentFields(booking);
    await booking.save();

    await logActivity(req.user?.id || req.user?._id, 'booking_total_updated', {
      bookingId: String(booking._id),
      previousTotal,
      calculatedTotal,
      newTotal: nextTotal,
      manualTotalAdjustment,
      paidAmount: summary.paidAmount,
      remainingAmount: summary.remainingAmount
    }, req);

    const io = req.app?.get('io');
    if (io) {
      io.emit('pms:booking_updated', { bookingId: String(booking._id), totalAmount: nextTotal });
    }

    const overpaidAmount = Math.max(0, Math.round((summary.paidAmount - nextTotal) * 100) / 100);
    const warning = overpaidAmount > 0
      ? `Recorded payments (₹${summary.paidAmount}) exceed the new total (₹${nextTotal}) by ₹${overpaidAmount}. No automatic refund was created.`
      : null;

    const bookingObj = typeof booking.toObject === 'function' ? booking.toObject() : booking;
    res.json({
      success: true,
      booking: attachPaymentSummary(bookingObj),
      overpaidAmount,
      warning
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/pms/bookings/:id/settle-payment
 * Mark remaining balance as paid via authoritative payment synchronization.
 * Emits pms:booking_updated real-time socket event and sends WhatsApp receipt attempt.
 */
router.patch('/bookings/:id/settle-payment', verifyToken, async (req, res, next) => {
  let idempotencyScopeKey = null;
  let settlementPersisted = false;
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const mode = VALID_PAYMENT_MODES.includes(req.body?.mode) ? req.body.mode : 'cash';
    const utr = typeof req.body?.utr === 'string' ? req.body.utr.trim() : '';

    const idempotencyKey = extractIdempotencyKey(req);
    if (idempotencyKey) {
      const lock = await acquireIdempotencyLock({
        key: idempotencyKey,
        endpoint: `PATCH:/api/pms/bookings/${req.params.id}/settle-payment`,
        userId: req.user?.id || req.user?._id || 'staff',
        payload: { bookingId: req.params.id, mode, utr }
      });
      if (lock.replay) {
        return res.status(lock.statusCode || 200).json(lock.responseBody);
      }
      idempotencyScopeKey = lock.scopeKey;
    }

    const atomicResult = await persistPaymentAtomically(Booking, req.params.id, (booking, currentSummary) => {
      if (currentSummary.remainingAmount <= 0) {
        return { error: { status: 400, message: 'Booking is already fully paid' } };
      }

      const nextPayments = Array.isArray(booking.payments) ? [...booking.payments] : [];
      const legacyAdvance = Number(booking.advancePaid ?? booking.advancePayment ?? 0);
      if (nextPayments.length === 0 && Number.isFinite(legacyAdvance) && legacyAdvance > 0) {
        nextPayments.push({
          amount: legacyAdvance,
          mode: 'other',
          utr: '',
          screenshotRef: '',
          paidAt: booking.createdAt || new Date(),
          collectedBy: {
            userId: null,
            name: booking.bookedBy?.name || 'Legacy Record',
            email: ''
          },
          notes: 'Legacy advance payment'
        });
      }
      nextPayments.push({
        amount: currentSummary.remainingAmount,
        mode,
        utr,
        screenshotRef: '',
        paidAt: new Date(),
        collectedBy: {
          userId: req.user?.id || req.user?._id || null,
          name: req.user?.name || req.user?.email || 'Staff',
          email: req.user?.email || ''
        },
        notes: 'Full balance settlement'
      });

      return { nextPayments };
    });

    if (atomicResult.notFound) {
      if (idempotencyScopeKey) await releaseIdempotencyOnFailure({ scopeKey: idempotencyScopeKey });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (atomicResult.validationError) {
      if (idempotencyScopeKey) await releaseIdempotencyOnFailure({ scopeKey: idempotencyScopeKey });
      return res.status(atomicResult.validationError.status).json({
        success: false,
        message: atomicResult.validationError.message
      });
    }

    const { booking, updatedSummary, currentSummary } = atomicResult;
    settlementPersisted = true;

    if (idempotencyScopeKey) {
      await attachBookingToIdempotency({ scopeKey: idempotencyScopeKey, bookingId: booking._id });
    }

    try {
      await logActivity(req.user?.id || req.user?._id, 'booking_payment_settled', {
        bookingId: booking._id,
        settledAmount: currentSummary.remainingAmount,
        totalPaid: updatedSummary.paidAmount,
        paymentStatus: updatedSummary.paymentStatus
      }, req.ip);
    } catch (auditErr) {
      logger.warn(`Audit log failed for settle payment on booking ${booking._id}: ${auditErr.message}`);
    }

    // Broadcast Socket.io real-time update
    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      if (io) {
        io.emit('pms:booking_updated', { booking: attachPaymentSummary(booking.toObject ? booking.toObject() : booking) });
      }
    } catch (socketErr) {
      logger.error(`Socket emit failed for settle payment: ${socketErr.message}`);
    }

    // Send WhatsApp payment receipt if session active
    try {
      const { sendMessage, activeSockets } = require('../services/whatsappService');
      const { Settings } = require('../models');
      const { resortContact1 } = require('../config/env');
      const settings = await Settings.findOne();
      const activeNumber = settings?.whatsappNumbers?.find(n => n.status === 'connected');

      if (activeNumber && (activeNumber.label || activeNumber.number)) {
        const sessionId = activeNumber.label || activeNumber.number;
        if (activeSockets.has(sessionId)) {
          const targetPhone = booking.customerPhone && booking.customerPhone.length >= 10 ? booking.customerPhone : resortContact1;
          const text = `💳 *Nandibaag Resort — Payment Settled!*\n\n• Guest: ${booking.customerName}\n• Total Amount: ₹${booking.totalAmount}\n• Advance Paid: ₹${booking.totalAmount}\n• Remaining Balance: ₹0 (FULLY PAID)\n• Status: Paid\n\nThank you for choosing Nandibaag Resort! 🙏`;

          sendMessage(sessionId, targetPhone, text).catch(err => {
            logger.warn(`WhatsApp payment receipt send error: ${err.message}`);
          });
        }
      }
    } catch (waErr) {
      logger.warn(`WhatsApp payment receipt check error: ${waErr.message}`);
    }

    const responseBody = {
      success: true,
      message: 'Balance settled & marked as Paid',
      paymentSummary: updatedSummary,
      booking: attachPaymentSummary(booking.toObject ? booking.toObject() : booking)
    };

    if (idempotencyScopeKey) {
      await completeIdempotency({
        scopeKey: idempotencyScopeKey,
        statusCode: 200,
        responseBody,
        bookingId: booking._id
      });
    }

    res.json(responseBody);
  } catch (error) {
    if (error instanceof IdempotencyError || error instanceof PaymentConcurrencyError) {
      if (!settlementPersisted && idempotencyScopeKey && error instanceof PaymentConcurrencyError) {
        await releaseIdempotencyOnFailure({ scopeKey: idempotencyScopeKey });
      }
      return res.status(error.statusCode || 409).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }
    if (!settlementPersisted && idempotencyScopeKey) {
      await releaseIdempotencyOnFailure({ scopeKey: idempotencyScopeKey });
    }
    next(error);
  }
});

/**
 * GET /api/pms/bookings
 * List bookings with backend-driven filters & server-side pagination:
 * ?status=, ?paymentStatus=, ?packageType=, ?stayType=, ?bookingId=,
 * ?date=, ?dateFrom=, ?dateTo=, ?createdFrom=, ?createdTo=, ?roomId=, ?search=,
 * ?sortOrder=asc|desc, ?page=1, ?limit=20
 */
router.get('/bookings', verifyToken, async (req, res, next) => {
  try {
    const {
      status,
      paymentStatus,
      packageType,
      stayType,
      bookingId,
      date,
      dateFrom,
      dateTo,
      createdFrom,
      createdTo,
      roomId,
      search,
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const sortDir = sortOrder === 'asc' ? 1 : -1;

    const filter = {};
    if (status) filter.status = status;

    if (paymentStatus) {
      if (!['unpaid', 'partially_paid', 'paid'].includes(paymentStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid paymentStatus filter' });
      }
      filter.paymentStatus = paymentStatus;
    }

    const effectiveStayType = packageType || stayType;
    if (effectiveStayType) {
      filter.packageType = effectiveStayType;
    }

    if (bookingId) {
      if (!isValidObjectId(bookingId)) {
        return res.status(400).json({ success: false, message: 'Invalid bookingId filter' });
      }
      filter._id = bookingId;
    }

    if (roomId) {
      if (!isValidObjectId(roomId)) {
        return res.status(400).json({ success: false, message: 'Invalid roomId filter' });
      }
      filter.$or = filter.$or || [];
      filter.roomIds = roomId;
    }

    if (date) {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date filter' });
      }
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      filter.checkInDate = { $gte: d, $lt: nextDay };
    }

    // Stay date range filter: finds bookings whose stay period overlaps [dateFrom, dateTo] in IST (+05:30)
    const parseISTStart = (str) => (/^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(`${str}T00:00:00.000+05:30`) : new Date(str));
    const parseISTEnd = (str) => (/^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(`${str}T23:59:59.999+05:30`) : new Date(str));

    if (dateFrom || dateTo) {
      const df = dateFrom ? parseISTStart(dateFrom) : null;
      const dt = dateTo ? parseISTEnd(dateTo) : null;
      if (df && Number.isNaN(df.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid dateFrom filter' });
      }
      if (dt && Number.isNaN(dt.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid dateTo filter' });
      }
      if (df && dt) {
        filter.checkInDate = { $lte: dt };
        filter.checkOutDate = { $gte: df };
      } else if (df) {
        filter.checkOutDate = { $gte: df };
      } else if (dt) {
        filter.checkInDate = { $lte: dt };
      }
    }

    // Booking creation date range filter (distinct from stay dates, IST +05:30)
    if (createdFrom || createdTo) {
      filter.createdAt = {};
      if (createdFrom) {
        const cf = parseISTStart(createdFrom);
        if (Number.isNaN(cf.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid createdFrom filter' });
        }
        filter.createdAt.$gte = cf;
      }
      if (createdTo) {
        const ct = parseISTEnd(createdTo);
        if (Number.isNaN(ct.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid createdTo filter' });
        }
        filter.createdAt.$lte = ct;
      }
    }

    if (search) {
      const trimmedSearch = String(search).trim();
      if (trimmedSearch.length > 100) {
        return res.status(400).json({ success: false, message: 'Search query too long (max 100 characters)' });
      }
      const escapedSearch = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchConditions = [
        { customerName: { $regex: escapedSearch, $options: 'i' } },
        { customerPhone: { $regex: escapedSearch, $options: 'i' } }
      ];
      if (isValidObjectId(trimmedSearch)) {
        searchConditions.push({ _id: trimmedSearch });
      }
      filter.$or = searchConditions;
    }

    const total = await Booking.countDocuments(filter);

    const bookings = await Booking.find(filter)
      .populate('roomBookingId')
      .sort({ createdAt: sortDir, _id: sortDir })
      .limit(parsedLimit)
      .skip((parsedPage - 1) * parsedLimit);

    // Populate room details if roomBookingId exists
    let populated = await Promise.all(
      bookings.map(async (b) => {
        const obj = b.toObject ? b.toObject() : b;
        if (b.roomBookingId && b.roomBookingId.roomId) {
          const room = await Room.findById(b.roomBookingId.roomId).select('roomNumber capacity seriesId');
          if (room) {
            await room.populate('seriesId', 'name');
            obj.room = room;
          }
        }
        return attachPaymentSummary(obj);
      })
    );
    
    const { mapRoomIdsToNumbers } = require('../utils/bookingHelper');
    populated = await mapRoomIdsToNumbers(populated);

    res.json({
      success: true,
      bookings: populated,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.max(1, Math.ceil(total / parsedLimit))
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
