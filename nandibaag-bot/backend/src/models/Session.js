const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  jti: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  deviceInfo: {
    type: String,
    default: 'Unknown Device'
  },
  ipAddress: {
    type: String,
    default: ''
  },
  loginAt: {
    type: Date,
    default: Date.now
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  loggedOutAt: {
    type: Date,
    default: null
  },
  loggedOutBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

sessionSchema.index({ userId: 1, isActive: 1 });
sessionSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Session', sessionSchema);
