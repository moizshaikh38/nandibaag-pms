/**
 * Channel Manager — routes incoming messages and outgoing replies to the
 * correct messaging channel so AI/Human mode, chat history, and booking
 * logic behave IDENTICALLY regardless of which channel a message came from.
 *
 * Channels:
 *   - 'whatsapp-web' — existing Baileys linked-device integration
 *   - 'fast2sms'     — Fast2SMS WhatsApp Business API (additional channel)
 */

const fast2smsService = require('./fast2smsService');
const whatsappService = require('./whatsappService');

/**
 * Route an incoming message into the shared message-processing pipeline.
 *
 * @param {{from: string, body: string}} message
 *        from — chatId format (e.g. "919876543210@s.whatsapp.net")
 *        body — message text
 * @param {'whatsapp-web' | 'fast2sms'} channel
 */
async function routeIncomingMessage(message, channel) {
  console.log(`[ChannelManager] channel=${channel} from=${message?.from}`);

  if (global.messageHandlerCallback) {
    await global.messageHandlerCallback(message, channel);
    return;
  }

  // Fallback: wire to messageHandler directly if callback isn't registered yet
  const { handleIncomingMessage } = require('./messageHandler');
  await handleIncomingMessage(message, channel);
}

/**
 * Send a message back to the customer across all available WhatsApp channels.
 * 
 * Baileys and Fast2SMS WhatsApp are TWO INDEPENDENT WhatsApp channels:
 * 1. If Baileys is connected -> Send through Baileys.
 * 2. If Fast2SMS WhatsApp is configured -> Send through Fast2SMS WhatsApp.
 * 3. If BOTH are connected -> Send through BOTH channels independently.
 * 4. If ONLY Baileys is connected -> Send through Baileys only.
 * 5. If ONLY Fast2SMS WhatsApp is connected -> Send through Fast2SMS WhatsApp only.
 * 6. If neither is connected -> Return false / queue; NEVER send normal cellular SMS.
 * 
 * @param {string} chatId  chatId format (e.g. "919876543210@s.whatsapp.net" or raw number)
 * @param {string} text
 * @param {'whatsapp-web' | 'fast2sms'} [channel]
 * @param {string} [sessionId] Baileys session id — default 'primary' / 'resort_primary'
 * @returns {Promise<boolean>} true if at least one WhatsApp channel succeeded
 */
async function sendMessageViaChannel(chatId, text, channel, sessionId = 'resort_primary') {
  const finalText = (text || '')
    .replace(/\\n\\n/g, '\n\n')
    .replace(/\\n/g, '\n')
    .trim();

  console.log('[Send:Attempt]', {
    to: chatId,
    channel: channel || 'all',
    text: finalText.slice(0, 50)
  });

  const results = {
    baileys: false,
    fast2sms: false
  };

  // ── 1. Baileys WhatsApp Channel ─────────────────────────────────────
  const targetSessionStatus = whatsappService.getSessionStatus(sessionId);
  const allStatuses = whatsappService.getAllSessionsStatus();
  const isBaileysConnected = targetSessionStatus === 'connected' || Object.values(allStatuses).some(s => s === 'connected');

  if (isBaileysConnected) {
    console.log(`[Send:Baileys] Attempting send to ${chatId} (sessionId: ${sessionId})...`);
    try {
      const baileysSent = await whatsappService.sendMessage(sessionId, chatId, finalText);
      if (baileysSent) {
        console.log(`[Send:Baileys] ✅ Success for ${chatId}`);
        results.baileys = true;
      } else {
        console.log(`[Send:Baileys] ❌ Failed/Queued for ${chatId}`);
      }
    } catch (baileysErr) {
      console.error(`[Send:Baileys] ❌ Error: ${baileysErr.message}`);
    }
  } else {
    console.log(`[Send:Baileys] ⏭️ Skipped live send (Baileys not connected), queueing message...`);
    try {
      if (typeof whatsappService.queueMessage === 'function') {
        await whatsappService.queueMessage(sessionId, chatId, finalText);
        console.log(`[Send:Baileys] 📥 Message queued for delivery on reconnection for ${chatId}`);
      }
    } catch (qErr) {
      console.warn(`[Send:Baileys] Error queueing message: ${qErr.message}`);
    }
  }

  // ── 2. Fast2SMS WhatsApp Channel (Independent) ─────────────────────
  const env = require('../config/env');
  const isFast2SmsAvailable = env.fast2smsEnabled && fast2smsService.getStatus() === 'connected';

  if (isFast2SmsAvailable) {
    console.log(`[Send:Fast2SMS:WhatsApp] Attempting send to ${chatId}...`);
    try {
      const fast2smsSent = await fast2smsService.sendMessage(chatId, finalText);
      if (fast2smsSent) {
        console.log(`[Send:Fast2SMS:WhatsApp] ✅ Success for ${chatId}`);
        results.fast2sms = true;
      } else {
        console.log(`[Send:Fast2SMS:WhatsApp] ❌ Failed for ${chatId}`);
      }
    } catch (fast2smsErr) {
      console.error(`[Send:Fast2SMS:WhatsApp] ❌ Error: ${fast2smsErr.message}`);
    }
  } else {
    console.log(`[Send:Fast2SMS:WhatsApp] ⏭️ Skipped (Fast2SMS not enabled/configured)`);
  }

  const atLeastOneSuccess = results.baileys || results.fast2sms;
  console.log(`[Send:Summary] to=${chatId} baileys=${results.baileys} fast2sms=${results.fast2sms} overall=${atLeastOneSuccess}`);

  return atLeastOneSuccess;
}

module.exports = {
  routeIncomingMessage,
  sendMessageViaChannel
};
