/**
 * Safe Staging-Only E2E Account Provisioning Script
 *
 * Usage:
 *   NODE_ENV=staging MONGO_URI=mongodb://127.0.0.1:27017/nandibaag-pms-staging \
 *   STAGING_E2E_PASSWORD="<operator-supplied-password>" \
 *   node src/scripts/createStagingE2EUser.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  if (process.env.NODE_ENV !== 'staging') {
    console.error('REFUSED: NODE_ENV must be "staging".');
    process.exit(1);
  }

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
  if (!uri.startsWith('mongodb://127.0.0.1:27017/nandibaag-pms-staging')) {
    console.error('REFUSED: Target URI must be mongodb://127.0.0.1:27017/nandibaag-pms-staging.');
    process.exit(1);
  }

  const password = process.env.STAGING_E2E_PASSWORD;
  if (!password || password.length < 8) {
    console.error('REFUSED: STAGING_E2E_PASSWORD env var (min 8 chars) is required.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  if (mongoose.connection.db.databaseName !== 'nandibaag-pms-staging') {
    await mongoose.disconnect();
    console.error('REFUSED: Connected database is not nandibaag-pms-staging.');
    process.exit(1);
  }

  const email = 'staging-e2e@nandibaag.com';
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Staging E2E account already exists: ${email} (role: ${existing.role})`);
    await mongoose.disconnect();
    return;
  }

  await User.create({
    name: 'Staging E2E Tester',
    email,
    password,
    role: 'admin',
    isActive: true
  });

  console.log(`Created isolated staging E2E account: ${email} (role: admin)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
