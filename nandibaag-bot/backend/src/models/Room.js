const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  seriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    required: true,
    index: true
  },
  roomNumber: {
    type: String,
    required: true,
    trim: true
  },
  capacity: {
    type: Number,
    required: true
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

roomSchema.index({ seriesId: 1, roomNumber: 1 }, { unique: true });

module.exports = mongoose.model('Room', roomSchema);
