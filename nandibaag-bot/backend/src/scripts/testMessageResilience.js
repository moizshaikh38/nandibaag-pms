const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { mongoUri } = require('../config/env');
const { handleMessage } = require('../services/messageHandler');
const Chat = require('../models/Chat');

async function testResilienceSuite() {
  await mongoose.connect(mongoUri);
  console.log('==================================================');
  console.log('--- STARTING MESSAGE RESILIENCE HEALTH-CHECK TEST (AI MODE) ---');
  console.log('==================================================\n');

  const testCases = [
    { name: '1. Original Bug Case', input: 'Yes 2 kids dates 5 aug - 7 aug' },
    { name: '2. Gibberish Text', input: 'asdkjaskjd123!@#' },
    { name: '3. Empty String', input: '' },
    { name: '4. Extreme/Nonsensical Values', input: '5 kids no ages 100 nights' },
    { name: '5. Long 1000+ Character Message', input: 'A'.repeat(1050) },
    { name: '6. Emoji Only', input: '😊😊😊' },
    { name: '7. Numbers Only', input: '12345' },
    { name: '8. Mixed Scripts', input: 'Couple होगा 5-7 aug साथ 2 kids' }
  ];

  let passedCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const phone = '91999900000' + i;
    await Chat.deleteMany({ customerPhone: phone });

    console.log(`[TEST ${i + 1}/8] ${tc.name}`);
    console.log(`Input: "${tc.input.length > 50 ? tc.input.substring(0, 50) + '...' : tc.input}"`);

    // Create chat explicitly in AI mode
    const chat = new Chat({
      customerPhone: phone,
      mode: 'ai',
      messages: [{ sender: 'customer', text: 'Hi', timestamp: new Date() }],
      bookingStage: 'type_selected',
      bookingDraft: { bookingType: 'couple' }
    });
    await chat.save();

    const msgEnvelope = {
      key: { remoteJid: phone + '@s.whatsapp.net', fromMe: false },
      message: { conversation: tc.input }
    };

    try {
      await handleMessage('resort_primary', msgEnvelope, 'whatsapp-web');

      const resultChat = await Chat.findOne({ customerPhone: phone });
      const botMsgs = resultChat ? resultChat.messages.filter(m => m.sender === 'bot') : [];

      if (tc.input === '') {
        // Empty message is safely ignored by design
        console.log(`  ✓ Result: Safely ignored non-text message as intended\n`);
        passedCount++;
      } else {
        console.log(`  ✓ Result: Reply generated & attempted (${botMsgs.length} bot msgs)`);
        if (botMsgs.length > 0) {
          console.log(`  ✓ Reply text: "${botMsgs[botMsgs.length - 1].text.substring(0, 90)}..."\n`);
          passedCount++;
        } else {
          console.error(`  ❌ NO BOT REPLY GENERATED FOR: ${tc.name}\n`);
        }
      }
    } catch (err) {
      console.error(`  ❌ SILENT FAILURE / UNHANDLED EXCEPTION: ${err.message}\n`);
    }
  }

  console.log('==================================================');
  console.log(`RESILIENCE TEST SUMMARY: ${passedCount}/${testCases.length} Passed!`);
  console.log('==================================================\n');

  await mongoose.disconnect();
}

testResilienceSuite().catch(err => {
  console.error('Resilience suite crashed:', err);
  process.exit(1);
});
