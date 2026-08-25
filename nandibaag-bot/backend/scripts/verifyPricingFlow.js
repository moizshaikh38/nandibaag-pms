const mongoose = require('mongoose');
const { handleMessage } = require('../src/services/messageHandler');
const { Chat } = require('../src/models');
require('dotenv').config({ path: '../.env' }); // Make sure environment is loaded

const verifyPricingFlow = async () => {
  try {
    // If not already connected to DB, connect
    if (!process.env.MONGODB_URI) {
       console.error('❌ MONGODB_URI not found in env');
       process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('\n' + '═'.repeat(70));
    console.log('✅ VERIFYING PRICING + CALL FLOW');
    console.log('═'.repeat(70) + '\n');

    // Create a mock Baileys message object that handleMessage expects
    const mockJid = '9999999999@s.whatsapp.net';
    
    // Create/clear the chat in DB first to ensure clean state
    await Chat.deleteOne({ customerPhone: '9999999999' });
    
    // First message to set the date/guests
    const testQuery = "29 August to 30 august, 4 adults and 0 kids";
    const msg = {
      key: { remoteJid: mockJid, fromMe: false },
      message: { conversation: testQuery },
      pushName: 'TestUser',
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    console.log('📝 Query:', testQuery);
    console.log('─'.repeat(70) + '\n');

    // Call the actual handleMessage function
    // We will intercept the console.log or just check the DB after since handleMessage saves to DB
    await handleMessage('test-session', msg, 'whatsapp-web');
    
    // Fetch the response from DB
    const chat = await Chat.findOne({ customerPhone: '9999999999' });
    if (!chat || chat.messages.length === 0) {
      throw new Error('No chat or messages found in DB');
    }
    
    // The last bot message should be our AI response
    const botMessages = chat.messages.filter(m => m.sender === 'bot');
    const response = botMessages[botMessages.length - 1].text;

    console.log('🤖 Response:\n');
    console.log(response);
    console.log('\n' + '─'.repeat(70) + '\n');

    // VERIFICATION CHECKLIST
    console.log('📋 VERIFICATION CHECKLIST:\n');

    const checks = [
      {
        name: 'Has total amount only',
        test: response.includes('₹') && response.toLowerCase().includes('total'),
        required: true
      },
      {
        name: 'Shows dates',
        test: response.includes('29') && response.includes('30'),
        required: true
      },
      {
        name: 'Shows day names',
        test: response.toLowerCase().includes('friday') || response.toLowerCase().includes('saturday'),
        required: true
      },
      {
        name: 'Shows guest count',
        test: response.includes('4') && response.toLowerCase().includes('adult'),
        required: true
      },
      {
        name: 'Has call to confirm',
        test: response.toLowerCase().includes('call') || response.includes('9257657664'),
        required: true
      },
      {
        name: 'NO "ADVANCE" text',
        test: !response.toLowerCase().includes('advance'),
        required: true
      },
      {
        name: 'NO "PENDING" text',
        test: !response.toLowerCase().includes('pending'),
        required: true
      },
      {
        name: 'NO "rooms available" text',
        test: !response.toLowerCase().includes('available'),
        required: true
      },
      {
        name: 'NO "all booked" text',
        test: !response.toLowerCase().includes('booked'),
        required: true
      }
    ];

    let passed = 0;
    let failed = 0;

    checks.forEach(check => {
      if (check.test) {
        console.log(`✅ ${check.name}`);
        passed++;
      } else {
        console.log(`❌ ${check.name}`);
        if (check.required) failed++;
      }
    });

    console.log('\n' + '═'.repeat(70));
    console.log(`Result: ${passed}/${checks.length} checks passed`);

    if (failed === 0) {
      console.log('\n🎉 FLOW IS CORRECT!');
      console.log('Customer sees: Pricing → Call to confirm ✅');
    } else {
      console.log(`\n⚠️  ${failed} required check(s) failed`);
    }

    console.log('═'.repeat(70) + '\n');

    // Cleanup mock data
    await Chat.deleteOne({ customerPhone: '9999999999' });

    process.exit(failed === 0 ? 0 : 1);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

verifyPricingFlow();
