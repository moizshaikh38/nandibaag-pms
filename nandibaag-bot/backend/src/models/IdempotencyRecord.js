const mongoose = require('mongoose');

const idempotencyRecordSchema = new mongoose.Schema({
  scopeKey: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true
  },
  endpoint: {
    type: String,
    required: true
  },
  idempotencyKey: {
    type: String,
    required: true
  },
  requestHash: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed'],
    default: 'in_progress',
    required: true
  },
  statusCode: {
    type: Number,
    default: 200
  },
  responseBody: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('IdempotencyRecord', idempotencyRecordSchema);
