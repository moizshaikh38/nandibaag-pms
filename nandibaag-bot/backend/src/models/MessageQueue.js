const mongoose = require('mongoose');

const messageQueueSchema = new mongoose.Schema({
  sessionId: { 
    type: String, 
    default: 'primary' 
  },
  chatId: { 
    type: String, 
    required: true 
  },
  text: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  attempts: { 
    type: Number, 
    default: 0 
  },
  maxAttempts: { 
    type: Number, 
    default: 5 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  sentAt: { 
    type: Date, 
    default: null 
  },
  error: { 
    type: String, 
    default: null 
  }
}, { timestamps: true });

messageQueueSchema.index({ status: 1, createdAt: 1 });
messageQueueSchema.index({ chatId: 1 });

module.exports = mongoose.model('MessageQueue', messageQueueSchema);
