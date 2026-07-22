const { Chat, Settings } = require('../models');
const { getAIResponse, detectLanguage } = require('./aiService');
const { scoreMessage } = require('./leadScoring');
const { scheduleFollowUps, cancelPendingFollowUps, containsOptOutPhrases, markChatAsOptedOut } = require('./followUpService');
const { sendMessage } = require('./whatsappService');
const { getCapacityAvailability, suggestRoomCombinations } = require('./availabilityService');
const logger = require('../config/logger');

/**
 * Handles incoming WhatsApp messages
 * 
 * This is the core message routing logic:
 * 1. Find or create Chat document
 * 2. Check mode (AI/human, global/per-chat)
 * 3. If AI mode: generate response, score lead, schedule follow-ups
 * 4. If human mode: notify staff, don't auto-reply
 * 5. Handle opt-out phrases
 * 6. Update chat language detection
 * 
 * @param {string} sessionId - WhatsApp session ID
 * @param {object} message - whatsapp-web.js message object
 */
async function handleMessage(sessionId, message) {
  const tStart = Date.now();
  try {
    // Extract message details
    const contact = message.from;
    const customerPhone = contact.replace('@c.us', '').replace('@s.whatsapp.net', '');
    const messageText = message.body;
    const messageType = message.hasMedia ? 'image' : 'text';
    
    if (!messageText) {
      logger.debug(`Ignoring non-text message from ${customerPhone}`);
      return;
    }
    
    console.log(`[TIMING] [1/6] Received message from WhatsApp at ${new Date().toISOString()}`);
    logger.info(`Processing message from ${customerPhone}: ${messageText.substring(0, 50)}...`);

    // Trigger WhatsApp "typing..." state immediately
    try {
      const waChat = await message.getChat();
      if (waChat && typeof waChat.sendStateTyping === 'function') {
        waChat.sendStateTyping(); // non-blocking, fire-and-forget
      }
    } catch (chatErr) {
      logger.debug(`Failed to send typing state: ${chatErr.message}`);
    }
    
    // Get settings for global mode and resort info
    console.log(`[TIMING] [2/6] Starting prompt building and AI chain execution after ${Date.now() - tStart}ms`);
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
      text: messageText,
      timestamp: new Date(),
      messageType
    });
    
    chat.lastMessageAt = new Date();
    
    // Cancel pending follow-ups since customer is engaged
    await cancelPendingFollowUps(chat._id, 'customer_replied');
    
    // Determine mode (only per-chat mode is used now)
    const mode = chat.mode;
    
    if (mode === 'human') {
      // Human mode - don't auto-reply, just save and notify staff
      await chat.save();
      logger.info(`Chat ${customerPhone} in human mode, message saved, no auto-reply`);
      
      // Emit event to dashboard for staff notification
      const { getIO } = require('../sockets');
      try {
        const io = getIO();
        io.emit('chat:new_message', {
          chatId: chat._id,
          customerPhone,
          message: messageText
        });
      } catch (error) {
        logger.error(`Failed to emit socket event: ${error.message}`);
      }
      
      return;
    }
    
    // AI mode - generate response
    try {
      // ── Phase C: Availability check before AI response ──────────────
      let systemNotes = '';
      const draft = chat.bookingDraft || {};
      const prevStage = chat.bookingStage;

      // Detect if customer is changing date/guest count after availability was already checked
      if (draft.availabilityChecked && draft.date && draft.adults) {
        const msgLower = messageText.toLowerCase();
        const dateChangePatterns = /\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|today|yesterday|weekend|weekday|this\s+(saturday|sunday|monday|friday)/i;
        const guestChangePatterns = /(\d+)\s*(log|guest|people|person|adult|ladk|ladki|bache)/i;
        const mentionsDate = dateChangePatterns.test(msgLower);
        const mentionsGuests = guestChangePatterns.test(msgLower);

        if (mentionsDate || mentionsGuests) {
          // Customer changed inputs — reset availability so we re-check
          chat.bookingDraft.availabilityChecked = false;
          chat.bookingDraft.availabilityConfirmed = false;
          chat.bookingDraft.roomPreference = 'not_applicable';
          chat.bookingDraft.suggestedCombination = null;
          logger.info(`Customer changed date/guests, resetting availability for re-check`);
        }
      }

      // Determine if we need to run availability check now
      // Trigger: we have date + guest count, and availability hasn't been checked yet (or was reset)
      const needsAvailabilityCheck =
        draft.date &&
        draft.adults &&
        draft.adults > 0 &&
        !draft.availabilityChecked &&
        // Only check when we're at the guest-count stage or transitioning past it
        ['guests_given', 'kids_given', 'married_checked'].includes(prevStage);

      if (needsAvailabilityCheck) {
        try {
          // Parse check-in date
          const checkInDate = new Date(draft.date);
          if (isNaN(checkInDate.getTime())) {
            logger.warn(`Could not parse booking draft date: "${draft.date}", skipping availability check`);
          } else {
            // Calculate check-out date (default 1 night)
            const nights = draft.nights && draft.nights > 0 ? draft.nights : 1;
            const checkOutDate = new Date(checkInDate);
            checkOutDate.setDate(checkOutDate.getDate() + nights);

            const guestCount = draft.adults + (draft.kids?.length || 0);

            // Step 1: Check capacity-level availability
            const capacityResult = await getCapacityAvailability(checkInDate, checkOutDate, guestCount);

            if (!capacityResult.available) {
              // No rooms at all for this capacity/dates
              systemNotes = '[SYSTEM NOTE: No availability — all rooms of sufficient capacity are booked for these dates. Do NOT quote any price. Politely tell the customer rooms are full for this date and ask them to try a different date.]';

              chat.bookingDraft.availabilityChecked = true;
              chat.bookingDraft.availabilityConfirmed = false;
              chat.bookingDraft.roomPreference = 'not_applicable';
              chat.bookingDraft.suggestedCombination = null;

              logger.info(`Availability check: NO rooms available for ${guestCount} guests, ${checkInDate.toISOString()} to ${checkOutDate.toISOString()}`);
            } else {
              // Some rooms available — check if guest count exceeds any single room
              const hasSingleRoom = capacityResult.available; // already checked above with guestCount as minCapacity

              // Also check if there's a tight-fit option (single room with capacity >= guestCount but close)
              const allRoomsResult = await getCapacityAvailability(checkInDate, checkOutDate, 1);
              const breakdownEntries = Object.values(allRoomsResult.breakdown || {});
              const maxCapacityAvailable = breakdownEntries.reduce((max, b) => Math.max(max, b.capacity), 0);

              if (hasSingleRoom) {
                // Normal fit — at least one room can hold everyone comfortably
                systemNotes = `[SYSTEM NOTE: Availability confirmed for ${guestCount} guests on ${checkInDate.toISOString()} to ${checkOutDate.toISOString()}. ${capacityResult.availableCount} room(s) available at this capacity. Proceed with booking flow normally.]`;

                chat.bookingDraft.availabilityChecked = true;
                chat.bookingDraft.availabilityConfirmed = true;
                chat.bookingDraft.roomPreference = 'not_applicable';
                chat.bookingDraft.suggestedCombination = null;

                logger.info(`Availability check: confirmed for ${guestCount} guests, ${capacityResult.availableCount} rooms available`);
              } else if (maxCapacityAvailable >= guestCount) {
                // A single room exists with enough capacity but it's tight
                systemNotes = `[SYSTEM NOTE: Guest count (${guestCount}) fits in a single room of capacity ${maxCapacityAvailable} but it will be a tight fit. Available options: 1 room of capacity ${maxCapacityAvailable} (tight fit). Ask the customer if they are okay with a tight fit in one room, or if they would prefer multiple rooms. Do NOT quote a price until they decide.]`;

                chat.bookingDraft.availabilityChecked = true;
                chat.bookingDraft.availabilityConfirmed = true;
                chat.bookingDraft.roomPreference = 'single_room_tight_fit';
                chat.bookingDraft.suggestedCombination = `1x capacity-${maxCapacityAvailable} (tight fit)`;

                logger.info(`Availability check: tight fit for ${guestCount} guests in capacity-${maxCapacityAvailable} room`);
              } else {
                // Guest count exceeds single room — need multi-room suggestion
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
                  // No valid combinations at all
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
          // Don't block the conversation — let it proceed without availability note
          // The AI won't have a system note and will proceed normally
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
      
      // Update conversation state
      if (chat.isNewConversation) {
        chat.isNewConversation = false;
      }
      
      await chat.save();
      
      // Send reply via WhatsApp
      const tSendStart = Date.now();
      console.log(`[TIMING] [5/6] Sending message back via WhatsApp at ${new Date().toISOString()}`);
      await sendMessage(sessionId, customerPhone, aiReply);
      console.log(`[TIMING] [6/6] Sent message back via WhatsApp in ${Date.now() - tSendStart}ms. Total end-to-end processing time: ${Date.now() - tStart}ms.`);
      
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
      
      // Save chat even if AI fails
      await chat.save();
      
      // Emit AI failure alert
      const { emitAIFailureAlert } = require('./leadScoring');
      emitAIFailureAlert(chat._id, customerPhone, aiError.message);
    }
    
  } catch (error) {
    logger.error(`Error handling message: ${error.message}`);
    // Don't throw - let the message queue continue
  }
}

module.exports = {
  handleMessage
};
