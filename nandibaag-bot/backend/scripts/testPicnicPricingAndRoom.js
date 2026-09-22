const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { getAIResponse } = require('../src/services/aiService');
const { calculatePricing } = require('../src/services/pricingService');

const testConversationFlow = async () => {
  try {
    console.log('\\n' + '═'.repeat(70));
    console.log('🧠 TESTING WEEKEND PICNIC PRICING & PRIVATE ROOM');
    console.log('═'.repeat(70) + '\\n');

    // Test 1: Direct pricing function
    console.log('--- TEST 1: calculatePricing function directly ---');
    // Using a known weekend date: 2026-09-20 is Sunday
    const res = calculatePricing('2026-09-20', null, 5, 'picnic', 'picnic', { mealOption: 'breakfast-to-dinner' });
    console.log(`Expected total for 5 on B→D Weekend: ₹7,500`);
    console.log(`Actual calculated total: ₹${res.raw.grandTotal}`);
    if (res.raw.grandTotal !== 7500) {
      console.log('❌ FAIL: calculatePricing returned wrong total!');
    } else {
      console.log('✅ PASS: calculatePricing is correct.\\n');
    }

    const mockChat = {
      _id: new mongoose.Types.ObjectId(),
      customerPhone: '9999999999',
      messages: [],
      save: async function() {}
    };

    const conversation = [
      { input: '20 Sep (Sunday), 5 people, one day picnic B→D' },
      { input: 'I want a room including' },
      { input: 'Yes, add private room to my booking' }
    ];

    let contextInjection = `
CONVERSATION CONTEXT:
- Date: 20 Sep
- Package: one-day-picnic
- Meal: breakfast-to-dinner
- Guests: 5
`;

    // Test AI flows
    for (const step of conversation) {
      console.log(`Input: "${step.input}"`);
      const response = await getAIResponse(mockChat, step.input, {}, contextInjection);
      mockChat.messages.push({ role: 'user', content: step.input });
      mockChat.messages.push({ role: 'assistant', content: response });
      console.log(`Response: \\n${response.substring(0, 300)}...\\n`);
    }

    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

testConversationFlow();
