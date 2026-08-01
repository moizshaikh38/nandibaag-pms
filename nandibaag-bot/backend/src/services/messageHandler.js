const { Chat, Settings } = require('../models');
const { getAIResponse, detectLanguage } = require('./aiService');
const { calculatePricing } = require('./pricingService');
const { scoreMessage } = require('./leadScoring');
const { scheduleFollowUps, cancelPendingFollowUps, containsOptOutPhrases, markChatAsOptedOut } = require('./followUpService');
const whatsappService = require('./whatsappService');
const { getCapacityAvailability, suggestRoomCombinations } = require('./availabilityService');
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

  const dayMonthRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/i;
  const monthDayRegex = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
  const numericDateRegex = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/;

  let targetDate = null;
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

  if (targetDate && !isNaN(targetDate.getTime())) {
    result.date = targetDate.toISOString().split('T')[0];
  }

  const adultMatch = lower.match(/(\d+)\s*(?:adult|adults|adlt|bade)/i);
  const kidMatch = lower.match(/(\d+)\s*(?:kid|kids|child|children|bache|bhaache)/i);
  const totalGuestMatch = lower.match(/(\d+)\s*(?:guest|guests|people|person|log|members|pax|janan|janansathi)/i);

  if (adultMatch) {
    result.adults = parseInt(adultMatch[1], 10);
  }
  if (kidMatch) {
    const numKids = parseInt(kidMatch[1], 10);
    result.kids = Array(numKids).fill(5);
  }

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
 * Handles incoming WhatsApp messages (Baileys compatible)
 * 
 * @param {string} sessionId - WhatsApp session ID
 * @param {object} msg - Baileys proto.IWebMessageInfo object
 */
async function handleMessage(sessionId, msg) {
  const tStart = Date.now();
  try {
    // Extract customer phone (always clean numeric phone string)
    const rawJid = msg.key.remoteJid;
    let customerPhone = '';
    if (msg.key.participant && msg.key.participant.includes('@s.whatsapp.net')) {
      customerPhone = msg.key.participant.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    } else {
      customerPhone = rawJid.split('@')[0].replace(/\D/g, '');
    }
    
    // Extract text from the incoming message object
    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    
    // Check for media
    const hasMedia = !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.documentMessage || msg.message?.stickerMessage);
    const messageType = hasMedia ? 'image' : 'text';
    
    if (!messageText && !hasMedia) {
      logger.debug(`Ignoring non-text/non-media message from ${customerPhone}`);
      return;
    }

    // Handle outgoing messages sent directly from phone or bot
    if (msg.key.fromMe) {
      let chat = await Chat.findOne({ customerPhone });
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
            await chat.save();

            try {
              const { getIO } = require('../sockets');
              const io = getIO();
              if (io) {
                io.emit('chat:updated', chat);
                io.emit('chat:new_message', {
                  chatId: chat._id,
                  customerPhone,
                  customerName: chat.customerName,
                  message: text,
                  sender: 'agent',
                  chat
                });
              }
            } catch (socketErr) {}
          }
        }
      }
      return;
    }
    
    console.log(`[TIMING] [1/6] Received message from WhatsApp at ${new Date().toISOString()}`);
    logger.info(`Processing message from ${customerPhone}: ${messageText.substring(0, 50)}...`);

    // Trigger WhatsApp typing state via Baileys presence update
    const sockEntry = whatsappService.activeSockets.get(sessionId);
    const sock = sockEntry?.sock || null;
    if (sock) {
      try {
        await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
      } catch (presErr) {
        logger.debug(`Failed to send composing presence: ${presErr.message}`);
      }
    }
    
    const settings = await Settings.findOne();
    if (!settings) {
      logger.error('Settings not found');
      return;
    }
    
    // Extract customer push name from WhatsApp profile if available
    const pushName = msg.pushName;
    
    // Find or create chat
    let chat = await Chat.findOne({ customerPhone });
    
    if (!chat) {
      chat = new Chat({
        customerPhone,
        customerName: pushName || null,
        whatsappNumberUsed: sessionId,
        mode: settings.globalMode,
        language: 'unknown',
        messages: [],
        bookingStage: 'none',
        bookingDraft: {},
        isNewConversation: true,
        isArchived: false
      });
      await chat.save();
      logger.info(`Created new chat for ${customerPhone} (Name: ${pushName || 'N/A'})`);
    } else if (pushName && (!chat.customerName || chat.customerName !== pushName)) {
      chat.customerName = pushName;
    }
    
    // Check for opt-out phrases
    if (containsOptOutPhrases(messageText)) {
      await markChatAsOptedOut(chat._id);
      logger.info(`Customer ${customerPhone} opted out`);
      return;
    }
    
    // Update chat language detection
    const detectedLanguage = detectLanguage(messageText);
    if (chat.language === 'unknown' || chat.language !== detectedLanguage) {
      chat.language = detectedLanguage;
    }
    
    // Add customer message to chat
    chat.messages.push({
      sender: 'customer',
      text: messageText || '[Media]',
      timestamp: new Date(),
      messageType,
      deliveryStatus: 'sent'
    });
    
    chat.lastMessageAt = new Date();
    
    // Cancel pending follow-ups since customer is engaged
    await cancelPendingFollowUps(chat._id, 'customer_replied');

    // Helper to emit real-time updates
    const emitRealtimeUpdate = (customMsgText, sender = 'customer') => {
      try {
        const { getIO } = require('../sockets');
        const io = getIO();
        if (io) {
          console.log(`[messageHandler] EMITTING Socket.io event 'chat:updated' & 'chat:new_message' for ${customerPhone}`);
          io.emit('chat:updated', chat);
          io.emit('chat:new_message', {
            chatId: chat._id,
            customerPhone,
            customerName: chat.customerName,
            message: customMsgText,
            sender,
            chat
          });
          io.emit('new_message', {
            chatId: chat._id,
            customerPhone,
            customerName: chat.customerName,
            message: customMsgText,
            sender,
            chat
          });
        }
      } catch (error) {
        logger.error(`Failed to emit socket event: ${error.message}`);
      }
    };
    
    const mode = chat.mode;
    
    // In human mode, ONLY staff should respond - AI should never reply
    if (mode === 'human') {
      await chat.save();
      logger.info(`Chat ${customerPhone} in human mode, message saved, emitting socket event`);
      
      emitRealtimeUpdate(messageText || '[Media]', 'customer');
      
      // Stop typing presence
      if (sock) {
        try {
          await sock.sendPresenceUpdate('paused', msg.key.remoteJid);
        } catch (e) {}
      }
      return;
    }

    console.log(`[MessageHandler] Processing in AI mode`);
    
    // In AI mode, emit immediately when customer message arrives so dashboard updates instantly!
    emitRealtimeUpdate(messageText || '[Media]', 'customer');
    
    // AI mode - generate response
    try {
      const systemNotesList = [];
      const addSystemNote = (note) => {
        if (note) systemNotesList.push(note);
      };
      
      console.log(`[MessageHandler] Starting AI response generation for ${customerPhone}`);
      console.log(`[MessageHandler] Chat mode: ${mode}`);

      const msgLower = (messageText || '').toLowerCase();
      const bookingType = detectBookingType(messageText);
      const discountIntent = isDiscountIntent(messageText);
      const greetingOnly = isGreetingOnly(messageText);

      if (bookingType) {
        chat.bookingDraft.bookingType = bookingType;
        if (chat.bookingStage === 'none') chat.bookingStage = 'type_selected';
      }

      if (greetingOnly) {
        addSystemNote('[SYSTEM NOTE: Customer only greeted. Do NOT mention old dates, guest counts, or previous package choices unless the customer asks to continue. Send one short welcome line and ask whether they want Couple Stay, Family Group Stay, or Day Picnic.]');
      }

      if (discountIntent) {
        addSystemNote('[SYSTEM NOTE: Customer is asking for a discount / lower price. Do NOT ask for date or guests again if pricing was already discussed. Politely say rates are already best/final because food, activities, and facilities are included. For special approval or group offer, ask them to call staff at 9257657665. Keep it warm and short.]');
      }
      
      // Natural language date and guest count extraction from customer text
      const extracted = extractBookingDetails(messageText);
      if (extracted.date) {
        chat.bookingDraft.date = extracted.date;
        logger.info(`Extracted natural language date: ${extracted.date} from message "${messageText}"`);
      }
      if (extracted.adults) {
        chat.bookingDraft.adults = extracted.adults;
        logger.info(`Extracted natural language adult count: ${extracted.adults} from message "${messageText}"`);
      }
      if (extracted.kids) {
        chat.bookingDraft.kids = extracted.kids;
        logger.info(`Extracted natural language kid count: ${extracted.kids.length} from message "${messageText}"`);
      }
      if (chat.bookingDraft.date && chat.bookingDraft.adults && chat.bookingStage !== 'price_quoted' && chat.bookingStage !== 'completed') {
        chat.bookingStage = 'guests_given';
      }

      const draft = chat.bookingDraft || {};
      const prevStage = chat.bookingStage;

      if (draft.availabilityChecked && draft.date && draft.adults) {
        const dateChangePatterns = /\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|today|yesterday|weekend|weekday|this\s+(saturday|sunday|monday|friday)/i;
        const guestChangePatterns = /(\d+)\s*(log|guest|people|person|adult|ladk|ladki|bache)/i;
        const mentionsDate = dateChangePatterns.test(msgLower);
        const mentionsGuests = guestChangePatterns.test(msgLower);

        if (mentionsDate || mentionsGuests) {
          chat.bookingDraft.availabilityChecked = false;
          chat.bookingDraft.availabilityConfirmed = false;
          chat.bookingDraft.roomPreference = 'not_applicable';
          chat.bookingDraft.suggestedCombination = null;
          logger.info(`Customer changed date/guests, resetting availability for re-check`);
        }
      }

      const needsAvailabilityCheck =
        draft.date &&
        draft.adults &&
        draft.adults > 0 &&
        !draft.availabilityChecked;

      if (needsAvailabilityCheck) {
        try {
          const checkInDate = new Date(draft.date);
          if (isNaN(checkInDate.getTime())) {
            logger.warn(`Could not parse booking draft date: "${draft.date}", skipping availability check`);
          } else {
            const nights = draft.nights && draft.nights > 0 ? draft.nights : 1;
            const checkOutDate = new Date(checkInDate);
            checkOutDate.setDate(checkOutDate.getDate() + nights);

            const guestCount = draft.adults + (draft.kids?.length || 0);

            const capacityResult = await getCapacityAvailability(checkInDate, checkOutDate, guestCount);

            if (!capacityResult.available) {
              addSystemNote('[SYSTEM NOTE: No availability — all rooms of sufficient capacity are booked for these dates. Do NOT quote any price. Politely tell the customer rooms are full for this date and ask them to try a different date.]');

              chat.bookingDraft.availabilityChecked = true;
              chat.bookingDraft.availabilityConfirmed = false;
              chat.bookingDraft.roomPreference = 'not_applicable';
              chat.bookingDraft.suggestedCombination = null;

              logger.info(`Availability check: NO rooms available for ${guestCount} guests, ${checkInDate.toISOString()} to ${checkOutDate.toISOString()}`);
            } else {
              const hasSingleRoom = capacityResult.available;

              const allRoomsResult = await getCapacityAvailability(checkInDate, checkOutDate, 1);
              const breakdownEntries = Object.values(allRoomsResult.breakdown || {});
              const maxCapacityAvailable = breakdownEntries.reduce((max, b) => Math.max(max, b.capacity), 0);

              if (hasSingleRoom) {
                const pricingResult = calculatePricing(checkInDate, checkOutDate, guestCount);

                addSystemNote(`[SYSTEM NOTE: Availability confirmed for ${guestCount} guests on ${checkInDate.toISOString()} to ${checkOutDate.toISOString()}.\n\nAUTHORITATIVE BACKEND PRICING BREAKDOWN:\n${pricingResult.formatted}\n\nINSTRUCTION: Present this exact pricing breakdown to the customer. Do NOT recalculate or alter any numbers.]`);

                chat.bookingDraft.availabilityChecked = true;
                chat.bookingDraft.availabilityConfirmed = true;
                chat.bookingDraft.roomPreference = 'not_applicable';
                chat.bookingDraft.suggestedCombination = null;

                logger.info(`Availability check: confirmed for ${guestCount} guests, ${capacityResult.availableCount} rooms available`);
              } else if (maxCapacityAvailable >= guestCount) {
                addSystemNote(`[SYSTEM NOTE: Guest count (${guestCount}) fits in a single room of capacity ${maxCapacityAvailable} but it will be a tight fit. Available options: 1 room of capacity ${maxCapacityAvailable} (tight fit). Ask the customer if they are okay with a tight fit in one room, or if they would prefer multiple rooms. Do NOT quote a price until they decide.]`);

                chat.bookingDraft.availabilityChecked = true;
                chat.bookingDraft.availabilityConfirmed = true;
                chat.bookingDraft.roomPreference = 'single_room_tight_fit';
                chat.bookingDraft.suggestedCombination = `1x capacity-${maxCapacityAvailable} (tight fit)`;

                logger.info(`Availability check: tight fit for ${guestCount} guests in capacity-${maxCapacityAvailable} room`);
              } else {
                const combinations = await suggestRoomCombinations(checkInDate, checkOutDate, guestCount);

                if (combinations.available && combinations.suggestions.length > 0) {
                  const suggestionDescriptions = combinations.suggestions.map(s => s.description).join('; ');
                  addSystemNote(`[SYSTEM NOTE: Guest count (${guestCount}) exceeds single room capacity. Available options: ${suggestionDescriptions}. Ask the customer whether they prefer a tight fit in one bigger room OR multiple smaller rooms. Present the options without mentioning room numbers. Do NOT quote a price until they decide.]`);

                  chat.bookingDraft.availabilityChecked = true;
                  chat.bookingDraft.availabilityConfirmed = true;
                  chat.bookingDraft.roomPreference = 'multiple_rooms';
                  chat.bookingDraft.suggestedCombination = suggestionDescriptions;

                  logger.info(`Availability check: multi-room needed for ${guestCount} guests, suggestions: ${suggestionDescriptions}`);
                } else {
                  addSystemNote('[SYSTEM NOTE: No availability — cannot fit the guest count in any room combination for these dates. Do NOT quote any price. Politely tell the customer and ask for a different date.]');

                  chat.bookingDraft.availabilityChecked = true;
                  chat.bookingDraft.availabilityConfirmed = false;
                  chat.bookingDraft.roomPreference = 'not_applicable';
                  chat.bookingDraft.suggestedCombination = null;

                  logger.info(`Availability check: no valid combinations for ${guestCount} guests`);
                }
              }
            }
          }
        } catch (availErr) {
          logger.error(`Availability check failed: ${availErr.message}`);
        }
      }

      const systemNotes = systemNotesList.join('\n\n');
      const aiReply = await getAIResponse(chat, messageText, settings, systemNotes);
      console.log(`[TIMING] [4/6] getAIResponse finished, AI reply generated in ${Date.now() - tStart}ms`);
      console.log(`[MessageHandler] AI reply received: "${aiReply?.substring(0, 50)}..."`);
      
      if (!aiReply || aiReply.trim() === '') {
        console.error(`[MessageHandler] AI reply is empty! Skipping message send.`);
        return;
      }
      
      // Add AI reply to chat
      chat.messages.push({
        sender: 'bot',
        text: aiReply,
        timestamp: new Date(),
        messageType: 'text'
      });
      
      if (chat.isNewConversation) {
        chat.isNewConversation = false;
      }
      
      await chat.save();
      console.log(`[MessageHandler] Chat saved with AI reply`);
      
      // Send reply via WhatsApp
      const tSendStart = Date.now();
      console.log(`[TIMING] [5/6] Sending message back via WhatsApp at ${new Date().toISOString()}`);
      console.log(`[MessageHandler] Sending to: ${rawJid}, Session: ${sessionId}`);
      
      const sendResult = await whatsappService.sendMessage(sessionId, rawJid, aiReply);
      
      console.log(`[MessageHandler] WhatsApp send result: ${sendResult ? 'SUCCESS' : 'FAILED'}`);
      console.log(`[TIMING] [6/6] Sent message back via WhatsApp in ${Date.now() - tSendStart}ms. Total end-to-end processing time: ${Date.now() - tStart}ms.`);
      
      // Stop typing state presence
      if (sock) {
        try {
          await sock.sendPresenceUpdate('paused', msg.key.remoteJid);
        } catch (presErr) {}
      }

      // Score the message for lead tracking
      await scoreMessage(chat, messageText, aiReply);
      
      // Schedule follow-ups if this is first booking interest
      const previousStage = chat.bookingStage;
      if (previousStage === 'none' && chat.bookingStage !== 'none') {
        await scheduleFollowUps(chat._id, customerPhone);
      }
      
      emitRealtimeUpdate(aiReply, 'bot');
      logger.info(`AI response sent to ${customerPhone}`);
      
    } catch (aiError) {
      logger.error(`AI generation failed for ${customerPhone}: ${aiError.message}`);
      
      const fallbackReply = buildEmergencyFallback(messageText, chat.language);
      
      chat.messages.push({
        sender: 'bot',
        text: fallbackReply,
        timestamp: new Date(),
        messageType: 'text'
      });
      await chat.save();

      try {
        await whatsappService.sendMessage(sessionId, rawJid, fallbackReply);
      } catch (sendErr) {
        logger.error(`Failed to send fallback message to ${customerPhone}: ${sendErr.message}`);
      }

      if (sock) {
        try {
          await sock.sendPresenceUpdate('paused', msg.key.remoteJid);
        } catch (e) {}
      }

      emitRealtimeUpdate(fallbackReply, 'bot');

      const { emitAIFailureAlert } = require('./leadScoring');
      emitAIFailureAlert(chat._id, customerPhone, aiError.message);
    }
    
  } catch (error) {
    logger.error(`Error handling message: ${error.message}`);
  }
}

module.exports = {
  handleMessage
};
