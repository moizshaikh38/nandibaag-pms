const express = require('express');
const router = express.Router();
const { Room, Booking, RoomBooking } = require('../models');

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
    let allRooms = await Room.find().lean();
    
    // Default fallback room inventory if DB is unseeded
    if (!allRooms || allRooms.length === 0) {
      allRooms = [
        { _id: '101', number: '101', roomNumber: '101', capacity: 4, type: 'Cottage' },
        { _id: '102', number: '102', roomNumber: '102', capacity: 4, type: 'Cottage' },
        { _id: '103', number: '103', roomNumber: '103', capacity: 5, type: 'Cottage' },
        { _id: '104', number: '104', roomNumber: '104', capacity: 5, type: 'Cottage' },
        { _id: '105', number: '105', roomNumber: '105', capacity: 6, type: 'Villa' },
        { _id: '106', number: '106', roomNumber: '106', capacity: 6, type: 'Villa' },
        { _id: '201', number: '201', roomNumber: '201', capacity: 4, type: 'Deluxe' },
        { _id: '202', number: '202', roomNumber: '202', capacity: 4, type: 'Deluxe' }
      ];
    }
    
    // Check each room for conflicts
    const availableRooms = await Promise.all(
      allRooms.map(async (room) => {
        const identifier = String(room.number || room.roomNumber || room._id);

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
        
        return {
          ...room,
          _id: String(room._id),
          number: identifier,
          roomNumber: identifier,
          capacity: Number(room.capacity || 4),
          available: !bookingConflict && !roomBookingConflict
        };
      })
    );
    
    // Filter only available rooms
    const onlyAvailable = availableRooms.filter(r => r.available);
    
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

module.exports = router;
