const mongoose = require('mongoose');

const roomBookingSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  checkInDate: {
    type: Date,
    required: true,
    index: true
  },
  checkOutDate: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'],
    default: 'confirmed'
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Compound index for fast overlap queries
roomBookingSchema.index({ roomId: 1, checkInDate: 1, checkOutDate: 1 });

module.exports = mongoose.model('RoomBooking', roomBookingSchema);
