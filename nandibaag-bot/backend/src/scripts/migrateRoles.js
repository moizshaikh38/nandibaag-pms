#!/usr/bin/env node

/**
 * Migration Script: Upgrade / Create Super Admin Accounts
 * 
 * Ensures exactly 3 super_admin accounts exist:
 * - moiz@nandibaag.com
 * - dev@nandibaag.com
 * - owner@nandibaag.com
 * 
 * Usage: node backend/src/scripts/migrateRoles.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const connectDB = require('../config/db');
const { User } = require('../models');
const logger = require('../config/logger');

const SUPER_ADMIN_EMAILS = [
  { email: 'moiz@nandibaag.com', name: 'Moiz Shaikh (Super Admin)' },
  { email: 'dev@nandibaag.com', name: 'Dev Team (Super Admin)' },
  { email: 'owner@nandibaag.com', name: 'Resort Owner (Super Admin)' }
];

function generateTempPassword() {
  return 'NbSuper!' + crypto.randomBytes(4).toString('hex');
}

async function migrate() {
  console.log('\n================================================================================');
  console.log('              NANDIBAAG PMS — SUPER ADMIN ROLE MIGRATION');
  console.log('================================================================================\n');

  await connectDB();

  const createdCredentials = [];
  const upgradedAccounts = [];

  for (const item of SUPER_ADMIN_EMAILS) {
    const normalizedEmail = item.email.toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      user.role = 'super_admin';
      user.isActive = true;
      await user.save();
      upgradedAccounts.push({ email: user.email, name: user.name, status: 'Upgraded to super_admin' });
      console.log(`  ✅ Upgraded existing user: ${user.email} -> super_admin`);
    } else {
      const tempPassword = generateTempPassword();
      user = new User({
        name: item.name,
        email: normalizedEmail,
        password: tempPassword,
        role: 'super_admin',
        isActive: true
      });
      await user.save();
      createdCredentials.push({ email: normalizedEmail, name: item.name, password: tempPassword });
      console.log(`  ✨ Created new super_admin user: ${normalizedEmail}`);
    }
  }

  console.log('\n================================================================================');
  console.log('                     SUPER ADMIN MIGRATION SUMMARY');
  console.log('================================================================================\n');

  if (upgradedAccounts.length > 0) {
    console.log('Upgraded Existing Accounts:');
    upgradedAccounts.forEach(acc => {
      console.log(`  • ${acc.email} (${acc.name}) -> role: super_admin`);
    });
    console.log('');
  }

  if (createdCredentials.length > 0) {
    console.log('--------------------------------------------------------------------------------');
    console.log('🔑 NEW SUPER ADMIN CREDENTIALS GENERATED (STORE / COPY SECURELY):');
    console.log('--------------------------------------------------------------------------------');
    createdCredentials.forEach(cred => {
      console.log(`  Email:    ${cred.email}`);
      console.log(`  Name:     ${cred.name}`);
      console.log(`  Password: \x1b[33m\x1b[1m${cred.password}\x1b[0m`);
      console.log('--------------------------------------------------------------------------------');
    });
  } else {
    console.log('All 3 super_admin accounts already existed and were verified/upgraded.');
  }

  console.log('\n================================================================================\n');
  await mongoose.disconnect();
}

if (require.main === module) {
  migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = migrate;
