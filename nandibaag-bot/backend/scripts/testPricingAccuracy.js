const mongoose = require('mongoose');
const { handleMessage } = require('../src/services/messageHandler');
const { Chat } = require('../src/models');
require('dotenv').config({ path: '../.env' }); // Make sure environment is loaded

const testCases = [
  {
    name: 'Couple + Kid (9 years) Weekday',
    input: '14 Sep 2026 to 15 Sep 2026, 2 adults + 1 kid 9 years, couple stay',
    expected: {
      total: 6500,
      hasCoupleFare: true,
      hasSingleKidCharge: true,
      noMultiplication: true
    }
  },
  {
    name: 'Couple + Kid (12 years) Weekend',
    input: '29 Aug 2026 to 30 Aug 2026, 2 adults + 1 kid 12 years, couple stay',
    expected: {
      total: 16000,
      hasWeekendRate: true,
      hasHigherKidCharge: true
    }
  },
  {
    name: 'Group (4 adults + 2 kids) Multi-night',
    input: '25 Aug 2026 to 27 Aug 2026, 4 adults + 2 kids (8 and 3 years), group stay',
    expected: {
      total: 22000,
      hasPerPersonRate: true,
      hasFreekid: true
    }
  },
  {
    name: 'Couple + Kid (3 years) FREE',
    input: '10 Sep 2026, 2 adults + 1 kid 3 years, couple stay',
    expected: {
      hasFreeKid: true,
      noChargeForBelow5: true
    }
  }
];

const testPricing = async () => {
  try {
    if (!process.env.MONGODB_URI) {
       console.error('❌ MONGODB_URI not found in env');
       process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('\n' + '═'.repeat(70));
    console.log('💰 TESTING PRICING ACCURACY');
    console.log('═'.repeat(70) + '\n');

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`Test: ${testCase.name}`);
      console.log(`Input: "${testCase.input}"`);

      // Mock JID
      const customerPhone = `999999999${i}`;
      const mockJid = `${customerPhone}@s.whatsapp.net`;

      await Chat.deleteOne({ customerPhone });

      const msg = {
        key: { remoteJid: mockJid, fromMe: false },
        message: { conversation: testCase.input },
        pushName: 'TestUser',
        messageTimestamp: Math.floor(Date.now() / 1000)
      };

      await handleMessage('test-session', msg, 'whatsapp-web');

      const chat = await Chat.findOne({ customerPhone });
      if (!chat || chat.messages.length === 0) {
        console.log(`❌ ERROR: No response found in DB`);
        continue;
      }

      // The last message in the chat should be from the AI (sender 'bot')
      const botMessages = chat.messages.filter(m => m.sender === 'bot');
      if (botMessages.length === 0) {
        console.log(`❌ ERROR: No bot messages found`);
        continue;
      }

      const response = botMessages[botMessages.length - 1].text;
      console.log(`Response:\n${response}\n`);

      // Simple checks
      let passed = true;

      if (testCase.expected.total) {
        const expectedTotal = testCase.expected.total.toLocaleString('en-IN');
        if (!response.includes(expectedTotal) && !response.includes(testCase.expected.total.toString())) {
          console.log(`❌ Expected total ₹${expectedTotal} or ${testCase.expected.total} not found`);
          passed = false;
        }
      }

      if (testCase.expected.noMultiplication) {
        if (response.includes('2 Adults × ₹5,500') || response.includes('2 × ₹5,500')) {
          console.log(`❌ ERROR: Using multiplication for couple rate`);
          passed = false;
        }
      }

      if (testCase.expected.hasFreeKid) {
        if (!response.includes('FREE')) {
          console.log(`❌ ERROR: Not showing free for <5 years`);
          passed = false;
        }
      }

      if (passed) {
        console.log(`✅ PASS\n`);
      } else {
        console.log(`❌ FAIL\n`);
      }
    }

    console.log('═'.repeat(70) + '\n');
    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

testPricing();
