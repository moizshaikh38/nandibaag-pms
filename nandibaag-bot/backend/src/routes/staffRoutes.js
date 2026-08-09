const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const {
  getStaffMonthlyStats,
  getAllStaffStats,
  getIndividualStaffProfile
} = require('../services/staffAnalyticsService');

// GET all staff with analytics
router.get('/analytics', async (req, res) => {
  try {
    const { months = 3 } = req.query;
    
    console.log('[StaffAPI:Analytics] Fetching analytics for', months, 'months');
    
    const allStats = await getAllStaffStats(parseInt(months));
    
    res.json({
      success: true,
      stats: allStats,
      period: `Last ${months} months`,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[StaffAPI:Analytics] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET individual staff profile
router.get('/:staffName/profile', async (req, res) => {
  try {
    const { staffName } = req.params;
    const { months = 6 } = req.query;
    
    console.log('[StaffAPI:Profile] Fetching profile for', staffName);
    
    const profile = await getIndividualStaffProfile(staffName, parseInt(months));
    
    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('[StaffAPI:Profile] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
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

// POST create staff
router.post('/', async (req, res) => {
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
