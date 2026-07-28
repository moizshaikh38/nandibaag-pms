const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const logger = require('../config/logger');
const { Session } = require('../models');

/**
 * Verifies JWT token from Authorization header & validates active Session
 * Attaches decoded user to req.user
 * Returns 401 if missing/invalid/expired/terminated
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;

    // Check session active status if token includes jti
    if (decoded.jti) {
      const session = await Session.findOne({ jti: decoded.jti });
      if (!session || !session.isActive) {
        return res.status(401).json({
          success: false,
          code: 'SESSION_TERMINATED',
          message: 'Session has been terminated, please log in again'
        });
      }

      // Non-blocking update of lastActiveAt timestamp
      Session.updateOne({ _id: session._id }, { $set: { lastActiveAt: new Date() } }).catch(err => {
        logger.warn(`Failed to update session lastActiveAt: ${err.message}`);
      });
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    logger.error(`Token verification error: ${error.message}`);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
}

/**
 * Checks if user has admin role
 * Returns 403 if not admin
 */
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  
  next();
}

/**
 * Checks if user has super_admin role
 * Returns 403 if not super_admin
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Super-admin access required'
    });
  }
  
  next();
}

/**
 * Checks if user has any of specified roles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || (!allowedRoles.includes(req.user.role) && req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    next();
  };
}

module.exports = {
  verifyToken,
  requireAdmin,
  requireSuperAdmin,
  requireRole
};
