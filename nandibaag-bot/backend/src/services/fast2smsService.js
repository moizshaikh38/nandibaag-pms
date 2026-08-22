/**
 * Fast2SMS Service.
 * 
 * Supports both:
 * 1. Fast2SMS WhatsApp API (`https://www.fast2sms.com/dev/whatsapp-session`)
 * 2. Fast2SMS Quick Bulk SMS API (`https://www.fast2sms.com/dev/bulkV2`)
 */

const env = require('../config/env');
const logger = require('../config/logger');

const MAX_MESSAGE_LENGTH = 4096;

class Fast2SmsService {
  constructor() {
    this.apiKey = (env.fast2smsApiKey || process.env.FAST2SMS_API_KEY || '').trim();
    this.apiUrl = (env.fast2smsApiUrl || 'https://www.fast2sms.com/dev/whatsapp-session').trim();
    this.senderNumbers = String(env.fast2smsSenderNumbers || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    this.phoneNumberId = String(env.fast2smsPhoneNumberId || '').trim();
    this.webhookSecret = (env.fast2smsWebhookSecret || '').trim();
    this.configured = false;
    this.initializedAt = null;
  }

  initialize() {
    this.apiKey = (env.fast2smsApiKey || process.env.FAST2SMS_API_KEY || '').trim();
    if (!this.apiKey) {
      this.configured = false;
      console.log('[Fast2SMS] ⚠️ FAST2SMS_API_KEY is not set — Fast2SMS channel is INERT.');
      return { status: 'not_configured', message: 'FAST2SMS_API_KEY missing' };
    }

    this.configured = true;
    this.initializedAt = new Date();
    console.log('[Fast2SMS] ✅ Service initialized with API Key.');
    return { status: 'connected', message: 'Fast2SMS ready' };
  }

  getStatus() {
    this.apiKey = (env.fast2smsApiKey || process.env.FAST2SMS_API_KEY || '').trim();
    return this.apiKey ? 'connected' : 'not_configured';
  }

  normalizeNumber(to) {
    if (!to) return '';
    let digits = String(to).replace(/\D/g, '');
    if (digits.length === 10) digits = `91${digits}`;
    return digits;
  }

  /**
   * Send a Quick Bulk SMS via Fast2SMS API (https://www.fast2sms.com/dev/bulkV2)
   */
  async sendSMS(to, text) {
    if (!this.apiKey) {
      this.apiKey = (process.env.FAST2SMS_API_KEY || '').trim();
    }
    if (!this.apiKey) {
      console.log('[Fast2SMS:SMS] ⚠️ FAST2SMS_API_KEY is missing');
      return false;
    }

    const digits = String(to).replace(/\D/g, '');
    const phone10Digits = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
    const senderId = (process.env.FAST2SMS_SENDER_ID || 'NBAAG').trim();

    console.log(`[Fast2SMS:SMS] Sending Bulk SMS to ${phone10Digits}...`);

    try {
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'q',
          message: text,
          language: 'english',
          flash: 0,
          numbers: phone10Digits,
          ...(senderId ? { sender_id: senderId } : {})
        })
      });

      const json = await response.json();
      console.log('[Fast2SMS:SMS] API Response:', json);

      if (json && (json.return === true || json.status_code === 200)) {
        console.log(`[Fast2SMS:SMS] ✅ SMS sent successfully to ${phone10Digits}`);
        return true;
      }

      if (json && json.status_code === 999) {
        console.error('[Fast2SMS:SMS] ❌ FAST2SMS ACCOUNT NOTICE:', json.message);
        console.error('[Fast2SMS:SMS] 👉 Fast2SMS requires one initial transaction of ₹100 INR in your Fast2SMS account before API sending is unlocked.');
      } else {
        console.error('[Fast2SMS:SMS] ❌ SMS Failed:', json.message || json);
      }
      return false;
    } catch (err) {
      console.error('[Fast2SMS:SMS] Error:', err.message);
      return false;
    }
  }

  /**
   * Send WhatsApp message via Fast2SMS WhatsApp API.
   * Returns true on success, or false on failure (allowing caller to use Baileys).
   * Does NOT automatically fall back to Bulk SMS, preventing accidental cellular SMS.
   */
  async sendMessage(to, text) {
    this.apiKey = (env.fast2smsApiKey || process.env.FAST2SMS_API_KEY || '').trim();
    if (!this.apiKey) {
      console.log(`[Fast2SMS] ⚠️ sendMessage ignored (FAST2SMS_API_KEY missing) for ${to}`);
      return false;
    }

    const number = this.normalizeNumber(to);
    if (!number || number.length < 11) {
      console.log(`[Fast2SMS] ❌ Invalid recipient number: ${to}`);
      return false;
    }

    const cleanedText = (text || '').replace(/\\n\\n/g, '\n\n').replace(/\\n/g, '\n');
    const truncatedText = cleanedText.length > MAX_MESSAGE_LENGTH ? `${cleanedText.slice(0, MAX_MESSAGE_LENGTH)}…` : cleanedText;

    // Try Fast2SMS WhatsApp API endpoint
    try {
      // Strip any existing query params from the env URL (handles both base URL and full sample URL)
      const parsedUrl = new URL(this.apiUrl);
      const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
      const url = new URL(baseUrl);

      url.searchParams.set('to', number);
      if (this.phoneNumberId) {
        url.searchParams.set('phone_number_id', this.phoneNumberId);
      } else {
        const displayNum = (this.senderNumbers[0] || env.resortContact1 || '9257657665').replace(/\D/g, '');
        const cleanDisplay = displayNum.length === 12 && displayNum.startsWith('91') ? displayNum.slice(2) : displayNum;
        url.searchParams.set('display_number', cleanDisplay);
      }

      console.log(`[Fast2SMS:WhatsApp] Request URL: ${url.toString()}`);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'text', text: truncatedText })
      });

      const responseText = await response.text();
      let json = {};
      try { json = JSON.parse(responseText); } catch (_) {}

      if (response.ok && json.return !== false) {
        console.log(`[Fast2SMS:WhatsApp] ✅ Message sent successfully to ${number}`);
        return true;
      }

      if (json && json.status_code === 999) {
        console.error('[Fast2SMS:WhatsApp] ❌ FAST2SMS ACCOUNT NOTICE:', json.message);
        console.error('[Fast2SMS:WhatsApp] 👉 Fast2SMS requires one initial transaction of ₹100 INR in your Fast2SMS account before API sending is unlocked.');
        return false;
      }

      console.log(`[Fast2SMS:WhatsApp] WhatsApp send returned error: ${responseText.slice(0, 200)}`);
      return false;
    } catch (error) {
      console.error(`[Fast2SMS:WhatsApp] Error: ${error.message}`);
      return false;
    }
  }
}

module.exports = new Fast2SmsService();
