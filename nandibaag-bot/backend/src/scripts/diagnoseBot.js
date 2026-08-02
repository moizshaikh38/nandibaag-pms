#!/usr/bin/env node
/**
 * End-to-end WhatsApp Bot Pipeline Diagnostic
 * Tests: DB → Settings → API Keys → AI Response → Send Channel → Delivery
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️';
const results = [];

function log(status, category, detail) {
  results.push({ status, category, detail });
  console.log(`  ${status} [${category}] ${detail}`);
}

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  NANDIBAAG BOT — FULL PIPELINE DIAGNOSTIC                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── 1. DATABASE ────────────────────────────────────────────────────
  console.log('─── 1. DATABASE CONNECTION ───');
  try {
    await mongoose.connect(mongoUri);
    log(PASS, 'DB', 'MongoDB Atlas connected');
  } catch (err) {
    log(FAIL, 'DB', `MongoDB connection FAILED: ${err.message}`);
    process.exit(1);
  }

  // ── 2. SETTINGS ────────────────────────────────────────────────────
  console.log('\n─── 2. SETTINGS & MODE ───');
  const Settings = require('../models/Settings');
  const settings = await Settings.findOne();
  if (!settings) {
    log(FAIL, 'Settings', 'No Settings document found in DB!');
  } else {
    log(settings.globalMode === 'ai' ? PASS : FAIL, 'Settings',
      `globalMode = "${settings.globalMode}" ${settings.globalMode !== 'ai' ? '← MUST be "ai" for bot to reply!' : ''}`);

    const numbers = settings.whatsappNumbers || [];
    log(numbers.length > 0 ? PASS : WARN, 'Settings',
      `${numbers.length} WhatsApp number(s) registered`);
    numbers.forEach(n => {
      log(n.status === 'connected' ? PASS : WARN, 'WhatsApp',
        `${n.label || n.number}: status="${n.status}", active=${n.isActive}`);
    });
  }

  // ── 3. API KEYS ────────────────────────────────────────────────────
  console.log('\n─── 3. AI API KEYS ───');
  const env = require('../config/env');
  const hasOpenRouter = !!(env.openrouterApiKey || process.env.OPENROUTER_API_KEY);
  const hasGroq = !!(env.groqApiKey || process.env.GROQ_API_KEY);
  const hasGemini = !!(env.geminiApiKey || process.env.GEMINI_API_KEY);

  log(hasOpenRouter ? PASS : FAIL, 'API Key', `OPENROUTER_API_KEY: ${hasOpenRouter ? 'SET' : 'MISSING'}`);
  log(hasGroq ? PASS : WARN, 'API Key', `GROQ_API_KEY: ${hasGroq ? 'SET' : 'MISSING (secondary fallback)'}`);
  log(hasGemini ? PASS : WARN, 'API Key', `GEMINI_API_KEY: ${hasGemini ? 'SET' : 'MISSING (optional)'}`);

  if (!hasOpenRouter && !hasGroq && !hasGemini) {
    log(FAIL, 'API Key', 'NO LLM API keys configured! Bot will use static rule-based fallback only.');
  }

  // ── 4. TEST AI RESPONSE GENERATION ─────────────────────────────────
  console.log('\n─── 4. AI RESPONSE GENERATION TEST ───');
  try {
    const { getAIResponse } = require('../services/aiService');
    const Chat = require('../models/Chat');

    // Create a minimal test chat object
    const testChat = {
      customerPhone: '919999999999',
      language: 'hinglish',
      bookingStage: 'none',
      bookingDraft: { kids: [] },
      messages: [{ sender: 'customer', text: 'Hi' }]
    };

    const t0 = Date.now();
    const reply = await getAIResponse(testChat, 'Couple stay ka rate kya hai', settings);
    const latency = Date.now() - t0;

    if (reply && reply.trim().length > 5) {
      log(PASS, 'AI Reply', `Generated in ${latency}ms: "${reply.substring(0, 80)}..."`);
    } else {
      log(FAIL, 'AI Reply', `Empty or invalid reply: "${reply}"`);
    }
  } catch (err) {
    log(FAIL, 'AI Reply', `getAIResponse threw error: ${err.message}`);
  }

  // ── 5. FAST2SMS CHANNEL ────────────────────────────────────────────
  console.log('\n─── 5. FAST2SMS CHANNEL ───');
  try {
    const fast2sms = require('../services/fast2smsService');
    const status = fast2sms.getStatus();
    log(status === 'connected' ? PASS : WARN, 'Fast2SMS',
      `Service status: "${status}" ${status !== 'connected' ? '(webhook receives msgs but CANNOT send replies via Fast2SMS API)' : ''}`);
    log(fast2sms.apiKey ? PASS : WARN, 'Fast2SMS', `API Key: ${fast2sms.apiKey ? 'SET' : 'MISSING'}`);
    log(fast2sms.webhookSecret ? PASS : WARN, 'Fast2SMS',
      `Webhook Secret: ${fast2sms.webhookSecret ? 'SET' : 'NOT SET (webhook is open to anyone!)'}`);
  } catch (err) {
    log(WARN, 'Fast2SMS', `Could not load fast2smsService: ${err.message}`);
  }

  // ── 6. BAILEYS (WHATSAPP WEB) CHANNEL ──────────────────────────────
  console.log('\n─── 6. BAILEYS (WHATSAPP WEB) SESSION ───');
  try {
    const ws = require('../services/whatsappService');
    const activeCount = ws.activeSockets ? ws.activeSockets.size : 0;
    log(activeCount > 0 ? PASS : WARN, 'Baileys',
      `${activeCount} active socket(s) in memory ${activeCount === 0 ? '(no live WhatsApp Web connection — replies will be QUEUED)' : ''}`);

    if (activeCount > 0) {
      for (const [sid, entry] of ws.activeSockets.entries()) {
        const connected = !!(entry?.sock?.user?.id);
        log(connected ? PASS : WARN, 'Baileys',
          `Session "${sid}": ${connected ? 'CONNECTED (JID: ' + entry.sock.user.id + ')' : 'socket exists but NOT authenticated'}`);
      }
    }
  } catch (err) {
    log(WARN, 'Baileys', `Could not inspect whatsappService: ${err.message}`);
  }

  // ── 7. CHANNEL MANAGER FALLBACK ────────────────────────────────────
  console.log('\n─── 7. CHANNEL MANAGER SEND PATH ───');
  try {
    const cm = require('../services/channelManager');
    const cmSource = require('fs').readFileSync(
      path.join(__dirname, '../services/channelManager.js'), 'utf8'
    );
    const hasFallback = cmSource.includes('Attempting WhatsApp Web') || cmSource.includes('fallback');
    log(hasFallback ? PASS : FAIL, 'ChannelMgr',
      `Fast2SMS → Baileys fallback: ${hasFallback ? 'ENABLED' : 'MISSING (if Fast2SMS fails, message is LOST!)'}`);
  } catch (err) {
    log(WARN, 'ChannelMgr', `Could not inspect channelManager: ${err.message}`);
  }

  // ── 8. RECENT CHATS & DELIVERY STATUS ──────────────────────────────
  console.log('\n─── 8. RECENT CHATS & MESSAGE DELIVERY ───');
  const Chat = require('../models/Chat');
  const recentChats = await Chat.find({ isArchived: false }).sort({ lastMessageAt: -1 }).limit(5);
  log(recentChats.length > 0 ? PASS : WARN, 'Chats', `${recentChats.length} active chat(s) found`);

  let humanModeCount = 0;
  let failedDeliveryCount = 0;
  let pendingDeliveryCount = 0;
  let noReplyCount = 0;

  for (const chat of recentChats) {
    if (chat.mode === 'human') humanModeCount++;

    const msgs = chat.messages || [];
    const lastCustomerMsg = [...msgs].reverse().find(m => m.sender === 'customer');
    const lastBotMsg = [...msgs].reverse().find(m => m.sender === 'bot');

    // Check if customer sent a message but bot never replied
    if (lastCustomerMsg && (!lastBotMsg || new Date(lastBotMsg.timestamp) < new Date(lastCustomerMsg.timestamp))) {
      if (chat.mode === 'ai') noReplyCount++;
    }

    // Check delivery statuses
    msgs.filter(m => m.sender === 'bot').forEach(m => {
      if (m.deliveryStatus === 'queued' || m.deliveryStatus === 'failed') failedDeliveryCount++;
      if (m.deliveryStatus === 'pending') pendingDeliveryCount++;
    });

    const lastMsg = msgs[msgs.length - 1];
    console.log(`    ${chat.customerPhone} | mode=${chat.mode} | stage=${chat.bookingStage} | last=[${lastMsg?.sender}] "${(lastMsg?.text || '').substring(0, 50)}" (delivery: ${lastMsg?.deliveryStatus || 'n/a'})`);
  }

  if (humanModeCount > 0) {
    log(WARN, 'Chats', `${humanModeCount} chat(s) in HUMAN mode — AI will NOT reply to these!`);
  }
  if (noReplyCount > 0) {
    log(FAIL, 'Chats', `${noReplyCount} AI-mode chat(s) where customer sent a message but bot has NOT replied!`);
  }
  if (failedDeliveryCount > 0) {
    log(FAIL, 'Delivery', `${failedDeliveryCount} bot message(s) with delivery status "queued" or "failed"!`);
  }
  if (pendingDeliveryCount > 0) {
    log(WARN, 'Delivery', `${pendingDeliveryCount} bot message(s) still "pending" (may not have been sent to WhatsApp)`);
  }

  // ── 9. MESSAGE QUEUE (UNSENT MESSAGES) ──────────────────────────────
  console.log('\n─── 9. OFFLINE MESSAGE QUEUE ───');
  try {
    const { MessageQueue } = require('../models');
    const pendingQueue = await MessageQueue.countDocuments({ status: 'pending' });
    const failedQueue = await MessageQueue.countDocuments({ status: 'failed' });
    log(pendingQueue === 0 ? PASS : WARN, 'Queue', `${pendingQueue} pending message(s) in offline queue`);
    log(failedQueue === 0 ? PASS : FAIL, 'Queue', `${failedQueue} permanently failed message(s) in queue`);
  } catch (err) {
    log(WARN, 'Queue', `MessageQueue model not found: ${err.message}`);
  }

  // ── 10. CIRCULAR DEPENDENCY CHECK ──────────────────────────────────
  console.log('\n─── 10. MODULE HEALTH ───');
  try {
    const mh = require('../services/messageHandler');
    log(typeof mh.handleMessage === 'function' ? PASS : FAIL, 'Module', 'messageHandler.handleMessage: OK');
    log(typeof mh.handleIncomingMessage === 'function' ? PASS : FAIL, 'Module', 'messageHandler.handleIncomingMessage: OK');
  } catch (err) {
    log(FAIL, 'Module', `messageHandler failed to load: ${err.message}`);
  }

  try {
    const ai = require('../services/aiService');
    log(typeof ai.getAIResponse === 'function' ? PASS : FAIL, 'Module', 'aiService.getAIResponse: OK');
  } catch (err) {
    log(FAIL, 'Module', `aiService failed to load: ${err.message}`);
  }

  // ── SUMMARY ────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  DIAGNOSTIC SUMMARY                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  const failures = results.filter(r => r.status === FAIL);
  const warnings = results.filter(r => r.status === WARN);
  const passes = results.filter(r => r.status === PASS);

  console.log(`\n  ${PASS} ${passes.length} passed`);
  console.log(`  ${WARN} ${warnings.length} warning(s)`);
  console.log(`  ${FAIL} ${failures.length} failure(s)`);

  if (failures.length > 0) {
    console.log('\n  ── FAILURES (must fix) ──');
    failures.forEach(f => console.log(`    ${FAIL} [${f.category}] ${f.detail}`));
  }
  if (warnings.length > 0) {
    console.log('\n  ── WARNINGS ──');
    warnings.forEach(w => console.log(`    ${WARN} [${w.category}] ${w.detail}`));
  }

  console.log('');
  await mongoose.disconnect();
}

run().catch(err => { console.error('Diagnostic crashed:', err); process.exit(1); });
