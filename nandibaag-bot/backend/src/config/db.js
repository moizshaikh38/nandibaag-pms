const mongoose = require('mongoose');
const logger = require('./logger');
const { mongoUri } = require('./env');

const MAX_RETRIES = 10;
const RETRY_DELAY = 5000;

let retryCount = 0;

const connectDB = async () => {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });
    logger.info('MongoDB connected successfully');
  } catch (error) {
    retryCount++;
    if (retryCount < MAX_RETRIES) {
      logger.error(`MongoDB connection failed (attempt ${retryCount}/${MAX_RETRIES}): ${error.message}`);
      logger.info(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
      setTimeout(connectDB, RETRY_DELAY);
    } else {
      logger.error(`MongoDB connection failed after ${MAX_RETRIES} attempts: ${error.message}`);
    }
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  logger.error(`MongoDB error: ${error.message}`);
});

module.exports = connectDB;
