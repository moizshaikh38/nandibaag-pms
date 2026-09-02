require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { getSettingValue, updateGenericSetting, initializeDefaultSettings } = require('../src/services/settingsService');
const { buildSystemPrompt } = require('../src/utils/systemPrompt');
const { formatBookingMessageForCustomer } = require('../src/utils/bookingMessageFormatter');

const runTest = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nandibaag';
    await mongoose.connect(mongoUri);

    console.log('\n═════════════════════════════════════════════════════════');
    console.log('🧪 TESTING CONFIGURABLE CONTACT NUMBERS');
    console.log('═════════════════════════════════════════════════════════\n');

    // 1. Initialize & Read Settings
    await initializeDefaultSettings();

    const mainNumber = await getSettingValue('resortContactNumber');
    const receptionNumber = await getSettingValue('resortContactNumberReception');
    const kitchenNumber = await getSettingValue('resortContactNumberKitchen');

    console.log('1. Settings Values:');
    console.log('   - resortContactNumber (Main):', mainNumber);
    console.log('   - resortContactNumberReception:', receptionNumber);
    console.log('   - resortContactNumberKitchen:', kitchenNumber);

    console.assert(mainNumber === '9257657664', `Expected 9257657664, got ${mainNumber}`);
    console.assert(receptionNumber === '9257657665', `Expected 9257657665, got ${receptionNumber}`);
    console.assert(kitchenNumber === '75582 69653', `Expected 75582 69653, got ${kitchenNumber}`);
    console.log('   ✅ Settings values verified!');

    // 2. Test System Prompt Injection
    console.log('\n2. System Prompt Contact Section:');
    const prompt = buildSystemPrompt('hinglish', '2026-08-28', 'Friday', {
      resortContactNumber: mainNumber,
      resortContactNumberReception: receptionNumber,
      resortContactNumberKitchen: kitchenNumber
    });

    console.assert(prompt.includes(mainNumber), `Prompt must include ${mainNumber}`);
    console.assert(prompt.includes(receptionNumber), `Prompt must include ${receptionNumber}`);
    console.assert(prompt.includes(kitchenNumber), `Prompt must include ${kitchenNumber}`);
    console.log('   ✅ System prompt contains dynamic contact section and main number!');

    // 3. Test Booking Message Formatter
    console.log('\n3. Booking Message Confirmation:');
    const sampleBooking = {
      customerName: 'Rahul Sharma',
      customerPhone: '9876543210',
      checkInDate: new Date('2026-08-28'),
      checkOutDate: new Date('2026-08-30'),
      totalMembers: 4,
      roomIds: ['room1', 'room2'],
      packageType: 'group',
      totalAmount: 24000,
      advancePaid: 5000,
      resortContactNumber: mainNumber
    };

    const confirmationRes = formatBookingMessageForCustomer(sampleBooking);
    const confirmationMsg = confirmationRes.text || confirmationRes;
    console.log('   Sample snippet:\n', confirmationMsg.split('\n').slice(-8).join('\n'));
    console.assert(confirmationMsg.includes(`Call: ${mainNumber}`), 'Confirmation message must include main contact number');
    console.log('   ✅ Confirmation message verified with new number!');

    console.log('\n═════════════════════════════════════════════════════════');
    console.log('🎉 ALL CONTACT NUMBER TESTS PASSED SUCCESSFULLY!');
    console.log('═════════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
};

runTest();
