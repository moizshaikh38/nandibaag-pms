require('dotenv').config();
const { getAIResponse } = require('../services/aiService');
const connectDB = require('../config/db');

async function testLiveOpenRouter() {
  console.log('====================================================');
  console.log('   TESTING OPENROUTER (openai/gpt-4o-mini) LIVE     ');
  console.log('====================================================\n');

  console.log('1. Checking Environment Variables:');
  console.log(' - MONGO_URI present?', !!process.env.MONGO_URI);
  console.log(' - MONGODB_URI present?', !!process.env.MONGODB_URI);
  console.log(' - OPENROUTER_API_KEY present?', !!process.env.OPENROUTER_API_KEY);
  console.log(' - OPENROUTER_MODEL_PRIMARY:', process.env.OPENROUTER_MODEL_PRIMARY || 'openai/gpt-4o-mini');
  console.log(' - GROQ_API_KEY present?', !!process.env.GROQ_API_KEY);

  const mockChat = {
    customerPhone: '919999999999',
    mode: 'ai',
    language: 'hinglish',
    messages: [
      { sender: 'customer', text: 'Hello, room kitne ka hai?', timestamp: new Date() }
    ],
    bookingStage: 'none',
    bookingDraft: {}
  };

  const mockSettings = { globalMode: 'ai' };

  console.log('\n2. Sending test prompt to aiService (Calling OpenRouter GPT-4o-Mini)...');
  const tStart = Date.now();
  const reply = await getAIResponse(mockChat, 'Hello, room kitne ka hai?', mockSettings, '');
  const duration = Date.now() - tStart;

  console.log(`\n3. AI Reply Received in ${duration}ms:`);
  console.log('----------------------------------------------------');
  console.log(reply);
  console.log('----------------------------------------------------');

  if (reply && reply.length > 10) {
    console.log('\n✅ SUCCESS: OpenRouter (openai/gpt-4o-mini) is LIVE and responding correctly!');
  } else {
    console.error('\n❌ FAILURE: Reply failed or returned empty.');
  }

  process.exit(0);
}

testLiveOpenRouter();
