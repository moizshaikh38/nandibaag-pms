const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

// Socket.io emitter will be set by the server initialization
let io = null;

function setSocketIo(socketIo) {
  io = socketIo;
}

// Active sessions Map: sessionId -> makeWASocket instance
const activeSockets = new Map();

// Reconnect attempt counters: sessionId -> attempt count
const reconnectAttempts = new Map();

// Per-chat message queue locks: chatPhone -> Promise
const messageQueueLocks = new Map();

function getSessionDataPath(sessionId) {
  return path.join(__dirname, '../../sessions', sessionId);
}

function deleteSessionFolder(sessionId) {
  const sessionPath = getSessionDataPath(sessionId);
  try {
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      logger.info(`Deleted session folder for ${sessionId}: ${sessionPath}`);
    }
  } catch (err) {
    logger.error(`Failed to delete session folder for ${sessionId}: ${err.message}`);
  }
}

/**
 * Initializes a Baileys session for a given sessionId.
 */
async function initSession(sessionId, { cleanStart = false, pairingPhoneNumber = null } = {}) {
  if (activeSockets.has(sessionId)) {
    logger.warn(`Session ${sessionId} already connected or active in memory`);
    return { sock: activeSockets.get(sessionId) };
  }

  if (cleanStart) {
    deleteSessionFolder(sessionId);
  }

  logger.info(`Initializing Baileys WhatsApp session: ${sessionId}`);

  const sessionPath = getSessionDataPath(sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ["Nandibaag Resort", "Chrome", "1.0.0"]
  });

  activeSockets.set(sessionId, sock);

  // Auto-request pairing code if phoneNumber provided and not registered
  if (pairingPhoneNumber && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        logger.info(`Requesting pairing code for ${pairingPhoneNumber} in session ${sessionId}`);
        const code = await sock.requestPairingCode(pairingPhoneNumber.replace(/\D/g, ''));
        logger.info(`Pairing code generated for ${sessionId}: ${code}`);
        if (io) {
          io.emit('whatsapp:pairing_code', { sessionId, code });
        }
      } catch (err) {
        logger.error(`Failed to request pairing code for ${sessionId}: ${err.message}`);
      }
    }, 2000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrDataUrl = await qrcode.toDataURL(qr);
        logger.info(`QR code generated for session ${sessionId}`);
        
        // Save QR to db & status update
        try {
          const { Settings } = require('../models');
          const settings = await Settings.findOne();
          if (settings) {
            const numberObj = settings.whatsappNumbers.find(n => n.label === sessionId || n.number === sessionId);
            if (numberObj) {
              numberObj.qrCode = qrDataUrl;
              numberObj.status = 'qr_pending';
              await settings.save();
            }
          }
        } catch (dbErr) {
          logger.error(`Failed to save QR status to DB: ${dbErr.message}`);
        }

        if (io) {
          io.emit('whatsapp:qr', { sessionId, qr: qrDataUrl });
        }
      } catch (error) {
        logger.error(`Failed to generate QR for session ${sessionId}: ${error.message}`);
      }
    }

    if (connection === 'open') {
      const phoneNumber = sock.user.id.split(':')[0];
      logger.info(`Baileys session ${sessionId} is connected (Phone: ${phoneNumber})`);

      try {
        const { Settings } = require('../models');
        const settings = await Settings.findOne();
        if (settings) {
          let numberObj = settings.whatsappNumbers.find(n => n.label === sessionId);
          if (!numberObj) {
            settings.whatsappNumbers.push({
              number: phoneNumber,
              label: sessionId,
              isActive: true,
              isPrimary: settings.whatsappNumbers.length === 0,
              status: 'connected',
              connectedAt: new Date(),
              qrCode: null
            });
          } else {
            numberObj.number = phoneNumber;
            numberObj.status = 'connected';
            numberObj.connectedAt = new Date();
            numberObj.qrCode = null;
            numberObj.isActive = true;
          }
          await settings.save();
        }
      } catch (dbErr) {
        logger.error(`Failed to save connected session to DB: ${dbErr.message}`);
      }

      if (io) {
        io.emit('whatsapp:ready', { sessionId, phoneNumber });
      }
      reconnectAttempts.set(sessionId, 0);
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(`Session ${sessionId} connection closed. StatusCode: ${statusCode}, ShouldReconnect: ${shouldReconnect}`);
      activeSockets.delete(sessionId);

      if (io) {
        io.emit('whatsapp:disconnected', { sessionId, reason: lastDisconnect?.error?.message });
      }

      if (shouldReconnect) {
        await autoReconnect(sessionId);
      } else {
        logger.warn(`Auth failed / Logged out for session ${sessionId}. Cleaning up session folder.`);
        
        try {
          const { Settings } = require('../models');
          const settings = await Settings.findOne();
          if (settings) {
            const numberObj = settings.whatsappNumbers.find(n => n.label === sessionId);
            if (numberObj) {
              numberObj.status = 'auth_failed';
              await settings.save();
            }
          }
        } catch (dbErr) {
          logger.error(`Failed to save auth_failed status to DB: ${dbErr.message}`);
        }

        if (io) {
          io.emit('whatsapp:auth_failure', { sessionId, message: 'Unlinked from phone' });
        }

        deleteSessionFolder(sessionId);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const chatPhone = msg.key.remoteJid.replace('@s.whatsapp.net', '');

      // Get or create lock for this chat to process sequentially
      let lock = messageQueueLocks.get(chatPhone);
      if (!lock) {
        lock = Promise.resolve();
        messageQueueLocks.set(chatPhone, lock);
      }

      messageQueueLocks.set(chatPhone, lock.then(async () => {
        try {
          const messageHandler = require('./messageHandler');
          await messageHandler.handleMessage(sessionId, msg);
        } catch (error) {
          logger.error(`Error processing message from ${chatPhone}: ${error.message}`);
        } finally {
          messageQueueLocks.delete(chatPhone);
        }
      }));
    }
  });

  return { sock };
}

// Map parameters to maintain startSession compatibility
async function startSession(sessionId, ioInstance, options = {}) {
  if (ioInstance) setSocketIo(ioInstance);
  return initSession(sessionId, {
    cleanStart: false,
    pairingPhoneNumber: options.pairingPhoneNumber
  });
}

async function requestPairingCode(sessionId, phoneNumber) {
  logger.info(`requestPairingCode called for ${sessionId} -> ${phoneNumber}`);
  // If socket already exists, trigger pairing code request directly
  const sock = activeSockets.get(sessionId);
  if (sock) {
    const code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
    if (io) {
      io.emit('whatsapp:pairing_code', { sessionId, code });
    }
    return code;
  } else {
    // If not exists, initialize it with pairing code option
    await initSession(sessionId, { pairingPhoneNumber: phoneNumber });
  }
}

async function autoReconnect(sessionId) {
  const maxAttempts = 5;
  const backoffDelays = [5000, 15000, 30000, 60000, 60000]; // 5s, 15s, 30s, 60s cap

  let attempts = reconnectAttempts.get(sessionId) || 0;
  if (attempts >= maxAttempts) {
    logger.error(`Session ${sessionId} reconnection failed after ${maxAttempts} attempts`);
    if (io) {
      io.emit('whatsapp:reconnect_failed', { sessionId });
    }
    reconnectAttempts.set(sessionId, 0);
    return;
  }

  const delay = backoffDelays[attempts];
  reconnectAttempts.set(sessionId, attempts + 1);

  logger.info(`Reconnecting session ${sessionId} in ${delay / 1000}s (attempt ${attempts + 1}/${maxAttempts})`);
  await new Promise(resolve => setTimeout(resolve, delay));

  try {
    await initSession(sessionId);
  } catch (error) {
    logger.error(`Reconnection attempt ${attempts + 1} failed for session ${sessionId}: ${error.message}`);
    await autoReconnect(sessionId);
  }
}

function getSessionStatus(sessionId, dbStatus) {
  const sock = activeSockets.get(sessionId);
  if (sock) {
    // If socket exists in activeSockets map, it is connected
    return 'connected';
  }
  if (dbStatus === 'connected') {
    return 'connected';
  }
  return 'disconnected';
}

function getAllSessionsStatus(whatsappNumbers = []) {
  const statusMap = {};
  if (Array.isArray(whatsappNumbers)) {
    for (const numberConfig of whatsappNumbers) {
      const sessionId = numberConfig.label || numberConfig.number;
      statusMap[sessionId] = getSessionStatus(sessionId, numberConfig.status);
    }
  }
  for (const sessionId of activeSockets.keys()) {
    statusMap[sessionId] = 'connected';
  }
  return statusMap;
}

async function sendMessage(sessionId, toPhone, text) {
  const activeKeys = Array.from(activeSockets.keys());
  logger.info(`[sendMessage] Registered active sessions: [${activeKeys.join(', ')}], Requested sessionId: '${sessionId}'`);

  let sock = activeSockets.get(sessionId);
  if (!sock) {
    const fallbackSession = activeKeys[0];
    if (fallbackSession) {
      logger.warn(`[sendMessage] Session '${sessionId}' not found in activeSockets. Falling back to active session '${fallbackSession}'.`);
      sock = activeSockets.get(fallbackSession);
    } else {
      throw new Error(`WhatsApp Session '${sessionId}' is not connected or inactive. Please connect a WhatsApp number in the Connect tab.`);
    }
  }

  let jid;
  if (toPhone.includes('@')) {
    jid = toPhone;
  } else {
    let digits = toPhone.replace(/\D/g, '');
    if (digits.length === 10) {
      digits = '91' + digits;
    }
    jid = `${digits}@s.whatsapp.net`;
  }

  logger.info(`Sending message via Baileys session to ${jid}`);

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await sock.sendMessage(jid, { text });
      logger.info(`Message sent successfully via Baileys to ${jid}`);
      return;
    } catch (error) {
      lastError = error;
      logger.warn(`Send attempt ${attempt + 1} failed to ${jid}: ${error.message}`);
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  throw new Error(`Failed to deliver message to ${toPhone} after 2 attempts: ${lastError.message}`);
}

async function stopSession(sessionId) {
  const sock = activeSockets.get(sessionId);
  if (sock) {
    try {
      await sock.logout();
      logger.info(`Session ${sessionId} logged out successfully via Baileys`);
    } catch (error) {
      logger.error(`Error logging out session ${sessionId}: ${error.message}`);
      try {
        sock.end(undefined);
      } catch (endErr) {
        logger.error(`Error ending session: ${endErr.message}`);
      }
    }
  }

  // Remove from settings database if desired (maintain old flow behavior)
  try {
    const { Settings } = require('../models');
    const settings = await Settings.findOne();
    if (settings) {
      const originalLength = settings.whatsappNumbers.length;
      settings.whatsappNumbers = settings.whatsappNumbers.filter(n => n.label !== sessionId);
      if (settings.whatsappNumbers.length !== originalLength) {
        await settings.save();
        logger.info(`Removed session ${sessionId} from Settings database`);
      }
    }
  } catch (dbErr) {
    logger.error(`Failed to remove session ${sessionId} from DB: ${dbErr.message}`);
  }

  activeSockets.delete(sessionId);
  reconnectAttempts.delete(sessionId);
  deleteSessionFolder(sessionId);

  if (io) {
    io.emit('whatsapp:session_destroyed', { sessionId });
  }
}

async function restoreAllSessions(ioInstance) {
  if (ioInstance) setSocketIo(ioInstance);
  logger.info('Restoring all active Baileys WhatsApp sessions...');

  const sessionsDir = path.join(__dirname, '../../sessions');
  if (!fs.existsSync(sessionsDir)) {
    return;
  }

  const folders = fs.readdirSync(sessionsDir);
  for (const sessionId of folders) {
    const sessionPath = path.join(sessionsDir, sessionId);
    if (fs.statSync(sessionPath).isDirectory()) {
      try {
        logger.info(`Restoring session ${sessionId}...`);
        await initSession(sessionId);
      } catch (error) {
        logger.error(`Failed to restore session ${sessionId}: ${error.message}`);
      }
    }
  }
}

async function destroyAllSessions() {
  logger.info(`Destroying all ${activeSockets.size} active WhatsApp session(s)...`);
  for (const [sessionId, sock] of activeSockets.entries()) {
    try {
      sock.end(undefined);
      logger.info(`Session ${sessionId} ended cleanly`);
    } catch (err) {
      logger.error(`Failed to destroy session ${sessionId} cleanly: ${err.message}`);
    }
  }
  activeSockets.clear();
}

module.exports = {
  setSocketIo,
  initSession,
  startSession,
  requestPairingCode,
  getSessionStatus,
  getAllSessionsStatus,
  sendMessage,
  stopSession,
  destroySession: stopSession, // map destroySession to stopSession
  restartAllActiveSessions: restoreAllSessions, // map to restoreAllSessions / restartAllActiveSessions
  restoreAllSessions,
  deleteSessionFolder,
  destroyAllSessions,
  activeSockets
};
