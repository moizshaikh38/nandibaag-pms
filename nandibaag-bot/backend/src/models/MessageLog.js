const mongoose = require('mongoose');

const messageLogSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  guestPhone: {
    type: String,
    required: true,
    index: true
  },
  messageType: {
    type: String,
    enum: [
      'followup_3hr', 'followup_1day', 'followup_3day', 'followup_7day',
      'checkin_reminder', 'checkout_message', 'review_request'
    ],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['sent', 'failed', 'cancelled'],
    required: true,
    index: true
  },
  sentAt: {
    type: Date,
    default: null
  },
  errorReason: {
    type: String,
    default: null
  },
  messageText: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

messageLogSchema.index({ createdAt: -1 });
messageLogSchema.index({ bookingId: 1 });

module.exports = mongoose.model('MessageLog', messageLogSchema);
