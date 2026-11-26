const mongoose = require('mongoose');

const roomNightLockSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  night: {
    type: String, // YYYY-MM-DD in IST
    required: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

// Database-enforced exclusivity: one booking per room per occupied night
roomNightLockSchema.index({ roomId: 1, night: 1 }, { unique: true });

module.exports = mongoose.model('RoomNightLock', roomNightLockSchema);
