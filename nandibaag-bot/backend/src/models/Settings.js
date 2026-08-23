const mongoose = require('mongoose');

const whatsappNumberSchema = new mongoose.Schema({
  number: String,
  label: String,
  isActive: {
    type: Boolean,
    default: true
  },
  isPrimary: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    default: 'disconnected'
  },
  connectedAt: {
    type: Date,
    default: null
  },
  qrCode: {
    type: String,
    default: null
  }
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  globalMode: {
    type: String,
    enum: ['ai', 'staff', 'human', 'auto'],
    default: 'ai'
  },
  defaultModeForNewChats: {
    type: String,
    enum: ['ai', 'staff', 'human', 'auto'],
    default: 'ai'
  },
  whatsappNumbers: [whatsappNumberSchema],
  openRouterModelOverride: {
    type: String,
    default: null
  },
  followUpEnabled: {
    type: Boolean,
    default: true
  },
  resortContactNumber: {
    type: String,
    default: '9257657664'
  },
  resortContactNumberReception: {
    type: String,
    default: '9257657665'
  },
  resortContactNumberKitchen: {
    type: String,
    default: '75582 69653'
  }
}, {
  timestamps: true
});

settingsSchema.index({ globalMode: 1 });
settingsSchema.index({ defaultModeForNewChats: 1 });

module.exports = mongoose.model('Settings', settingsSchema);
