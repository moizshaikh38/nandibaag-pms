const { ActivityLog } = require('../models');
const logger = require('../config/logger');

/**
 * Parses user-agent header into a friendly device string
 */
function parseUserAgent(uaString = '') {
  if (!uaString) return 'Unknown Device';
  
  let browser = 'Browser';
  if (uaString.includes('Firefox/')) browser = 'Firefox';
  else if (uaString.includes('Edg/')) browser = 'Edge';
  else if (uaString.includes('Chrome/')) browser = 'Chrome';
  else if (uaString.includes('Safari/')) browser = 'Safari';

  let os = 'Unknown OS';
  if (uaString.includes('iPhone') || uaString.includes('iPad')) os = 'iOS';
  else if (uaString.includes('Android')) os = 'Android';
  else if (uaString.includes('Mac OS X') || uaString.includes('Macintosh')) os = 'macOS';
  else if (uaString.includes('Windows')) os = 'Windows';
  else if (uaString.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`;
}

/**
 * Extracts client IP address safely from Express request
 */
function getClientIp(req) {
  if (!req) return '';
  const xForwardedFor = req.headers ? req.headers['x-forwarded-for'] : null;
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

/**
 * Non-blocking activity logger helper
 */
async function logActivity(userId, action, details = '', req = null) {
  if (!userId || !action) return;
  try {
    const ipAddress = getClientIp(req);
    await ActivityLog.create({
      userId,
      action,
      details: typeof details === 'object' ? JSON.stringify(details) : String(details),
      ipAddress
    });
  } catch (err) {
    logger.warn(`Failed to log activity [${action}] for user [${userId}]: ${err.message}`);
  }
}

module.exports = {
  logActivity,
  parseUserAgent,
  getClientIp
};
