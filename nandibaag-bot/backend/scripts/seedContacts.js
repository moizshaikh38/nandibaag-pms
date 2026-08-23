require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Settings, SystemSettings } = require('../src/models');

const seedContacts = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nandibaag';
    await mongoose.connect(mongoUri);

    console.log('\n═════════════════════════════════════════════════════════');
    console.log('📞 SEEDING / UPDATING RESORT CONTACT NUMBERS');
    console.log('═════════════════════════════════════════════════════════\n');

    // 1. Update Settings collection
    await Settings.findOneAndUpdate(
      {},
      {
        $set: {
          resortContactNumber: '9257657664',
          resortContactNumberReception: '9257657665',
          resortContactNumberKitchen: '75582 69653'
        }
      },
      { new: true, upsert: true }
    );
    console.log('✅ Settings collection updated:');
    console.log('   Main Booking:', '9257657664');
    console.log('   Reception:', '9257657665');
    console.log('   Kitchen:', '75582 69653');

    // 2. Update SystemSettings collection
    if (SystemSettings) {
      const contactSettings = [
        {
          settingKey: 'resortContactNumber',
          settingValue: '9257657664',
          description: 'Main resort contact number',
          dataType: 'string',
          category: 'general'
        },
        {
          settingKey: 'resortContactNumberReception',
          settingValue: '9257657665',
          description: 'Reception contact number',
          dataType: 'string',
          category: 'general'
        },
        {
          settingKey: 'resortContactNumberKitchen',
          settingValue: '75582 69653',
          description: 'Kitchen contact number',
          dataType: 'string',
          category: 'general'
        }
      ];

      for (const item of contactSettings) {
        await SystemSettings.findOneAndUpdate(
          { settingKey: item.settingKey },
          { $set: item },
          { new: true, upsert: true }
        );
        console.log(`   [SystemSettings] Upserted: ${item.settingKey} → ${item.settingValue}`);
      }
    }

    console.log('\n✅ Contacts seeded and updated successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding contacts:', error);
    process.exit(1);
  }
};

seedContacts();
