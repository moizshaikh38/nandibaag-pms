const express = require('express');
const router = express.Router();
const { Room, Booking, RoomBooking } = require('../models');

/**
 * GET /api/rooms
 * Returns all active rooms in resort.
 */
router.get('/', async (req, res) => {
  try {
    let allRooms = await Room.find({ status: { $ne: 'deleted' } })
      .populate('seriesId', 'name')
      .lean();

    if (!allRooms || allRooms.length === 0) {
      allRooms = [
        { _id: '101', number: '101', roomNumber: '101', capacity: 4, type: 'Cottage', seriesName: 'Series 100 (Cottages)' },
        { _id: '102', number: '102', roomNumber: '102', capacity: 4, type: 'Cottage', seriesName: 'Series 100 (Cottages)' },
        { _id: '103', number: '103', roomNumber: '103', capacity: 5, type: 'Cottage', seriesName: 'Series 100 (Cottages)' },
        { _id: '104', number: '104', roomNumber: '104', capacity: 5, type: 'Cottage', seriesName: 'Series 100 (Cottages)' },
        { _id: '105', number: '105', roomNumber: '105', capacity: 6, type: 'Villa', seriesName: 'Series 100 (Cottages)' },
        { _id: '106', number: '106', roomNumber: '106', capacity: 6, type: 'Villa', seriesName: 'Series 100 (Cottages)' },
        { _id: '201', number: '201', roomNumber: '201', capacity: 4, type: 'Deluxe', seriesName: 'Series 200 (Deluxe)' },
        { _id: '202', number: '202', roomNumber: '202', capacity: 4, type: 'Deluxe', seriesName: 'Series 200 (Deluxe)' }
      ];
    }

    res.json({
      success: true,
      rooms: allRooms
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/rooms/availability
 * Returns all available rooms for a given checkInDate & checkOutDate.
 */
router.get('/availability', async (req, res) => {
  try {
    const { checkInDate, checkOutDate } = req.query;
    
    console.log('[Rooms:Availability] Checking availability for:', {
      checkInDate,
      checkOutDate
    });
    
    const checkIn = checkInDate ? new Date(checkInDate) : new Date();
    const checkOut = checkOutDate ? new Date(checkOutDate) : new Date(checkIn.getTime() + 86400000);

    // Find all rooms in database
    let allRooms = await Room.find({ status: { $ne: 'deleted' } })
      .populate('seriesId', 'name')
      .lean();
    
    // Default fallback room inventory if DB is unseeded
    if (!allRooms || allRooms.length === 0) {
      allRooms = [
        { _id: '101', number: '101', roomNumber: '101', capacity: 4, type: 'Cottage', seriesName: 'Series 100 (Cottages)' },
        { _id: '102', number: '102', roomNumber: '102', capacity: 4, type: 'Cottage', seriesName: 'Series 100 (Cottages)' },
        { _id: '103', number: '103', roomNumber: '103', capacity: 5, type: 'Cottage', seriesName: 'Series 100 (Cottages)' },
        { _id: '104', number: '104', roomNumber: '104', capacity: 5, type: 'Cottage', seriesName: 'Series 100 (Cottages)' },
        { _id: '105', number: '105', roomNumber: '105', capacity: 6, type: 'Villa', seriesName: 'Series 100 (Cottages)' },
        { _id: '106', number: '106', roomNumber: '106', capacity: 6, type: 'Villa', seriesName: 'Series 100 (Cottages)' },
        { _id: '201', number: '201', roomNumber: '201', capacity: 4, type: 'Deluxe', seriesName: 'Series 200 (Deluxe)' },
        { _id: '202', number: '202', roomNumber: '202', capacity: 4, type: 'Deluxe', seriesName: 'Series 200 (Deluxe)' }
      ];
    }
    
    // Check each room for conflicts
    const availableRooms = await Promise.all(
      allRooms.map(async (room) => {
        const identifier = String(room.number || room.roomNumber || room._id);
        const seriesName = room.seriesId?.name || room.seriesName || (identifier.startsWith('2') ? 'Series 200 (Deluxe)' : 'Series 100 (Cottages)');

        const bookingConflict = await Booking.findOne({
          $or: [
            { roomIds: identifier },
            { roomId: identifier },
            { roomIds: String(room._id) },
            { roomId: String(room._id) }
          ],
          checkInDate: { $lt: checkOut },
          checkOutDate: { $gt: checkIn },
          status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }
        });
        
        const roomBookingConflict = await RoomBooking.findOne({
          roomId: room._id,
          checkInDate: { $lt: checkOut },
          checkOutDate: { $gt: checkIn },
          status: { $in: ['confirmed', 'checked_in'] }
        });
        
        const RoomMaintenance = require('../models/RoomMaintenance');
        const maintenanceConflict = await RoomMaintenance.findOne({
          $or: [
            { roomId: identifier },
            { roomId: String(room._id) }
          ],
          startDate: { $lt: checkOut },
          endDate: { $gt: checkIn },
          status: 'active'
        });

        const isAvailable = !bookingConflict && !roomBookingConflict && !maintenanceConflict && room.status !== 'maintenance';

        return {
          ...room,
          _id: String(room._id),
          number: identifier,
          roomNumber: identifier,
          seriesName,
          capacity: Number(room.capacity || 4),
          available: isAvailable,
          isMaintenance: !!maintenanceConflict || room.status === 'maintenance'
        };
      })
    );
    
    // Filter only available rooms & sort by seriesName then roomNumber
    const onlyAvailable = availableRooms
      .filter(r => r.available)
      .sort((a, b) => a.seriesName.localeCompare(b.seriesName) || a.number.localeCompare(b.number, undefined, { numeric: true }));
    
    console.log('[Rooms:Availability] Found', onlyAvailable.length, 'available rooms out of', allRooms.length);
    
    res.json({
      success: true,
      rooms: onlyAvailable,
      allRooms: availableRooms
    });
    
  } catch (error) {
    console.error('[Rooms:Availability] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/rooms/availability-realtime
 * Returns all rooms with real-time status ('available', 'reserved_by_you', 'reserved_by_other', 'booked')
 */
router.get('/availability-realtime', async (req, res) => {
  try {
    const { checkInDate, checkOutDate, sessionId } = req.query;

    console.log('[Rooms:RealtimeAvailability] Fetching for:', {
      checkInDate,
      checkOutDate,
      sessionId
    });

    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        error: 'checkInDate and checkOutDate required'
      });
    }

    const { getRoomsWithReservationStatus, getAvailabilityMessage } = require('../services/availabilityService');
    const rooms = await getRoomsWithReservationStatus(checkInDate, checkOutDate, sessionId);
    const availabilityMessage = await getAvailabilityMessage(checkInDate, checkOutDate, sessionId);

    res.json({
      success: true,
      rooms,
      availabilityMessage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Rooms:RealtimeAvailability] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
