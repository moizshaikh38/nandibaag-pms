#!/usr/bin/env node

const mongoose = require('mongoose');
const { User } = require('../models');
require('dotenv').config();

const NEW_PASSWORD = 'admin123'; // Simple password for testing

async function resetAdminPassword() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const admin = await User.findOne({ email: 'admin@nandibaag.com' });
    
    if (!admin) {
      console.log('Admin user not found. Creating...');
      const newAdmin = new User({
        name: 'Admin',
        email: 'admin@nandibaag.com',
        password: NEW_PASSWORD,
        role: 'admin'
      });
      await newAdmin.save();
      console.log('Admin user created successfully');
    } else {
      admin.password = NEW_PASSWORD;
      await admin.save();
      console.log('Admin password reset successfully');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 LOGIN CREDENTIALS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Email:    admin@nandibaag.com`);
    console.log(`Password: ${NEW_PASSWORD}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

resetAdminPassword();
