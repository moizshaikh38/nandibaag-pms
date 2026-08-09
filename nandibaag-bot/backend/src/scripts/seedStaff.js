const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const Staff = require('../models/Staff');

const seedStaff = async () => {
  try {
    console.log('[SeedStaff] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    
    const staffMembers = [
      {
        name: 'Kadambari',
        staffId: 'staff_001',
        contact: '9876543210',
        email: 'kadambari@nandibaag.com',
        role: 'Booking Manager',
        status: 'active'
      },
      {
        name: 'Ravi',
        staffId: 'staff_002',
        contact: '9876543211',
        email: 'ravi@nandibaag.com',
        role: 'Booking Manager',
        status: 'active'
      },
      {
        name: 'Priti',
        staffId: 'staff_003',
        contact: '9876543212',
        email: 'priti@nandibaag.com',
        role: 'Booking Manager',
        status: 'active'
      },
      {
        name: 'Mansi',
        staffId: 'staff_004',
        contact: '9876543213',
        email: 'mansi@nandibaag.com',
        role: 'Booking Manager',
        status: 'active'
      }
    ];
    
    for (const member of staffMembers) {
      await Staff.findOneAndUpdate(
        { staffId: member.staffId },
        { $set: member },
        { upsert: true, new: true }
      );
    }
    
    console.log('✅ Staff members successfully seeded into Database');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding staff:', error);
    process.exit(1);
  }
};

seedStaff();
