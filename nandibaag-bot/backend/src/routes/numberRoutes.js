const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { stopSession, deleteSessionFolder } = require('../services/whatsappService');
const { Settings } = require('../models');
const logger = require('../config/logger');

const router = express.Router();

/**
 * DELETE /api/numbers/:id
 * Delete a WhatsApp number & session cleanly end-to-end.
 * Role: super_admin or admin.
 */
router.delete('/:id', verifyToken, requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    let sessionId = id;

    // 1. Find the WhatsApp number doc in Settings if exists
    const settings = await Settings.findOne();
    if (settings && settings.whatsappNumbers) {
      const numberDoc = settings.whatsappNumbers.find(
        n => n._id?.toString() === id || n.label === id || n.number === id
      );
      if (numberDoc && numberDoc.label) {
        sessionId = numberDoc.label;
      }
    }

    logger.info(`Deleting WhatsApp number/session: ID=${id}, sessionId=${sessionId}`);

    // 2. Stop & logout Baileys WhatsApp session (calls sock.logout() to unlink device)
    try {
      await stopSession(sessionId);
    } catch (sessionErr) {
      logger.warn(`Warning stopping session ${sessionId}: ${sessionErr.message}`);
    }

    // 3. Delete session folder from disk completely (fs.rmSync recursive & force)
    try {
      deleteSessionFolder(sessionId);
    } catch (folderErr) {
      logger.warn(`Warning deleting session folder ${sessionId}: ${folderErr.message}`);
    }

    // 4. Delete WhatsAppNumber from MongoDB Settings
    if (settings && settings.whatsappNumbers) {
      const initialCount = settings.whatsappNumbers.length;
      settings.whatsappNumbers = settings.whatsappNumbers.filter(
        n => n._id?.toString() !== id && n.label !== sessionId && n.number !== id
      );
      if (settings.whatsappNumbers.length !== initialCount) {
        await settings.save();
        logger.info(`Removed number/session '${sessionId}' from Settings MongoDB document`);
      }
    }

    // 5. AuditLog entry
    const actor = req.user?.email || req.user?.id || 'admin';
    logger.info(`[AUDIT_LOG] DELETE_WHATSAPP_NUMBER: User '${actor}' deleted WhatsApp number/session '${sessionId}' (ID: ${id})`);

    // 6. Emit Socket.io event for real-time frontend update
    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      if (io) {
        io.emit('number_deleted', { id, sessionId });
        io.emit('whatsapp:number_deleted', { id, sessionId });
        io.emit('whatsapp:session_destroyed', { id, sessionId });
      }
    } catch (socketErr) {
      logger.warn(`Warning emitting socket event for number deletion: ${socketErr.message}`);
    }

    // 7. Return clean success response
    res.json({
      success: true,
      message: `WhatsApp number '${sessionId}' and session deleted successfully. You can add a new number with the same label afterward.`,
      id,
      sessionId
    });

  } catch (error) {
    logger.error(`Error deleting WhatsApp number ${req.params.id}: ${error.message}`);
    
    // Safety Net: Cleanup folder even if unexpected failure occurs
    try {
      deleteSessionFolder(req.params.id);
    } catch (_) {}

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete WhatsApp number'
    });
  }
});

module.exports = router;
