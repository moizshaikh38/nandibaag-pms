const express = require('express');
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth');
const { MessageLog, Booking } = require('../models');

const router = express.Router();

/**
 * GET /api/message-log
 * List message logs with filters, pagination, sorted by sentAt/createdAt desc.
 *
 * Query params:
 *   ?guestPhone=     — partial match on guest phone
 *   ?messageType=    — exact match (followup_3hr, checkin_reminder, etc.)
 *   ?status=         — exact match (sent, failed, cancelled)
 *   ?bookingId=      — exact match
 *   ?dateFrom=       — ISO date string (>= createdAt)
 *   ?dateTo=         — ISO date string (<= createdAt)
 *   ?page=           — page number (default 1)
 *   ?limit=          — items per page (default 50, max 200)
 */
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const {
      guestPhone,
      messageType,
      status,
      bookingId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 50
    } = req.query;

    const filter = {};

    if (guestPhone) {
      filter.guestPhone = { $regex: guestPhone, $options: 'i' };
    }
    if (messageType) {
      filter.messageType = messageType;
    }
    if (status) {
      filter.status = status;
    }
    if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) {
      filter.bookingId = bookingId;
    }
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));

    const [logs, total] = await Promise.all([
      MessageLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip((pageNum - 1) * limitNum)
        .populate('bookingId', 'customerName customerPhone bookingType status'),
      MessageLog.countDocuments(filter)
    ]);

    res.json({
      success: true,
      logs,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
