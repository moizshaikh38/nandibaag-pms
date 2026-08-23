require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const fast2smsService = require('../src/services/fast2smsService');

const testFast2SmsWhatsApp = async () => {
  const testNumber = '919579289912'; // Test phone number
  const aiConfirmationMessage = `✅ BOOKING SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 DATES:
28/08/2026 (Friday) to 29/08/2026 (Saturday)
1 Night Stay

👥 GUESTS:
4 Adults

🏨 PACKAGE:
GROUP STAY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 PRICING BREAKDOWN:
4 Adults × ₹3,000 = ₹12,000

────────────────────────────
TOTAL: ₹12,000

✓ Includes: All Meals + Activities
✓ Vegetarian only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📞 NEXT STEP:
Hamari team aapse jald hi connect karegi for booking confirmation 😊
Call: 9257657664`;

  console.log('Testing Fast2SMS WhatsApp API with AI Confirmation Message:');
  console.log('Phone:', testNumber);
  console.log('Message length:', aiConfirmationMessage.length);

  try {
    const parsedUrl = new URL(fast2smsService.apiUrl);
    const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
    const url = new URL(baseUrl);
    url.searchParams.set('to', testNumber);
    if (fast2smsService.phoneNumberId) {
      url.searchParams.set('phone_number_id', fast2smsService.phoneNumberId);
    }

    console.log('\n--- 1. Testing with { type: "text", text: message } ---');
    console.log('URL:', url.toString());

    const res1 = await axios.post(url.toString(), {
      type: 'text',
      text: aiConfirmationMessage
    }, {
      headers: {
        Authorization: fast2smsService.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log('HTTP Status:', res1.status);
    console.log('Response Data:', JSON.stringify(res1.data, null, 2));

    console.log('\n--- 2. Testing via fast2smsService.sendMessage() ---');
    const res2 = await fast2smsService.sendMessage(testNumber, aiConfirmationMessage);
    console.log('fast2smsService.sendMessage result:', res2);

  } catch (err) {
    console.error('❌ Request error:', err.message);
    if (err.response) {
      console.error('HTTP Status:', err.response.status);
      console.error('Response Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
};

testFast2SmsWhatsApp();
