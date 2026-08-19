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
 * Send a message back to the customer via the correct channel.
 *
 * @param {string} chatId  chatId format (e.g. "919876543210@s.whatsapp.net" or raw number)
 * @param {string} text
 * @param {'whatsapp-web' | 'fast2sms'} channel
 * @param {string} [sessionId] Baileys session id — only used by whatsapp-web
 */
async function sendMessageViaChannel(chatId, text, channel, sessionId = 'primary') {
  const finalText = (text || '')
    .replace(/\\n\\n/g, '\n\n')
    .replace(/\\n/g, '\n')
    .trim();

  console.log('[Send:Attempt]', {
    to: chatId,
    channel,
    text: finalText.slice(0, 50)
  });

  console.log('[Send:DEBUG] Character breakdown:');
  console.log('Text length:', finalText.length);
  console.log('Newline count:', (finalText.match(/\n/g) || []).length);
  console.log('First 200 chars:\n' + finalText.substring(0, 200));

  try {
    let success = false;

    // Check if the requested Baileys session or any Baileys session is connected using whatsappService helpers
    const targetSessionStatus = whatsappService.getSessionStatus(sessionId);
    const allStatuses = whatsappService.getAllSessionsStatus();
    const isBaileysConnected = targetSessionStatus === 'connected' || Object.values(allStatuses).some(s => s === 'connected');

    // 1. WhatsApp-First: If a connected Baileys session exists or whatsapp-web is requested, use Baileys
    if (isBaileysConnected || channel === 'whatsapp-web') {
      success = await whatsappService.sendMessage(sessionId, chatId, finalText);
      if (success) {
        console.log('[Send:SUCCESS] WhatsApp Web (Baileys) message sent');
        return true;
      }
      console.log(`[ChannelManager] WhatsApp Web (Baileys) send returned false for ${chatId}. Checking Fast2SMS WhatsApp...`);
    }

    // 2. Fallback to Fast2SMS WhatsApp API only if Baileys was unavailable/failed and channel is fast2sms
    if (!success && channel === 'fast2sms') {
      success = await fast2smsService.sendMessage(chatId, finalText);
      if (success) {
        console.log('[Send:SUCCESS] Fast2SMS WhatsApp message sent');
        return true;
      }
      console.log(`[ChannelManager] Fast2SMS WhatsApp send failed for ${chatId}.`);
    }

    return success;
  } catch (error) {
    console.error('[Send:FAILED] Error:', error.message);
    return false;
  }
}

module.exports = {
  routeIncomingMessage,
  sendMessageViaChannel
};
