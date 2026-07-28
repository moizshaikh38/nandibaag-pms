const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
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

function emitSocketEvent(event, payload) {
  try {
    if (io && typeof io.emit === 'function') {
      io.emit(event, payload);
      return;
    }
    const { getIO } = require('../sockets');
    const socketServer = getIO();
    if (socketServer && typeof socketServer.emit === 'function') {
      io = socketServer;
      io.emit(event, payload);
    }
  } catch (err) {
    logger.warn(`Could not emit Socket.io event '${event}': ${err.message}`);
  }
}

// Active sessions Map: sessionId -> makeWASocket instance
const activeSockets = new Map();

// Reconnect attempt counters: sessionId -> attempt count
const reconnectAttempts = new Map();

// Per-chat message queue locks: chatPhone -> Promise
const messageQueueLocks = new Map();

// Watchdog interval reference
let watchdogIntervalHandle = null;

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

// Track sessions currently initializing or reconnecting to prevent duplicate socket creation
const connectingSessions = new Set();

/**
 * Initializes a Baileys session for a given sessionId.
 */
async function initSession(sessionId, { cleanStart = false, pairingPhoneNumber = null } = {}) {
  if (connectingSessions.has(sessionId)) {
    logger.warn(`Session ${sessionId} is already initializing or reconnecting. Skipping duplicate creation.`);
    return { sock: activeSockets.get(sessionId) };
  }

  if (activeSockets.has(sessionId)) {
    const existingSock = activeSockets.get(sessionId);
    if (existingSock && existingSock.user && existingSock.user.id) {
      logger.warn(`Session ${sessionId} is already connected in memory.`);
      return { sock: existingSock };
    }
  }

  connectingSessions.add(sessionId);

  if (cleanStart) {
    const useMongoAuthState = require('./mongoAuthState');
    try {
      const { deleteSession } = await useMongoAuthState(sessionId);
      if (deleteSession) await deleteSession();
    } catch (cleanErr) {}
    deleteSessionFolder(sessionId);
  }

  logger.info(`Initializing Baileys WhatsApp session via Mongo Atlas Auth: ${sessionId}`);

  const useMongoAuthState = require('./mongoAuthState');
  const { state, saveCreds } = await useMongoAuthState(sessionId);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.macOS('Desktop'),
    keepAliveIntervalMs: 25000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    emitOwnEvents: false,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    retryRequestDelayMs: 500
  });

  activeSockets.set(sessionId, sock);

  // Auto-request pairing code if phoneNumber provided and not registered
  if (pairingPhoneNumber && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        logger.info(`Requesting pairing code for ${pairingPhoneNumber} in session ${sessionId}`);
        const code = await sock.requestPairingCode(pairingPhoneNumber.replace(/\D/g, ''));
        logger.info(`Pairing code generated for ${sessionId}: ${code}`);
        emitSocketEvent('whatsapp:pairing_code', { sessionId, code });
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

        emitSocketEvent('whatsapp:qr', { sessionId, qr: qrDataUrl });
      } catch (error) {
        logger.error(`Failed to generate QR for session ${sessionId}: ${error.message}`);
      }
    }

    if (connection === 'open') {
      connectingSessions.delete(sessionId);
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

      emitSocketEvent('whatsapp:ready', { sessionId, phoneNumber });
      reconnectAttempts.set(sessionId, 0);
    }

    if (connection === 'close') {
      connectingSessions.delete(sessionId);
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const isImmediate = statusCode === DisconnectReason.restartRequired || statusCode === 515;

      logger.warn(`Session ${sessionId} connection closed. StatusCode: ${statusCode}, Reason: ${lastDisconnect?.error?.message}`);
      activeSockets.delete(sessionId);

      emitSocketEvent('whatsapp:disconnected', { sessionId, reason: lastDisconnect?.error?.message });

      // Always auto-reconnect using saved auth keys on disk.
      // NEVER delete session folder automatically so session stays linked across restarts/glitches.
      autoReconnect(sessionId, isImmediate);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of messages) {
      const rawJid = msg.key.remoteJid;
      if (!rawJid || rawJid === 'status@broadcast' || rawJid.endsWith('@g.us')) continue;

      const chatPhone = rawJid.replace('@s.whatsapp.net', '').replace('@lid', '');

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
    emitSocketEvent('whatsapp:pairing_code', { sessionId, code });
    return code;
  } else {
    // If not exists, initialize it with pairing code option
    await initSession(sessionId, { pairingPhoneNumber: phoneNumber });
  }
}

/**
 * Infinite self-healing auto-reconnect strategy.
 * For transient disconnections (e.g. WiFi flicker, network drop, code 515),
 * retries with backoff and NEVER gives up permanently.
 */
async function autoReconnect(sessionId, isImmediate = false) {
  const backoffDelays = [2000, 5000, 10000, 20000, 30000]; // 2s, 5s, 10s, 20s, 30s backoff

  let attempts = reconnectAttempts.get(sessionId) || 0;
  const delay = isImmediate ? 1000 : (backoffDelays[attempts] || 60000); // Caps at 60s for subsequent attempts

  reconnectAttempts.set(sessionId, attempts + 1);

  logger.info(`Reconnecting session ${sessionId} in ${delay / 1000}s (attempt ${attempts + 1})`);
  await new Promise(resolve => setTimeout(resolve, delay));

  if (activeSockets.has(sessionId)) {
    logger.info(`Session ${sessionId} was re-established in memory while waiting.`);
    return;
  }

  try {
    await initSession(sessionId);
  } catch (error) {
    logger.error(`Reconnection attempt ${attempts + 1} failed for session ${sessionId}: ${error.message}`);
    // Keep retrying in background indefinitely
    await autoReconnect(sessionId);
  }
}

/**
 * Background Supervisor Watchdog.
 * Runs every 2 minutes to inspect active WhatsApp sessions and auto-heal missing sockets.
 */
function startSessionWatchdog() {
  if (watchdogIntervalHandle) return;

  logger.info('Starting WhatsApp Session Watchdog Supervisor (2 min health check)...');

  watchdogIntervalHandle = setInterval(async () => {
    try {
      const { Settings } = require('../models');
      const settings = await Settings.findOne();
      if (!settings || !Array.isArray(settings.whatsappNumbers)) return;

      for (const numberConfig of settings.whatsappNumbers) {
        const sessionId = numberConfig.label || numberConfig.number;

        // Ignore explicitly unlinked or deactivated numbers
        if (numberConfig.status === 'auth_failed' || numberConfig.isActive === false) {
          continue;
        }

        if (activeSockets.has(sessionId) || connectingSessions.has(sessionId)) {
          continue;
        }

        logger.warn(`[Watchdog] Session '${sessionId}' is registered in DB but missing from memory. Healing connection...`);
        try {
          await initSession(sessionId);
        } catch (err) {
          logger.error(`[Watchdog] Failed to heal session '${sessionId}': ${err.message}`);
        }
        // Also check session folders on disk that might be unindexed in DB settings
        const sessionsDir = path.join(__dirname, '../../sessions');
        if (fs.existsSync(sessionsDir)) {
          const folders = fs.readdirSync(sessionsDir);
          for (const sId of folders) {
            const sPath = path.join(sessionsDir, sId);
            if (fs.statSync(sPath).isDirectory() && !activeSockets.has(sId) && !connectingSessions.has(sId)) {
              logger.warn(`[Watchdog] Session folder '${sId}' exists on disk but missing from memory. Auto-restoring...`);
              try {
                await initSession(sId);
              } catch (err) {
                logger.error(`[Watchdog] Failed to restore session folder '${sId}': ${err.message}`);
              }
            }
          }
        }
      }
    } catch (err) {
      logger.error(`[Watchdog] Error in session supervisor loop: ${err.message}`);
    }
  }, 120000); // Every 2 minutes
}

function getSessionStatus(sessionId, dbStatus) {
  const sock = activeSockets.get(sessionId);
  if (sock) {
    // A session is strictly connected ONLY when sock.user is set (authenticated JID)
    if (sock.user && sock.user.id) {
      return 'connected';
    }
    if (dbStatus === 'qr_pending' || dbStatus === 'connecting') {
      return dbStatus;
    }
    return 'connecting';
  }
  
  if (dbStatus === 'connected') {
    // If no active socket in memory, the DB status is stale
    return 'disconnected';
  }
  
  return dbStatus || 'disconnected';
}

function getAllSessionsStatus(whatsappNumbers = []) {
  const statusMap = {};
  if (Array.isArray(whatsappNumbers)) {
    for (const numberConfig of whatsappNumbers) {
      const sessionId = numberConfig.label || numberConfig.number;
      statusMap[sessionId] = getSessionStatus(sessionId, numberConfig.status);
    }
  }
  for (const [sessionId, sock] of activeSockets.entries()) {
    if (!statusMap[sessionId]) {
      statusMap[sessionId] = (sock.user && sock.user.id) ? 'connected' : 'connecting';
    }
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

  emitSocketEvent('whatsapp:session_destroyed', { sessionId });
}

async function restoreAllSessions(ioInstance) {
  if (ioInstance) setSocketIo(ioInstance);
  logger.info('Restoring all active Baileys WhatsApp sessions...');

  // Always start session watchdog supervisor interval
  startSessionWatchdog();

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
  if (watchdogIntervalHandle) {
    clearInterval(watchdogIntervalHandle);
    watchdogIntervalHandle = null;
  }
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
  startSessionWatchdog,
  deleteSessionFolder,
  destroyAllSessions,
  activeSockets
};
