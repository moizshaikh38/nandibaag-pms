const { Chat, Settings } = require('../models');
const { getAIResponse, detectLanguage } = require('./aiService');
const { calculatePricing, getDayName, isWeekend } = require('./pricingService');
const { scoreMessage } = require('./leadScoring');
const { scheduleFollowUps, cancelPendingFollowUps, containsOptOutPhrases, markChatAsOptedOut } = require('./followUpService');
const whatsappService = require('./whatsappService');
const channelManager = require('./channelManager');
const {
  getCapacityAvailability,
  suggestRoomCombinations,
  checkOvernightAvailability,
  checkOneDayPicknicAvailability,
  getDetailedAvailabilityMessage,
  getRoomsWithDetailedStatus
} = require('./availabilityService');
const { formatDateTableForPrompt } = require('./dateHelper');
const crypto = require('crypto');
const { sanitizeBookingDraft } = require('../utils/sanitizeBookingDraft');
const logger = require('../config/logger');

// Per-channel message cache (SHA256 hash -> timestamp) for robust deduplication
const webhookMessageCache = new Map();

// Cache of outgoing bot reply content hashes (SHA256 of text -> timestamp) to catch echoes
const recentBotRepliesFingerprint = new Map();

function registerBotReplyFingerprint(text) {
  if (!text || typeof text !== 'string') return;
  const hash = crypto.createHash('sha256').update(text.trim().slice(0, 80)).digest('hex');
  recentBotRepliesFingerprint.set(hash, Date.now());
  if (recentBotRepliesFingerprint.size > 2000) {
    const firstKey = recentBotRepliesFingerprint.keys().next().value;
    recentBotRepliesFingerprint.delete(firstKey);
  }
}

function isBotReplyFingerprint(text) {
  if (!text || typeof text !== 'string') return false;
  const hash = crypto.createHash('sha256').update(text.trim().slice(0, 80)).digest('hex');
  const timestamp = recentBotRepliesFingerprint.get(hash);
  if (timestamp && Date.now() - timestamp < 120000) { // 2-minute window
    return true;
  }
  return false;
}

function getMessageHash(from, text, channel = 'default') {
  const timeWindow = Math.floor(Date.now() / 10000) * 10000;
  // NOTE: channel is intentionally NOT included in the hash.
  // The same message from the same sender must be deduplicated across channels
  // (e.g. Baileys + Fast2SMS can both deliver the same incoming WhatsApp message).
  const hashInput = `${from}||${(text || '').slice(0, 50)}||${timeWindow}`;
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

function emitRealtimeUpdate(chat, customMsgText, senderRole = 'customer') {
  try {
    const { getIO } = require('../sockets');
    const io = getIO();
    if (io && chat) {
      io.emit('chat:updated', chat);
      io.emit('chat:new_message', {
        chatId: chat._id,
        customerPhone: chat.customerPhone,
        customerName: chat.customerName,
        message: customMsgText,
        sender: senderRole,
        chat
      });
    }
  } catch (error) {}
}

/** Check if text content matches an exact outgoing bot reply fingerprint */
function isBotReplyText(text) {
  if (!text || typeof text !== 'string') return false;
  return isBotReplyFingerprint(text);
}

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
    // Current date calibrated to IST (Asia/Kolkata)
    const now = new Date();
    const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const parts = istDateStr.split('-');
    const today = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));

    const sameMonthRangeRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:\-|to|se|\–)\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/i;
    const dateRangeRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s*(?:\-|to|se|\–)\s*(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)?\b/i;
    const dayMonthRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/i;
    const monthDayRegex = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
    const numericDateRegex = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/;

    let targetDate = null;

    // STEP 1: Handle relative dates first (tomorrow, next week, today)
    if (lower.includes('tomorrow') || lower.includes('kal') || lower.includes('udya')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      targetDate = tomorrow;
      console.log('[DateParsing] "Tomorrow" detected →', targetDate.toISOString().split('T')[0]);
    } else if (lower.includes('next week')) {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      targetDate = nextWeek;
      console.log('[DateParsing] "Next week" detected →', targetDate.toISOString().split('T')[0]);
    } else if (lower.includes('today') || lower.includes('aaj')) {
      targetDate = new Date(today);
      console.log('[DateParsing] "Today" detected →', targetDate.toISOString().split('T')[0]);
    } else if (lower.includes('this weekend') || lower.includes('next weekend') || lower.includes('weekend')) {
      targetDate = new Date(today);
      const currentDay = targetDate.getDay(); // 0 is Sun, 5 is Fri, 6 is Sat
      const daysUntilFriday = (5 - currentDay + 7) % 7 || 7;
      targetDate.setDate(targetDate.getDate() + daysUntilFriday);
      console.log('[DateParsing] "Weekend" detected →', targetDate.toISOString().split('T')[0]);
    }

    // STEP 2: Handle explicit date patterns if relative date not found
    if (!targetDate) {
      let sameMonthMatch = lower.match(sameMonthRangeRegex);
      let rangeMatch = lower.match(dateRangeRegex);

      if (sameMonthMatch) {
        const startDay = parseInt(sameMonthMatch[1], 10);
        const endDay = parseInt(sameMonthMatch[2], 10);
        const monthIdx = months[sameMonthMatch[3].toLowerCase()];

        if (startDay >= 1 && startDay <= 31 && endDay >= 1 && endDay <= 31 && monthIdx !== undefined) {
          let year = today.getFullYear();
          const startDate = new Date(year, monthIdx, startDay);
          const endDate = new Date(year, monthIdx, endDay);
          if (startDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
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
      } else if (rangeMatch) {
        const startDay = parseInt(rangeMatch[1], 10);
        const startMonthIdx = months[rangeMatch[2].toLowerCase()];
        const endDay = parseInt(rangeMatch[3], 10);
        const endMonthIdx = rangeMatch[4] ? months[rangeMatch[4].toLowerCase()] : startMonthIdx;

        if (startDay >= 1 && startDay <= 31 && startMonthIdx !== undefined && endDay >= 1 && endDay <= 31 && endMonthIdx !== undefined) {
          let year = today.getFullYear();
          const startDate = new Date(year, startMonthIdx, startDay);
          const endDate = new Date(year, endMonthIdx, endDay);
          if (startDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
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
            if (targetDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
              targetDate.setFullYear(year + 1);
            }
          }
        } else if ((match = lower.match(monthDayRegex))) {
          const monthIdx = months[match[1].toLowerCase()];
          const day = parseInt(match[2], 10);
          if (day >= 1 && day <= 31 && monthIdx !== undefined) {
            let year = today.getFullYear();
            targetDate = new Date(year, monthIdx, day);
            if (targetDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
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
        }
      }
    }

    if (targetDate && !isNaN(targetDate.getTime())) {
      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetDate.getDate()).padStart(2, '0');
      result.date = `${year}-${month}-${day}`;

      const checkInD = targetDate;
      const n = result.nights || 1;
      const checkOutD = new Date(checkInD);
      checkOutD.setDate(checkOutD.getDate() + n);

      const checkOutStr = `${checkOutD.getFullYear()}-${String(checkOutD.getMonth() + 1).padStart(2, '0')}-${String(checkOutD.getDate()).padStart(2, '0')}`;

      console.log('[DateValidation:DEBUG]', {
        systemNow: new Date().toISOString(),
        currentDateExpected: '2026-08-05',
        customerInput: text,
        extractedDates: { checkInDate: result.date, checkOutDate: checkOutStr },
        calculatedDays: n,
        dayOfWeekCheckIn: getDayName(result.date),
        dayOfWeekCheckOut: getDayName(checkOutStr),
        weekendDetected: isWeekend(result.date)
      });
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
      const allAgeNums = [];

      const ageRegex = /(?:age|ages|year|years|yr|yrs|sal)\s*:?\s*(\d{1,2})(?:\s*(?:and|&|,)\s*(\d{1,2}))?/gi;
      let m;
      while ((m = ageRegex.exec(lower)) !== null) {
        if (m[1]) allAgeNums.push(parseInt(m[1], 10));
        if (m[2]) allAgeNums.push(parseInt(m[2], 10));
      }

      if (allAgeNums.length === 0) {
        const parenthesizedAge = lower.match(/kid[s]?\s*\(\s*(?:age\s*)?(\d{1,2})\s*\)/i) || lower.match(/\(\s*(?:age\s*)?(\d{1,2})\s*\)/i);
        if (parenthesizedAge) {
          allAgeNums.push(parseInt(parenthesizedAge[1], 10));
        }
      }

      let parsedAges = [];
      if (allAgeNums.length > 0) {
        if (allAgeNums.length === 1 && numKids > 1) {
          parsedAges = Array.from({ length: numKids }, () => allAgeNums[0]);
        } else {
          parsedAges = allAgeNums.slice(0, numKids);
          while (parsedAges.length < numKids) {
            parsedAges.push(parsedAges[parsedAges.length - 1] || 5);
          }
        }
      } else {
        parsedAges = Array.from({ length: numKids }, () => 5);
      }

      result.kids = parsedAges.map(age => ({ age }));
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

  // Sub-extraction 5: Explicit Nights / Days
  try {
    const nightMatch = lower.match(/(\d+)\s*(?:night|nights|raat|rrat|day|days|din)\b/i) || lower.match(/for\s+(\d+)\s*(?:day|days|night|nights|din)/i);
    if (nightMatch) {
      result.nights = parseInt(nightMatch[1], 10);
    }
  } catch (nErr) {
    console.warn('[Extract] Nights parsing failed:', nErr.message);
  }

  // Sub-extraction 6: Kids Specified Detection
  const noKidsPattern = /\b(no\s*kids?|without\s*kids?|0\s*kids?|kids?\s*nahi|bache?\s*nahi|lahan\s*mule?\s*nahi|no\s*children|koi\s*bhi\s*bacha\s*nahi)\b/i;
  if (noKidsPattern.test(lower)) {
    result.kids = [];
    result.kidsSpecified = true;
  } else if (result.kids && result.kids.length > 0) {
    result.kidsSpecified = true;
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

function detectConversationTopic(text) {
  const lower = (text || '').toLowerCase();
  if (/\b(discount|offer|kam|kum|less|negotiate|budget|best price|final price|swast|kami)\b/i.test(lower)) return 'discount_or_price_negotiation';
  if (/\b(day\s*picnic|one\s*day|picnic|water\s*park)\b/i.test(lower)) return 'day_picnic';
  if (/\b(couple|husband|wife|anniversary)\b/i.test(lower)) return 'couple_stay';
  if (/\b(group|family|friends|corporate|team)\b/i.test(lower)) return 'group_stay';
  if (/\b(price|rate|cost|charge|package|kitn|kiti|kay)\b/i.test(lower)) return 'pricing';
  if (/\b(available|availability|room|date|check-?in|check-?out|tarikh|tarakh)\b/i.test(lower)) return 'availability';
  if (/\b(photo|photos|pic|image|gallery)\b/i.test(lower)) return 'photos';
  if (/\b(location|address|map|maps|kaha|kuth)\b/i.test(lower)) return 'location';
  if (/\b(payment|advance|upi|cash|card|refund|cancel)\b/i.test(lower)) return 'payment_or_policy';
  if (/\b(food|breakfast|lunch|dinner|tea|veg|jain|non-veg|nonveg)\b/i.test(lower)) return 'food';
  return null;
}

function updateConversationState(chat, text, sender) {
  if (!chat || !text) return;
  const cleanText = String(text).trim();
  if (!cleanText) return;

  chat.conversationState = chat.conversationState || {};
  const topic = detectConversationTopic(cleanText);

  if (sender === 'customer') {
    chat.conversationState.customerLastQuery = cleanText.slice(0, 1000);
    if (topic) chat.conversationState.context = topic;
  } else if (sender === 'staff' || sender === 'agent') {
    chat.conversationState.lastStaffMessage = cleanText.slice(0, 1000);
    chat.conversationState.lastStaffMessageTime = new Date();
    if (topic) chat.conversationState.context = topic;
  }
}

function getDefaultModeForNewChat(settings) {
  const configuredMode = settings?.defaultModeForNewChats || settings?.globalMode || 'ai';
  return ['ai', 'human'].includes(configuredMode) ? configuredMode : 'ai';
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

    const rawMessageText = msg.message?.conversation || 
                           msg.message?.extendedTextMessage?.text || 
                           msg.message?.imageMessage?.caption || 
                           msg.message?.videoMessage?.caption || 
                           msg.message?.documentMessage?.caption || '';
    messageText = rawMessageText;

    const hasMedia = !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.documentMessage || msg.message?.stickerMessage);
    const messageType = hasMedia ? 'image' : 'text';
    
    // Robust deduplication using sender + message content hash + 10s time window
    const msgHash = getMessageHash(rawJid, messageText || (hasMedia ? 'media_' + (msg.key?.id || msg.messageTimestamp || Date.now()) : ''), channel);
    const lastSeen = webhookMessageCache.get(msgHash);
    if (lastSeen && Date.now() - lastSeen < 10000) {
      console.log('[MessageHandler] ⚠️  Duplicate webhook message, skipping hash:', msgHash);
      return;
    }
    webhookMessageCache.set(msgHash, Date.now());

    // Filter out echoed bot replies by content
    if (isBotReplyText(messageText)) {
      console.log('[MessageHandler] 🛑 Detected bot reply content, skipping AI response:', messageText.substring(0, 50));
      return;
    }

    const rawParticipant = (msg.key.participant && msg.key.participant.includes('@s.whatsapp.net'))
      ? msg.key.participant
      : (rawJid || '');
    customerPhone = rawParticipant.split('@')[0].split(':')[0].replace(/\D/g, '');
    
    console.log('[MessageHandler:ENTRY] Processing message');
    console.log('[MessageHandler:ENTRY] From:', customerPhone);
    let isMediaAck = false;
    let mediaAckText = '';

    console.log('[Media:Check]', {
      hasMedia,
      messageType: msg.message?.imageMessage ? 'image' : messageType,
      messageKeys: Object.keys(msg.message || {})
    });

    // MEDIA ACKNOWLEDGMENT: If media sent without caption text
    if (hasMedia && !rawMessageText) {
      console.log('[Media:Acknowledgment] Media received without caption');
      isMediaAck = true;
      
      if (msg.message?.imageMessage) {
        mediaAckText = '📸 Photo mil gayi! Kya ye room/property ke baare mein hai? ' +
                      'Ya booking details poochni hain? Text mein likho toh mein help kar dunga.';
      } 
      else if (msg.message?.documentMessage) {
        mediaAckText = '📄 Document mil gayi! Mujhe PDF read nahi kar sakta. ' +
                      'Kripya booking details, dates, aur guest count text mein likho.';
      } 
      else if (msg.message?.audioMessage) {
        mediaAckText = '🎙️ Voice note mil gayi! Mujhe audio samajhne mein mushkili hoti hai. ' +
                      'Kripya apne booking details text mein likho - ' +
                      'dates, guests, package type (Couple/Group/Day Picnic).';
      } 
      else if (msg.message?.videoMessage) {
        mediaAckText = '🎥 Video mil gayi! Mujhe video dekh nahi sakta, lekin ' +
                      'text mein bataao kya poochna hai. Dates, guests, aur package type likho.';
      }
      else if (msg.message?.stickerMessage) {
        mediaAckText = '😊 Sticker mil gayi! Lekin mujhe booking mein help karne ke liye ' +
                      'dates aur guest details text mein chahiye. Likho na! 😊';
      }
      
      messageText = mediaAckText;
      console.log('[Media:Acknowledgment] Generated response:', mediaAckText.slice(0, 50));
    }

    console.log('[Media:Result]', {
      hasMedia,
      messageText: (messageText || '').slice(0, 50),
      messageLength: (messageText || '').length
    });
    
    if (!messageText && !hasMedia) {
      logger.debug(`Ignoring non-text/non-media message from ${customerPhone}`);
      return;
    }

    const clean10 = customerPhone.length > 10 ? customerPhone.slice(-10) : customerPhone;
    const phoneQueries = [
      { customerPhone },
      ...(clean10 ? [{ customerPhone: clean10 }, { customerPhone: '91' + clean10 }] : [])
    ];

    // Handle outgoing messages sent directly from phone or bot
    if (msg.key.fromMe) {
      chat = await Chat.findOne({ $or: phoneQueries });
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
            updateConversationState(chat, text, 'agent');
            chat.lastMessageAt = new Date();
            try { await chat.save(); } catch (_) {}

            emitRealtimeUpdate(chat, text, 'agent');
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
    
    const settings = await Settings.findOne();
    if (!settings) {
      logger.error('Settings not found');
      return;
    }
    
    const pushName = msg.pushName;
    chat = await Chat.findOne({ $or: phoneQueries });
    
    if (!chat) {
      const defaultMode = getDefaultModeForNewChat(settings);
      chat = new Chat({
        customerPhone,
        customerName: pushName || null,
        whatsappNumberUsed: sessionId,
        channel,
        mode: defaultMode,
        language: 'unknown',
        messages: [],
        bookingStage: 'none',
        bookingDraft: {},
        isNewConversation: true,
        isArchived: false
      });
      try { await chat.save(); } catch (_) {}
      logger.info(`Created new chat for ${customerPhone} in ${defaultMode} mode (Name: ${pushName || 'N/A'})`);
    } else if (pushName && (!chat.customerName || chat.customerName !== pushName)) {
      chat.customerName = pushName;
    }

    // STRICT HUMAN/STAFF MODE CHECK: If chat is in human mode, DO NOT send typing presence and DO NOT reply!
    const initialMode = (chat.mode || '').trim().toLowerCase();
    if (initialMode === 'human' || initialMode === 'staff') {
      if (sock) {
        try { await sock.sendPresenceUpdate('paused', msg.key.remoteJid); } catch (_) {}
      }
    } else if (sock) {
      try { await sock.sendPresenceUpdate('composing', msg.key.remoteJid); } catch (_) {}
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
    
    const senderRole = msg.key?.fromMe ? 'agent' : (isBotReplyText(messageText) ? 'bot' : 'customer');
    
    const customerText = isMediaAck ? (rawMessageText || '📷 Photo') : (messageText || '[Media]');
    const mediaUrl = msg.message?.imageMessage?.url || msg.message?.videoMessage?.url || msg.message?.documentMessage?.url || null;

    chat.messages.push({
      sender: senderRole,
      text: customerText,
      timestamp: new Date(),
      messageType,
      mediaUrl,
      deliveryStatus: 'sent'
    });
    updateConversationState(chat, customerText, senderRole);
    
    chat.lastMessageAt = new Date();
    try { await cancelPendingFollowUps(chat._id, 'customer_replied'); } catch (_) {}


    
    console.log('[ChatHistory:DEBUG] Loaded messages count:', chat.messages?.length || 0);
    console.log('[ChatHistory:DEBUG] Last 3 messages:',
      chat.messages?.slice(-3).map(m => ({ sender: m.sender, text: (m.text || '').slice(0, 50) }))
    );

    const mode = (chat.mode || '').trim().toLowerCase();
    if (mode === 'human' || mode === 'staff') {
      try { await chat.save(); } catch (_) {}
      logger.info(`Chat ${customerPhone} in human mode, message saved, emitting socket event`);
      emitRealtimeUpdate(chat, customerText, 'customer');
      if (sock) {
        try { await sock.sendPresenceUpdate('paused', msg.key.remoteJid); } catch (_) {}
      }
      return;
    }

    emitRealtimeUpdate(chat, customerText, 'customer');
    
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
      if (extracted.kidsSpecified) {
        chat.bookingDraft.kidsSpecified = true;
      }
      if (extracted.nights) {
        chat.bookingDraft.nights = extracted.nights;
      }

      // Sanitize booking draft defensively
      chat.bookingDraft = sanitizeBookingDraft(chat.bookingDraft);
      try { await chat.save(); } catch (_) {}

      if (chat.bookingDraft.date && chat.bookingDraft.adults && chat.bookingStage !== 'price_quoted' && chat.bookingStage !== 'completed') {
        chat.bookingStage = 'guests_given';
      }

      const draft = chat.bookingDraft || {};

      if (draft.date) {
        const dateChangePatterns = /\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|today|yesterday|weekend|weekday|this\s+(saturday|sunday|monday|friday)/i;
        const guestChangePatterns = /(\d+)\s*(log|guest|people|person|adult|ladk|ladki|bache)/i;
        if (dateChangePatterns.test(msgLower) || guestChangePatterns.test(msgLower)) {
          chat.bookingDraft.availabilityChecked = false;
          chat.bookingDraft.availabilityConfirmed = false;
        }
      }

      // UNIVERSAL LIVE AVAILABILITY CHECK: Whenever a date is identified, check live DB availability immediately
      if (draft.date) {
        try {
          const checkInDate = new Date(draft.date);
          if (!isNaN(checkInDate.getTime())) {
            const nights = draft.nights && draft.nights > 0 ? draft.nights : 1;
            const checkOutDate = new Date(checkInDate);
            checkOutDate.setDate(checkOutDate.getDate() + nights);
            const guestCount = (draft.adults && draft.adults > 0) ? (draft.adults + (draft.kids?.length || 0)) : 1;

            const isDayPicnic = draft.bookingType === 'picnic' || draft.bookingType === 'dayuse' || draft.packageType === 'one-day-picnic' || /\b(picnic|day\s*use|dayuse|one\s*day|day\s*package)\b/i.test(msgLower);

            if (isDayPicnic) {
              console.log('[MessageHandler:AVAILABILITY] Checking ONE-DAY PICNIC availability for:', draft.date);
              const dayuse = await checkOneDayPicknicAvailability(checkInDate, draft.mealOption || 'breakfast-to-dinner');
              const availableCount = dayuse.availableRooms.length;

              if (availableCount === 0) {
                console.log('[MessageHandler:AVAILABILITY] ❌ NO ROOMS AVAILABLE for one-day picnic on:', draft.date);
                addSystemNote(`[SYSTEM NOTE — MANDATORY: ⛔ ALL ROOMS ARE FULLY BOOKED for one-day picnic on ${draft.date}. There is ZERO availability on these dates. You MUST tell the customer politely: "Maaf kijiye, ${draft.date} ko one-day picnic ke liye saari cottages fully booked hain 😔 Kya aap doosri dates try karna chahenge?" DO NOT say rooms are available. DO NOT show pricing. DO NOT proceed with booking. Only suggest trying different dates.]`);
                chat.bookingDraft.availabilityChecked = true;
                chat.bookingDraft.availabilityConfirmed = false;
              } else {
                console.log('[MessageHandler:AVAILABILITY] ✅ ONE-DAY PICNIC AVAILABLE:', availableCount);
                const options = {
                  mealOption: draft.mealOption,
                  mealRate: draft.mealRate
                };
                const pricingResult = calculatePricing(checkInDate, checkOutDate, draft.adults || 2, draft.kids || [], 'picnic', options);

                if (!draft.mealOption) {
                  addSystemNote(`[SYSTEM NOTE: ONE-DAY PICNIC is AVAILABLE on ${draft.date} (${availableCount} cottage(s) available). Offer two meal options:\n1. Breakfast to Dinner (₹1,250 weekday / ₹1,500 weekend)\n2. Breakfast to High Tea (₹1,000 weekday / ₹1,250 weekend)\nAsk which option they prefer!]`);
                } else {
                  addSystemNote(`[SYSTEM NOTE: ONE-DAY PICNIC pricing calculated (${availableCount} cottage(s) available).\n${pricingResult.formatted}]`);
                }
                chat.bookingDraft.availabilityChecked = true;
                chat.bookingDraft.availabilityConfirmed = true;
              }
            } else {
              // Overnight booking (Couple / Group / Default)
              console.log('[MessageHandler:AVAILABILITY] Checking OVERNIGHT availability for:', draft.date, 'to', checkOutDate.toISOString().split('T')[0]);
              const overnight = await checkOvernightAvailability(checkInDate, checkOutDate);
              const availableCount = overnight.availableRooms.length;

              if (availableCount === 0) {
                console.log('[MessageHandler:AVAILABILITY] ❌ ALL OVERNIGHT ROOMS BOOKED for:', draft.date);
                // Check if one-day picnic is available on this date as alternative
                const dayuse = await checkOneDayPicknicAvailability(checkInDate, 'breakfast-to-dinner');
                const dayuseAvailable = dayuse.availableRooms.length;

                if (dayuseAvailable > 0) {
                  console.log('[MessageHandler:AVAILABILITY] Offering ONE-DAY PICNIC alternative (available:', dayuseAvailable, ')');
                  addSystemNote(`[SYSTEM NOTE — MANDATORY: ⛔ ALL ROOMS ARE FULLY BOOKED FOR OVERNIGHT STAY on ${draft.date}. However, ONE-DAY PICNIC IS AVAILABLE (9:00 AM - 6:30 PM or 9:30 PM, ${dayuseAvailable} cottage(s) available). You MUST tell the customer: "Maaf kijiye, ${draft.date} ko overnight stay ke liye all cottages fully booked hain 😔 Lekin hamare paas ONE-DAY PICNIC (9:00 AM - 6:30 PM ya 9:30 PM) ke liye availability hai! Kya aap one-day picnic book karna chahenge? 🎉" DO NOT say overnight rooms are available. DO NOT calculate overnight pricing.]`);
                } else {
                  console.log('[MessageHandler:AVAILABILITY] ⛔ BOTH OVERNIGHT & PICNIC FULL on:', draft.date);
                  addSystemNote(`[SYSTEM NOTE — MANDATORY: ⛔ ALL ROOMS ARE FULLY BOOKED for both overnight stay and one-day picnic on ${draft.date}. There is ZERO availability on these dates. You MUST tell the customer politely: "Maaf kijiye, ${draft.date} ko humari saari cottages fully booked hain 😔 Kya aap doosri dates try karna chahenge?" DO NOT say rooms are available. DO NOT show pricing. DO NOT proceed with booking. Only suggest trying different dates.]`);
                }
                chat.bookingDraft.availabilityChecked = true;
                chat.bookingDraft.availabilityConfirmed = false;
              } else if (draft.adults && draft.adults > 0) {
                console.log('[MessageHandler:AVAILABILITY] ✅ OVERNIGHT ROOMS AVAILABLE:', availableCount);
                const pricingResult = calculatePricing(checkInDate, checkOutDate, draft.adults || 2, draft.kids || [], draft.bookingType || 'auto');

                const isKidsSpecified = extracted.kidsSpecified || chat.bookingDraft.kidsSpecified || (draft.kids && draft.kids.length > 0);
                if (!isKidsSpecified) {
                  console.log('[BookingFlow] Kids status NOT specified yet. Asking customer about kids FIRST before displaying pricing breakdown.');
                  chat.bookingDraft.askingAboutKids = true;
                  addSystemNote(`[SYSTEM NOTE: Dates & adults count confirmed (${draft.date}, ${draft.adults} adults, ${availableCount} cottage(s) available). CRITICAL INSTRUCTION: Ask the customer about kids FIRST before showing pricing breakdown:\n"Kya koi kids aa rahe hain? Agar yes, age bataiye 😊"\nDO NOT display the pricing breakdown until customer responds to kids question!]`);
                } else {
                  console.log('[BookingFlow] Kids status confirmed. Showing final pricing breakdown.');
                  chat.bookingDraft.askingAboutKids = false;
                  addSystemNote(`[SYSTEM NOTE: Overnight availability (${availableCount} cottage(s) available) & kids status confirmed (${draft.kids?.length || 0} kids).\nPRICING BREAKDOWN:\n${pricingResult.formatted}]`);
                }

                chat.bookingDraft.availabilityChecked = true;
                chat.bookingDraft.availabilityConfirmed = true;
              } else {
                console.log('[MessageHandler:AVAILABILITY] Overnight date is available, waiting for guest count:', draft.date);
                chat.bookingDraft.availabilityChecked = true;
                chat.bookingDraft.availabilityConfirmed = true;
              }
            }
            try { await chat.save(); } catch (_) {}
          }
        } catch (availErr) {
          logger.error(`Availability check error: ${availErr.message}`);
        }
      }

      // ── CONVERSATION STATE MACHINE & NAME COLLECTION (Steps 5 & 6) ──
      const confirmIntentPattern = /\b(confirm|book|booking|ready|haan|yes|hoga|kardo|kar do|karo|bhej do|done|fix|ha)\b/i;
      const isConfirmIntent = confirmIntentPattern.test(msgLower);

      if (chat.bookingDraft.nameRequested && !chat.bookingDraft.customerName) {
        const candidateName = (messageText || '').trim().replace(/^(my name is|naam|name|im|i am|me|main)\s+/i, '');
        if (candidateName.length > 0) {
          chat.customerName = candidateName;
          chat.bookingDraft.customerName = candidateName;
          chat.bookingDraft.nameRequested = false;
          chat.bookingDraft.bookingStep = 6;
          chat.bookingStage = 'completed';
          console.log('[BookingFlow] Name collected:', candidateName);
          try { await chat.save(); } catch (_) {}

          let priceStr = '₹5,000';
          try {
            const checkInDate = new Date(chat.bookingDraft.date);
            const nights = chat.bookingDraft.nights || 1;
            const checkOutDate = new Date(checkInDate);
            checkOutDate.setDate(checkOutDate.getDate() + nights);
            const pricingResult = calculatePricing(checkInDate, checkOutDate, chat.bookingDraft.adults || 2, chat.bookingDraft.kids || [], chat.bookingDraft.bookingType || 'auto');
            priceStr = `₹${pricingResult.raw.grandTotal.toLocaleString('en-IN')}`;
          } catch (_) {}

          addSystemNote(`[SYSTEM NOTE: Customer provided their name: "${candidateName}". Output the exact FINAL CONFIRMATION SUMMARY below (do NOT ask customer to call):
✓ FINAL BOOKING CONFIRMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 Name: ${candidateName}
📅 Dates: ${chat.bookingDraft.date}
👥 Guests: ${chat.bookingDraft.adults} adults + ${chat.bookingDraft.kids?.length || 0} kids
💰 Price: ${priceStr}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All details taken ✅
Hamari team aapse jald hi connect karegi for booking 😊]`);
        }
      } else if (isConfirmIntent && chat.bookingDraft.date && chat.bookingDraft.adults && chat.bookingDraft.availabilityConfirmed && !chat.bookingDraft.customerName) {
        console.log('[BookingFlow] Customer name not collected yet. Requesting name.');
        chat.bookingDraft.nameRequested = true;
        chat.bookingDraft.bookingStep = 5;
        chat.bookingStage = 'guests_given';
        try { await chat.save(); } catch (_) {}
        addSystemNote('[SYSTEM NOTE: Customer wants to confirm booking. Ask customer name: "Booking confirm karne ke liye aapka naam bata dijiye?"]');
      }

      if (isMediaAck) {
        replyToSend = mediaAckText;
      } else {
        // ── INJECT DATE TABLE INTO SYSTEM NOTES ──
        // Whenever check-in/check-out dates are known, inject a pre-computed
        // date table so the LLM reads exact day names instead of guessing.
        const draftForDateTable = chat.bookingDraft || {};
        if (draftForDateTable.date) {
          try {
            const ciDate = new Date(draftForDateTable.date);
            if (!isNaN(ciDate.getTime())) {
              const nights = draftForDateTable.nights && draftForDateTable.nights > 0 ? draftForDateTable.nights : 1;
              const coDate = new Date(ciDate);
              coDate.setDate(coDate.getDate() + nights);
              const dateTable = formatDateTableForPrompt(ciDate, coDate);
              if (dateTable) {
                console.log('[DateHelper] Injecting date table into system notes');
                addSystemNote(dateTable);
              }
            }
          } catch (dateTableErr) {
            console.error('[DateHelper] Error generating date table:', dateTableErr.message);
          }
        }

        // Fresh mode check immediately before AI execution to prevent race condition
        const freshChat = await Chat.findById(chat._id).select('mode');
        const currentMode = (freshChat?.mode || chat.mode || '').trim().toLowerCase();
        if (currentMode === 'human' || currentMode === 'staff') {
          logger.info(`Chat ${customerPhone} is in ${currentMode} mode, cancelling AI reply`);
          return;
        }

        const systemNotes = systemNotesList.join('\n\n');
        replyToSend = await getAIResponse(chat, messageText, settings, systemNotes);
      }
    } catch (aiError) {
      logger.error(`[MessageHandler] Error in AI/computation flow: ${aiError.message}`);
      logger.error(`STACK: ${aiError.stack}`);
      replyToSend = buildEmergencyFallback(messageText, chat?.language);
    }

  } catch (outerErr) {
    console.error('[MessageHandler:CRASH] Error:', outerErr.message);
    console.error('[MessageHandler:CRASH] Stack:', outerErr.stack);
    logger.error(`[MessageHandler] Outer error: ${outerErr.message}`);
    logger.error(`OUTER STACK: ${outerErr.stack}`);
    replyToSend = "Samajh nahi aaya, phir se try karo 😊 Ya call karein: 9257657665";
  }

  // ─── INDEPENDENT REPLY SEND BLOCK ───────────────────────────────────
  // Runs NO MATTER WHAT — a DB save error or AI crash can NEVER block message sending!
  try {
    const finalMode = (chat?.mode || '').trim().toLowerCase();
    if (finalMode === 'human' || finalMode === 'staff') {
      logger.info(`[MessageHandler] Chat ${customerPhone} in human mode, blocking reply send`);
      return;
    }

    if (!replyToSend || replyToSend.trim() === '') {
      replyToSend = "Samajh nahi aaya, phir se try karo 😊 Ya call karein: 9257657665";
    }

    const formattedMessage = replyToSend
      .replace(/\\n\\n/g, '\n\n')
      .replace(/\\n/g, '\n');

    console.log('[MessageHandler:Format] Message after formatting:');
    console.log(formattedMessage.substring(0, 200));
    console.log('[MessageHandler:Format] Newline count:', (formattedMessage.match(/\n/g) || []).length);

    // Register fingerprint of outgoing bot reply to catch webhook echoes instantly
    registerBotReplyFingerprint(formattedMessage);
    
    sendResult = await channelManager.sendMessageViaChannel(rawJid, formattedMessage, channel, sessionId);
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
      emitRealtimeUpdate(chat, replyToSend, 'bot');
      
      try {
        const { scoreMessage } = require('./leadScoring');
        await scoreMessage(chat, messageText, replyToSend);
      } catch (_) {}

      // ── FOLLOW-UP TRIGGER & RESCHEDULING (FIX #1 & FIX #2) ──
      const draft = chat.bookingDraft || {};
      if (chat.bookingStage !== 'none' || draft.date || draft.adults) {
        console.log('[FollowUp:Trigger] Scheduling follow-ups for:', {
          chatId: chat._id,
          customerPhone: chat.customerPhone,
          bookingStage: chat.bookingStage
        });

        // Delete old pending follow-ups for this chat so fresh ones start
        try {
          const { FollowUp } = require('../models');
          await FollowUp.deleteMany({
            chatId: chat._id,
            status: 'pending'
          });
        } catch (_) {}

        // Schedule fresh follow-ups
        try {
          await scheduleFollowUps(chat._id, chat.customerPhone);
          console.log('[FollowUp:Reschedule] Follow-ups scheduled successfully');
        } catch (fErr) {
          logger.error(`[FollowUp:Error] Failed to schedule follow-ups: ${fErr.message}`);
        }
      }
    }
  } catch (saveError) {
    logger.error(`[MessageHandler] DB save failed (reply was still sent): ${saveError.message}`);
  }

  console.log('[MessageHandler:EXIT] Message processed successfully');
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

const SYSTEM_PROMPT = `
You are a helpful booking assistant for Nandibaag Resort.

BOOKING PACKAGES & TIMINGS:
══════════════════════════════════════════════════════════════════

1️⃣ OVERNIGHT STAYS (Couple or Group)
   ────────────────────────────────────
   Check-in: 12:00 PM (Noon)
   Check-out: 10:30 AM (Next morning)
   
   What's Included:
   • 4 meals: Breakfast, Lunch, Hi-tea, Dinner
   • Rooms for full night
   • All activities
   
   Pricing:
   • Couple: ₹5,500 (Weekday) / ₹6,500 (Weekend)
   • Group (3+ people): ₹2,000/person (Weekday) / ₹3,000/person (Weekend)
   • Kids: <5 FREE | 6-10 ₹1,000 | 10-15 ₹1,500

2️⃣ ONE-DAY PICNIC PACKAGES (Same-day only)
   ────────────────────────────────────────
   
   Option A: Breakfast → Tea (B→T)
   ─────────────────────────────────
   Check-in: 9:00 AM
   Check-out: 6:30 PM
   
   Meals: Breakfast + Lunch + Hi-tea
   Price: ₹1,000 (Weekday) / ₹1,250 (Weekend)
   
   Option B: Breakfast → Dinner (B→D)
   ────────────────────────────────────
   Check-in: 9:00 AM
   Check-out: 9:30 PM
   
   Meals: Breakfast + Lunch + Hi-tea + Dinner
   Price: ₹1,250 (Weekday) / ₹1,500 (Weekend)
   
   ⚠️ CRITICAL: Day picnic is SAME-DAY ONLY
   NOT overnight stay!

3️⃣ MEAL TIMINGS (for all packages)
   ──────────────────────────────────
   • Breakfast: 9:00 AM - 10:30 AM
   • Lunch: 1:30 PM - 2:30 PM
   • Hi-tea: 5:30 PM - 6:30 PM
   • Dinner: 8:30 PM - 9:30 PM

4️⃣ ACTIVITIES & CAFÉ
   ───────────────────
   Kayaking & Rope Cycling:
   • 9:00 AM - 1:30 PM
   • 3:00 PM - 5:30 PM
   
   Dollers Cafe:
   • 12:00 PM - 12:00 AM (Midnight)

CRUCIAL RULES FOR YOU:
═════════════════════════════════════════════════════════════════════

RULE 1: ALWAYS differentiate between OVERNIGHT and DAY PICNIC
─────────────────────────────────────────────────────────────
When customer asks "timings?":
- If asking about Couple/Group → Tell overnight timings
- If asking about Day Picnic → Tell B→T or B→D timings (9 AM start)
- NEVER confuse them!

RULE 2: If customer asks Day Picnic, ASK MEAL PREFERENCE FIRST
──────────────────────────────────────────────────────────────
Customer: "Day picnic on 29 Aug?"
You: "Great! Would you prefer:
      B→Tea (9 AM - 6:30 PM) or
      B→Dinner (9 AM - 9:30 PM)?"

Then give correct timings based on their choice.

RULE 3: NEVER say Day Picnic has 12 PM check-in
──────────────────────────────────────────────
Day Picnic ALWAYS starts at 9:00 AM (breakfast time)
NOT 12 PM!

RULE 4: Check-out times are DIFFERENT
──────────────────────────────────────
- Overnight check-out: 10:30 AM NEXT DAY
- Day Picnic B→T: 6:30 PM SAME DAY
- Day Picnic B→D: 9:30 PM SAME DAY

EXAMPLE CONVERSATIONS:
═════════════════════════════════════════════════════════════════════

Customer: "What are your timings?"
You: "We have two options:

🏨 OVERNIGHT STAY (Couple/Group):
   Check-in: 12:00 PM | Check-out: 10:30 AM next day
   Price: ₹5,500-₹6,500 (Couple) or ₹2,000-₹3,000/person (Group)

🎉 ONE-DAY PICNIC (Same-day only):
   Option 1 (B→Tea): 9:00 AM - 6:30 PM | ₹1,000-₹1,250
   Option 2 (B→Dinner): 9:00 AM - 9:30 PM | ₹1,250-₹1,500

Which interests you?"

---

Customer: "Day picnic timings?"
You: "One-day picnic starts at 9:00 AM!

Which meal option?
- B→Tea: 9 AM - 6:30 PM | ₹1,000-₹1,250
- B→Dinner: 9 AM - 9:30 PM | ₹1,250-₹1,500

Includes breakfast, lunch, hi-tea (and dinner if B→D)."

---

Customer: "Overnight stay timing?"
You: "For overnight:
Check-in: 12:00 PM (Noon)
Check-out: 10:30 AM next morning

Includes 4 meals + activities."

═════════════════════════════════════════════════════════════════════
`;

module.exports = {
  SYSTEM_PROMPT,
  handleMessage,
  handleIncomingMessage,
  extractBookingDetails,
  isBotReplyFingerprint
};
