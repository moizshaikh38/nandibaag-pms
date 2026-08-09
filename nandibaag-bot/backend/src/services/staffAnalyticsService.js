const { Booking, Staff } = require('../models');

const getStaffMonthlyStats = async (staffName, monthsBack = 3) => {
  try {
    console.log('[StaffAnalytics:Monthly] Fetching stats for', staffName);
    
    const stats = {};
    const now = new Date();
    
    // Get last N months data
    for (let i = 0; i < monthsBack; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toLocaleDateString('en-GB', {
        month: 'short',
        year: '2-digit'
      });
      
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      
      const queryFilter = {
        $or: [
          { 'bookedBy.name': { $regex: new RegExp(`^${staffName}$`, 'i') } },
          { bookedBy: { $regex: new RegExp(`^${staffName}$`, 'i') } }
        ],
        createdAt: { $gte: monthStart, $lt: monthEnd },
        status: { $nin: ['cancelled', 'no_show'] }
      };

      const bookingCount = await Booking.countDocuments(queryFilter);
      const bookings = await Booking.find(queryFilter).lean();
      const revenue = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
      
      const packageBreakdown = {
        couple: 0,
        group: 0,
        oneDay: 0
      };
      
      bookings.forEach(b => {
        const pkg = b.packageType || b.bookingType;
        if (pkg === 'couple') packageBreakdown.couple++;
        else if (pkg === 'group') packageBreakdown.group++;
        else if (pkg === 'oneDay' || pkg === 'picnic') packageBreakdown.oneDay++;
      });
      
      stats[monthKey] = {
        count: bookingCount,
        revenue,
        packageBreakdown
      };
    }
    
    console.log('[StaffAnalytics:Monthly] Stats for', staffName, ':', Object.keys(stats));
    return stats;
  } catch (error) {
    console.error('[StaffAnalytics:Monthly] Error:', error.message);
    throw error;
  }
};

const getAllStaffStats = async (monthsBack = 3) => {
  try {
    console.log('[StaffAnalytics:All] Fetching all staff stats');
    
    let staff = await Staff.find({ status: 'active' }).lean();
    
    if (!staff || staff.length === 0) {
      const uniqueNames = await Booking.distinct('bookedBy.name');
      const filtered = uniqueNames.filter(Boolean);
      staff = filtered.map((name, idx) => ({
        name,
        staffId: `staff_00${idx + 1}`,
        contact: '9876543210',
        hireDate: new Date(),
        status: 'active'
      }));
    }

    if (!staff || staff.length === 0) {
      staff = [
        { name: 'Kadambari', staffId: 'staff_001', contact: '9876543210', hireDate: new Date(), status: 'active' },
        { name: 'Ravi', staffId: 'staff_002', contact: '9876543211', hireDate: new Date(), status: 'active' },
        { name: 'Priti', staffId: 'staff_003', contact: '9876543212', hireDate: new Date(), status: 'active' },
        { name: 'Mansi', staffId: 'staff_004', contact: '9876543213', hireDate: new Date(), status: 'active' }
      ];
    }
    
    const allStats = [];
    
    for (const member of staff) {
      const monthlyStats = await getStaffMonthlyStats(member.name, monthsBack);
      
      const totalCount = Object.values(monthlyStats).reduce((sum, m) => sum + m.count, 0);
      const totalRevenue = Object.values(monthlyStats).reduce((sum, m) => sum + m.revenue, 0);
      const avgPerMonth = totalCount > 0 ? (totalCount / monthsBack).toFixed(1) : 0;
      
      const monthKeys = Object.keys(monthlyStats);
      const currentMonth = monthlyStats[monthKeys[0]]?.count || 0;
      const previousMonth = monthlyStats[monthKeys[1]]?.count || 0;
      const trend = currentMonth - previousMonth;
      const trendPercent = previousMonth > 0 
        ? ((trend / previousMonth) * 100).toFixed(1)
        : (currentMonth > 0 ? 100 : 0);
      
      allStats.push({
        name: member.name,
        staffId: member.staffId,
        contact: member.contact,
        hireDate: member.hireDate,
        monthlyStats,
        totalCount,
        totalRevenue,
        avgPerMonth: Number(avgPerMonth),
        trend,
        trendPercent: Number(trendPercent),
        trendDirection: trend > 0 ? '↗' : trend < 0 ? '↘' : '→'
      });
    }
    
    allStats.sort((a, b) => b.totalCount - a.totalCount || b.totalRevenue - a.totalRevenue);
    
    console.log('[StaffAnalytics:All] Fetched stats for', allStats.length, 'staff');
    return allStats;
  } catch (error) {
    console.error('[StaffAnalytics:All] Error:', error.message);
    throw error;
  }
};

const getIndividualStaffProfile = async (staffName, monthsBack = 6) => {
  try {
    console.log('[StaffAnalytics:Profile] Fetching profile for', staffName);
    
    let staff = await Staff.findOne({ name: { $regex: new RegExp(`^${staffName}$`, 'i') } }).lean();
    
    if (!staff) {
      staff = {
        name: staffName,
        staffId: `staff_${staffName.toLowerCase()}`,
        contact: '9876543210',
        role: 'Booking Manager',
        status: 'active'
      };
    }
    
    const monthlyStats = await getStaffMonthlyStats(staffName, monthsBack);
    
    const now = new Date();
    const monthsAgoDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    
    const bookings = await Booking.find({
      $or: [
        { 'bookedBy.name': { $regex: new RegExp(`^${staffName}$`, 'i') } },
        { bookedBy: { $regex: new RegExp(`^${staffName}$`, 'i') } }
      ],
      createdAt: { $gte: monthsAgoDate },
      status: { $nin: ['cancelled', 'no_show'] }
    }).sort({ createdAt: -1 }).lean();
    
    return {
      ...staff,
      monthlyStats,
      bookings,
      totalBookings: bookings.length,
      totalRevenue: bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0)
    };
  } catch (error) {
    console.error('[StaffAnalytics:Profile] Error:', error.message);
    throw error;
  }
};

module.exports = {
  getStaffMonthlyStats,
  getAllStaffStats,
  getIndividualStaffProfile
};
