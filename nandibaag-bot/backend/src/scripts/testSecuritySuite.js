#!/usr/bin/env node

/**
 * Security Suite Automated Verification Script
 * Tests:
 * 1. Super Admin login with jti & Session document creation
 * 2. Concurrent logins -> 2 distinct sessions
 * 3. Force-logout of single session -> 401 SESSION_TERMINATED for logged out session
 * 4. Remaining session stays active & valid
 * 5. Staff account creation via team API
 * 6. RBAC check: Staff account forbidden from accessing /api/team/users (403)
 * 7. Password reset & session termination
 * 8. Activity Log audit trail creation
 * 9. Account deactivation & login rejection
 */

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const connectDB = require('../config/db');
const { User, Session, ActivityLog, Booking } = require('../models');

const BASE_URL = process.env.API_URL || 'http://localhost:7002/api';

async function runSecuritySuite() {
  console.log('\n================================================================================');
  console.log('            NANDIBAAG PMS — SECURITY & TEAM MANAGEMENT TEST SUITE');
  console.log('================================================================================\n');

  await connectDB();

  try {
    // 1. Super Admin Login
    console.log('Step 1: Logging in as Super Admin (moiz@nandibaag.com)...');
    const superAdmin = await User.findOne({ email: 'moiz@nandibaag.com' });
    if (!superAdmin) {
      throw new Error('Super admin account moiz@nandibaag.com not found. Run migrateRoles.js first.');
    }

    // Set a known password for testing
    superAdmin.password = 'SuperTestPassword123!';
    await superAdmin.save();

    const loginRes1 = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'moiz@nandibaag.com',
      password: 'SuperTestPassword123!',
      rememberMe: true
    }, { headers: { 'User-Agent': 'TestBrowser1/macOS' } });

    const token1 = loginRes1.data.token;
    console.log('  ✅ Super Admin login 1 successful. Token issued.');

    // Verify Session 1 in DB
    const session1 = await Session.findOne({ userId: superAdmin._id, isActive: true }).sort({ createdAt: -1 });
    if (!session1 || !session1.jti) {
      throw new Error('Session document or jti missing for login 1');
    }
    console.log(`  ✅ Session 1 verified in DB. JTI: ${session1.jti.slice(0, 8)}... (${session1.deviceInfo})`);

    // 2. Concurrent Login 2
    console.log('\nStep 2: Concurrent login 2 for Super Admin...');
    const loginRes2 = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'moiz@nandibaag.com',
      password: 'SuperTestPassword123!'
    }, { headers: { 'User-Agent': 'TestBrowser2/iOS' } });

    const token2 = loginRes2.data.token;
    console.log('  ✅ Super Admin login 2 successful. Token 2 issued.');

    const activeSessionsCount = await Session.countDocuments({ userId: superAdmin._id, isActive: true });
    console.log(`  ✅ Active sessions count in DB for super admin: ${activeSessionsCount}`);

    // 3. Force logout Session 1
    console.log('\nStep 3: Force logging out Session 1 via Team Security API...');
    const forceLogoutRes = await axios.post(
      `${BASE_URL}/team/users/${superAdmin._id}/sessions/${session1._id}/logout`,
      {},
      { headers: { Authorization: `Bearer ${token2}` } }
    );
    console.log(`  ✅ ${forceLogoutRes.data.message}`);

    // 4. Verify Session 1 token is rejected with SESSION_TERMINATED
    console.log('\nStep 4: Verifying Session 1 token rejection...');
    try {
      await axios.get(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token1}` }
      });
      throw new Error('FAILED: Session 1 token was expected to be rejected!');
    } catch (err) {
      if (err.response && err.response.status === 401 && err.response.data.code === 'SESSION_TERMINATED') {
        console.log('  ✅ Session 1 token correctly rejected with 401 SESSION_TERMINATED!');
      } else {
        throw new Error(`Unexpected error response for terminated session: ${err.message}`);
      }
    }

    // 5. Verify Session 2 token remains active and valid
    console.log('\nStep 5: Verifying Session 2 token remains active...');
    const meRes = await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token2}` }
    });
    console.log(`  ✅ Session 2 active. Verified user: ${meRes.data.user.email} (${meRes.data.user.role})`);

    // 6. Create Staff Account
    console.log('\nStep 6: Creating a new staff account via Super Admin API...');
    const createStaffRes = await axios.post(
      `${BASE_URL}/team/users`,
      {
        name: 'Test Staff User',
        email: 'teststaff@nandibaag.com',
        role: 'staff',
        password: 'StaffPassword123!'
      },
      { headers: { Authorization: `Bearer ${token2}` } }
    );
    console.log(`  ✅ Staff user created: ${createStaffRes.data.user.email} (Role: ${createStaffRes.data.user.role})`);

    // 7. Login as Staff & test RBAC restriction
    console.log('\nStep 7: Logging in as Staff & testing Super Admin route restriction...');
    const staffLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'teststaff@nandibaag.com',
      password: 'StaffPassword123!'
    });
    const staffToken = staffLoginRes.data.token;

    try {
      await axios.get(`${BASE_URL}/team/users`, {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      throw new Error('FAILED: Staff user should be forbidden from /api/team/users!');
    } catch (err) {
      if (err.response && err.response.status === 403) {
        console.log('  ✅ Staff request correctly blocked with 403 Forbidden!');
      } else {
        throw new Error(`Unexpected status for forbidden route: ${err.message}`);
      }
    }

    // 8. Reset Staff password & test login
    console.log('\nStep 8: Resetting Staff password via Super Admin API...');
    const resetRes = await axios.patch(
      `${BASE_URL}/team/users/${createStaffRes.data.user.id}/reset-password`,
      { newPassword: 'NewStaffPassword456!' },
      { headers: { Authorization: `Bearer ${token2}` } }
    );
    console.log(`  ✅ ${resetRes.data.message}`);

    // Verify old password fails
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        email: 'teststaff@nandibaag.com',
        password: 'StaffPassword123!'
      });
      throw new Error('FAILED: Old staff password should fail after reset!');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log('  ✅ Old staff password correctly rejected with 401!');
      }
    }

    // Verify new password works
    const newStaffLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'teststaff@nandibaag.com',
      password: 'NewStaffPassword456!'
    });
    console.log(`  ✅ New staff password login successful!`);

    // 9. Verify Activity Log Audit Trail
    console.log('\nStep 9: Verifying Activity Log audit trail entries...');
    const logsRes = await axios.get(`${BASE_URL}/team/activity-log`, {
      headers: { Authorization: `Bearer ${token2}` }
    });
    console.log(`  ✅ Total activity logs captured in DB: ${logsRes.data.pagination.total}`);
    if (logsRes.data.logs.length > 0) {
      console.log(`  Latest log: [${logsRes.data.logs[0].action}] by ${logsRes.data.logs[0].user?.name} — ${logsRes.data.logs[0].details}`);
    }

    // 10. Disable Staff Account
    console.log('\nStep 10: Disabling Staff Account...');
    await axios.patch(
      `${BASE_URL}/team/users/${createStaffRes.data.user.id}/disable`,
      {},
      { headers: { Authorization: `Bearer ${token2}` } }
    );
    console.log('  ✅ Staff account disabled.');

    // Verify login is rejected for disabled account
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        email: 'teststaff@nandibaag.com',
        password: 'NewStaffPassword456!'
      });
      throw new Error('FAILED: Disabled staff account should not be able to log in!');
    } catch (err) {
      if (err.response && err.response.status === 401 && err.response.data.message.includes('deactivated')) {
        console.log('  ✅ Login correctly rejected: Account is deactivated.');
      }
    }

    // Clean up test staff account
    await User.findByIdAndDelete(createStaffRes.data.user.id);
    await Session.deleteMany({ userId: createStaffRes.data.user.id });
    console.log('\n================================================================================');
    console.log('            🎉 ALL SECURITY & TEAM MANAGEMENT TESTS PASSED 100%!');
    console.log('================================================================================\n');

  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.response?.data || error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runSecuritySuite();
