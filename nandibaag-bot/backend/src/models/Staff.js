const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  staffId: {
    type: String,
    unique: true,
    required: true
  },
  contact: {
    type: String,
    required: false
  },
  email: {
    type: String,
    required: false
  },
  hireDate: {
    type: Date,
    required: false
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  role: {
    type: String,
    required: false,
    default: 'Staff'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Staff', staffSchema);
