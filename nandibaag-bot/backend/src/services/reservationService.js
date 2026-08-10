const { RoomReservation, Booking } = require('../models');

/**
 * Creates temporary 15-minute room reservations for selected room IDs.
 * Cancels any existing active reservations for the SAME sessionId before creating new ones.
 */
const createReservation = async (roomIds, checkInDate, checkOutDate, userId = 'staff', sessionId) => {
  try {
    console.log('[Reservation:Create] Creating reservations for rooms:', roomIds, 'sessionId:', sessionId);

    if (!roomIds || !Array.isArray(roomIds) || roomIds.length === 0) {
      return [];
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 mins lock

    // 1. Cancel previous active reservations for this sessionId to keep reservations clean
    await RoomReservation.updateMany(
      { sessionId, status: 'active' },
      { status: 'cancelled' }
    );

    // 2. Check for conflicts with confirmed bookings or active reservations from OTHER sessions
    for (const roomId of roomIds) {
      const existingBooking = await Booking.findOne({
        $or: [{ roomIds: roomId }, { roomId: String(roomId) }],
        checkInDate: { $lt: checkOut },
        checkOutDate: { $gt: checkIn },
        status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }
      });

      if (existingBooking) {
        throw new Error(`Room ${roomId} is already booked by ${existingBooking.customerName}`);
      }

      const existingReservation = await RoomReservation.findOne({
        roomId: String(roomId),
        checkInDate: { $lt: checkOut },
        checkOutDate: { $gt: checkIn },
        expiresAt: { $gt: now },
        status: 'active',
        sessionId: { $ne: sessionId }
      });

      if (existingReservation) {
        throw new Error(`Room ${roomId} is currently reserved by another user`);
      }
    }

    // 3. Create active reservations
    const reservations = await Promise.all(
      roomIds.map(roomId =>
        RoomReservation.create({
          roomId: String(roomId),
          checkInDate: checkIn,
          checkOutDate: checkOut,
          reservedBy: userId,
          sessionId,
          expiresAt,
          status: 'active'
        })
      )
    );

    console.log('[Reservation:Create] ✅ Created', reservations.length, 'reservations expiring at', expiresAt.toISOString());
    return reservations;

  } catch (error) {
    console.error('[Reservation:Create] Error:', error.message);
    throw error;
  }
};

const confirmReservation = async (sessionId, checkInDate, checkOutDate) => {
  try {
    console.log('[Reservation:Confirm] Confirming reservations for session:', sessionId);

    const query = { sessionId, status: 'active' };
    if (checkInDate && checkOutDate) {
      query.checkInDate = { $lt: new Date(checkOutDate) };
      query.checkOutDate = { $gt: new Date(checkInDate) };
    }

    const updated = await RoomReservation.updateMany(
      query,
      { status: 'confirmed' }
    );

    console.log('[Reservation:Confirm] ✅ Confirmed', updated.modifiedCount, 'reservations');
    return updated;
  } catch (error) {
    console.error('[Reservation:Confirm] Error:', error.message);
    throw error;
  }
};

const cancelReservation = async (sessionId, checkInDate, checkOutDate) => {
  try {
    console.log('[Reservation:Cancel] Cancelling reservations for session:', sessionId);

    const query = { sessionId, status: 'active' };
    if (checkInDate && checkOutDate) {
      query.checkInDate = { $lt: new Date(checkOutDate) };
      query.checkOutDate = { $gt: new Date(checkInDate) };
    }

    const updated = await RoomReservation.updateMany(
      query,
      { status: 'cancelled' }
    );

    console.log('[Reservation:Cancel] ✅ Cancelled', updated.modifiedCount, 'reservations');
    return updated;
  } catch (error) {
    console.error('[Reservation:Cancel] Error:', error.message);
    throw error;
  }
};

const cleanupExpiredReservations = async () => {
  try {
    const deleted = await RoomReservation.deleteMany({
      expiresAt: { $lt: new Date() },
      status: 'active'
    });

    if (deleted.deletedCount > 0) {
      console.log('[Reservation:Cleanup] Deleted', deleted.deletedCount, 'expired reservations');
    }
  } catch (error) {
    console.error('[Reservation:Cleanup] Error:', error.message);
  }
};

module.exports = {
  createReservation,
  confirmReservation,
  cancelReservation,
  cleanupExpiredReservations
};
