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
  if (channel === 'fast2sms') {
    const success = await fast2smsService.sendMessage(chatId, text);
    if (success) return true;
    console.log(`[ChannelManager] Fast2SMS send failed or not configured for ${chatId}. Attempting WhatsApp Web (Baileys) fallback...`);
  }
  // default / fallback to whatsapp-web
  return await whatsappService.sendMessage(sessionId, chatId, text);
}

module.exports = {
  routeIncomingMessage,
  sendMessageViaChannel
};
