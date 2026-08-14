const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Chat, Lead } = require('../models');
const { sendMessageViaChannel } = require('../services/channelManager');
const { cancelPendingFollowUps, containsOptOutPhrases, markChatAsOptedOut } = require('../services/followUpService');
const logger = require('../config/logger');

const router = express.Router();

function detectConversationTopic(text) {
  const lower = (text || '').toLowerCase();
  if (/\b(discount|offer|kam|kum|less|negotiate|budget|best price|final price|swast|kami)\b/i.test(lower)) return 'discount_or_price_negotiation';
  if (/\b(day\s*picnic|one\s*day|picnic|water\s*park)\b/i.test(lower)) return 'day_picnic';
  if (/\b(couple|husband|wife|anniversary)\b/i.test(lower)) return 'couple_stay';
  if (/\b(group|family|friends|corporate|team)\b/i.test(lower)) return 'group_stay';
  if (/\b(price|rate|cost|charge|package|kitn|kiti|kay)\b/i.test(lower)) return 'pricing';
  if (/\b(available|availability|room|date|check-?in|check-?out|tarikh|tarakh)\b/i.test(lower)) return 'availability';
  if (/\b(photo|photos|pic|image|gallery)\b/i.test(lower)) return 'photos';
  if (/\b(location|address|map|maps|kaha|kuth)\b/i.test(lower)) return 'location';
  if (/\b(payment|advance|upi|cash|card|refund|cancel)\b/i.test(lower)) return 'payment_or_policy';
  if (/\b(food|breakfast|lunch|dinner|tea|veg|jain|non-veg|nonveg)\b/i.test(lower)) return 'food';
  return null;
}

function updateStaffConversationState(chat, text) {
  if (!chat || !text) return;
  const cleanText = String(text).trim();
  if (!cleanText) return;

  chat.conversationState = chat.conversationState || {};
  chat.conversationState.lastStaffMessage = cleanText.slice(0, 1000);
  chat.conversationState.lastStaffMessageTime = new Date();

  const topic = detectConversationTopic(cleanText);
  if (topic) {
    chat.conversationState.context = topic;
  }
}

/**
 * GET /api/chats
 * List all chats with search and pagination
 */
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const { search, page = 1, limit = 100 } = req.query;
    
    const query = { isArchived: false };
    
    if (search) {
      query.$or = [
        { customerPhone: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const parsedLimit = Math.min(parseInt(limit, 10) || 100, 100);
    const parsedPage = parseInt(page, 10) || 1;
    const skip = (parsedPage - 1) * parsedLimit;
    
    const [chats, total] = await Promise.all([
      Chat.find(query)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(parsedLimit),
      Chat.countDocuments(query)
    ]);
    
    // Attach lead score and status from Lead collection
    const chatIds = chats.map(c => c._id);
    const leads = await Lead.find({ chatId: { $in: chatIds } });
    const leadMap = new Map(leads.map(l => [l.chatId.toString(), l]));

    const chatsWithLeads = chats.map(chat => {
      const chatObj = chat.toObject();
      const lead = leadMap.get(chat._id.toString());
      if (lead) {
        chatObj.leadScore = lead.score;
        chatObj.leadStatus = lead.status;
      } else {
        const isHotFallback = Boolean(chat.bookingDraft?.date) || ['guests_given', 'price_quoted', 'name_given', 'phone_given', 'special_requests'].includes(chat.bookingStage);
        chatObj.leadScore = isHotFallback ? 75 : 0;
        chatObj.leadStatus = isHotFallback ? 'hot' : 'cold';
      }
      return chatObj;
    });

    res.json({
      success: true,
      chats: chatsWithLeads,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/chats/:id
 * Get single chat with full message history
 */
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const chat = await Chat.findById(req.params.id);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    const lead = await Lead.findOne({ chatId: chat._id });
    const chatObj = chat.toObject();
    if (lead) {
      chatObj.leadScore = lead.score;
      chatObj.leadStatus = lead.status;
    } else {
      const isHotFallback = Boolean(chat.bookingDraft?.date) || ['guests_given', 'price_quoted', 'name_given', 'phone_given', 'special_requests'].includes(chat.bookingStage);
      chatObj.leadScore = isHotFallback ? 75 : 0;
      chatObj.leadStatus = isHotFallback ? 'hot' : 'cold';
    }
    
    res.json({
      success: true,
      chat: chatObj
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/chats/:id/mode
 * Toggle per-chat AI/human mode
 */
router.patch('/:id/mode', verifyToken, async (req, res, next) => {
  try {
    const { mode } = req.body;
    
    if (!mode || !['ai', 'human'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: 'mode must be "ai" or "human"'
      });
    }
    
    const chat = await Chat.findById(req.params.id);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    const previousMode = chat.mode || 'ai';
    const switchedAt = new Date();

    if (previousMode !== mode) {
      chat.modeHistory = chat.modeHistory || [];
      chat.modeHistory.push({
        fromMode: previousMode,
        toMode: mode,
        switchedAt,
        switchedBy: req.user?.email || req.user?.id || 'staff'
      });

      chat.conversationState = chat.conversationState || {};
      chat.conversationState.lastModeSwitchAt = switchedAt;
      if (previousMode === 'human' && mode === 'ai') {
        chat.conversationState.resumedByAiAt = switchedAt;
      }
    }

    chat.mode = mode;
    await chat.save();
    
    // If switching to human, cancel pending follow-ups
    if (mode === 'human') {
      await cancelPendingFollowUps(chat._id, 'staff_handled');
    }
    
    // Emit socket event for real-time sync across tabs/devices
    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      io.emit('chat:mode_updated', { chatId: chat._id, mode: chat.mode });
    } catch (socketErr) {
      // Socket emit is best-effort, don't fail the request
      console.warn('Socket emit failed for chat:mode_updated:', socketErr.message);
    }

    res.json({
      success: true,
      chat
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/chats/:id/message
 * POST /api/chats/:id/reply
 * POST /api/chats/:id/send
 * Staff sends manual message from dashboard to customer
 */
const handleStaffSendMessage = async (req, res, next) => {
  try {
    const { text } = req.body;
    
    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'text is required'
      });
    }
    
    const chat = await Chat.findById(req.params.id);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    console.log(`[StaffSendMessage] Attempting send to ${chat.customerPhone} (chatId: ${chat._id})`);
    
    const sessionId = chat.whatsappNumberUsed || 'resort_primary';
    const channel = chat.channel || 'whatsapp-web';
    let deliveryStatus = 'sent';
    let sendError = null;

    try {
      await sendMessageViaChannel(chat.customerPhone, text.trim(), channel, sessionId);
      console.log(`[StaffSendMessage] Send via ${channel} succeeded for ${chat.customerPhone}`);
    } catch (err) {
      deliveryStatus = 'failed';
      sendError = err.message;
      logger.error(`[StaffSendMessage] Send via ${channel} failed for ${chat.customerPhone}: ${err.message}`);
    }

    const newMessageObj = {
      sender: 'staff',
      text: text.trim(),
      timestamp: new Date(),
      messageType: 'text',
      deliveryStatus
    };
    
    // Append to chat messages
    chat.messages.push(newMessageObj);
    updateStaffConversationState(chat, text.trim());
    chat.lastMessageAt = new Date();
    await chat.save();
    
    // Cancel pending follow-ups since staff handled
    try {
      await cancelPendingFollowUps(chat._id, 'staff_handled');
    } catch (_) {}
    
    // Emit real-time Socket.io events
    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      if (io) {
        console.log(`[StaffSendMessage] EMITTING Socket.io event 'chat:updated' for chatId ${chat._id}`);
        io.emit('chat:updated', chat);
        io.emit('chat:new_message', {
          chatId: chat._id,
          customerPhone: chat.customerPhone,
          message: text.trim(),
          sender: 'staff',
          deliveryStatus,
          chat
        });
        io.emit('new_message', {
          chatId: chat._id,
          customerPhone: chat.customerPhone,
          message: text.trim(),
          sender: 'staff',
          deliveryStatus,
          chat
        });
      }
    } catch (socketErr) {
      logger.warn(`Failed to emit socket event on staff message: ${socketErr.message}`);
    }

    if (deliveryStatus === 'failed') {
      return res.status(500).json({
        success: false,
        message: `Message failed to send — check WhatsApp connection: ${sendError}`,
        chat
      });
    }
    
    res.json({
      success: true,
      message: 'Message sent to WhatsApp',
      chat
    });
  } catch (error) {
    next(error);
  }
};

router.post('/:id/message', verifyToken, handleStaffSendMessage);
router.post('/:id/reply', verifyToken, handleStaffSendMessage);
router.post('/:id/send', verifyToken, handleStaffSendMessage);

/**
 * POST /api/chats/:id/reset
 * Reset conversation (keeps history for record)
 */
router.post('/:id/reset', verifyToken, async (req, res, next) => {
  try {
    const chat = await Chat.findById(req.params.id);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    // Add system marker
    chat.messages.push({
      sender: 'bot',
      text: '--- New Conversation Started ---',
      timestamp: new Date(),
      messageType: 'text'
    });
    
    // Reset conversation state
    chat.isNewConversation = true;
    chat.bookingStage = 'none';
    chat.bookingDraft = {};
    chat.conversationResetAt = new Date();
    
    await chat.save();
    
    // Cancel pending follow-ups
    await cancelPendingFollowUps(chat._id, 'conversation_reset');
    
    res.json({
      success: true,
      message: 'Conversation reset'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/chats/:id/archive
 * Soft delete chat
 */
router.patch('/:id/archive', verifyToken, async (req, res, next) => {
  try {
    const chat = await Chat.findByIdAndUpdate(
      req.params.id,
      { isArchived: true },
      { new: true }
    );
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    // Cancel pending follow-ups
    await cancelPendingFollowUps(chat._id, 'chat_archived');
    
    res.json({
      success: true,
      message: 'Chat archived'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
