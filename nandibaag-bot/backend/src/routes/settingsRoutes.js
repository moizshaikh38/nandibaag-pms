const express = require('express');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { Settings, Chat } = require('../models');
const { getIO } = require('../sockets');
const logger = require('../config/logger');
const { logActivity } = require('../utils/activityLogger');

const router = express.Router();

function normalizeChatMode(mode) {
  if (mode === 'staff') return 'human';
  return mode;
}

/**
 * GET /api/settings
 * Get current global settings
 */
router.get('/', verifyToken, async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    
    // Create default settings if none exist
    if (!settings) {
      settings = new Settings({
        globalMode: 'ai',
        defaultModeForNewChats: 'ai',
        whatsappNumbers: [],
        openRouterModelOverride: null,
        followUpEnabled: true
      });
      await settings.save();
    } else if (!settings.defaultModeForNewChats) {
      settings.defaultModeForNewChats = settings.globalMode || 'ai';
      await settings.save();
    }
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/settings/global-mode
 * Update default mode for NEW chats only (admin only)
 * DOES NOT touch existing chats — only new incoming chats use this mode
 */
router.patch('/global-mode', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const requestedMode = normalizeChatMode(req.body.globalMode || req.body.mode);
    
    if (!requestedMode || !['ai', 'human'].includes(requestedMode)) {
      return res.status(400).json({
        success: false,
        message: 'Mode must be "ai" or "human"'
      });
    }
    
    // Update ONLY the settings document — NOT any chats
    const settings = await Settings.findOneAndUpdate(
      {},
      { globalMode: requestedMode, defaultModeForNewChats: requestedMode },
      { new: true, upsert: true }
    );

    // ⚠️ REMOVED: Chat.updateMany({}, { mode }) — this was overwriting ALL existing chats
    logger.info(`[Settings] Default mode for new chats set to: ${requestedMode} (existing chats NOT touched)`);
    logActivity(req.user.id, 'default_mode_changed', `Set default mode for new chats to ${requestedMode.toUpperCase()} (existing chats unchanged)`, req);

    // Emit real-time Socket.io event to clients
    try {
      const io = getIO();
      io.emit('settings:default_new_chat_mode_changed', { defaultModeForNewChats: requestedMode });
      io.emit('settings:global_mode_changed', { globalMode: requestedMode });
    } catch (err) {
      logger.error(`Failed to emit socket updates after mode setting change: ${err.message}`);
    }
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/settings/default-new-chat-mode
 * Set default mode for brand-new chats only (admin only)
 * Existing chats keep their current mode.
 */
router.patch('/default-new-chat-mode', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const requestedMode = normalizeChatMode(req.body.defaultModeForNewChats || req.body.mode || req.body.value);

    if (!requestedMode || !['ai', 'human'].includes(requestedMode)) {
      return res.status(400).json({
        success: false,
        message: 'defaultModeForNewChats must be "ai" or "human"'
      });
    }

    const settings = await Settings.findOneAndUpdate(
      {},
      { defaultModeForNewChats: requestedMode },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    logActivity(
      req.user.id,
      'default_new_chat_mode_changed',
      `Set new chats default mode to ${requestedMode.toUpperCase()}`,
      req
    );

    try {
      const io = getIO();
      io.emit('settings:default_new_chat_mode_changed', { defaultModeForNewChats: requestedMode });
    } catch (err) {
      logger.error(`Failed to emit socket update after default chat mode change: ${err.message}`);
    }

    res.json({
      success: true,
      settings,
      message: 'Default mode for new chats updated'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/settings/follow-ups
 * Enable/disable follow-up system (admin only)
 */
router.patch('/follow-ups', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { followUpEnabled } = req.body;
    
    if (typeof followUpEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'followUpEnabled must be a boolean'
      });
    }
    
    const settings = await Settings.findOneAndUpdate(
      {},
      { followUpEnabled },
      { new: true, upsert: true }
    );
    logActivity(req.user.id, 'follow_ups_toggled', `${followUpEnabled ? 'Enabled' : 'Disabled'} automated follow-up sequences`, req);
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/settings/whatsapp-numbers
 * Update WhatsApp numbers configuration (admin only)
 */
router.put('/whatsapp-numbers', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { whatsappNumbers } = req.body;
    
    if (!Array.isArray(whatsappNumbers)) {
      return res.status(400).json({
        success: false,
        message: 'whatsappNumbers must be an array'
      });
    }
    
    const settings = await Settings.findOneAndUpdate(
      {},
      { whatsappNumbers },
      { new: true, upsert: true }
    );
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
