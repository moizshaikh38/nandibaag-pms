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

  // Shape 2: Fast2SMS simple / WhatsApp Business API — flat or nested objects
  const direct = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const from = direct.from || direct.number || direct.sender || direct.phone || direct.wa_id || direct.mobile || direct.mobile_no || direct.customer_phone || direct.sender_number || direct.contact || (Array.isArray(direct.contacts) ? direct.contacts[0]?.wa_id : null) || null;
  let body =
    (typeof direct.text?.body === 'string' && direct.text.body) ||
    (typeof direct.text === 'string' && direct.text) ||
    (typeof direct.message?.text === 'string' && direct.message.text) ||
    (typeof direct.message === 'string' && direct.message) ||
    (typeof direct.body === 'string' && direct.body) ||
    (typeof direct.content === 'string' && direct.content) ||
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
 * Handshake & health check endpoint for Fast2SMS / Meta Cloud API webhook verification.
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'] || req.query.mode;
  const token = req.query['hub.verify_token'] || req.query.verify_token;
  const challenge = req.query['hub.challenge'] || req.query.challenge;

  console.log('[Fast2SMS:Webhook] 🔍 GET verification request received:', { mode, token, challenge });

  // 1. Meta / Fast2SMS challenge-response handshake
  if (challenge) {
    console.log('[Fast2SMS:Webhook] ✓ Responding to hub.challenge verification request');
    return res.status(200).send(challenge);
  }

  // 2. Standard status ping
  res.status(200).json({
    status: 'online',
    channel: 'fast2sms',
    message: 'Fast2SMS Webhook endpoint is active and ready to receive incoming messages.'
  });
});

const { isBotReplyFingerprint } = require('../services/messageHandler');

/** Check if text content matches an exact outgoing bot reply fingerprint */
function isBotReply(text) {
  if (!text || typeof text !== 'string') return false;
  return isBotReplyFingerprint(text);
}

/**
 * POST /api/fast2sms/webhook
 * Receives incoming WhatsApp messages & test probes from Fast2SMS.
 * Always acknowledges quickly with HTTP 200 OK so Fast2SMS dashboard test probes pass.
 */
router.post('/webhook', async (req, res) => {
  const env = require('../config/env');
  if (!env.fast2smsEnabled) {
    console.log('[Fast2SMS:Webhook] ⚠️ Fast2SMS channel is disabled (FAST2SMS_ENABLED=false) — dropping incoming webhook.');
    return res.status(200).json({ success: true, status: 'disabled' });
  }

  console.log('[Fast2SMS:Webhook] Incoming webhook payload:', JSON.stringify(req.body).slice(0, 300));
  
  // Ignore status updates if explicit status update payload
  const webhookType = req.body?.webhook_type;
  const status = req.body?.status;
  if (webhookType === 'status_update' || status === 'sent' || status === 'delivered' || status === 'read') {
    console.log('[Fast2SMS:Webhook] ⏭️ Ignoring status update event');
    return res.status(200).json({ status: 'ignored_status' });
  }

  // Extract from and body using robust multi-format extractor
  const extracted = extractIncomingMessage(req.body);
  const from = extracted?.from || req.body?.from || req.body?.number || req.body?.sender;
  const messageText = extracted?.body || req.body?.body || req.body?.message || req.body?.text;

  if (!messageText || !from) {
    console.log('[Fast2SMS:Webhook] ⏭️ Missing message text or sender in payload');
    return res.status(200).json({ status: 'ignored_empty' });
  }

  // Ignore bot echo if outgoing message text
  if (isBotReply(messageText)) {
    console.log('[Fast2SMS:Webhook] 🛑 Ignoring bot reply echo');
    return res.status(200).json({ status: 'ignored_bot_echo' });
  }

  console.log('[Fast2SMS:Webhook] ✅ Genuine customer message detected');
  console.log('[Fast2SMS:Webhook] From:', from);
  console.log('[Fast2SMS:Webhook] Message:', String(messageText).slice(0, 80));

  const chatId = normalizeToChatId(from);
  if (!chatId) {
    console.log(`[Fast2SMS:Webhook] ⚠️ Invalid sender number format: "${from}"`);
    return res.status(200).json({ status: 'invalid_number' });
  }

  const message = { from: chatId, body: String(messageText) };

  // Route to message handling pipeline
  channelManager.routeIncomingMessage(message, 'fast2sms').catch((error) => {
    logger.error(`[Fast2SMS:Webhook] Pipeline error: ${error.message}`);
  });

  // Always respond quickly to Fast2SMS
  res.status(200).json({ status: 'ok' });
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
