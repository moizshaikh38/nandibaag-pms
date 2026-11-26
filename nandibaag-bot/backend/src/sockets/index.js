const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret, frontendUrl, allowedOrigins: extraAllowedOrigins } = require('../config/env');
const { User, Session } = require('../models');
const logger = require('../config/logger');

let io = null;
const connectedSessions = new Map();

function getAllowedSocketOrigins() {
  const devOrigins = process.env.NODE_ENV !== 'production'
    ? [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:7001',
        'http://localhost:7002',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:7001',
        'http://127.0.0.1:7002'
      ]
    : [];

  const configuredOrigins = String(extraAllowedOrigins || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return Array.from(new Set([
    frontendUrl,
    ...configuredOrigins,
    ...devOrigins
  ].filter(Boolean)));
}

/**
 * Initializes Socket.io on the HTTP server
 * 
 * - Enforces JWT + active Session authentication before allowing connection
 * - Session registration & room reservation broadcasts
 * - Exports getIO() helper for services to emit events
 * 
 * @param {object} httpServer - HTTP server instance
 */
function initializeSocket(httpServer) {
  const allowedOrigins = getAllowedSocketOrigins();

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Strict JWT + Session authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers?.authorization;
      const bearerToken = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : null;
      const token = socket.handshake.auth?.token || bearerToken;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, jwtSecret);

      if (decoded.jti) {
        const session = await Session.findOne({ jti: decoded.jti }).lean();
        if (!session || !session.isActive) {
          return next(new Error('Session terminated'));
        }
      }

      const user = await User.findById(decoded.id).select('isActive role email name').lean();
      if (!user || !user.isActive) {
        return next(new Error('Account is inactive or not found'));
      }

      socket.user = {
        id: String(user._id),
        email: user.email,
        role: user.role,
        name: user.name
      };
      next();
    } catch (error) {
      logger.warn(`Socket authentication rejected: ${error.message}`);
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userLabel = socket.user?.email || 'session_user';
    logger.info(`Socket connected: ${userLabel} (socket: ${socket.id})`);
    
    // Join dashboard room for real-time updates
    socket.join('dashboard');

    socket.on('register_session', (sessionId) => {
      if (sessionId) {
        connectedSessions.set(sessionId, socket.id);
        socket.sessionId = sessionId;
        socket.join(`session_${sessionId}`);
        logger.info(`Registered session ${sessionId} on socket ${socket.id}`);
      }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      if (socket.sessionId) {
        connectedSessions.delete(socket.sessionId);
      }
      logger.info(`Socket disconnected: ${userLabel} (socket: ${socket.id})`);
    });
  });

  logger.info('Socket.io initialized');
}

/**
 * Gets the Socket.io instance
 * Used by services to emit events without circular imports
 * 
 * @returns {object} Socket.io instance
 */
function getIO() {
  if (!io) {
    logger.warn('Socket.io not initialized yet');
    return null;
  }
  return io;
}

module.exports = {
  initializeSocket,
  getIO
};
