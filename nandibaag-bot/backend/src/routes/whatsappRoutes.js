const express = require('express');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { initSession, requestPairingCode, getSessionStatus, getAllSessionsStatus, destroySession, deleteSessionFolder } = require('../services/whatsappService');
const { Settings } = require('../models');
const logger = require('../config/logger');

const router = express.Router();

/**
 * GET /api/whatsapp/status
 * Returns current connection status
 */
router.get('/status', verifyToken, async (req, res, next) => {
  try {
    const settings = await Settings.findOne();
    const whatsappNumbers = settings?.whatsappNumbers || [];
    const statusMap = getAllSessionsStatus(whatsappNumbers);
    const isAnyConnected = Object.values(statusMap).includes('connected');
    
    res.json({
      success: true,
      status: isAnyConnected ? 'connected' : 'disconnected',
      sessions: statusMap
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/whatsapp/sessions
 * Returns status of all WhatsApp sessions
 */
router.get('/sessions', verifyToken, async (req, res, next) => {
  try {
    const settings = await Settings.findOne();
    const whatsappNumbers = settings?.whatsappNumbers || [];
    
    const statusMap = getAllSessionsStatus(whatsappNumbers);
    const qrCodes = {};
    for (const num of whatsappNumbers) {
      if (num.qrCode && (num.status === 'qr_pending' || num.status === 'connecting')) {
        const key = num.label || num.number;
        qrCodes[key] = num.qrCode;
      }
    }
    
    res.json({
      success: true,
      sessions: statusMap,
      qrCodes
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/whatsapp/sessions
 * Add a new WhatsApp session (admin only).
 * 
 * This endpoint is NON-BLOCKING: it starts initialization in the background
 * and immediately returns 200. The frontend should listen for socket events
 * ('whatsapp:qr', 'whatsapp:ready', 'whatsapp:init_failed') to drive the UI.
 */
router.post('/sessions', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { sessionId, cleanStart } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId is required'
      });
    }

    // Start initialization (non-blocking — returns immediately)
    initSession(sessionId, { cleanStart: !!cleanStart }).catch((error) => {
      logger.error(`Background session initialization failed for ${sessionId}: ${error.message}`);
    });
    
    res.json({
      success: true,
      message: 'Session initialization started. Listen for socket events.',
      sessionId
    });
  } catch (error) {
    logger.error(`Failed to start session ${req.body.sessionId}: ${error.message}`);
    next(error);
  }
});

/**
 * POST /api/whatsapp/sessions/:id/pairing-code
 * Initialize session with pairing code instead of QR
 */
router.post('/:id/pairing-code', verifyToken, async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'phoneNumber is required'
      });
    }
    
    await requestPairingCode(sessionId, phoneNumber);
    
    res.json({
      success: true,
      message: 'Pairing code requested'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/whatsapp/sessions/:id
 * Destroy a WhatsApp session (admin only).
 * Also deletes the on-disk session folder to allow clean re-initialization.
 */
router.delete('/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    
    await destroySession(sessionId, { deleteData: true });
    
    res.json({
      success: true,
      message: 'Session destroyed and data cleaned up'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/whatsapp/failed-messages
 * List unresolved failed messages for staff review.
 */
router.get('/failed-messages', verifyToken, async (req, res, next) => {
  try {
    const { FailedMessage } = require('../models');
    const list = await FailedMessage.find({ resolved: false }).sort({ timestamp: -1 }).limit(50).lean();
    res.json({
      success: true,
      count: list.length,
      failedMessages: list
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
