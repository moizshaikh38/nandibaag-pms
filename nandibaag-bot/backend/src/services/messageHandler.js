const { Chat, Settings } = require('../models');
const { getAIResponse, detectLanguage } = require('./aiService');
const { scoreMessage } = require('./leadScoring');
const { scheduleFollowUps, cancelPendingFollowUps, containsOptOutPhrases, markChatAsOptedOut } = require('./followUpService');
const whatsappService = require('./whatsappService');
const { getCapacityAvailability, suggestRoomCombinations } = require('./availabilityService');
const logger = require('../config/logger');

/**
 * Handles incoming WhatsApp messages (Baileys compatible)
 * 
 * @param {string} sessionId - WhatsApp session ID
 * @param {object} msg - Baileys proto.IWebMessageInfo object
 */
async function handleMessage(sessionId, msg) {
  const tStart = Date.now();
  try {
    // Extract customer phone
    const customerPhone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
    
    // Extract text from the incoming message object
    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    
    // Check for media
    const hasMedia = !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.documentMessage || msg.message?.stickerMessage);
    const messageType = hasMedia ? 'image' : 'text';
    
    if (!messageText && !hasMedia) {
      logger.debug(`Ignoring non-text/non-media message from ${customerPhone}`);
      return;
    }
    
    console.log(`[TIMING] [1/6] Received message from WhatsApp at ${new Date().toISOString()}`);
    logger.info(`Processing message from ${customerPhone}: ${messageText.substring(0, 50)}...`);

    // Trigger WhatsApp typing state via Baileys presence update
    const sock = whatsappService.activeSockets.get(sessionId);
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
    
    // Find or create chat
    let chat = await Chat.findOne({ customerPhone });
    
    if (!chat) {
      chat = new Chat({
        customerPhone,
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
      logger.info(`Created new chat for ${customerPhone}`);
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
      messageType
    });
    
    chat.lastMessageAt = new Date();
    
    // Cancel pending follow-ups since customer is engaged
    await cancelPendingFollowUps(chat._id, 'customer_replied');
    
    const mode = chat.mode;
    
    if (mode === 'human') {
      await chat.save();
      logger.info(`Chat ${customerPhone} in human mode, message saved, no auto-reply`);
      
      const { getIO } = require('../sockets');
      try {
        const io = getIO();
        io.emit('chat:new_message', {
          chatId: chat._id,
          customerPhone,
          message: messageText || '[Media]'
        });
      } catch (error) {
        logger.error(`Failed to emit socket event: ${error.message}`);
      }
      
      // Stop typing presence
      if (sock) {
        try {
          await sock.sendPresenceUpdate('paused', msg.key.remoteJid);
        } catch (e) {}
      }
      return;
    }
    
    // AI mode - generate response
    try {
      let systemNotes = '';
      const draft = chat.bookingDraft || {};
      const prevStage = chat.bookingStage;

      if (draft.availabilityChecked && draft.date && draft.adults) {
        const msgLower = messageText.toLowerCase();
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
        !draft.availabilityChecked &&
        ['guests_given', 'kids_given', 'married_checked'].includes(prevStage);

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
              systemNotes = '[SYSTEM NOTE: No availability — all rooms of sufficient capacity are booked for these dates. Do NOT quote any price. Politely tell the customer rooms are full for this date and ask them to try a different date.]';

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
                systemNotes = `[SYSTEM NOTE: Availability confirmed for ${guestCount} guests on ${checkInDate.toISOString()} to ${checkOutDate.toISOString()}. ${capacityResult.availableCount} room(s) available at this capacity. Proceed with booking flow normally.]`;

                chat.bookingDraft.availabilityChecked = true;
                chat.bookingDraft.availabilityConfirmed = true;
                chat.bookingDraft.roomPreference = 'not_applicable';
                chat.bookingDraft.suggestedCombination = null;

                logger.info(`Availability check: confirmed for ${guestCount} guests, ${capacityResult.availableCount} rooms available`);
              } else if (maxCapacityAvailable >= guestCount) {
                systemNotes = `[SYSTEM NOTE: Guest count (${guestCount}) fits in a single room of capacity ${maxCapacityAvailable} but it will be a tight fit. Available options: 1 room of capacity ${maxCapacityAvailable} (tight fit). Ask the customer if they are okay with a tight fit in one room, or if they would prefer multiple rooms. Do NOT quote a price until they decide.]`;

                chat.bookingDraft.availabilityChecked = true;
                chat.bookingDraft.availabilityConfirmed = true;
                chat.bookingDraft.roomPreference = 'single_room_tight_fit';
                chat.bookingDraft.suggestedCombination = `1x capacity-${maxCapacityAvailable} (tight fit)`;

                logger.info(`Availability check: tight fit for ${guestCount} guests in capacity-${maxCapacityAvailable} room`);
              } else {
                const combinations = await suggestRoomCombinations(checkInDate, checkOutDate, guestCount);

                if (combinations.available && combinations.suggestions.length > 0) {
                  const suggestionDescriptions = combinations.suggestions.map(s => s.description).join('; ');
                  systemNotes = `[SYSTEM NOTE: Guest count (${guestCount}) exceeds single room capacity. Available options: ${suggestionDescriptions}. Ask the customer whether they prefer a tight fit in one bigger room OR multiple smaller rooms. Present the options without mentioning room numbers. Do NOT quote a price until they decide.]`;

                  chat.bookingDraft.availabilityChecked = true;
                  chat.bookingDraft.availabilityConfirmed = true;
                  chat.bookingDraft.roomPreference = 'multiple_rooms';
                  chat.bookingDraft.suggestedCombination = suggestionDescriptions;

                  logger.info(`Availability check: multi-room needed for ${guestCount} guests, suggestions: ${suggestionDescriptions}`);
                } else {
                  systemNotes = '[SYSTEM NOTE: No availability — cannot fit the guest count in any room combination for these dates. Do NOT quote any price. Politely tell the customer and ask for a different date.]';

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

      const aiReply = await getAIResponse(chat, messageText, settings, systemNotes);
      console.log(`[TIMING] [4/6] getAIResponse finished, AI reply generated in ${Date.now() - tStart}ms`);
      
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
      
      // Send reply via WhatsApp
      const tSendStart = Date.now();
      console.log(`[TIMING] [5/6] Sending message back via WhatsApp at ${new Date().toISOString()}`);
      await whatsappService.sendMessage(sessionId, customerPhone, aiReply);
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
      
      logger.info(`AI response sent to ${customerPhone}`);
      
    } catch (aiError) {
      logger.error(`AI generation failed for ${customerPhone}: ${aiError.message}`);
      
      // Stop typing state presence on error
      if (sock) {
        try {
          await sock.sendPresenceUpdate('paused', msg.key.remoteJid);
        } catch (e) {}
      }

      await chat.save();
      
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
