const mongoose = require('mongoose');

const failedMessageSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true
  },
  customerPhone: String,
  channel: {
    type: String,
    default: 'whatsapp-web'
  },
  originalMessage: String,
  errorMessage: String,
  errorStack: String,
  resolved: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('FailedMessage', failedMessageSchema);
