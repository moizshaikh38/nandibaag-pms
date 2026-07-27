const mongoose = require('mongoose');

const kidSchema = new mongoose.Schema({
  age: Number,
  rate: Number
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat'
  },
  customerName: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  bookingType: {
    type: String,
    enum: ['couple', 'group', 'picnic'],
    required: true
  },
  date: {
    type: String,
    required: true
  },
  checkInDate: {
    type: Date
  },
  checkOutDate: {
    type: Date
  },
  isWeekend: {
    type: Boolean
  },
  adults: {
    type: Number
  },
  kids: [kidSchema],
  totalAmount: {
    type: Number,
    required: true
  },
  priceBreakdown: {
    type: String
  },
  specialRequests: {
    type: String
  },
  advancePayment: {
    type: Number,
    default: 0
  },
  remainingPayment: {
    type: Number,
    default: 0
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partially_paid', 'paid'],
    default: 'unpaid'
  },
  // Phase D: PMS fields
  guestAddress: {
    type: String
  },
  guestIdProofType: {
    type: String,
    enum: ['aadhaar', 'pan', 'license', null],
    default: null
  },
  guestIdProofPhoto: {
    type: String,
    default: null
  },
  roomBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RoomBooking',
    default: null
  },
  messagesStopped: {
    type: Boolean,
    default: false
  },
  // Phase F+G: lifecycle message sent-flags
  checkinReminderSent: {
    type: Boolean,
    default: false
  },
  checkoutMessageSent: {
    type: Boolean,
    default: false
  },
  reviewRequestSent: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['draft', 'pending_payment', 'confirmed', 'cancelled', 'checked_in', 'checked_out', 'no_show'],
    default: 'draft',
    index: true
  },
  createdBy: {
    type: String,
    enum: ['ai', 'staff'],
    default: 'ai'
  }
}, {
  timestamps: true
});

bookingSchema.index({ customerPhone: 1 });
bookingSchema.index({ date: 1 });
bookingSchema.index({ bookingType: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
