const mongoose = require('mongoose');

const roomMaintenanceSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true
  },

  maintenanceType: {
    type: String,
    enum: ['maintenance', 'wellness', 'cleaning', 'repair', 'other'],
    default: 'maintenance'
  },

  startDate: {
    type: Date,
    required: true
  },

  endDate: {
    type: Date,
    required: true
  },

  reason: {
    type: String,
    required: false,
    maxlength: 500
  },

  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },

  createdBy: {
    type: String,
    required: false
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
roomMaintenanceSchema.index({ roomId: 1, startDate: 1, endDate: 1 });
roomMaintenanceSchema.index({ status: 1 });

module.exports = mongoose.models.RoomMaintenance || mongoose.model('RoomMaintenance', roomMaintenanceSchema);
