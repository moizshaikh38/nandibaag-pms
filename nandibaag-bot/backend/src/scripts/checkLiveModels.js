const OpenAI = require('openai');

async function testOpenRouterAndGroq() {
  console.log('====================================================');
  console.log('   CHECKING OPENROUTER & GROQ MODEL LIVE STATUS     ');
  console.log('====================================================\n');

  const openrouterApiKey = process.env.OPENROUTER_API_KEY || 'your-openrouter-api-key';
  const groqApiKey = process.env.GROQ_API_KEY || '';

  const openrouterModels = [
    'openai/gpt-4o-mini',
    'meta-llama/llama-3.3-70b-instruct:free',
    'anthropic/claude-3.5-sonnet',
    'meta-llama/llama-3.1-70b-instruct'
  ];

  const groqModels = [
    'llama-3.3-70b-versatile',
    'mixtral-8x7b-32768'
  ];

  console.log('1. Checking OpenRouter API Key & Models (PRIMARY)...');
  if (!openrouterApiKey || openrouterApiKey === 'your-openrouter-api-key') {
    console.log('⚠️ [OPENROUTER] OPENROUTER_API_KEY is not configured or using placeholder in local .env');
    console.log('   -> System will use robust Multilingual Smart Intent Assistant fallback locally,');
    console.log('   -> Once OPENROUTER_API_KEY is set in Render production environment variables, OpenRouter will respond instantly.\n');
  } else {
    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openrouterApiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://nandibaag.com',
        'X-Title': 'Nandibaag WhatsApp AI'
      }
    });

    for (const model of openrouterModels) {
      try {
        const start = Date.now();
        const res = await openai.chat.completions.create({
          model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 10
        });
        const latency = Date.now() - start;
        console.log(`✅ [OPENROUTER LIVE] Model "${model}" is ONLINE & WORKING (${latency}ms)`);
        console.log(`   └─ Reply: "${res.choices?.[0]?.message?.content?.trim()}"`);
      } catch (err) {
        console.log(`❌ [OPENROUTER FAIL] Model "${model}" failed: ${err.message}`);
      }
    }
  }

  console.log('2. Checking Groq API Key & Models (SECONDARY)...');
  if (!groqApiKey) {
    console.log('⚠️ [GROQ] GROQ_API_KEY is not configured in local .env (will be skipped unless GROQ_API_KEY is set)\n');
  } else {
    const groqClient = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: groqApiKey
    });

    for (const model of groqModels) {
      try {
        const start = Date.now();
        const res = await groqClient.chat.completions.create({
          model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 10
        });
        const latency = Date.now() - start;
        console.log(`✅ [GROQ LIVE] Model "${model}" is ONLINE & WORKING (${latency}ms)`);
        console.log(`   └─ Reply: "${res.choices?.[0]?.message?.content?.trim()}"`);
      } catch (err) {
        console.log(`❌ [GROQ FAIL] Model "${model}" failed: ${err.message}`);
      }
    }
  }

  console.log('\n====================================================');
  console.log('   CHECK COMPLETE                                  ');
  console.log('====================================================');
}

testOpenRouterAndGroq();
