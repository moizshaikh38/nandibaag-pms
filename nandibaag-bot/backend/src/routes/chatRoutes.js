const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Chat, Lead } = require('../models');
const { sendMessageViaChannel } = require('../services/channelManager');
const { cancelPendingFollowUps, containsOptOutPhrases, markChatAsOptedOut } = require('../services/followUpService');
const logger = require('../config/logger');

const router = express.Router();

/**
 * GET /api/chats
 * List all chats with search and pagination
 */
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    
    const query = { isArchived: false };
    
    if (search) {
      query.$or = [
        { customerPhone: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const [chats, total] = await Promise.all([
      Chat.find(query)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
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
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
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
    
    const chat = await Chat.findByIdAndUpdate(
      req.params.id,
      { mode },
      { new: true }
    );
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
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
