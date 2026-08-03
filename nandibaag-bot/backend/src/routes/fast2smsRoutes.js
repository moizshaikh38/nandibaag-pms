/**
 * Fast2SMS webhook routes — receives INCOMING WhatsApp messages pushed by
 * Fast2SMS and funnels them into the shared message-processing pipeline.
 *
 * Fast2SMS webhook payload formats vary (Meta Cloud API shape vs Fast2SMS
 * simple shape), so parsing is defensive: it tries several known shapes and
 * always logs the full payload for debugging.
 */

const express = require('express');
const crypto = require('crypto');
const fast2smsService = require('../services/fast2smsService');
const channelManager = require('../services/channelManager');
const logger = require('../config/logger');

const router = express.Router();

/** Normalize any sender number to the internal chatId format: 91XXXXXXXXXX@s.whatsapp.net */
function normalizeToChatId(number) {
  let digits = String(number || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;
  // 12+ digits not starting with 91: assume it already has a country code —
  // keep as-is (Indian numbers normally come in as 10 or 12 digits).
  if (digits.length < 10) return null;
  return `${digits}@s.whatsapp.net`;
}

/**
 * Extract { from, body } from a Fast2SMS incoming webhook payload.
 * Tries the Meta Cloud API shape and the Fast2SMS simple shape.
 */
function extractIncomingMessage(payload) {
  if (!payload || typeof payload !== 'object') return null;

  // Shape 1: Meta Cloud API — entry[].changes[].value.messages[]
  try {
    const entries = payload.entry || payload.data?.entry;
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        for (const change of entry.changes || []) {
          const value = change.value || change;
          const messages = value.messages || value.message;
          const msgList = Array.isArray(messages) ? messages : (messages ? [messages] : []);
          for (const msg of msgList) {
            const from = msg.from || msg.from_me || msg.number || msg.phone;
            const text =
              msg.text?.body || msg.text || msg.message || msg.body || msg.content || null;
            if (from && text && typeof text === 'string') {
              return { from: String(from), body: text };
            }
          }
        }
      }
    }
  } catch (e) {
    logger.debug(`[Fast2SMS] Meta-shape parse error: ${e.message}`);
  }

  // Shape 2: Fast2SMS simple — flat { number, text } / { from, message }
  const direct = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const from = direct.from || direct.number || direct.sender || direct.phone || direct.wa_id || null;
  let body =
    (typeof direct.text === 'string' && direct.text) ||
    direct.message ||
    direct.body ||
    direct.content ||
    null;
  if (typeof body !== 'string') body = null;
  if (from && body && typeof body === 'string') {
    return { from: String(from), body };
  }

  return null;
}

/** Check webhook authenticity using FAST2SMS_WEBHOOK_SECRET (best effort). */
function isAuthorized(req) {
  const secret = fast2smsService.webhookSecret;
  if (!secret) return true; // verification disabled — accept (logged at init)

  const provided =
    req.headers['x-webhook-secret'] ||
    req.headers['x-fast2sms-secret'] ||
    req.headers['x-signature'] ||
    req.query.secret ||
    '';
  if (!provided) return false;

  const a = Buffer.from(String(provided));
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * GET /api/fast2sms/webhook
 * Health check & verification endpoint for Fast2SMS webhook URL.
 */
router.get('/webhook', (req, res) => {
  const challenge = req.query['hub.challenge'] || req.query.challenge;
  if (challenge) {
    return res.status(200).send(challenge);
  }
  res.json({
    status: 'online',
    channel: 'fast2sms',
    message: 'Fast2SMS Webhook endpoint is active and ready to receive incoming messages.'
  });
});

/**
 * POST /api/fast2sms/webhook
 * Receives incoming WhatsApp messages from Fast2SMS.
 * Acknowledges quickly (200) since webhook senders expect fast acks;
 * processing continues in the shared pipeline.
 */
router.post('/webhook', async (req, res) => {
  const payload = req.body;
  console.log(`[Fast2SMS:Webhook] ⬇️ Incoming webhook hit at ${new Date().toISOString()}`);
  console.log(`[Fast2SMS:Webhook] Full payload: ${JSON.stringify(payload)}`);

  if (!isAuthorized(req)) {
    console.log('[Fast2SMS:Webhook] ❌ Webhook signature/secret mismatch — rejecting.');
    return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
  }

  const parsed = extractIncomingMessage(payload);
  if (!parsed || !parsed.from || !parsed.body) {
    console.log('[Fast2SMS:Webhook] ⚠️ Could not parse sender/text from payload — acknowledging.');
    return res.status(200).json({ success: true, message: 'acknowledged' });
  }

  const chatId = normalizeToChatId(parsed.from);
  if (!chatId) {
    console.log(`[Fast2SMS:Webhook] ⚠️ Sender number invalid: "${parsed.from}" — acknowledging.`);
    return res.status(200).json({ success: true, message: 'acknowledged' });
  }
  const message = { from: chatId, body: parsed.body };

  console.log(`[Fast2SMS:Webhook] ✅ Parsed message from=${chatId} body="${parsed.body.slice(0, 80)}"`);

  // Fire-and-forget the pipeline so we ACK fast (AI generation can take
  // 5-15s; Fast2SMS expects a quick 200 to avoid retries / duplicate sends).
  channelManager.routeIncomingMessage(message, 'fast2sms').catch((error) => {
    logger.error(`[Fast2SMS:Webhook] Pipeline error: ${error.message}`);
  });

  // Always ack fast
  res.status(200).json({ success: true, message: 'ok' });
});

/**
 * GET /api/fast2sms/status
 * Returns Fast2SMS channel status (for dashboard / debugging).
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    channel: 'fast2sms',
    status: fast2smsService.getStatus(),
    senderNumbers: fast2smsService.senderNumbers,
    webhookSecretConfigured: Boolean(fast2smsService.webhookSecret)
  });
});

module.exports = router;
