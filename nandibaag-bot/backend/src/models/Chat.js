// IMPORTANT: Chats are NEVER hard-deleted. Use the isArchived flag for soft deletion.
// This preserves conversation history and lead data even if a customer asks to stop.
// Hard deletion would break data integrity and lose valuable customer insights.

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['customer', 'bot', 'staff', 'agent'],
    required: true
  },
  text: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'document'],
    default: 'text'
  },
  deliveryStatus: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'queued', 'failed'],
    default: 'sent'
  }
}, { _id: false });

const bookingDraftSchema = new mongoose.Schema({
  bookingType: {
    type: String,
    enum: ['couple', 'group', 'picnic', null]
  },
  date: String,
  nights: Number,
  adults: Number,
  kids: [{
    age: Number
  }],
  isMarried: Boolean,
  calculatedPrice: Number,
  priceBreakdown: String,
  specialRequests: String,
  // Phase C: availability-check fields
  availabilityChecked: {
    type: Boolean,
    default: false
  },
  availabilityConfirmed: {
    type: Boolean,
    default: false
  },
  roomPreference: {
    type: String,
    enum: ['single_room_tight_fit', 'multiple_rooms', 'not_applicable'],
    default: 'not_applicable'
  },
  kidsSpecified: {
    type: Boolean,
    default: false
  },
  customerName: {
    type: String,
    default: null
  },
  nameRequested: {
    type: Boolean,
    default: false
  },
  bookingStep: {
    type: Number,
    default: 1
  },
  suggestedCombination: {
    type: String,
    default: null
  }
}, { _id: false });

const modeHistorySchema = new mongoose.Schema({
  fromMode: {
    type: String,
    enum: ['ai', 'staff', 'human', 'auto', null],
    default: null
  },
  toMode: {
    type: String,
    enum: ['ai', 'staff', 'human', 'auto'],
    required: true
  },
  switchedAt: {
    type: Date,
    default: Date.now
  },
  switchedBy: {
    type: String,
    default: 'staff'
  }
}, { _id: false });

const chatSchema = new mongoose.Schema({
  customerPhone: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  customerName: {
    type: String,
    default: null
  },
  whatsappNumberUsed: {
    type: String
  },
  channel: {
    type: String,
    enum: ['whatsapp-web', 'fast2sms'],
    default: 'whatsapp-web'
  },
  mode: {
    type: String,
    enum: ['ai', 'staff', 'human', 'auto'],
    default: 'ai'
  },
  language: {
    type: String,
    enum: ['hindi', 'marathi', 'roman_marathi', 'english', 'hinglish', 'gujarati', 'unknown'],
    default: 'unknown'
  },
  messages: [messageSchema],
  modeHistory: [modeHistorySchema],
  conversationState: {
    lastStaffMessage: {
      type: String,
      default: null
    },
    lastStaffMessageTime: {
      type: Date,
      default: null
    },
    customerLastQuery: {
      type: String,
      default: null
    },
    context: {
      type: String,
      default: null
    },
    lastModeSwitchAt: {
      type: Date,
      default: null
    },
    resumedByAiAt: {
      type: Date,
      default: null
    }
  },
  lastMessageAt: {
    type: Date,
    index: true
  },
  bookingStage: {
    type: String,
    enum: ['none', 'type_selected', 'date_given', 'guests_given', 'kids_given', 'married_checked', 'price_quoted', 'name_given', 'phone_given', 'special_requests', 'handed_over', 'completed'],
    default: 'none'
  },
  bookingDraft: {
    type: bookingDraftSchema,
    default: {}
  },
  isNewConversation: {
    type: Boolean,
    default: true
  },
  conversationResetAt: {
    type: Date,
    default: null
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

chatSchema.index({ lastMessageAt: -1 });
chatSchema.index({ mode: 1 });
chatSchema.index({ bookingStage: 1 });
chatSchema.index({ isArchived: 1 });
chatSchema.index({ language: 1 });

module.exports = mongoose.model('Chat', chatSchema);
