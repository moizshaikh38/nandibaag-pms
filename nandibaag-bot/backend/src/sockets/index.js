const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { User } = require('../models');
const logger = require('../config/logger');

let io = null;
const connectedSessions = new Map();

/**
 * Initializes Socket.io on the HTTP server
 * 
 * - Optional JWT auth (allows guest sessions for real-time room availability sync)
 * - Session registration & room reservation broadcasts
 * - Exports getIO() helper for services to emit events
 * 
 * @param {object} httpServer - HTTP server instance
 */
function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Middleware for Socket.io — optional auth
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      
      if (token) {
        const decoded = jwt.verify(token, jwtSecret);
        const user = await User.findById(decoded.id);
        if (user && user.isActive) {
          socket.user = user;
        }
      }
      next();
    } catch (error) {
      // Proceed without failing unauthenticated session socket
      next();
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
