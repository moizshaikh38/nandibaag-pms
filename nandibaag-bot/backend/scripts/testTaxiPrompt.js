const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/moizshaikh/nandibaag-pms/nandibaag-bot/backend/.env' });
const { getAIResponse } = require('../src/services/aiService');

const testConversationFlow = async () => {
  try {
    const mockChat = {
      _id: new mongoose.Types.ObjectId(),
      customerPhone: '9999999999',
      messages: [],
      save: async function() {}
    };

    const conversation = [
      { input: 'Ola Uber available?' },
      { input: 'Return jana hai, cab milega?' },
      { input: 'Auto available hai kya station tak?' },
    ];

    for (const step of conversation) {
      console.log(`Input: "${step.input}"`);
      const response = await getAIResponse(mockChat, step.input, {}, '');
      mockChat.messages.push({ role: 'user', content: step.input });
      mockChat.messages.push({ role: 'assistant', content: response });
      console.log(`Response: ${response.substring(0, 300)}...\\n`);
    }
    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

testConversationFlow();
