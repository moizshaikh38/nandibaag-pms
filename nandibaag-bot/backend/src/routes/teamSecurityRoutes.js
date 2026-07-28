const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { User, Session, ActivityLog, RoomBooking, Booking } = require('../models');
const { verifyToken, requireSuperAdmin } = require('../middleware/auth');
const logger = require('../config/logger');
const { logActivity } = require('../utils/activityLogger');

const router = express.Router();

// Apply verifyToken and requireSuperAdmin to ALL routes in this file
router.use(verifyToken, requireSuperAdmin);

/**
 * GET /api/team/users
 * List all users with active session counts
 */
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });

    const userList = await Promise.all(
      users.map(async (u) => {
        const activeSessionCount = await Session.countDocuments({
          userId: u._id,
          isActive: true
        });

        const isPeerSuperAdmin = u.role === 'super_admin' && u._id.toString() !== req.user.id;

        return {
          id: u._id,
          _id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          lastLogin: u.lastLogin,
          createdAt: u.createdAt,
          activeSessionCount,
          isEditable: !isPeerSuperAdmin
        };
      })
    );

    res.json({
      success: true,
      users: userList
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/team/users/:id/sessions
 * List all sessions for a specific user (last 30 days)
 */
router.get('/users/:id/sessions', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const sessions = await Session.find({
      userId: id,
      loginAt: { $gte: thirtyDaysAgo }
    })
      .populate('loggedOutBy', 'name email role')
      .sort({ lastActiveAt: -1, loginAt: -1 });

    res.json({
      success: true,
      sessions: sessions.map(s => ({
        id: s._id,
        _id: s._id,
        jti: s.jti,
        deviceInfo: s.deviceInfo,
        ipAddress: s.ipAddress,
        loginAt: s.loginAt,
        lastActiveAt: s.lastActiveAt,
        isActive: s.isActive,
        loggedOutAt: s.loggedOutAt,
        loggedOutBy: s.loggedOutBy ? {
          id: s.loggedOutBy._id,
          name: s.loggedOutBy.name,
          email: s.loggedOutBy.email
        } : null
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/team/users/:id/sessions/:sessionId/logout
 * Force logout a specific session
 */
router.post('/users/:id/sessions/:sessionId/logout', async (req, res, next) => {
  try {
    const { id, sessionId } = req.params;

    const session = await Session.findOne({
      _id: sessionId,
      userId: id,
      isActive: true
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Active session not found'
      });
    }

    session.isActive = false;
    session.loggedOutAt = new Date();
    session.loggedOutBy = req.user.id;
    await session.save();

    const targetUser = await User.findById(id).select('email name');

    logActivity(
      req.user.id,
      'force_logout_session',
      `Terminated session ${session.jti.slice(0, 8)}... (${session.deviceInfo}) for user ${targetUser?.email || id}`,
      req
    );

    res.json({
      success: true,
      message: `Session terminated for ${targetUser?.name || 'user'}`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/team/users/:id/logout-all
 * Force logout all active sessions for a user
 */
router.post('/users/:id/logout-all', async (req, res, next) => {
  try {
    const { id } = req.params;

    const targetUser = await User.findById(id).select('email name role');
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent peer super admins from kicking each other
    if (targetUser.role === 'super_admin' && targetUser._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Cannot force logout fellow super-admin accounts'
      });
    }

    const result = await Session.updateMany(
      { userId: id, isActive: true },
      {
        $set: {
          isActive: false,
          loggedOutAt: new Date(),
          loggedOutBy: req.user.id
        }
      }
    );

    logActivity(
      req.user.id,
      'force_logout_all',
      `Terminated all active sessions (${result.modifiedCount}) for user ${targetUser.email}`,
      req
    );

    res.json({
      success: true,
      message: `Terminated ${result.modifiedCount} active session(s) for ${targetUser.name}`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/team/users
 * Create a new staff or admin user account (super_admin allowed only via script)
 */
const createUserSchema = Joi.object({
  name: Joi.string().trim().min(2).required(),
  email: Joi.string().email().lowercase().trim().required(),
  role: Joi.string().valid('staff', 'admin').required(),
  password: Joi.string().min(6).optional().allow('')
});

router.post('/users', async (req, res, next) => {
  try {
    const { error, value } = createUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const existingUser = await User.findOne({ email: value.email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }

    const tempPassword = value.password || ('NbStaff!' + crypto.randomBytes(4).toString('hex'));

    const newUser = new User({
      name: value.name,
      email: value.email,
      role: value.role,
      password: tempPassword,
      isActive: true
    });

    await newUser.save();

    logActivity(
      req.user.id,
      'user_created',
      `Created new ${value.role} account for ${value.email}`,
      req
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      tempPassword,
      user: {
        id: newUser._id,
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.isActive
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/team/users/:id/reset-password
 * Reset password for a specific user and force logout active sessions
 */
const resetPasswordSchema = Joi.object({
  newPassword: Joi.string().min(6).optional().allow('')
});

router.patch('/users/:id/reset-password', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (targetUser.role === 'super_admin' && targetUser._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Cannot reset password for fellow super-admin accounts'
      });
    }

    const newPassword = value.newPassword || ('NbReset!' + crypto.randomBytes(4).toString('hex'));

    targetUser.password = newPassword;
    await targetUser.save();

    // Terminate all sessions so new password is required
    await Session.updateMany(
      { userId: id, isActive: true },
      {
        $set: {
          isActive: false,
          loggedOutAt: new Date(),
          loggedOutBy: req.user.id
        }
      }
    );

    logActivity(
      req.user.id,
      'password_reset',
      `Reset password for user ${targetUser.email} and terminated active sessions`,
      req
    );

    res.json({
      success: true,
      message: `Password reset successfully for ${targetUser.email}`,
      tempPassword: newPassword
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/team/users/:id/disable
 * Soft-disable a user account and terminate all active sessions
 */
router.patch('/users/:id/disable', async (req, res, next) => {
  try {
    const { id } = req.params;
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (targetUser.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot disable super-admin accounts'
      });
    }

    targetUser.isActive = false;
    await targetUser.save();

    await Session.updateMany(
      { userId: id, isActive: true },
      {
        $set: {
          isActive: false,
          loggedOutAt: new Date(),
          loggedOutBy: req.user.id
        }
      }
    );

    logActivity(
      req.user.id,
      'disable_user',
      `Disabled account for ${targetUser.email} and terminated all active sessions`,
      req
    );

    res.json({
      success: true,
      message: `Account for ${targetUser.email} disabled successfully`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/team/users/:id/enable
 * Re-enable a disabled user account
 */
router.patch('/users/:id/enable', async (req, res, next) => {
  try {
    const { id } = req.params;
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    targetUser.isActive = true;
    await targetUser.save();

    logActivity(
      req.user.id,
      'enable_user',
      `Re-enabled account for ${targetUser.email}`,
      req
    );

    res.json({
      success: true,
      message: `Account for ${targetUser.email} enabled successfully`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/team/users/:id
 * Safe deletion check: if user has historical audit records (RoomBookings, Bookings), disable instead of hard-deleting
 */
router.delete('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (targetUser.role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete super-admin accounts' });
    }

    const roomBookingsCount = await RoomBooking.countDocuments({ assignedBy: id });
    const bookingsCount = await Booking.countDocuments({ createdBy: id });

    if (roomBookingsCount > 0 || bookingsCount > 0) {
      // Disable instead to preserve audit trails
      targetUser.isActive = false;
      await targetUser.save();

      await Session.updateMany(
        { userId: id, isActive: true },
        {
          $set: {
            isActive: false,
            loggedOutAt: new Date(),
            loggedOutBy: req.user.id
          }
        }
      );

      logActivity(
        req.user.id,
        'user_deletion_prevented_and_disabled',
        `Disabled user ${targetUser.email} instead of deleting due to ${roomBookingsCount + bookingsCount} historical record(s)`,
        req
      );

      return res.json({
        success: true,
        isDisabledInstead: true,
        message: `User has ${roomBookingsCount + bookingsCount} historical booking audit record(s) and cannot be hard-deleted. The account has been disabled instead.`
      });
    }

    // Zero historical records -> hard delete
    await Session.deleteMany({ userId: id });
    await User.findByIdAndDelete(id);

    logActivity(
      req.user.id,
      'user_deleted',
      `Hard deleted user ${targetUser.email} (zero historical records)`,
      req
    );

    res.json({
      success: true,
      isDisabledInstead: false,
      message: `User ${targetUser.email} deleted successfully`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/team/activity-log
 * Paginated activity logs with optional filters
 */
router.get('/activity-log', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { userId, action, dateFrom, dateTo } = req.query;

    const filter = {};
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      filter.userId = userId;
    }
    if (action) {
      filter.action = action;
    }
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const total = await ActivityLog.countDocuments(filter);
    const logs = await ActivityLog.find(filter)
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      logs: logs.map(l => ({
        id: l._id,
        _id: l._id,
        action: l.action,
        details: l.details,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt,
        user: l.userId ? {
          id: l.userId._id,
          name: l.userId.name,
          email: l.userId.email,
          role: l.userId.role
        } : { name: 'Unknown User', email: '' }
      })),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/team/activity-log/actions
 * List distinct action types for filter dropdown
 */
router.get('/activity-log/actions', async (req, res, next) => {
  try {
    const actions = await ActivityLog.distinct('action');
    res.json({
      success: true,
      actions: actions.sort()
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
