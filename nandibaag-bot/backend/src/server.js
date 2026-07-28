const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const logger = require('./config/logger');
const { port, frontendUrl, adminDefaultEmail, adminDefaultPassword } = require('./config/env');
const { User, Settings, Room } = require('./models');
const { initializeSocket, getIO } = require('./sockets');
const {
  setSocketIo: setWhatsappSocketIo,
  restartAllActiveSessions,
  startSessionWatchdog,
  destroyAllSessions
} = require('./services/whatsappService');
const { setSocketIo: setLeadScoringSocketIo } = require('./services/leadScoring');
const { startFollowUpCron } = require('./services/followUpCron');
const { startLifecycleCron } = require('./services/lifecycleMessageCron');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const { generalLimiter, authLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/authRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const chatRoutes = require('./routes/chatRoutes');
const leadRoutes = require('./routes/leadRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const availabilityRoutes = require('./routes/availabilityRoutes');
const pmsBookingRoutes = require('./routes/pmsBookingRoutes');
const messageLogRoutes = require('./routes/messageLogRoutes');
const numberRoutes = require('./routes/numberRoutes');
const teamSecurityRoutes = require('./routes/teamSecurityRoutes');

const app = express();
const server = http.createServer(app);

// Security middleware
app.use(helmet());

// CORS
const allowedOrigins = [
  frontendUrl,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:7001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:7001'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || (origin && (origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com'))) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Compression
app.use(compression());

// Body parsing (50MB limit to allow ID photo base64 uploads without 413 PayloadTooLargeError)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Logging (dev only)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting
app.use('/api', generalLimiter);
app.use('/api/auth/login', authLimiter);

// Health check endpoint (before auth)
app.get('/health', async (req, res) => {
  try {
    const mongoConnected = mongoose.connection.readyState === 1;
    
    const settings = await Settings.findOne();
    const whatsappNumbers = settings?.whatsappNumbers || [];
    const { getAllSessionsStatus } = require('./services/whatsappService');
    const sessionStatuses = getAllSessionsStatus(whatsappNumbers);
    const activeSessions = Object.values(sessionStatuses).filter(status => status === 'connected').length;
    
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      mongoConnected,
      activeWhatsappSessions: activeSessions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

const { ensureDbConnected } = require('./config/db');

// Ensure DB is connected before processing API requests
app.use('/api', ensureDbConnected);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/numbers', numberRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/pms', pmsBookingRoutes);
app.use('/api/message-log', messageLogRoutes);
app.use('/api/team', teamSecurityRoutes);

// Global error handler (must be last)
app.use(errorHandler);

// Initialize Socket.io
initializeSocket(server);

// Set Socket.io instance for services
const io = getIO();
setWhatsappSocketIo(io);
setLeadScoringSocketIo(io);

const startServer = async () => {
  // 1. Start HTTP Server immediately so cloud port scanner detects port binding instantly
  server.listen(port, () => {
    logger.info(`Server running on port ${port}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`Frontend URL: ${frontendUrl}`);
  }).on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use.`);
      process.exit(1);
    } else {
      logger.error(`Failed to start server: ${error.message}`);
      process.exit(1);
    }
  });

  // 2. Perform background database connection & service bootstrap asynchronously
  try {
    await connectDB();
    
    // Ensure default admin user exists
    const adminCount = await User.countDocuments({ role: { $in: ['admin', 'super_admin'] } });
    if (adminCount === 0) {
      logger.warn('No admin user found, creating default admin');
      const admin = new User({
        name: 'Admin',
        email: adminDefaultEmail,
        password: adminDefaultPassword,
        role: 'admin'
      });
      await admin.save();
    }
    
    // Ensure default settings exist
    const settingsCount = await Settings.countDocuments();
    if (settingsCount === 0) {
      logger.info('Creating default settings');
      const settings = new Settings({
        globalMode: 'ai',
        whatsappNumbers: [],
        openRouterModelOverride: null,
        followUpEnabled: true
      });
      await settings.save();
    }

    // Ensure room inventory exists
    const roomCount = await Room.countDocuments();
    if (roomCount === 0) {
      logger.info('No cottage rooms found in database, auto-seeding room inventory...');
      try {
        const { seed } = require('./scripts/seedRoomInventory');
        if (typeof seed === 'function') await seed();
      } catch (seedErr) {
        logger.error(`Failed to auto-seed room inventory: ${seedErr.message}`);
      }
    }
    
    // Restart all active WhatsApp sessions and start watchdog supervisor
    restartAllActiveSessions().catch(err => {
      logger.error(`Error restoring sessions: ${err.message}`);
    });
    
    // Start follow-up & lifecycle cron jobs
    startFollowUpCron();
    startLifecycleCron();

    // Start 30-second continuous HTTP KeepAlive self-ping for 24/7 Render Uptime
    const { startKeepAlive } = require('./services/keepAliveService');
    startKeepAlive();
    
  } catch (error) {
    logger.error(`Background service initialization error: ${error.message}`);
  }
};

// Process-level error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received, shutting down gracefully`);

  // Force exit if shutdown hangs (e.g. due to hung Puppeteer destroy)
  const forceExitTimeout = setTimeout(() => {
    logger.warn('Graceful shutdown timed out, force exiting.');
    process.exit(1);
  }, 5000);
  if (forceExitTimeout.unref) {
    forceExitTimeout.unref();
  }

  try {
    await destroyAllSessions();
  } catch (error) {
    logger.error(`Error while destroying WhatsApp sessions during shutdown: ${error.message}`);
  }

  await new Promise((resolve) => {
    server.close((error) => {
      if (error) {
        logger.error(`Error while closing server: ${error.message}`);
      } else {
        logger.info('Server closed');
      }
      resolve();
    });
  });

  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error(`Error while disconnecting MongoDB: ${error.message}`);
  }

  if (signal === 'SIGUSR2') {
    process.kill(process.pid, 'SIGUSR2');
    return;
  }

  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGUSR2', () => shutdown('SIGUSR2'));

startServer();
