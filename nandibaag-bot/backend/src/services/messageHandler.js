const { Chat, Settings } = require('../models');
const { getAIResponse, detectLanguage } = require('./aiService');
const { calculatePricing } = require('./pricingService');
const { scoreMessage } = require('./leadScoring');
const { scheduleFollowUps, cancelPendingFollowUps, containsOptOutPhrases, markChatAsOptedOut } = require('./followUpService');
const whatsappService = require('./whatsappService');
const channelManager = require('./channelManager');
const { getCapacityAvailability, suggestRoomCombinations } = require('./availabilityService');
const { sanitizeBookingDraft } = require('../utils/sanitizeBookingDraft');
const logger = require('../config/logger');

/**
 * Natural language parser for dates and guest counts from customer messages.
 * Handles mixed phrasings like "28 august 5 guest 4 adult and 1 kid", "15th august 2 couples", "25 Dec 6 adults".
 */
function extractBookingDetails(text, today = new Date()) {
  const result = {};
  if (!text || typeof text !== 'string') return result;
  const lower = text.toLowerCase();

  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };

  // Sub-extraction 1: Dates & Date Ranges
  try {
    const dateRangeRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s*(?:\-|to|se|\–)\s*(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)?\b/i;
    const dayMonthRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/i;
    const monthDayRegex = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
    const numericDateRegex = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/;

    let targetDate = null;
    let rangeMatch = lower.match(dateRangeRegex);

    if (rangeMatch) {
      const startDay = parseInt(rangeMatch[1], 10);
      const startMonthIdx = months[rangeMatch[2].toLowerCase()];
      const endDay = parseInt(rangeMatch[3], 10);
      const endMonthIdx = rangeMatch[4] ? months[rangeMatch[4].toLowerCase()] : startMonthIdx;

      if (startDay >= 1 && startDay <= 31 && startMonthIdx !== undefined && endDay >= 1 && endDay <= 31 && endMonthIdx !== undefined) {
        let year = today.getFullYear();
        const startDate = new Date(year, startMonthIdx, startDay);
        const endDate = new Date(year, endMonthIdx, endDay);
        if (startDate < new Date(today.setHours(0, 0, 0, 0))) {
          startDate.setFullYear(year + 1);
          endDate.setFullYear(year + 1);
        }
        targetDate = startDate;
        const diffMs = endDate.getTime() - startDate.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          result.nights = diffDays;
        }
      }
    }

    if (!targetDate) {
      let match = lower.match(dayMonthRegex);
      if (match) {
        const day = parseInt(match[1], 10);
        const monthIdx = months[match[2].toLowerCase()];
        if (day >= 1 && day <= 31 && monthIdx !== undefined) {
          let year = today.getFullYear();
          targetDate = new Date(year, monthIdx, day);
          if (targetDate < new Date(today.setHours(0, 0, 0, 0))) {
            targetDate.setFullYear(year + 1);
          }
        }
      } else if ((match = lower.match(monthDayRegex))) {
        const monthIdx = months[match[1].toLowerCase()];
        const day = parseInt(match[2], 10);
        if (day >= 1 && day <= 31 && monthIdx !== undefined) {
          let year = today.getFullYear();
          targetDate = new Date(year, monthIdx, day);
          if (targetDate < new Date(today.setHours(0, 0, 0, 0))) {
            targetDate.setFullYear(year + 1);
          }
        }
      } else if ((match = lower.match(numericDateRegex))) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        let year = match[3] ? parseInt(match[3], 10) : today.getFullYear();
        if (year < 100) year += 2000;
        if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
          targetDate = new Date(year, month, day);
        }
      } else if (lower.includes('tomorrow') || lower.includes('kal') || lower.includes('udya')) {
        targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (lower.includes('this weekend') || lower.includes('next weekend') || lower.includes('weekend')) {
        targetDate = new Date(today);
        const currentDay = targetDate.getDay();
        const daysUntilSaturday = (6 - currentDay + 7) % 7 || 7;
        targetDate.setDate(targetDate.getDate() + daysUntilSaturday);
      }
    }

    if (targetDate && !isNaN(targetDate.getTime())) {
      result.date = targetDate.toISOString().split('T')[0];
    }
  } catch (dateErr) {
    console.warn('[Extract] Date parsing failed:', dateErr.message);
  }

  // Sub-extraction 2: Adults
  try {
    const adultMatch = lower.match(/(\d+)\s*(?:adult|adults|adlt|bade)/i);
    if (adultMatch) {
      result.adults = parseInt(adultMatch[1], 10);
    }
  } catch (adultErr) {
    console.warn('[Extract] Adult parsing failed:', adultErr.message);
  }

  // Sub-extraction 3: Kids
  try {
    const kidMatch = lower.match(/(\d+)\s*(?:kid|kids|child|children|bache|bhaache)/i);
    if (kidMatch) {
      const numKids = parseInt(kidMatch[1], 10);
      result.kids = Array.from({ length: numKids }, () => ({ age: 5 }));
    }
  } catch (kidErr) {
    console.warn('[Extract] Kid parsing failed:', kidErr.message);
    result.kids = [];
  }

  // Sub-extraction 4: Total Guests / Couples fallback
  try {
    const totalGuestMatch = lower.match(/(\d+)\s*(?:guest|guests|people|person|log|members|pax|janan|janansathi)/i);
    if (!result.adults && totalGuestMatch) {
      const total = parseInt(totalGuestMatch[1], 10);
      if (result.kids && result.kids.length > 0) {
        result.adults = Math.max(1, total - result.kids.length);
      } else {
        result.adults = total;
      }
    } else if (!result.adults && lower.includes('couple')) {
      result.adults = 2;
    }
  } catch (guestErr) {
    console.warn('[Extract] Total guest parsing failed:', guestErr.message);
  }

  return result;
}

function detectBookingType(text) {
  const lower = (text || '').toLowerCase();
  if (/\b(day\s*picnic|one\s*day|picnic|water\s*park|one day picnic)\b/i.test(lower)) return 'picnic';
  if (/\b(couple|husband|wife|anniversary|2\s*(?:people|guest|guests|log|adult|adults))\b/i.test(lower)) return 'couple';
  if (/\b(group|family|friends|team|corporate|3\+|[3-9]\s*(?:people|guest|guests|log|adult|adults))\b/i.test(lower)) return 'group';
  return null;
}

function isDiscountIntent(text) {
  return /\b(discount|offer|kam|kum|less|negotiate|negotiable|sasta|sasti|cheap|budget|final price|best price|swast|kami|mhag|mahag|mehenga|mehnga|kam karo|price kam)\b/i.test(text || '');
}

function isGreetingOnly(text) {
  return /^(hi|hello|hey|hii+|namaste|namaskar|good\s+(morning|afternoon|evening)|salam|salaam)[\s!.🙏🌿]*$/i.test((text || '').trim());
}

function buildEmergencyFallback(messageText, language = 'hinglish') {
  const text = (messageText || '').toLowerCase();
  const phone = '9257657665';

  if (isDiscountIntent(text)) {
    if (language === 'roman_marathi') {
      return `Ho ji, rates already best ahet karan food + activities included aahet. Special approval sathi staff la call kara: ${phone} 📞`;
    }
    if (language === 'marathi') {
      return `हो जी, rates आधीच best आहेत कारण food + activities included आहेत. Special approval साठी staff ला call करा: ${phone} 📞`;
    }
    return `Ji, rates already best hain kyunki food + activities included hain. Special approval ke liye staff se baat kar sakte hain: ${phone} 📞`;
  }

  if (/\b(photo|photos|pic|image|gallery)\b/i.test(text)) {
    return `Photos yahan dekh sakte hain: https://nandibaag.com/rooms 📷`;
  }

  if (/\b(location|address|map|maps|kaha|kuth)\b/i.test(text)) {
    return `Location: Karjat. Maps: https://maps.app.goo.gl/h6PB4y4G4oSWyFxdA 📍`;
  }

  if (/\b(contact|phone|number|call)\b/i.test(text)) {
    return `Resort contact number: ${phone} 📞`;
  }

  if (isGreetingOnly(messageText)) {
    if (language === 'roman_marathi') {
      return `Namaste! 🌿 Couple Stay, Family Group Stay ki Day Picnic — konti mahiti pahije?`;
    }
    if (language === 'marathi') {
      return `नमस्कार! 🌿 Couple Stay, Family Group Stay की Day Picnic — कोणती माहिती हवी?`;
    }
    return `Namaste! 🌿 Couple Stay, Family Group Stay ya Day Picnic me se kiski enquiry hai?`;
  }

  return `Ji, thoda technical issue aa raha hai. Aap apni date, package aur guest count ek message me bhej dein, ya staff ko call karein: ${phone} 📞`;
}

/**
 * Handles incoming messages (Baileys compatible)
 * 
 * @param {string} sessionId - WhatsApp session ID
 * @param {object} msg - Baileys proto.IWebMessageInfo object
 * @param {'whatsapp-web' | 'fast2sms'} [channel='whatsapp-web'] - source channel
 */
async function handleMessage(sessionId, msg, channel = 'whatsapp-web') {
  const tStart = Date.now();
  const rawJid = msg.key?.remoteJid;
  let customerPhone = '';
  let replyToSend = null;
  let sendResult = false;
  let chat = null;
  let messageText = '';

  try {
    if (!rawJid) return;
    
    if (msg.key.participant && msg.key.participant.includes('@s.whatsapp.net')) {
      customerPhone = msg.key.participant.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    } else {
      customerPhone = rawJid.split('@')[0].replace(/\D/g, '');
    }
    
    messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const hasMedia = !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.documentMessage || msg.message?.stickerMessage);
    const messageType = hasMedia ? 'image' : 'text';
    
    if (!messageText && !hasMedia) {
      logger.debug(`Ignoring non-text/non-media message from ${customerPhone}`);
      return;
    }

    // Handle outgoing messages sent directly from phone or bot
    if (msg.key.fromMe) {
      chat = await Chat.findOne({ customerPhone });
      if (chat) {
        const text = messageText || (hasMedia ? '[Media]' : '');
        if (text) {
          const lastMsg = chat.messages[chat.messages.length - 1];
          if (!lastMsg || lastMsg.text !== text || (Date.now() - new Date(lastMsg.timestamp).getTime() > 10000)) {
            chat.messages.push({
              sender: 'agent',
              text,
              timestamp: new Date(msg.messageTimestamp ? msg.messageTimestamp * 1000 : Date.now()),
              messageType,
              deliveryStatus: 'sent'
            });
            chat.lastMessageAt = new Date();
            try { await chat.save(); } catch (_) {}
          }
        }
      }
      return;
    }
    
    console.log(`[TIMING] [1/6] Received message from WhatsApp at ${new Date().toISOString()}`);
    logger.info(`Processing message from ${customerPhone}: ${messageText.substring(0, 50)}...`);

    const sock = channel === 'whatsapp-web'
      ? (whatsappService.activeSockets.get(sessionId)?.sock || null)
      : null;
    if (sock) {
      try { await sock.sendPresenceUpdate('composing', msg.key.remoteJid); } catch (_) {}
    }
    
    const settings = await Settings.findOne();
    if (!settings) {
      logger.error('Settings not found');
      return;
    }
    
    const pushName = msg.pushName;
    chat = await Chat.findOne({ customerPhone });
    
    if (!chat) {
      chat = new Chat({
        customerPhone,
        customerName: pushName || null,
        whatsappNumberUsed: sessionId,
        channel,
        mode: settings.globalMode,
        language: 'unknown',
        messages: [],
        bookingStage: 'none',
        bookingDraft: {},
        isNewConversation: true,
        isArchived: false
      });
      try { await chat.save(); } catch (_) {}
      logger.info(`Created new chat for ${customerPhone} (Name: ${pushName || 'N/A'})`);
    } else if (pushName && (!chat.customerName || chat.customerName !== pushName)) {
      chat.customerName = pushName;
    }
    
    if (containsOptOutPhrases(messageText)) {
      await markChatAsOptedOut(chat._id);
      logger.info(`Customer ${customerPhone} opted out`);
      return;
    }
    
    const detectedLanguage = detectLanguage(messageText);
    if (chat.language === 'unknown' || chat.language !== detectedLanguage) {
      chat.language = detectedLanguage;
    }
    
    chat.messages.push({
      sender: 'customer',
      text: messageText || '[Media]',
      timestamp: new Date(),
      messageType,
      deliveryStatus: 'sent'
    });
    
    chat.lastMessageAt = new Date();
    try { await cancelPendingFollowUps(chat._id, 'customer_replied'); } catch (_) {}

    const emitRealtimeUpdate = (customMsgText, sender = 'customer') => {
      try {
        const { getIO } = require('../sockets');
        const io = getIO();
        if (io) {
          io.emit('chat:updated', chat);
          io.emit('chat:new_message', {
            chatId: chat._id,
            customerPhone,
            customerName: chat.customerName,
            message: customMsgText,
            sender,
            chat
          });
        }
      } catch (error) {}
    };
    
    const mode = chat.mode;
    if (mode === 'human') {
      try { await chat.save(); } catch (_) {}
      logger.info(`Chat ${customerPhone} in human mode, message saved, emitting socket event`);
      emitRealtimeUpdate(messageText || '[Media]', 'customer');
      if (sock) {
        try { await sock.sendPresenceUpdate('paused', msg.key.remoteJid); } catch (_) {}
      }
      return;
    }

    emitRealtimeUpdate(messageText || '[Media]', 'customer');
    
    // Primary Reply Computation Step
    try {
      const systemNotesList = [];
      const addSystemNote = (note) => {
        if (note) systemNotesList.push(note);
      };

      const msgLower = (messageText || '').toLowerCase();
      const bookingType = detectBookingType(messageText);
      const discountIntent = isDiscountIntent(messageText);
      const greetingOnly = isGreetingOnly(messageText);

      if (bookingType) {
        chat.bookingDraft.bookingType = bookingType;
        if (chat.bookingStage === 'none') chat.bookingStage = 'type_selected';
      }

      if (greetingOnly) {
        addSystemNote('[SYSTEM NOTE: Customer only greeted. Send one short welcome line and ask whether they want Couple Stay, Family Group Stay, or Day Picnic.]');
      }

      if (discountIntent) {
        addSystemNote('[SYSTEM NOTE: Customer is asking for a discount / lower price. Politely say rates are already best/final because food, activities, and facilities are included. For special approval or group offer, ask them to call staff at 9257657665.]');
      }
      
      const extracted = extractBookingDetails(messageText);
      if (extracted.date) {
        chat.bookingDraft.date = extracted.date;
      }
      if (extracted.adults) {
        chat.bookingDraft.adults = extracted.adults;
      }
      if (extracted.kids) {
        chat.bookingDraft.kids = extracted.kids;
      }
      if (extracted.nights) {
        chat.bookingDraft.nights = extracted.nights;
      }

      // Sanitize booking draft defensively
      chat.bookingDraft = sanitizeBookingDraft(chat.bookingDraft);

      if (chat.bookingDraft.date && chat.bookingDraft.adults && chat.bookingStage !== 'price_quoted' && chat.bookingStage !== 'completed') {
        chat.bookingStage = 'guests_given';
      }

      const draft = chat.bookingDraft || {};

      if (draft.availabilityChecked && draft.date && draft.adults) {
        const dateChangePatterns = /\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|today|yesterday|weekend|weekday|this\s+(saturday|sunday|monday|friday)/i;
        const guestChangePatterns = /(\d+)\s*(log|guest|people|person|adult|ladk|ladki|bache)/i;
        if (dateChangePatterns.test(msgLower) || guestChangePatterns.test(msgLower)) {
          chat.bookingDraft.availabilityChecked = false;
          chat.bookingDraft.availabilityConfirmed = false;
        }
      }

      if (draft.date && draft.adults && draft.adults > 0 && !draft.availabilityChecked) {
        try {
          const checkInDate = new Date(draft.date);
          if (!isNaN(checkInDate.getTime())) {
            const nights = draft.nights && draft.nights > 0 ? draft.nights : 1;
            const checkOutDate = new Date(checkInDate);
            checkOutDate.setDate(checkOutDate.getDate() + nights);
            const guestCount = draft.adults + (draft.kids?.length || 0);

            const capacityResult = await getCapacityAvailability(checkInDate, checkOutDate, guestCount);
            if (!capacityResult.available) {
              addSystemNote('[SYSTEM NOTE: No availability for these dates. Ask customer to try another date.]');
              chat.bookingDraft.availabilityChecked = true;
              chat.bookingDraft.availabilityConfirmed = false;
            } else {
              const pricingResult = calculatePricing(checkInDate, checkOutDate, guestCount);
              addSystemNote(`[SYSTEM NOTE: Availability confirmed.\nPRICING BREAKDOWN:\n${pricingResult.formatted}]`);
              chat.bookingDraft.availabilityChecked = true;
              chat.bookingDraft.availabilityConfirmed = true;
            }
          }
        } catch (availErr) {
          logger.error(`Availability check error: ${availErr.message}`);
        }
      }

      const systemNotes = systemNotesList.join('\n\n');
      replyToSend = await getAIResponse(chat, messageText, settings, systemNotes);
    } catch (aiError) {
      logger.error(`[MessageHandler] Error in AI/computation flow: ${aiError.message}`);
      logger.error(`STACK: ${aiError.stack}`);
      replyToSend = buildEmergencyFallback(messageText, chat?.language);
    }

  } catch (outerErr) {
    logger.error(`[MessageHandler] Outer error: ${outerErr.message}`);
    logger.error(`OUTER STACK: ${outerErr.stack}`);
    replyToSend = "Samajh nahi aaya, phir se try karo 😊 Ya call karein: 9257657665";
  }

  // ─── INDEPENDENT REPLY SEND BLOCK ───────────────────────────────────
  // Runs NO MATTER WHAT — a DB save error or AI crash can NEVER block message sending!
  try {
    if (!replyToSend || replyToSend.trim() === '') {
      replyToSend = "Samajh nahi aaya, phir se try karo 😊 Ya call karein: 9257657665";
    }
    sendResult = await channelManager.sendMessageViaChannel(rawJid, replyToSend, channel, sessionId);
    console.log(`[MessageHandler] Reply sent via ${channel}: ${sendResult ? 'SUCCESS ✓' : 'FAILED (queued)'}`);
  } catch (sendError) {
    logger.error(`[MessageHandler] ✗✗✗ CRITICAL: Even fallback send failed: ${sendError.message}`);
    try {
      const { FailedMessage } = require('../models');
      await FailedMessage.create({
        chatId: rawJid,
        customerPhone,
        channel,
        originalMessage: messageText,
        errorMessage: sendError.message,
        errorStack: sendError.stack
      });
    } catch (_) {}
  }

  // ─── INDEPENDENT DATABASE SAVE BLOCK ─────────────────────────────────
  // Failure in DB save NEVER impacts the WhatsApp reply that was already attempted/sent
  try {
    if (chat) {
      if (chat.bookingDraft) {
        chat.bookingDraft = sanitizeBookingDraft(chat.bookingDraft);
      }
      if (replyToSend) {
        chat.messages.push({
          sender: 'bot',
          text: replyToSend,
          timestamp: new Date(),
          messageType: 'text',
          deliveryStatus: sendResult ? 'sent' : 'queued'
        });
      }
      await chat.save();
      
      try {
        const { scoreMessage } = require('./leadScoring');
        await scoreMessage(chat, messageText, replyToSend);
      } catch (_) {}
    }
  } catch (saveError) {
    logger.error(`[MessageHandler] DB save failed (reply was still sent): ${saveError.message}`);
  }
}

/**
 * Normalized entry point for messages arriving from ANY channel.
 * Used by the channelManager for fast2sms (and reusable for other channels).
 *
 * @param {{from: string, body: string}} message
 *        from — chatId format (e.g. "919876543210@s.whatsapp.net")
 *        body — message text
 * @param {'whatsapp-web' | 'fast2sms'} [channel='whatsapp-web']
 */
async function handleIncomingMessage(message, channel = 'whatsapp-web') {
  const from = message?.from;
  const body = message?.body;

  if (!from || !body) {
    logger.warn(`[handleIncomingMessage] Missing from/body for channel ${channel}`);
    return;
  }

  // Build a Baileys-compatible message envelope so the SAME processing
  // pipeline (AI, booking, pricing, mode) runs unchanged.
  const msg = {
    key: { remoteJid: from, fromMe: false },
    message: { conversation: body },
    pushName: message.name || null,
    messageTimestamp: Math.floor(Date.now() / 1000)
  };

  await handleMessage(message.sessionId || (channel === 'fast2sms' ? 'fast2sms' : 'primary'), msg, channel);
}

module.exports = {
  handleMessage,
  handleIncomingMessage,
  extractBookingDetails
};
