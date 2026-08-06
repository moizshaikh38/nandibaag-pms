/**
 * Fast2SMS WhatsApp Business API service.
 *
 * ADDITIONAL messaging channel that runs in PARALLEL with the existing
 * WhatsApp Web (Baileys) integration. This service is purely additive —
 * it never touches the Baileys flow.
 *
 * Discovered API details (Phase 0 research):
 *   - Send free-form text: POST {FAST2SMS_API_URL}  (default https://www.fast2sms.com/dev/whatsapp-session)
 *   - Auth: Authorization header with the raw API key (docs.fast2sms.com/reference/authorization)
 *   - Query params: to (recipient with country code), phone_number_id (sender number's ID)
 *   - Body: { "type": "text", "text": "..." }
 *   - Webhooks: supported (up to 10 endpoints per account)
 *   - Multi-number: supported via phone_number_id per request
 *
 * If FAST2SMS_API_KEY is missing the service is inert: it logs a warning,
 * reports 'not_configured', and never crashes the server.
 */

const env = require('../config/env');
const logger = require('../config/logger');

const MAX_MESSAGE_LENGTH = 4096; // WhatsApp Cloud API text message limit

class Fast2SmsService {
  constructor() {
    this.apiKey = (env.fast2smsApiKey || '').trim();
    this.apiUrl = (env.fast2smsApiUrl || 'https://www.fast2sms.com/dev/whatsapp-session').trim();
    this.senderNumbers = String(env.fast2smsSenderNumbers || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // The Meta-style phone number ID (different from the phone number itself).
    // Fast2SMS shows it in the dashboard (Get Phone Numbers API). Optional
    // override — without it we fall back to the first sender number.
    this.phoneNumberId = String(env.fast2smsPhoneNumberId || '').trim();
    this.webhookSecret = (env.fast2smsWebhookSecret || '').trim();
    this.configured = false;
    this.initializedAt = null;
  }

  /**
   * Validates API key presence and logs ready status.
   * Safe to call on every server start — never throws.
   */
  initialize() {
    if (!this.apiKey) {
      this.configured = false;
      console.log('[Fast2SMS] ⚠️ FAST2SMS_API_KEY is not set — Fast2SMS channel is INERT (not_configured). Server continues normally.');
      return { status: 'not_configured', message: 'FAST2SMS_API_KEY missing' };
    }

    this.configured = true;
    this.initializedAt = new Date();
    console.log('[Fast2SMS] ✅ Service initialized.');
    console.log(`[Fast2SMS]    API URL: ${this.apiUrl}`);
    console.log(`[Fast2SMS]    Sender numbers: ${this.senderNumbers.length ? this.senderNumbers.join(', ') : '(none configured)'}`);
    console.log(`[Fast2SMS]    phone_number_id: ${this.phoneNumberId || this.senderNumbers[0] || '(none)'}`);
    console.log(`[Fast2SMS]    Webhook secret: ${this.webhookSecret ? 'configured' : 'not set (webhook verification disabled)'}`);
    return { status: 'connected', message: 'Fast2SMS ready' };
  }

  /**
   * @returns {'connected' | 'not_configured'}
   */
  getStatus() {
    return this.configured ? 'connected' : 'not_configured';
  }

  /**
   * Normalize a recipient to E.164 digits without '+'.
   * Accepts "919876543210", "+91 98765 43210", "9876543210", "919876543210@s.whatsapp.net".
   */
  normalizeNumber(to) {
    if (!to) return '';
    let digits = String(to).replace(/\D/g, '');
    if (digits.length === 10) digits = `91${digits}`; // assume India
    return digits;
  }

  /**
   * Send a plain text WhatsApp message via Fast2SMS.
   *
   * @param {string} to   Recipient phone (any reasonable format)
   * @param {string} text Message body (truncated to MAX_MESSAGE_LENGTH)
   * @returns {Promise<boolean>} true on success, false on any failure
   */
  async sendMessage(to, text) {
    if (!this.configured) {
      console.log(`[Fast2SMS] ⚠️ sendMessage ignored (not configured) for ${to}`);
      return false;
    }

    const number = this.normalizeNumber(to);
    if (!number || number.length < 11) {
      console.log(`[Fast2SMS] ❌ Invalid recipient number: ${to}`);
      return false;
    }

    const cleanedText = (text || '')
      .replace(/\\n\\n/g, '\n\n')
      .replace(/\\n/g, '\n');

    const truncatedText = cleanedText.length > MAX_MESSAGE_LENGTH
      ? `${cleanedText.slice(0, MAX_MESSAGE_LENGTH)}…`
      : cleanedText;

    // Fast2SMS requires phone_number_id (the sender's Meta phone number ID).
    // Prefer the explicit FAST2SMS_PHONE_NUMBER_ID; otherwise fall back to the
    // first configured sender number with a warning.
    let phoneNumberId = this.phoneNumberId || this.senderNumbers[0] || '';
    if (!this.phoneNumberId && this.senderNumbers[0]) {
      console.log('[Fast2SMS] ⚠️ FAST2SMS_PHONE_NUMBER_ID not set — using sender number as phone_number_id. Set FAST2SMS_PHONE_NUMBER_ID (Meta phone number ID from Fast2SMS dashboard) if sends fail.');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Fast2SMS:Send] Request sent');
    console.log(`[Fast2SMS:Send]   To: ${number}`);
    console.log(`[Fast2SMS:Send]   Text length: ${truncatedText.length}`);
    console.log(`[Fast2SMS:Send]   URL: ${this.apiUrl}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      const url = new URL(this.apiUrl);
      url.searchParams.set('to', number);
      if (phoneNumberId) {
        url.searchParams.set('phone_number_id', phoneNumberId);
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'text', text: truncatedText })
      });

      const responseBody = await response.text();
      console.log('[Fast2SMS:Send] Response received');
      console.log(`[Fast2SMS:Send]   HTTP status: ${response.status}`);
      console.log(`[Fast2SMS:Send]   Body: ${responseBody.slice(0, 500)}`);

      if (response.ok) {
        console.log(`[Fast2SMS] ✅ Message sent successfully to ${number}`);
        return true;
      }

      console.log(`[Fast2SMS] ❌ Fast2SMS API returned status ${response.status} for ${number}`);
      return false;
    } catch (error) {
      console.error(`[Fast2SMS] ❌ Error sending message to ${number}: ${error.message}`);
      logger.error(`[Fast2SMS] sendMessage error: ${error.message}`);
      return false;
    }
  }
}

module.exports = new Fast2SmsService();
