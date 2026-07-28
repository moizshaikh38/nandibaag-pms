const mongoose = require('mongoose');
const logger = require('./logger');
const { mongoUri } = require('./env');

let connectionPromise = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    maxPoolSize: 20
  }).then((conn) => {
    logger.info('MongoDB connected successfully');
    connectionPromise = null;
    return conn;
  }).catch((error) => {
    logger.error(`MongoDB connection failed: ${error.message}`);
    connectionPromise = null;
    throw error;
  });

  return connectionPromise;
};

async function ensureDbConnected(req, res, next) {
  if (mongoose.connection.readyState === 1) {
    return next();
  }
  try {
    await connectDB();
    next();
  } catch (error) {
    logger.error(`ensureDbConnected middleware failed: ${error.message}`);
    return res.status(503).json({
      success: false,
      message: 'Database connection to MongoDB Atlas failed or timing out. Ensure 0.0.0.0/0 IP is allowed in MongoDB Atlas Network Access.',
      error: error.message
    });
  }
}

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  logger.error(`MongoDB error: ${error.message}`);
});

module.exports = connectDB;
module.exports.ensureDbConnected = ensureDbConnected;
