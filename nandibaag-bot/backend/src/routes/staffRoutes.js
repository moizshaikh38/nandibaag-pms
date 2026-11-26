const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
router.use(verifyToken);
const Staff = require('../models/Staff');
const {
  StaffAnalyticsValidationError,
  getStaffMonthlyStats,
  getAllStaffStats,
  getIndividualStaffProfile
} = require('../services/staffAnalyticsService');

// GET all staff with analytics
router.get('/analytics', async (req, res, next) => {
  try {
    const result = await getAllStaffStats(req.query);
    res.json({
      success: true,
      stats: result.stats,
      filters: result.filters,
      metadata: result.metadata,
      period: result.filters.months ? `Last ${result.filters.months} months` : `${result.filters.dateFrom} to ${result.filters.dateTo}`,
      generatedAt: result.metadata.generatedAt
    });
  } catch (error) {
    if (error instanceof StaffAnalyticsValidationError) {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
});

// GET individual staff profile
router.get('/:staffName/profile', async (req, res, next) => {
  try {
    const { staffName } = req.params;
    const { months = 6 } = req.query;
    const profile = await getIndividualStaffProfile(staffName, Number(months));
    res.json({
      success: true,
      profile
    });
  } catch (error) {
    if (error instanceof StaffAnalyticsValidationError) {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
});

// GET all staff (master list)
router.get('/', async (req, res) => {
  try {
    console.log('[StaffAPI:List] Fetching all staff');
    
    const staff = await Staff.find().sort({ name: 1 }).lean();
    
    res.json({
      success: true,
      staff,
      count: staff.length
    });
  } catch (error) {
    console.error('[StaffAPI:List] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST create staff (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, staffId, contact, email, hireDate, role } = req.body;
    
    console.log('[StaffAPI:Create] Creating staff:', name);
    
    const staff = new Staff({
      name,
      staffId: staffId || `staff_${Date.now()}`,
      contact,
      email,
      hireDate,
      role: role || 'Staff',
      status: 'active'
    });
    
    await staff.save();
    
    console.log('[StaffAPI:Create] ✅ Staff created:', staff._id);
    
    res.json({
      success: true,
      staff
    });
  } catch (error) {
    console.error('[StaffAPI:Create] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
