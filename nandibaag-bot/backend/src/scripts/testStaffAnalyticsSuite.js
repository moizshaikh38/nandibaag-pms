const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { Staff, Booking } = require('../models');
const {
  getStaffMonthlyStats,
  getAllStaffStats,
  getIndividualStaffProfile
} = require('../services/staffAnalyticsService');

async function runTestSuite() {
  console.log('====================================================');
  console.log('    RUNNING STAFF PERFORMANCE ANALYTICS TEST SUITE   ');
  console.log('====================================================\n');

  try {
    await mongoose.connect(mongoUri);
    console.log('[TestSetup] Connected to MongoDB');

    // TEST 1: Master Staff List & Database Models
    console.log('\n--- TEST 1: Staff Database Master List ---');
    const staffList = await Staff.find({ status: 'active' }).lean();
    console.log(`Found ${staffList.length} active staff members:`, staffList.map(s => `${s.name} (${s.staffId})`).join(', '));
    if (staffList.length < 4) throw new Error('Expected at least 4 active staff members');
    console.log('TEST 1 RESULT: ✅ PASS');

    // TEST 2: Staff Monthly Stats Service
    console.log('\n--- TEST 2: getStaffMonthlyStats Service ---');
    const monthlyStats = await getStaffMonthlyStats('Kadambari', 3);
    console.log('Monthly keys returned:', Object.keys(monthlyStats));
    if (Object.keys(monthlyStats).length !== 3) throw new Error('Expected 3 months of stats');
    console.log('TEST 2 RESULT: ✅ PASS');

    // TEST 3: All Staff Analytics & Leaderboard Sorting
    console.log('\n--- TEST 3: getAllStaffStats Service (Leaderboard View) ---');
    const allStats = await getAllStaffStats(3);
    console.log(`Aggregated stats for ${allStats.length} staff members:`);
    allStats.forEach((s, idx) => {
      console.log(`  Rank #${idx + 1}: ${s.name} - Total Bookings: ${s.totalCount}, Revenue: ₹${s.totalRevenue}, Trend: ${s.trendDirection} ${s.trendPercent}%`);
    });
    if (!Array.isArray(allStats) || allStats.length === 0) throw new Error('Expected non-empty allStats array');
    console.log('TEST 3 RESULT: ✅ PASS');

    // TEST 4: Individual Staff Profile Service
    console.log('\n--- TEST 4: getIndividualStaffProfile Service ---');
    const profile = await getIndividualStaffProfile('Kadambari', 6);
    console.log('Profile fetched for:', profile.name);
    console.log('  Total Bookings (6 months):', profile.totalBookings);
    console.log('  Total Revenue:', profile.totalRevenue);
    console.log('  Bookings list count:', profile.bookings.length);
    if (!profile.name || typeof profile.totalBookings !== 'number') throw new Error('Invalid profile payload');
    console.log('TEST 4 RESULT: ✅ PASS');

    console.log('\n====================================================');
    console.log('                 SUMMARY OF TESTS                   ');
    console.log('====================================================');
    console.log('TEST 1 (Staff Master List): ✅ PASS');
    console.log('TEST 2 (getStaffMonthlyStats): ✅ PASS');
    console.log('TEST 3 (getAllStaffStats Leaderboard): ✅ PASS');
    console.log('TEST 4 (getIndividualStaffProfile): ✅ PASS\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ TEST SUITE FAILED:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTestSuite();
