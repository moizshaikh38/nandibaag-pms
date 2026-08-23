require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Booking } = require('../src/models');
const { formatBookingMessageForCustomer } = require('../src/utils/bookingMessageFormatter');
const { sendMessageViaChannel } = require('../src/services/channelManager');
const fast2smsService = require('../src/services/fast2smsService');
const env = require('../src/config/env');

const testBookingConfirmation = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nandibaag';
    await mongoose.connect(mongoUri);

    console.log('\n══════════════════════════════════════════════════');
    console.log('🔍 DIAGNOSING BOOKING CONFIRMATION SENDING');
    console.log('══════════════════════════════════════════════════\n');

    console.log('ENV Fast2SMS settings:');
    console.log('  fast2smsEnabled:', env.fast2smsEnabled);
    console.log('  fast2smsApiKey:', env.fast2smsApiKey ? (env.fast2smsApiKey.slice(0, 8) + '...') : 'MISSING');
    console.log('  fast2smsPhoneNumberId:', env.fast2smsPhoneNumberId);
    console.log('  fast2smsSenderNumbers:', env.fast2smsSenderNumbers);
    console.log('  fast2smsService status:', fast2smsService.getStatus());

    // Find latest booking
    const booking = await Booking.findOne().sort({ createdAt: -1 });
    if (!booking) {
      console.log('No booking found to test.');
      process.exit(0);
    }

    console.log('\nTesting with latest booking:');
    console.log('  Customer:', booking.customerName);
    console.log('  Phone:', booking.customerPhone);
    console.log('  SMS Sent status in DB:', booking.smsSent);
    console.log('  SMS Error in DB:', booking.smsError);

    let cleanCustomerPhone = String(booking.customerPhone || '').replace(/[^\d]/g, '');
    if (cleanCustomerPhone.length === 10) cleanCustomerPhone = '91' + cleanCustomerPhone;

    const customerMessage = formatBookingMessageForCustomer(booking);
    console.log('\nFormatted Message Length:', customerMessage.length);
    console.log('Preview:\n', customerMessage.slice(0, 150) + '...\n');

    console.log('--- Calling sendMessageViaChannel ---');
    const result = await sendMessageViaChannel(cleanCustomerPhone, customerMessage, 'whatsapp-web', 'resort_primary');
    console.log('\nsendMessageViaChannel result:', result);

    console.log('\n--- Direct Fast2SMS send test ---');
    const directResult = await fast2smsService.sendMessage(cleanCustomerPhone, customerMessage);
    console.log('Direct fast2smsService.sendMessage result:', directResult);

    console.log('\n--- Direct Fast2SMS sendSMS (Cellular Quick SMS) test ---');
    const smsDirectResult = await fast2smsService.sendSMS(cleanCustomerPhone, `Booking Confirmed for ${booking.customerName}! Nandibaag Resort. Check-in: ${booking.checkInDate}`);
    console.log('Direct fast2smsService.sendSMS result:', smsDirectResult);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during test:', error);
    process.exit(1);
  }
};

testBookingConfirmation();
