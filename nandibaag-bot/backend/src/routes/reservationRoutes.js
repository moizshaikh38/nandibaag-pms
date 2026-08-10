const express = require('express');
const router = express.Router();
const { createReservation, cancelReservation } = require('../services/reservationService');
const { getIO } = require('../sockets');

router.post('/', async (req, res) => {
  try {
    const { roomIds, checkInDate, checkOutDate, sessionId, userId } = req.body;

    console.log('[Reservation:API] Creating reservation:', { roomIds, checkInDate, checkOutDate, sessionId });

    if (!roomIds || !Array.isArray(roomIds) || roomIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'roomIds array required'
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId required'
      });
    }

    const reservations = await createReservation(
      roomIds,
      checkInDate,
      checkOutDate,
      userId || 'staff_user',
      sessionId
    );

    // Broadcast room status update via Socket.io to all clients
    try {
      const io = getIO();
      if (io) {
        io.emit('reservation_updated', {
          roomIds,
          checkInDate,
          checkOutDate,
          sessionId,
          action: 'reserved'
        });
      }
    } catch (_) {}

    res.json({
      success: true,
      reservations,
      expiresAt: reservations[0]?.expiresAt || new Date(Date.now() + 15 * 60 * 1000)
    });

  } catch (error) {
    console.error('[Reservation:API] Error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/cancel', async (req, res) => {
  try {
    const { sessionId, checkInDate, checkOutDate } = req.body;

    console.log('[Reservation:API] Cancelling reservation for session:', sessionId);

    await cancelReservation(sessionId, checkInDate, checkOutDate);

    // Broadcast update via Socket.io
    try {
      const io = getIO();
      if (io) {
        io.emit('reservation_updated', {
          sessionId,
          checkInDate,
          checkOutDate,
          action: 'cancelled'
        });
      }
    } catch (_) {}

    res.json({
      success: true,
      message: 'Reservation cancelled'
    });
  } catch (error) {
    console.error('[Reservation:API] Cancel Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
