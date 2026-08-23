const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  settingKey: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  settingValue: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  dataType: {
    type: String,
    enum: ['string', 'number', 'boolean', 'json'],
    default: 'string'
  },
  category: {
    type: String,
    enum: ['general', 'chat', 'pricing', 'notifications'],
    default: 'general'
  },
  updatedBy: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
