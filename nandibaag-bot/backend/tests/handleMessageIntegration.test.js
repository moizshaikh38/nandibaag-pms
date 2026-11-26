/**
 * Integration Test Suite for handleMessage() with Mocked Dependencies
 * 
 * Verifies end-to-end execution without database or network connections:
 * - Exact call counts for getAIResponse and sendMessageViaChannel
 * - Socket emission verification (chat:updated, chat:new_message)
 * - Human mode suppression
 * - Intentional silence exit paths
 * - Mixed availability handling
 * - Follow-up lifecycle integration
 * - Context persistence across multi-turn sequences
 */

const assert = require('assert');

// ─────────────────────────────────────────────────────────────────────────────
// MOCK STATE AND SPIES
// ─────────────────────────────────────────────────────────────────────────────
const spies = {
  getAIResponseCalls: [],
  sendMessageViaChannelCalls: [],
  cancelPendingFollowUpsCalls: [],
  scheduleFollowUpsCalls: [],
  socketEmits: [],
  presenceUpdates: []
};

function resetSpies() {
  spies.getAIResponseCalls = [];
  spies.sendMessageViaChannelCalls = [];
  spies.cancelPendingFollowUpsCalls = [];
  spies.scheduleFollowUpsCalls = [];
  spies.socketEmits = [];
  spies.presenceUpdates = [];
}

// In-memory chat storage for tests
let inMemoryChats = new Map();

function createMockChatDoc(data) {
  const chat = {
    _id: data._id || 'mock_chat_' + Date.now(),
    customerPhone: data.customerPhone || '9876543210',
    customerName: data.customerName || 'Test Customer',
    whatsappNumberUsed: data.whatsappNumberUsed || 'primary',
    channel: data.channel || 'whatsapp-web',
    mode: data.mode || 'ai',
    language: data.language || 'hinglish',
    messages: data.messages || [],
    bookingStage: data.bookingStage || 'none',
    bookingDraft: data.bookingDraft || {},
    conversationState: data.conversationState || {},
    isNewConversation: false,
    isArchived: false,
    lastMessageAt: new Date(),
    async save() {
      inMemoryChats.set(this.customerPhone, this);
      return this;
    }
  };
  return chat;
}

// ─────────────────────────────────────────────────────────────────────────────
// WIRE MOCKS INTO REQUIRE CACHE
// ─────────────────────────────────────────────────────────────────────────────
const models = require('../src/models');
models.Settings.findOne = async () => ({
  defaultModeForNewChats: 'ai',
  globalMode: 'ai',
  systemPrompt: 'Mock Prompt'
});

models.Chat.findOne = async (query) => {
  if (query.$or) {
    for (const q of query.$or) {
      if (q.customerPhone && inMemoryChats.has(q.customerPhone)) {
        return inMemoryChats.get(q.customerPhone);
      }
    }
  }
  return null;
};

models.Chat.findById = (id) => {
  let found = null;
  for (const c of inMemoryChats.values()) {
    if (c._id === id || String(c._id) === String(id)) {
      found = c;
      break;
    }
  }
  return {
    select: function() { return this; },
    lean: function() { return this; },
    then: function(resolve, reject) {
      return Promise.resolve(found).then(resolve, reject);
    }
  };
};

models.Chat.updateOne = async () => ({ acknowledged: true });

models.FollowUp.deleteMany = async () => ({ acknowledged: true });

// Mock constructor
const OriginalChat = models.Chat;
models.Chat = function(data) {
  const doc = createMockChatDoc(data);
  inMemoryChats.set(doc.customerPhone, doc);
  return doc;
};
Object.assign(models.Chat, OriginalChat);

// Mock aiService
const aiService = require('../src/services/aiService');
aiService.getAIResponse = async (chat, messageText, settings, systemNotes) => {
  spies.getAIResponseCalls.push({ chat, messageText, settings, systemNotes });
  // Simulated responses
  if (messageText.includes('couple')) {
    return 'Couple stay is ₹5,500 on weekdays and ₹6,500 on weekends. Includes 4 meals and pool!';
  }
  if (messageText.includes('location')) {
    return 'Nandibaag Resort is located near Karjat, Maharashtra. Google Maps link: https://maps.google.com';
  }
  return 'Nandibaag Resort offers a wonderful stay with swimming pool, rain dance, and pure veg buffet!';
};

// Mock channelManager
const channelManager = require('../src/services/channelManager');
channelManager.sendMessageViaChannel = async (channel, sessionId, customerPhone, text, remoteJid, chat) => {
  spies.sendMessageViaChannelCalls.push({ channel, sessionId, customerPhone, text, remoteJid, chat });
  return true;
};

// Mock followUpService
const followUpService = require('../src/services/followUpService');
followUpService.cancelPendingFollowUps = async (chatId, reason) => {
  spies.cancelPendingFollowUpsCalls.push({ chatId, reason });
  return true;
};
followUpService.scheduleFollowUps = async (chatId, phone) => {
  spies.scheduleFollowUpsCalls.push({ chatId, phone });
  return true;
};

// Mock sockets
const sockets = require('../src/sockets');
sockets.getIO = () => ({
  emit: (event, payload) => {
    spies.socketEmits.push({ event, payload });
  }
});

// Mock activeSockets in whatsappService
const whatsappService = require('../src/services/whatsappService');
whatsappService.activeSockets.set('primary', {
  sock: {
    sendPresenceUpdate: async (type, jid) => {
      spies.presenceUpdates.push({ type, jid });
    }
  }
});

// Load handleMessage with mocked environment
const { handleMessage } = require('../src/services/messageHandler');

// ─────────────────────────────────────────────────────────────────────────────
// TEST RUNNER
// ─────────────────────────────────────────────────────────────────────────────
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    resetSpies();
    inMemoryChats.clear();
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    console.error(err.stack);
    failedTests++;
  }
}

function buildBaileysMsg(phone, text, mediaObj = null) {
  const jid = `${phone}@s.whatsapp.net`;
  const msg = {
    key: { remoteJid: jid, fromMe: false, id: 'MSG_' + Math.random().toString(36).slice(2) },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: 'Customer ' + phone.slice(-4),
    message: {}
  };

  if (mediaObj) {
    Object.assign(msg.message, mediaObj);
  } else {
    msg.message.conversation = text;
  }

  return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────
async function runAllIntegrationTests() {
  console.log('\n' + '═'.repeat(70));
  console.log('🚀 NANDIBAAG RESORT BOT V2: handleMessage() INTEGRATION TESTS');
  console.log('═'.repeat(70) + '\n');

  // 1. INTENTIONAL SILENCE: "27 ko available hai?"
  await runAsyncTest('handleMessage: "27 ko available hai?" triggers silence', async () => {
    const msg = buildBaileysMsg('9988776655', '27 ko available hai?');
    await handleMessage('primary', msg, 'whatsapp-web');

    // Assert zero AI call and zero outbound WhatsApp reply
    assert.strictEqual(spies.getAIResponseCalls.length, 0, 'getAIResponse must NOT be called');
    assert.strictEqual(spies.sendMessageViaChannelCalls.length, 0, 'sendMessageViaChannel must NOT be called');
    assert.strictEqual(spies.cancelPendingFollowUpsCalls.length, 0, 'cancelPendingFollowUps must NOT be called');
    assert.strictEqual(spies.scheduleFollowUpsCalls.length, 0, 'scheduleFollowUps must NOT be called');

    // Assert customer message saved to DB
    const chat = inMemoryChats.get('9988776655');
    assert.ok(chat, 'Chat document must be created/saved');
    assert.strictEqual(chat.messages.length, 1);
    assert.strictEqual(chat.messages[0].sender, 'customer');
    assert.strictEqual(chat.messages[0].text, '27 ko available hai?');

    // Assert socket events: customer message emitted, bot message NOT emitted
    const customerNewMsg = spies.socketEmits.find(e => e.event === 'chat:new_message' && e.payload.sender === 'customer');
    assert.ok(customerNewMsg, 'chat:new_message for customer must be emitted');
    const botNewMsg = spies.socketEmits.find(e => e.event === 'chat:new_message' && e.payload.sender === 'bot');
    assert.strictEqual(botNewMsg, undefined, 'chat:new_message for bot must NOT be emitted');
  });

  // 1b. INTENTIONAL SILENCE WITH EXPLICIT DATE: "27 Sep available hai?"
  await runAsyncTest('handleMessage: "27 Sep available hai?" triggers silence and preserves date in draft', async () => {
    const msg = buildBaileysMsg('9988776656', '27 Sep available hai?');
    await handleMessage('primary', msg, 'whatsapp-web');

    assert.strictEqual(spies.getAIResponseCalls.length, 0, 'getAIResponse must NOT be called');
    assert.strictEqual(spies.sendMessageViaChannelCalls.length, 0, 'sendMessageViaChannel must NOT be called');

    const chat = inMemoryChats.get('9988776656');
    assert.ok(chat, 'Chat document must be created/saved');
    assert.strictEqual(chat.bookingDraft.date, '2026-09-27', 'Date must be extracted and preserved in bookingDraft');
  });

  // 2. INTENTIONAL SILENCE: Standalone "okay"
  await runAsyncTest('handleMessage: "okay" triggers silence', async () => {
    const msg = buildBaileysMsg('9988776654', 'okay');
    await handleMessage('primary', msg, 'whatsapp-web');

    assert.strictEqual(spies.getAIResponseCalls.length, 0);
    assert.strictEqual(spies.sendMessageViaChannelCalls.length, 0);
    assert.strictEqual(spies.cancelPendingFollowUpsCalls.length, 0);

    const chat = inMemoryChats.get('9988776654');
    assert.strictEqual(chat.messages.length, 1);
    assert.strictEqual(chat.messages[0].sender, 'customer');
  });

  // 3. INTENTIONAL SILENCE: Off-topic "India match kab hai?"
  await runAsyncTest('handleMessage: "India match kab hai?" triggers silence', async () => {
    const msg = buildBaileysMsg('9988776653', 'India match kab hai?');
    await handleMessage('primary', msg, 'whatsapp-web');

    assert.strictEqual(spies.getAIResponseCalls.length, 0);
    assert.strictEqual(spies.sendMessageViaChannelCalls.length, 0);

    const chat = inMemoryChats.get('9988776653');
    assert.strictEqual(chat.messages.length, 1);
    assert.strictEqual(chat.messages[0].sender, 'customer');
  });

  // 4. VALID RESORT QUERY: "couple package price?"
  await runAsyncTest('handleMessage: "couple package price?" triggers AI response and sends reply', async () => {
    const msg = buildBaileysMsg('9988776652', 'couple package price?');
    await handleMessage('primary', msg, 'whatsapp-web');

    assert.strictEqual(spies.getAIResponseCalls.length, 1, 'getAIResponse must be called once');
    assert.strictEqual(spies.sendMessageViaChannelCalls.length, 1, 'sendMessageViaChannel must be called once');
    assert.strictEqual(spies.cancelPendingFollowUpsCalls.length, 1, 'cancelPendingFollowUps must be called');
    assert.strictEqual(spies.scheduleFollowUpsCalls.length, 1, 'scheduleFollowUps must be called');

    const chat = inMemoryChats.get('9988776652');
    assert.strictEqual(chat.messages.length, 2, 'Chat should have customer and bot messages');
    assert.strictEqual(chat.messages[0].sender, 'customer');
    assert.strictEqual(chat.messages[1].sender, 'bot');
  });

  // 5. HUMAN / STAFF MODE: Must block AI response even on resort query
  await runAsyncTest('handleMessage: Human mode blocks automated reply', async () => {
    const phone = '9988776651';
    const preExistingChat = createMockChatDoc({ customerPhone: phone, mode: 'human' });
    inMemoryChats.set(phone, preExistingChat);

    const msg = buildBaileysMsg(phone, 'couple package price?');
    await handleMessage('primary', msg, 'whatsapp-web');

    assert.strictEqual(spies.getAIResponseCalls.length, 0, 'AI must NOT be called in human mode');
    assert.strictEqual(spies.sendMessageViaChannelCalls.length, 0, 'No outbound message in human mode');

    const chat = inMemoryChats.get(phone);
    assert.strictEqual(chat.messages.length, 1, 'Customer message must still be saved');
  });

  // 6. MIXED AVAILABILITY: "27 Sep available hai aur couple price kya hai?"
  await runAsyncTest('handleMessage: Mixed query replies with suppressAvailability system note', async () => {
    const msg = buildBaileysMsg('9988776650', '27 Sep available hai aur couple price kya hai?');
    await handleMessage('primary', msg, 'whatsapp-web');

    assert.strictEqual(spies.getAIResponseCalls.length, 1, 'getAIResponse must be called for mixed query');
    assert.strictEqual(spies.sendMessageViaChannelCalls.length, 1, 'sendMessageViaChannel must be called once');

    // Verify system note contained availability suppression
    const callArgs = spies.getAIResponseCalls[0];
    assert.ok(callArgs.systemNotes.includes('AVAILABILITY RESPONSE DISABLED'), 'System note must contain AVAILABILITY RESPONSE DISABLED');

    // Verify outbound reply does NOT confirm availability
    const sentText = spies.sendMessageViaChannelCalls[0].text;
    assert.strictEqual(/room\(s\)\s*available/i.test(sentText), false);
    assert.strictEqual(/rooms\s*are\s*available/i.test(sentText), false);
  });

  // 7. MULTI-TURN CONTEXT PERSISTENCE
  await runAsyncTest('handleMessage: Multi-turn context persistence with intermediate silence', async () => {
    const phone = '9988776649';

    // Turn 1: "29 Sep couple stay"
    await handleMessage('primary', buildBaileysMsg(phone, '29 Sep couple stay'), 'whatsapp-web');
    let chat = inMemoryChats.get(phone);
    assert.ok(chat.bookingDraft.date, 'Check-in date must be in draft');
    assert.strictEqual(chat.bookingDraft.bookingType, 'couple');

    // Turn 2: "available hai?" -> SILENT
    resetSpies();
    await handleMessage('primary', buildBaileysMsg(phone, 'available hai?'), 'whatsapp-web');
    assert.strictEqual(spies.getAIResponseCalls.length, 0, 'Turn 2 must be silent');
    assert.strictEqual(spies.sendMessageViaChannelCalls.length, 0);
    chat = inMemoryChats.get(phone);
    assert.ok(chat.bookingDraft.date, 'Date must remain preserved during silence');

    // Turn 3: Staff sends "Yes available hai."
    chat.messages.push({ sender: 'staff', text: 'Yes available hai.', timestamp: new Date() });

    // Turn 4: Customer asks "total batao"
    resetSpies();
    await handleMessage('primary', buildBaileysMsg(phone, 'total batao'), 'whatsapp-web');
    assert.strictEqual(spies.getAIResponseCalls.length, 1, 'Turn 4 must answer with pricing');
    assert.strictEqual(spies.sendMessageViaChannelCalls.length, 1);
  });

  // 8. MULTI-TURN MEAL OPTION: "Dinner" must not be silenced
  await runAsyncTest('handleMessage: Active booking answer "Dinner" proceeds without silence', async () => {
    const phone = '9988776648';
    const preExistingChat = createMockChatDoc({
      customerPhone: phone,
      bookingStage: 'type_selected',
      bookingDraft: { bookingType: 'picnic', date: '2026-09-28', adults: 4 },
      messages: [
        { sender: 'customer', text: '4 people picnic 28 Sep', timestamp: new Date() },
        { sender: 'bot', text: 'Breakfast to Tea ya Breakfast to Dinner? Kaunsa option pasand hai?', timestamp: new Date() }
      ]
    });
    inMemoryChats.set(phone, preExistingChat);

    await handleMessage('primary', buildBaileysMsg(phone, 'Dinner'), 'whatsapp-web');

    assert.strictEqual(spies.getAIResponseCalls.length, 1, 'AI must respond to "Dinner"');
    assert.strictEqual(spies.sendMessageViaChannelCalls.length, 1, 'Reply must be sent');
  });

  // 9. MEDIA HANDLING: Uncaptioned sticker remains silent
  await runAsyncTest('handleMessage: Uncaptioned sticker remains silent', async () => {
    const msg = buildBaileysMsg('9988776647', '', { stickerMessage: { url: 'https://media.sticker.webp' } });
    await handleMessage('primary', msg, 'whatsapp-web');

    assert.strictEqual(spies.getAIResponseCalls.length, 0, 'AI must NOT be called for uncaptioned sticker');
    assert.strictEqual(spies.sendMessageViaChannelCalls.length, 0, 'No outbound WhatsApp message');

    const chat = inMemoryChats.get('9988776647');
    assert.strictEqual(chat.messages.length, 1);
    assert.strictEqual(chat.messages[0].messageType, 'sticker');
    assert.strictEqual(chat.messages[0].text, '[STICKER]');
  });

  console.log('\n' + '═'.repeat(70));
  console.log(`INTEGRATION TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('═'.repeat(70) + '\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllIntegrationTests();
