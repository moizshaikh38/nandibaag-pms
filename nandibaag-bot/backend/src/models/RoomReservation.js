const mongoose = require('mongoose');

const roomReservationSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true
  },
  
  checkInDate: {
    type: Date,
    required: true
  },
  
  checkOutDate: {
    type: Date,
    required: true
  },
  
  reservedBy: {
    type: String, // User ID, staff name, or session
    required: true
  },
  
  sessionId: {
    type: String, // Browser session ID
    required: true,
    index: true
  },
  
  reservedAt: {
    type: Date,
    default: Date.now
  },
  
  expiresAt: {
    type: Date,
    required: true // 15 mins from creation
  },
  
  status: {
    type: String,
    enum: ['active', 'confirmed', 'cancelled'],
    default: 'active',
    index: true
  }
}, {
  timestamps: true
});

// Auto-delete expired reservations via TTL index
roomReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RoomReservation', roomReservationSchema);
