const mongoose = require('mongoose');

const seriesSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'maintenance', 'deleted'],
    default: 'active'
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Series', seriesSchema);
