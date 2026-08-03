const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

// ─── Socket.io emitter ────────────────────────────────────────────────
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

// ─── State Maps ───────────────────────────────────────────────────────

// sessionId -> { sock, socketId }   (socketId is a unique tag per makeWASocket call)
const activeSockets = new Map();

// sessionId -> attempt count
const reconnectAttempts = new Map();

// chatPhone -> Promise chain
const messageQueueLocks = new Map();

// sessionId -> true   (guard against duplicate initSession calls)
const connectingSessions = new Set();

// sessionId -> reconnect timeout handle
const reconnectTimers = new Map();

// Monotonically increasing counter to tag each socket uniquely
let socketIdCounter = 0;

// Watchdog interval handle
let watchdogIntervalHandle = null;

// Track last successful connection time per session to help watchdog avoid race conditions
const lastSuccessfulConnection = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────

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
 * Safely close an old socket without triggering its event handlers to
 * interfere with a newly created socket for the same sessionId.
 */
function safeEndOldSocket(oldSock) {
  if (!oldSock) return;
  try {
    // Remove all event listeners so the old socket's 'close' event
    // doesn't delete the NEW socket from activeSockets
    oldSock.ev.removeAllListeners('connection.update');
    oldSock.ev.removeAllListeners('creds.update');
    oldSock.ev.removeAllListeners('messages.upsert');
    oldSock.end(undefined);
  } catch (e) {
    // Silently ignore — socket may already be dead
  }
}

// ─── Core Session Initialization ──────────────────────────────────────

/**
 * Initializes a Baileys session for a given sessionId.
 *
 * ROOT CAUSE FIX:
 *   Previously, when a reconnect happened, a new socket was created but the
 *   OLD socket's `connection.update` listener was still alive. When the old
 *   socket eventually fired `connection === 'close'`, it ran:
 *       activeSockets.delete(sessionId)
 *   which DELETED the brand-new socket from the map, making the app think
 *   the session was disconnected even though it was actually connected.
 *   The watchdog / autoReconnect would then create ANOTHER socket, and the
 *   cycle repeated every 2-3 seconds.
 *
 *   Fix: Every socket gets a unique `socketId`. The `connection === 'close'`
 *   handler checks whether the socket firing the event is still the CURRENT
 *   active socket. If it's a zombie (old socket), the event is ignored.
 */
async function initSession(sessionId, { cleanStart = false, pairingPhoneNumber = null } = {}) {
  // If cleanStart is requested, forcibly clear any stale initializing guard & sockets
  if (cleanStart) {
    connectingSessions.delete(sessionId);
    if (activeSockets.has(sessionId)) {
      const oldEntry = activeSockets.get(sessionId);
      safeEndOldSocket(oldEntry?.sock);
      activeSockets.delete(sessionId);
    }
  }

  // Guard: don't create duplicate sockets if one is already initializing
  if (connectingSessions.has(sessionId)) {
    logger.warn(`[initSession] Session ${sessionId} is already initializing. Skipping.`);
    const entry = activeSockets.get(sessionId);
    return { sock: entry?.sock || null };
  }

  // Guard: if session is already fully connected and cleanStart is false, reuse it
  if (activeSockets.has(sessionId) && !cleanStart) {
    const entry = activeSockets.get(sessionId);
    if (entry?.sock?.user?.id) {
      logger.warn(`[initSession] Session ${sessionId} is already connected. Reusing.`);
      return { sock: entry.sock };
    }
    if (connectingSessions.has(sessionId)) {
      logger.warn(`[initSession] Session ${sessionId} already has a socket connecting. Reusing.`);
      return { sock: entry?.sock || null };
    }
    // Socket exists but is no longer actively initializing — close the zombie and replace
    logger.info(`[initSession] Session ${sessionId} exists but is not authenticated or initializing. Replacing.`);
    safeEndOldSocket(entry?.sock);
    activeSockets.delete(sessionId);
  }

  const pendingReconnect = reconnectTimers.get(sessionId);
  if (pendingReconnect) {
    clearTimeout(pendingReconnect);
    reconnectTimers.delete(sessionId);
  }

  connectingSessions.add(sessionId);

  try {
    const sessionPath = getSessionDataPath(sessionId);
    if (cleanStart) {
      deleteSessionFolder(sessionId);
      logger.info(`[initSession] Purged session folder for clean session start: ${sessionId}`);
    }
    const authState = await useMultiFileAuthState(sessionPath);

    logger.info(`[initSession] Initializing Baileys session: ${sessionId}`);

    const { state, saveCreds } = authState;
    const { version } = await fetchLatestBaileysVersion();

    // Assign a unique ID to this specific socket instance
    const mySocketId = ++socketIdCounter;

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: Browsers.macOS('Desktop'),
      keepAliveIntervalMs: 60000,
      connectTimeoutMs: 90000,
      defaultQueryTimeoutMs: 90000,
      emitOwnEvents: false,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      retryRequestDelayMs: 3000,
      generateHighQualityLinkPreview: false,
      qrMaxRetries: 5,
    });
    
    console.log(`[initSession] makeWASocket created for ${sessionId}`);

    // Store socket with its unique ID
    activeSockets.set(sessionId, { sock, socketId: mySocketId });

    // Auto-request pairing code if needed
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
      }, 3000);
    }

    // ── Credential Updates ──────────────────────────────────────────
    sock.ev.on('creds.update', saveCreds);

    // ── Connection Lifecycle ────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log(`[Baileys:Debug] connection.update for ${sessionId}:`, JSON.stringify({ connection, hasQr: !!qr, lastDisconnect: lastDisconnect ? String(lastDisconnect) : undefined }));

      // ─── ZOMBIE CHECK ───────────────────────────────────────────
      // If this socket is NOT the current active socket for this sessionId,
      // it's a zombie from a previous initSession call. Ignore ALL its events.
      const currentEntry = activeSockets.get(sessionId);
      if (currentEntry && currentEntry.socketId !== mySocketId) {
        logger.debug(`[ZOMBIE] Ignoring connection.update from old socket #${mySocketId} for session ${sessionId} (current is #${currentEntry.socketId})`);
        return;
      }

      // ─── QR Code ────────────────────────────────────────────────
      if (qr) {
        console.log('\n==================================================');
        console.log(`[WhatsApp] ⚠️  QR Code received for session '${sessionId}' — Scan to authenticate`);
        console.log('==================================================');

        // Render ASCII QR Code directly in terminal
        qrcode.toString(qr, { type: 'terminal', small: true }, (err, terminalQrStr) => {
          if (!err && terminalQrStr) {
            console.log(terminalQrStr);
            console.log('==================================================\n');
          }
        });

        try {
          const qrDataUrl = await qrcode.toDataURL(qr);
          logger.info(`QR code generated for session ${sessionId}`);

          try {
            const { Settings } = require('../models');
            const settings = await Settings.findOne();
            if (settings) {
              let numberObj = settings.whatsappNumbers.find(n => n.label === sessionId || n.number === sessionId);
              if (!numberObj) {
                numberObj = {
                  number: sessionId,
                  label: sessionId,
                  isActive: true,
                  isPrimary: settings.whatsappNumbers.length === 0,
                  status: 'qr_pending',
                  connectedAt: null,
                  qrCode: qrDataUrl
                };
                settings.whatsappNumbers.push(numberObj);
              } else {
                numberObj.qrCode = qrDataUrl;
                numberObj.status = 'qr_pending';
              }
              await settings.save();
            }
          } catch (dbErr) {
            logger.error(`Failed to save QR status to DB: ${dbErr.message}`);
          }

          emitSocketEvent('whatsapp:qr', { sessionId, qr: qrDataUrl });
        } catch (error) {
          logger.error(`Failed to generate QR for session ${sessionId}: ${error.message}`);
        }
      }

      // ─── Connected ──────────────────────────────────────────────
      if (connection === 'open') {
        connectingSessions.delete(sessionId);
        const phoneNumber = sock.user.id.split(':')[0];
        logger.info(`✅ Session ${sessionId} CONNECTED (Phone: ${phoneNumber}, socketId: #${mySocketId})`);
        
        // Set a flag to prevent immediate watchdog intervention
        lastSuccessfulConnection.set(sessionId, Date.now());

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

        // Start background message queue processor
        startMessageProcessor();
      }

      // ─── Disconnected ───────────────────────────────────────────
      if (connection === 'close') {
        connectingSessions.delete(sessionId);

        // CRITICAL: Re-check that THIS socket is still the current one.
        // Another initSession may have already replaced us while we were closing.
        const entryNow = activeSockets.get(sessionId);
        if (entryNow && entryNow.socketId !== mySocketId) {
          logger.info(`[ZOMBIE] Close event from old socket #${mySocketId} for ${sessionId} — new socket #${entryNow.socketId} already active. Ignoring.`);
          return;
        }

        const errorObj = lastDisconnect?.error;
        const statusCode = errorObj?.output?.statusCode || errorObj?.output?.payload?.statusCode;
        const reasonMsg = errorObj?.message || errorObj?.output?.payload?.message || 'unknown';
        const errorStack = errorObj?.stack || '';
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403;
        const isImmediate = statusCode === DisconnectReason.restartRequired || statusCode === 515;

        const os = require('os');
        const freeMemMB = Math.round(os.freemem() / (1024 * 1024));
        const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));

        logger.warn(`❌ [DISCONNECT DIAGNOSTIC] Timestamp: ${new Date().toISOString()} | Session: '${sessionId}' | SocketId: #${mySocketId} | StatusCode: ${statusCode} | Reason: "${reasonMsg}" | RAM: ${freeMemMB}MB free of ${totalMemMB}MB | LoggedOut: ${isLoggedOut} | Immediate: ${isImmediate}`);
        if (errorStack) {
          logger.debug(`[DISCONNECT STACK] ${errorStack}`);
        }

        // Only now remove from activeSockets
        activeSockets.delete(sessionId);

        if (isLoggedOut) {
          // User explicitly unlinked the device from their phone.
          // Clean up credentials completely — do NOT auto-reconnect.
          logger.error(`Session ${sessionId} was LOGGED OUT by user. Cleaning up credentials.`);
          deleteSessionFolder(sessionId);

          try {
            const { Settings } = require('../models');
            const settings = await Settings.findOne();
            if (settings) {
              const numberObj = settings.whatsappNumbers.find(n => n.label === sessionId || n.number === sessionId);
              if (numberObj) {
                numberObj.status = 'auth_failed';
                numberObj.isActive = false;
                numberObj.qrCode = null;
                await settings.save();
              }
            }
          } catch (dbErr) {}

          emitSocketEvent('whatsapp:disconnected', { sessionId, reason: reasonMsg, isLoggedOut: true });
        } else {
          // Transient disconnect (network glitch, restart required, etc.)
          // Keep DB status as connected during automatic recovery so the
          // dashboard doesn't pause AI replies for brief WhatsApp blips.

          autoReconnect(sessionId, isImmediate);
        }
      }
    });

    // ── Message Handler ─────────────────────────────────────────────
    sock.ev.on('messages.upsert', async (m) => {
      console.log('[Baileys:RAW] FIRED. Count:', m.messages?.length, 'Type:', m.type);
      const { messages, type } = m;
      if (type !== 'notify' && type !== 'append') return;

      // Zombie check for message handler too
      const currentEntry = activeSockets.get(sessionId);
      if (currentEntry && currentEntry.socketId !== mySocketId) return;

      for (const msg of messages) {
        // IGNORE messages from bot itself (fromMe = true)
        if (msg.key?.fromMe === true) {
          console.log('[Baileys] Ignoring own message (fromMe=true):', msg.key?.id);
          continue;
        }

        const rawJid = msg.key.remoteJid;
        if (!rawJid || rawJid === 'status@broadcast' || rawJid.endsWith('@g.us')) continue;

        const chatPhone = rawJid.replace('@s.whatsapp.net', '').replace('@lid', '');

        let lock = messageQueueLocks.get(chatPhone);
        if (!lock) {
          lock = Promise.resolve();
          messageQueueLocks.set(chatPhone, lock);
        }

        messageQueueLocks.set(chatPhone, lock.then(async () => {
          try {
            const messageHandler = require('./messageHandler');
            await messageHandler.handleMessage(sessionId, msg, 'whatsapp-web');
          } catch (error) {
            logger.error(`Error processing message from ${chatPhone}: ${error.message}`);
          } finally {
            messageQueueLocks.delete(chatPhone);
          }
        }));
      }
    });

    return { sock };
  } catch (error) {
    connectingSessions.delete(sessionId);
    logger.error(`[initSession] Failed to initialize session ${sessionId}: ${error.message}`);
    emitSocketEvent('whatsapp:init_failed', { sessionId, message: error.message });

    try {
      const { Settings } = require('../models');
      const settings = await Settings.findOne();
      if (settings) {
        const numberObj = settings.whatsappNumbers.find(n => n.label === sessionId || n.number === sessionId);
        if (numberObj) {
          numberObj.status = 'disconnected';
          numberObj.qrCode = null;
          await settings.save();
        }
      }
    } catch (dbErr) {
      logger.error(`Failed to save init failure for session ${sessionId}: ${dbErr.message}`);
    }

    throw error;
  }
}

// ─── Public Session Helpers ───────────────────────────────────────────

async function startSession(sessionId, ioInstance, options = {}) {
  if (ioInstance) setSocketIo(ioInstance);
  return initSession(sessionId, {
    cleanStart: false,
    pairingPhoneNumber: options.pairingPhoneNumber
  });
}

async function requestPairingCode(sessionId, phoneNumber) {
  logger.info(`requestPairingCode called for ${sessionId} -> ${phoneNumber}`);
  const entry = activeSockets.get(sessionId);
  if (entry?.sock) {
    const code = await entry.sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
    emitSocketEvent('whatsapp:pairing_code', { sessionId, code });
    return code;
  } else {
    await initSession(sessionId, { pairingPhoneNumber: phoneNumber });
  }
}

// ─── Auto-Reconnect ──────────────────────────────────────────────────

/**
 * Exponential backoff auto-reconnect for transient disconnections.
 * Will NOT reconnect if the session was logged out (handled separately).
 */
async function autoReconnect(sessionId, isImmediate = false) {
  if (connectingSessions.has(sessionId)) {
    logger.warn(`[autoReconnect] Skipped for ${sessionId}: already initializing.`);
    return;
  }

  if (reconnectTimers.has(sessionId)) {
    logger.warn(`[autoReconnect] Skipped for ${sessionId}: reconnect already scheduled.`);
    return;
  }

  // If session was already reconnected by someone else, skip
  const existing = activeSockets.get(sessionId);
  if (existing?.sock?.user?.id) {
    logger.info(`[autoReconnect] Session ${sessionId} is already connected. Skipping.`);
    reconnectAttempts.set(sessionId, 0);
    return;
  }

  const backoffDelays = [10000, 30000, 60000, 120000, 300000]; // Increased: 10s → 30s → 60s → 120s → 300s
  let attempts = reconnectAttempts.get(sessionId) || 0;
  const delay = isImmediate ? 5000 : (backoffDelays[Math.min(attempts, backoffDelays.length - 1)]); // Increased immediate delay to 5s

  reconnectAttempts.set(sessionId, attempts + 1);

  logger.info(`[autoReconnect] Reconnecting ${sessionId} in ${delay / 1000}s (attempt ${attempts + 1})`);
  const timer = setTimeout(async () => {
    reconnectTimers.delete(sessionId);

    // Re-check after waiting — maybe someone else already reconnected
    const recheck = activeSockets.get(sessionId);
    if (recheck?.sock?.user?.id) {
      logger.info(`[autoReconnect] Session ${sessionId} was reconnected while waiting. Done.`);
      reconnectAttempts.set(sessionId, 0);
      return;
    }

    if (connectingSessions.has(sessionId)) {
      logger.info(`[autoReconnect] Session ${sessionId} is already initializing after wait. Done.`);
      return;
    }

    try {
      await initSession(sessionId);
    } catch (error) {
      logger.error(`[autoReconnect] Attempt ${attempts + 1} failed for ${sessionId}: ${error.message}`);
      autoReconnect(sessionId, false);
    }
  }, delay);
  if (timer.unref) timer.unref();
  reconnectTimers.set(sessionId, timer);
}

// ─── Watchdog Supervisor ─────────────────────────────────────────────

/**
 * Runs every 3 minutes. If a session is registered in the DB as active
 * but has no live socket in memory, auto-heals it.
 */
function startSessionWatchdog() {
  if (watchdogIntervalHandle) return;

  logger.info('[Watchdog] Starting session supervisor (10-minute health check)...');

  watchdogIntervalHandle = setInterval(async () => {
    try {
      const { Settings } = require('../models');
      const settings = await Settings.findOne();
      if (!settings || !Array.isArray(settings.whatsappNumbers)) return;

      for (const numberConfig of settings.whatsappNumbers) {
        const sessionId = numberConfig.label || numberConfig.number;

        // Skip deactivated / auth-failed sessions
        if (numberConfig.status === 'auth_failed' || numberConfig.isActive === false) {
          continue;
        }

        if (connectingSessions.has(sessionId)) {
          logger.info(`[Watchdog] Session '${sessionId}' is already initializing. Skipping.`);
          continue;
        }

        // Check if ANY active socket in activeSockets is already live and connected
        let isAlreadyConnected = false;
        if (activeSockets.has(sessionId)) {
          const entry = activeSockets.get(sessionId);
          if (entry?.sock?.user?.id) isAlreadyConnected = true;
        } else {
          for (const [key, val] of activeSockets.entries()) {
            if ((key === sessionId || key.includes(sessionId) || sessionId.includes(key)) && val?.sock?.user?.id) {
              isAlreadyConnected = true;
              break;
            }
          }
        }
        
        // Additional check: if session connected recently (within 5 minutes), skip watchdog
        const lastConnectedTime = lastSuccessfulConnection.get(sessionId);
        if (lastConnectedTime && (Date.now() - lastConnectedTime < 300000)) {
          logger.info(`[Watchdog] Session '${sessionId}' connected recently (${Math.round((Date.now() - lastConnectedTime)/1000)}s ago). Skipping.`);
          continue;
        }

        if (isAlreadyConnected) {
          continue; // fully connected, DO NOT launch duplicate initSession!
        }

        // Only skip if the SPECIFIC session is already connected, not just any socket
        // This allows healing of disconnected sessions while others are connected
        let anyConnected = false;
        for (const [key, val] of activeSockets.entries()) {
          if (key === sessionId && val?.sock?.user?.id) {
            anyConnected = true;
            break;
          }
        }
        if (anyConnected) {
          logger.info(`[Watchdog] Session '${sessionId}' is already connected. Skipping.`);
          continue;
        }

        // Session is supposed to be active but has no live socket at all
        logger.warn(`[Watchdog] Session '${sessionId}' is in DB as active but missing from memory. Healing connection...`);
        try {
          const entry = activeSockets.get(sessionId);
          if (entry?.sock) {
            safeEndOldSocket(entry.sock);
            activeSockets.delete(sessionId);
          }
          // Add a small delay before reconnecting to avoid rapid cycling
          await new Promise(resolve => setTimeout(resolve, 2000));
          await initSession(sessionId);
        } catch (err) {
          logger.error(`[Watchdog] Failed to heal session '${sessionId}': ${err.message}`);
        }
      }
    } catch (err) {
      logger.error(`[Watchdog] Error in supervisor loop: ${err.message}`);
    }
  }, 600000); // Every 10 minutes (increased from 3 minutes to reduce race conditions)
}

// ─── Status Queries ──────────────────────────────────────────────────

function getSessionStatus(sessionId, dbStatus) {
  let entry = activeSockets.get(sessionId);

  if (!entry) {
    for (const [key, val] of activeSockets.entries()) {
      if (key === sessionId || key.includes(sessionId) || sessionId.includes(key)) {
        entry = val;
        break;
      }
    }
  }

  if (entry?.sock?.user?.id) {
    return 'connected';
  }

  if (connectingSessions.has(sessionId)) {
    return 'connecting';
  }

  if (dbStatus === 'connected' && entry?.sock) {
    return 'connected';
  }

  if (dbStatus === 'connecting' && reconnectTimers.has(sessionId)) {
    return 'connecting';
  }

  return dbStatus && dbStatus !== 'connected' ? dbStatus : 'disconnected';
}

function getAllSessionsStatus(whatsappNumbers = []) {
  const statusMap = {};
  if (Array.isArray(whatsappNumbers)) {
    for (const numberConfig of whatsappNumbers) {
      const sessionId = numberConfig.label || numberConfig.number;
      statusMap[sessionId] = getSessionStatus(sessionId, numberConfig.status);
    }
  }
  for (const [sessionId, entry] of activeSockets.entries()) {
    if (!statusMap[sessionId]) {
      statusMap[sessionId] = (entry?.sock?.user?.id) ? 'connected' : 'connecting';
    }
  }
  return statusMap;
}

// ─── Offline Message Queueing & Processor ─────────────────────────────
let messageProcessorHandle = null;

async function queueMessage(sessionId, chatId, text) {
  try {
    const { MessageQueue } = require('../models');
    const existing = await MessageQueue.findOne({ chatId, text, status: 'pending' });
    if (!existing) {
      await MessageQueue.create({
        sessionId: sessionId || 'primary',
        chatId,
        text,
        status: 'pending'
      });
      logger.info(`[Queue] Message queued for: ${chatId}`);
    }
  } catch (error) {
    logger.error(`[Queue] Error queueing message for ${chatId}: ${error.message}`);
  }
}

function startMessageProcessor() {
  if (messageProcessorHandle) return;

  logger.info('[Queue] Starting offline message processor interval (5s check)...');

  messageProcessorHandle = setInterval(async () => {
    try {
      if (activeSockets.size === 0) return;

      const { MessageQueue } = require('../models');
      const pending = await MessageQueue.find({ status: 'pending' }).limit(20);

      if (pending.length > 0) {
        logger.info(`[Queue] Processing ${pending.length} pending message(s)...`);

        for (const msgItem of pending) {
          try {
            await sendMessage(msgItem.sessionId || 'primary', msgItem.chatId, msgItem.text);
            await MessageQueue.updateOne(
              { _id: msgItem._id },
              { status: 'sent', sentAt: new Date() }
            );
            logger.info(`[Queue] ✓ Sent queued message to: ${msgItem.chatId}`);
          } catch (error) {
            msgItem.attempts = (msgItem.attempts || 0) + 1;
            if (msgItem.attempts >= (msgItem.maxAttempts || 5)) {
              await MessageQueue.updateOne(
                { _id: msgItem._id },
                { status: 'failed', attempts: msgItem.attempts, error: error.message }
              );
              logger.error(`[Queue] ✗ Max attempts reached for ${msgItem.chatId}: ${error.message}`);
            } else {
              await MessageQueue.updateOne(
                { _id: msgItem._id },
                { attempts: msgItem.attempts, error: error.message }
              );
            }
          }
        }
      }
    } catch (error) {
      logger.error(`[Queue] Processor error: ${error.message}`);
    }
  }, 5000);
}

// ─── Message Sending ─────────────────────────────────────────────────

async function sendMessage(sessionId, toPhone, text) {
  const activeKeys = Array.from(activeSockets.keys());
  let entry = activeSockets.get(sessionId);

  if (!entry?.sock) {
    // 1. Fuzzy match by label / number / substring
    for (const [key, val] of activeSockets.entries()) {
      if (key === sessionId || key.includes(sessionId) || sessionId.includes(key)) {
        entry = val;
        break;
      }
    }
  }

  if (!entry?.sock && activeSockets.size > 0) {
    // 2. Fall back to ANY active connected socket
    for (const [key, val] of activeSockets.entries()) {
      if (val?.sock?.user?.id) {
        entry = val;
        break;
      }
    }
  }

  const isReady = !!(entry?.sock && entry.sock.user && entry.sock.user.id);



  if (!entry?.sock) {
    logger.warn(`[sendMessage] Session '${sessionId}' is not ready. Queueing message for: ${toPhone}`);
    await queueMessage(sessionId, toPhone, text);
    return false;
  }

  const sock = entry.sock;
  let jid;
  if (toPhone.includes('@')) {
    jid = toPhone;
  } else {
    let digits = toPhone.replace(/\D/g, '');
    if (digits.length === 10) digits = '91' + digits;
    jid = `${digits}@s.whatsapp.net`;
  }

  logger.info(`Sending message via Baileys to ${jid}`);

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await sock.sendMessage(jid, { text });
      logger.info(`Message sent successfully to ${jid}`);
      // Clear pending queue items for this recipient
      try {
        const { MessageQueue } = require('../models');
        await MessageQueue.deleteMany({ chatId: toPhone, status: 'pending' });
      } catch (qErr) {}
      return true;
    } catch (error) {
      lastError = error;
      logger.warn(`Send attempt ${attempt + 1} failed to ${jid}: ${error.message}`);
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }
  }

  logger.error(`Failed to deliver message to ${toPhone} after 2 attempts. Queueing message.`);
  await queueMessage(sessionId, toPhone, text);
  return false;
}

// ─── Session Teardown ────────────────────────────────────────────────

async function stopSession(sessionId) {
  console.log(`[SessionDelete] Starting delete for: ${sessionId}`);
  const entry = activeSockets.get(sessionId);
  console.log(`[SessionDelete] Socket found in memory? ${!!entry?.sock}`);

  if (entry?.sock) {
    try {
      console.log(`[SessionDelete] Calling sock.logout()...`);
      await entry.sock.logout();
      logger.info(`Session ${sessionId} logged out via Baileys`);
    } catch (error) {
      logger.error(`Error logging out session ${sessionId}: ${error.message}`);
      safeEndOldSocket(entry.sock);
    }
  }

  try {
    console.log(`[SessionDelete] Updating DB status...`);
    const { Settings } = require('../models');
    const settings = await Settings.findOne();
    if (settings && Array.isArray(settings.whatsappNumbers)) {
      const originalLength = settings.whatsappNumbers.length;
      settings.whatsappNumbers = settings.whatsappNumbers.filter(
        n => n._id?.toString() !== sessionId && n.label !== sessionId && n.number !== sessionId
      );
      if (settings.whatsappNumbers.length !== originalLength) {
        await settings.save();
        logger.info(`Removed session ${sessionId} from Settings database`);
      }
    }
  } catch (dbErr) {
    logger.error(`Failed to remove session ${sessionId} from DB: ${dbErr.message}`);
  }

  console.log(`[SessionDelete] Removing from in-memory map & clearing connection timers...`);
  activeSockets.delete(sessionId);
  reconnectAttempts.delete(sessionId);
  connectingSessions.delete(sessionId);
  lastSuccessfulConnection.delete(sessionId);

  const reconnectTimer = reconnectTimers.get(sessionId);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimers.delete(sessionId);
  }

  console.log(`[SessionDelete] Deleting session folder...`);
  deleteSessionFolder(sessionId);

  console.log(`[SessionDelete] Emitting disconnected event to frontend...`);
  emitSocketEvent('whatsapp:session_destroyed', { sessionId });
  emitSocketEvent('whatsapp:disconnected', { sessionId });
  emitSocketEvent('whatsapp:number_deleted', { sessionId });
  console.log(`[SessionDelete] ✓ Complete for ${sessionId}`);
}

// ─── Restore All Sessions on Startup ─────────────────────────────────

async function restoreAllSessions(ioInstance) {
  if (ioInstance) setSocketIo(ioInstance);
  const sessionBaseDir = path.resolve(__dirname, '../../sessions');
  logger.info(`[Startup] WhatsApp Session Directory: ${sessionBaseDir}`);
  logger.warn(`[Startup] ⚠️ Ensure '${sessionBaseDir}' is mounted on PERSISTENT DISK (Render: Persistent Disk / Railway: Volume) so WhatsApp session login survives redeploys.`);
  logger.info('Restoring all active Baileys WhatsApp sessions...');

  // Start watchdog supervisor
  startSessionWatchdog();

  // Restore from DB-registered sessions (primary source of truth)
  try {
    const { Settings } = require('../models');
    const settings = await Settings.findOne();
    if (settings && Array.isArray(settings.whatsappNumbers)) {
      for (const numberConfig of settings.whatsappNumbers) {
        const sessionId = numberConfig.label || numberConfig.number;
        if (numberConfig.status === 'auth_failed' || numberConfig.isActive === false) {
          logger.info(`Skipping deactivated session: ${sessionId}`);
          continue;
        }
        try {
          logger.info(`Restoring session from DB: ${sessionId}...`);
          await initSession(sessionId);
        } catch (error) {
          logger.error(`Failed to restore session ${sessionId}: ${error.message}`);
        }
      }
    }
  } catch (dbErr) {
    logger.error(`Failed to query DB for session restore: ${dbErr.message}`);
  }
}

// ─── Destroy All (for graceful shutdown) ─────────────────────────────

async function destroyAllSessions() {
  logger.info(`Destroying all ${activeSockets.size} active WhatsApp session(s)...`);
  if (watchdogIntervalHandle) {
    clearInterval(watchdogIntervalHandle);
    watchdogIntervalHandle = null;
  }
  for (const [sessionId, entry] of activeSockets.entries()) {
    safeEndOldSocket(entry?.sock);
    logger.info(`Session ${sessionId} ended cleanly`);
  }
  activeSockets.clear();
  for (const timer of reconnectTimers.values()) {
    clearTimeout(timer);
  }
  reconnectTimers.clear();
  connectingSessions.clear();
}

// ─── Exports ─────────────────────────────────────────────────────────

module.exports = {
  setSocketIo,
  initSession,
  startSession,
  requestPairingCode,
  getSessionStatus,
  getAllSessionsStatus,
  sendMessage,
  stopSession,
  destroySession: stopSession,
  restartAllActiveSessions: restoreAllSessions,
  restoreAllSessions,
  startSessionWatchdog,
  deleteSessionFolder,
  destroyAllSessions,
  activeSockets
};
