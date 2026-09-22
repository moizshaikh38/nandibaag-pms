const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { getAIResponse } = require('../src/services/aiService');

const testConversationFlow = async () => {
  try {
    console.log('\\n' + '═'.repeat(70));
    console.log('🧠 TESTING CONVERSATION MEMORY (Real Bug Scenario)');
    console.log('═'.repeat(70) + '\\n');

    const mockChat = {
      _id: new mongoose.Types.ObjectId(),
      customerPhone: '9999999999',
      messages: [],
      save: async function() {}
    };

    const conversation = [
      { input: 'Hi', check: null },
      { input: 'One day trip package details', check: null },
      { input: 'Muze around 18 sep ko book Krna tha', check: 'DATE_PROVIDED' },
      { input: 'Resort suru hai kya in date pr', check: null },
      { input: 'Okh one day package mai kya rhega', check: 'SHOULD_ANSWER_PACKAGE_INFO' },
      { input: 'Shyam ko return jana hai around 5-6 pm', check: null },
      { input: 'One day ke package mai kya include hai', check: 'SHOULD_NOT_ASK_DATE_AGAIN' }
    ];

    for (const step of conversation) {
      console.log(`Input: "${step.input}"`);

      // Mock the context extraction logic from messageHandler.js
      const context = { checkInDate: null, packageType: null };
      mockChat.messages.forEach(msg => {
        if (msg.role === 'user') {
          const dateMatch = msg.content.match(/(\\d{1,2})\\s*(sep|september|aug|august|oct|october|nov|november|dec|december)/i);
          if (dateMatch) context.checkInDate = dateMatch[0];
          if (/one.?day|picnic/i.test(msg.content)) context.packageType = 'one-day-picnic';
        }
      });
      
      const contextInjection = `
CONVERSATION CONTEXT (Already known - DO NOT ask again):
${context.checkInDate ? `- Customer already mentioned date: ${context.checkInDate}` : '- Date: NOT YET PROVIDED'}
${context.packageType ? `- Package type: ${context.packageType}` : '- Package: NOT YET PROVIDED'}

CRITICAL RULE: If date is already in context above, DO NOT ask "Check-in date batayein" again. Use the date already provided.
`;

      const response = await getAIResponse(mockChat, step.input, {}, contextInjection);
      
      mockChat.messages.push({ role: 'user', content: step.input });
      mockChat.messages.push({ role: 'assistant', content: response });

      console.log(`Response: ${response.substring(0, 150)}...\\n`);

      if (step.check === 'SHOULD_NOT_ASK_DATE_AGAIN') {
        if (response.includes('Check-in date batayein') || 
            response.includes('kis date pe')) {
          console.log('❌ FAIL: Asked for date again after already provided!\n');
        } else {
          console.log('✅ PASS: Did not re-ask for date\n');
        }
      }

      if (step.check === 'SHOULD_ANSWER_PACKAGE_INFO') {
        if (response.includes('include') || response.includes('Breakfast') || 
            response.includes('Activities')) {
          console.log('✅ PASS: Answered package info\n');
        } else {
          console.log(`❌ FAIL: Did not answer "what's included" question!\\n`);
        }
      }
    }

    console.log('═'.repeat(70) + '\n');
    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

testConversationFlow();
