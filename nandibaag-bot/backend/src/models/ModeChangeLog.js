const mongoose = require('mongoose');

const modeChangeLogSchema = new mongoose.Schema({
  changedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  changedBy: {
    type: String,
    required: true,
    default: 'Admin'
  },
  affectedChats: {
    type: Number,
    required: true,
    default: 0
  },
  modifiedChats: {
    type: Number,
    required: true,
    default: 0
  },
  fromModeDistribution: {
    ai: { type: Number, default: 0 },
    staff: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  toMode: {
    type: String,
    enum: ['ai', 'staff', 'human', 'auto'],
    required: true
  },
  totalChats: {
    type: Number,
    required: true,
    default: 0
  },
  changeType: {
    type: String,
    enum: ['MASS_SWITCH', 'DEFAULT_ONLY', 'MANUAL', 'API'],
    default: 'MASS_SWITCH'
  },
  notes: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ModeChangeLog', modeChangeLogSchema);
