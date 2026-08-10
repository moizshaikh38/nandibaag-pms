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
    enum: ['couple', 'group', 'picnic', 'oneDay'],
    required: true
  },
  packageType: {
    type: String,
    enum: ['couple', 'group', 'oneDay', 'picnic'],
    required: false
  },
  mealOption: {
    type: String,
    enum: ['B->D', 'B->T', null],
    required: false,
    default: null
  },
  guestComposition: {
    adults: {
      type: Number,
      default: 2
    },
    children: {
      type: Number,
      default: 0
    }
  },
  bookedBy: {
    name: {
      type: String
    },
    staffId: {
      type: String
    }
  },
  staffNames: [{
    name: String,
    id: { type: String }
  }],
  notes: {
    type: String,
    maxlength: 500,
    default: ''
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
  advancePaid: {
    type: Number,
    required: false,
    default: 0
  },
  remainingPayment: {
    type: Number,
    default: 0
  },
  messagesSent: {
    customerSMS: {
      type: Boolean,
      default: false
    },
    staffGroup: {
      type: Boolean,
      default: false
    },
    sentAt: Date
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
  roomId: {
    type: String,
    required: false
  },
  roomIds: {
    type: [String],
    required: false,
    default: []
  },
  createdBy: {
    type: String,
    enum: ['ai', 'staff'],
    default: 'ai'
  }
}, {
  timestamps: true
});

bookingSchema.methods.getRoomsDisplay = function() {
  return this.roomIds && this.roomIds.length > 0 
    ? this.roomIds.join(', ')
    : (this.roomId || 'TBA');
};

bookingSchema.methods.getTotalRoomCapacity = async function() {
  const Room = require('./Room');
  if (!this.roomIds || this.roomIds.length === 0) return 0;
  
  const rooms = await Room.find({ _id: { $in: this.roomIds } });
  return rooms.reduce((sum, room) => sum + (room.capacity || 0), 0);
};

bookingSchema.index({ customerPhone: 1 });
bookingSchema.index({ date: 1 });
bookingSchema.index({ bookingType: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
