/**
 * Centralized Selective-Response Router for Nandibaag Resort WhatsApp Chatbot Backend.
 * 
 * V2 Selective-Response Architecture:
 * Supports first-class intentional silence, context-aware intent routing,
 * availability suppression, safe token/word-boundary matching, and conservative defaults.
 */

const logger = require('../config/logger');

// Categories supported by the router
const CATEGORIES = {
  RESORT_QUERY: 'RESORT_QUERY',
  AVAILABILITY_ONLY: 'AVAILABILITY_ONLY',
  MIXED_RESORT_AVAILABILITY: 'MIXED_RESORT_AVAILABILITY',
  ACKNOWLEDGEMENT: 'ACKNOWLEDGEMENT',
  IRRELEVANT: 'IRRELEVANT',
  UNCERTAIN: 'UNCERTAIN'
};

// Standalone acknowledgement words / phrases
const ACK_WORDS = new Set([
  'ok', 'okay', 'okk', 'okey', 'k', 'kk', 'acha', 'accha', 'achha', 'achaa',
  'thik', 'theek', 'thik hai', 'theek hai', 'hmm', 'hm', 'hmmm', 'haan', 'han', 'ha',
  'yes', 'yep', 'yeah', 'thanks', 'thank you', 'thank u', 'thx', 'dhanyavad',
  'shukriya', 'cool', 'great', 'superb', 'nice', 'good', 'done', 'perfect',
  'alright', 'all right', 'sure', 'noted', 'samajh gaya', 'samja', 'got it'
]);

// Emoji regex for reactions and short emojis
const EMOJI_REGEX = /^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+$/u;

/**
 * Checks if text is purely an acknowledgement or emoji reaction.
 */
function isStandaloneAcknowledgement(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (EMOJI_REGEX.test(trimmed)) {
    return true;
  }

  // Normalize punctuation and extra spaces
  const clean = trimmed
    .toLowerCase()
    .replace(/[!.,?~🙏👍👌❤️😊🎉🌿\-_\/\\;:'"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return ACK_WORDS.has(clean);
}

/**
 * Safe word-boundary check for exact payment intent.
 * Prevents false positives like "pajupis pulav" or "equipment details".
 */
function isExactPaymentIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return /\b(upi|payment|scanner|how\s+to\s+pay|payment\s+method|advance\s+payment|gpay|phonepe|paytm|bank\s+transfer|account\s+details|qr\s*code|scan\s*code|pay\s+kaise|kaise\s+pay)\b/i.test(lower);
}

/**
 * Safe word-boundary check for video intent.
 */
function isExactVideoIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return /\b(videos?|room\s+videos?|cottage\s+videos?|resort\s+videos?)\b/i.test(lower);
}

/**
 * Check if customer message is a greeting only.
 */
function isGreetingOnly(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  return /^(hi|hello|hey|hii+|namaste|namaskar|good\s+(morning|afternoon|evening)|salam|salaam)[\s!.🙏🌿]*$/i.test(trimmed);
}

/**
 * Safe word-boundary check for relative date tokens.
 * Solves "Kalyan" matching "kal", etc.
 */
function isRelativeDateToken(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return /\b(tomorrow|kal|udya|today|aaj|parso|parva|yesterday|this\s+weekend|next\s+weekend|weekend)\b/i.test(lower);
}

/**
 * Detects if a message contains an availability inquiry.
 */
function hasAvailabilityIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();

  // Explicit availability keywords with word boundaries
  const availRegex = /\b(available|availability|availibility|availablity|vacancy|vacant|free\s+rooms?|rooms?\s+(free|hoga|hogi|milega|milegi|milenge|available)|dates?\s+available|booking\s+possible|room\s+mil\s+sakta|room\s+milega|room\s+milegi|stay\s+milega)\b/i;
  if (availRegex.test(lower)) return true;

  // Marathi availability phrasings
  if (/\b(available\s+aahe|khali\s+aahe|shilak\s+aahe|bhetel\s+ka|milel\s+ka|room\s+aahe\s+ka)\b/i.test(lower)) return true;

  // Relative/date query asking if possible: e.g. "27 ko available hai?", "kal room milega?"
  if (/\b(available\s*hai|khali\s*hai|milega|mil\s*sakta|hoga|hogi)\b/i.test(lower) && 
      /\b(\d{1,2}\s*(sep|aug|oct|nov|dec|jan|feb|mar|apr|may|jun|jul)|room|rooms|cottage|stay|kal|aaj|udya|dates?)\b/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Detects if a message asks about Nandibaag Resort topics OTHER than availability.
 * (e.g. pricing, packages, activities, food, location, timings, policies, etc.)
 */
function hasOtherResortQuery(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();

  // Pricing / Packages (Notice 'kay' is NOT here!)
  if (/\b(price|pricing|rate|rates|cost|charge|charges|package|packages|total|grand\s*total|bill|amount|kitna|kitne|kitni|kiti|discount|offer|best\s*price|final\s*price|kam|kami|sasta)\b/i.test(lower)) {
    return true;
  }

  // Stays & Packages
  if (/\b(couple|couple\s*stay|group|group\s*stay|family|family\s*stay|day\s*picnic|one\s*day|picnic|water\s*park|overnight|cottage|cottages|villa|private\s*room)\b/i.test(lower)) {
    return true;
  }

  // Food & Dining
  if (/\b(food|menu|breakfast|lunch|dinner|tea|hi-tea|veg|jain|non-?veg|nonveg|chicken|meal|meals|khana|jevan)\b/i.test(lower)) {
    return true;
  }

  // Activities & Facilities
  if (/\b(activities|activity|kayaking|rope\s*cycling|pool|swimming|swimming\s*pool|games|indoor\s*games|outdoor\s*games|rain\s*dance|music|dj|cafe|dollers)\b/i.test(lower)) {
    return true;
  }

  // Timings
  if (/\b(timings?|check-?in|check-?out|samay|vel)\b/i.test(lower)) {
    return true;
  }

  // Location & Directions / How to reach
  if (/\b(location|address|map|maps|kaha|kahan|kuth|kuthe|directions?|route|rasta|distance|how\s+to\s+reach|reach|cab|taxi|station|karjat|kaise\s+(aau|aana|aaye|pahunche|pahuche|jaaye)|kase\s+yayche)\b/i.test(lower)) {
    return true;
  }

  // Photos & Media
  if (/\b(photo|photos|pic|pics|picture|pictures|video|videos|gallery|images?|dekhao|dikhaye)\b/i.test(lower)) {
    return true;
  }

  // Policies & Rules
  if (/\b(pet|pets|dog|dogs|alcohol|liquor|drink|beer|policy|rules|wifi|parking|cancel|cancelled|cancellation|refund|postpone|advance|allowed)\b/i.test(lower)) {
    return true;
  }

  // Contact
  if (/\b(contact|phone|number|call|staff|manager)\b/i.test(lower)) {
    return true;
  }

  // Payment
  if (isExactPaymentIntent(lower)) {
    return true;
  }

  return false;
}

/**
 * Detects if a message is clearly irrelevant, off-topic, or spam.
 */
function isIrrelevantOrOffTopic(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase().trim();

  // Sports
  if (/\b(cricket|ipl|world\s*cup|india\s*match|match\s*kab\s*hai|football|messi|ronaldo|score)\b/i.test(lower)) {
    return true;
  }

  // Crypto / Stocks / Finance Spam
  if (/\b(bitcoin|crypto|ethereum|btc|share\s*market|nifty|sensex|stocks?|trading|loans?|insurance|credit\s*card|mutual\s*funds?)\b/i.test(lower)) {
    return true;
  }

  // Gambling / Ads / Promotions
  if (/\b(casino|betting|rummy|lottery|earn\s*money|work\s*from\s*home)\b/i.test(lower)) {
    return true;
  }

  // Politics / General Knowledge
  if (/\b(prime\s*minister|pm\s*modi|modi\s*ji|election|president|capital\s*of|who\s*is\s+president)\b/i.test(lower)) {
    return true;
  }

  // Weather / Mausam
  if (/\b(weather|mausam|climate)\b/i.test(lower)) {
    return true;
  }

  // Jokes, Bot Identity, or Unrelated General Chatter
  if (/\b(tell\s*me\s*a\s*joke|joke\s*sunao|who\s*are\s*you|what\s*are\s*you|tum\s*kaun\s*ho|aap\s*kaun\s*ho|koun\s*ho)\b/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether a short or ambiguous message is an answer to an active
 * pending question from previous conversation state or booking draft.
 */
function hasActiveBookingContext(text, chat) {
  if (!chat) return false;
  const cleanText = (text || '').trim();
  const lower = cleanText.toLowerCase();

  const messages = Array.isArray(chat.messages) ? chat.messages : [];
  const draft = chat.bookingDraft || {};
  const stage = chat.bookingStage || 'none';

  // Find the last message sent by bot or staff
  const botOrStaffMessages = messages.filter(m => m.sender === 'bot' || m.sender === 'staff' || m.sender === 'agent');
  const lastBotMsg = botOrStaffMessages.length > 0 ? (botOrStaffMessages[botOrStaffMessages.length - 1].text || '').toLowerCase() : '';

  // 1. Bot asked about kids
  const botAskedKids = draft.askingAboutKids || /\b(kids?|bach(e|che|cha)?|children|lahan\s*mule?|age)\b/i.test(lastBotMsg);
  if (botAskedKids) {
    if (/\b(no|nahi|na|none|zero|0|koi\s*nahi|koi\s*bhi\s*nahi|bache\s*nahi)\b/i.test(lower)) return true;
    if (/\b(yes|haan|ha|ho|aahet|hain)\b/i.test(lower)) return true;
    if (/^\d{1,2}(\s*(kids?|bache|child|sal|yr|years?))?$/i.test(lower)) return true;
    if (/\b(\d+\s*(kids?|children|bache)|age\s*\d+)\b/i.test(lower)) return true;
  }

  // 2. Bot asked about Day Picnic meal option (B->T vs B->D)
  const botAskedMeal = /\b(b[→\->\s]*tea|b[→\->\s]*dinner|breakfast\s*to\s*tea|breakfast\s*to\s*dinner|meal\s*option|which\s*option)\b/i.test(lastBotMsg);
  if (botAskedMeal) {
    if (/\b(dinner|tea|high\s*tea|b\s*to\s*d|b\s*to\s*t|b-d|b-t|option\s*1|option\s*2|1|2|first|second)\b/i.test(lower)) return true;
  }

  // 3. Bot asked for dates
  const botAskedDate = /\b(check-?in\s*date|konta\s*date|kis\s*date|dates?\s*(batayein|sanga|batao|share))\b/i.test(lastBotMsg);
  if (botAskedDate) {
    if (isRelativeDateToken(lower)) return true;
    if (/\b(\d{1,2}\s*(sep|aug|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|september|august|october|november|december)|(\d{1,2})[\/\-](\d{1,2}))\b/i.test(lower)) return true;
  }

  // 4. Bot asked for guest count
  const botAskedGuests = /\b(guest\s*count|kitne\s*adults|total\s*adults|kiti\s*jan|adults\s*ani\s*kids|kitne\s*log)\b/i.test(lastBotMsg);
  if (botAskedGuests) {
    if (/^\d{1,2}$/.test(lower) || /\b(\d+\s*(people|person|guest|guests|log|adult|adults|members?))\b/i.test(lower)) return true;
    if (/\b(couple|husband\s*and\s*wife|2)\b/i.test(lower)) return true;
  }

  // 5. Bot asked for customer name
  const botAskedName = draft.nameRequested || /\b(aapka\s*naam|naam\s*bata|customer\s*name|name\s*please)\b/i.test(lastBotMsg);
  if (botAskedName && cleanText.length >= 2 && cleanText.length <= 50) {
    // Avoid purely generic greetings/acknowledgements
    if (!isStandaloneAcknowledgement(cleanText) && !isGreetingOnly(cleanText)) {
      return true;
    }
  }

  // 6. Bot gave pricing quote and asked to confirm/book
  const botGaveQuote = (stage === 'price_quoted' || stage === 'guests_given' || /\b(total|pricing|grand\s*total|confirm\s*karna)\b/i.test(lastBotMsg));
  if (botGaveQuote) {
    if (/\b(confirm|book|booking|ready|haan|yes|hoga|kardo|kar do|karo|bhej do|done|fix|ha|ho)\b/i.test(lower)) return true;
  }

  // 7. Active booking draft progression
  // If the conversation already has an active date or booking type and the customer sends guest numbers
  if ((draft.date || draft.bookingType) && /\b(\d+\s*(people|person|adults?|guest|guests|log|kids?)|couple)\b/i.test(lower)) {
    return true;
  }

  // 8. If customer gives a date when guest count is already known
  if (draft.adults && isRelativeDateToken(lower)) {
    return true;
  }

  return false;
}

/**
 * Centralized detectConversationTopic.
 * Replaces duplicated logic and removes Marathi "kay" from pricing keywords.
 */
function detectConversationTopic(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  if (/\b(discount|offer|kam|kum|less|negotiate|budget|best\s*price|final\s*price|swast|kami)\b/i.test(lower)) return 'discount_or_price_negotiation';
  if (/\b(day\s*picnic|one\s*day|picnic|water\s*park)\b/i.test(lower)) return 'day_picnic';
  if (/\b(couple|husband|wife|anniversary)\b/i.test(lower)) return 'couple_stay';
  if (/\b(group|family|friends|corporate|team)\b/i.test(lower)) return 'group_stay';
  // ⚠️ CRITICAL FIX: "kay" is Marathi for "what". It is NOT a pricing keyword!
  if (/\b(price|pricing|rate|rates|cost|charge|charges|package|packages|total|grand\s*total|bill|amount|kitn|kiti)\b/i.test(lower)) return 'pricing';
  if (/\b(available|availability|room|date|check-?in|check-?out|tarikh|tarakh)\b/i.test(lower)) return 'availability';
  if (/\b(location|address|map|maps|kaha|kuth|kuthe|directions?|route|rasta|distance|how\s+to\s+reach|reach|cab|taxi|station|karjat|kaise\s+(aau|aana|aaye|pahunche|pahuche|jaaye)|kase\s+yayche)\b/i.test(lower)) return 'location';
  if (/\b(payment|advance|upi|cash|card|refund|cancel|scanner)\b/i.test(lower)) return 'payment_or_policy';
  if (/\b(food|breakfast|lunch|dinner|tea|veg|jain|non-?veg|nonveg|menu)\b/i.test(lower)) return 'food';
  if (/\b(activities|activity|kayaking|cycling|games|pool|swimming)\b/i.test(lower)) return 'activities';

  return null;
}

/**
 * Main Selective-Response Router function.
 * Evaluates inbound message against conversation context and returns routing decision.
 * 
 * @param {string} messageText - Inbound customer message text
 * @param {object} chat - Chat document / state from database
 * @param {boolean} hasMedia - Whether message contains media attachment
 * @returns {object} Structured routing decision
 */
function routeIncomingMessage(messageText, chat, hasMedia = false) {
  const text = (messageText || '').trim();

  // Default structured result
  const decision = {
    action: 'SILENT',
    category: CATEGORIES.UNCERTAIN,
    intent: 'uncertain',
    resortRelated: false,
    availabilityAsked: false,
    suppressAvailability: false,
    reason: 'Uncertain message defaulted to silent for staff attention',
    confidence: 0.5
  };

  // 1. Uncaptioned random media
  if (hasMedia && !text) {
    decision.action = 'SILENT';
    decision.category = CATEGORIES.ACKNOWLEDGEMENT;
    decision.intent = 'uncaptioned_media';
    decision.reason = 'Uncaptioned media received; saved for staff inspection';
    decision.confidence = 0.95;
    logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent} reason="${decision.reason}"`);
    return decision;
  }

  // 2. Exact payment inquiry (word-boundary matched)
  if (isExactPaymentIntent(text)) {
    decision.action = 'REPLY';
    decision.category = CATEGORIES.RESORT_QUERY;
    decision.intent = 'payment';
    decision.resortRelated = true;
    decision.confidence = 0.98;
    decision.reason = 'Customer requested payment/UPI information';
    logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent}`);
    return decision;
  }

  // 3. Exact video inquiry (word-boundary matched)
  if (isExactVideoIntent(text)) {
    decision.action = 'REPLY';
    decision.category = CATEGORIES.RESORT_QUERY;
    decision.intent = 'videos';
    decision.resortRelated = true;
    decision.confidence = 0.95;
    decision.reason = 'Customer requested room/resort video';
    logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent}`);
    return decision;
  }

  // 4. Greeting only (standalone welcome)
  if (isGreetingOnly(text)) {
    decision.action = 'REPLY';
    decision.category = CATEGORIES.RESORT_QUERY;
    decision.intent = 'greeting';
    decision.resortRelated = true;
    decision.confidence = 0.95;
    decision.reason = 'Customer sent greeting only';
    logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent}`);
    return decision;
  }

  // 5. Standalone Acknowledgement check
  if (isStandaloneAcknowledgement(text)) {
    // CRITICAL: Check if this is an answer to an active booking question (e.g. kids="no", meal="dinner")
    const isContextualAnswer = hasActiveBookingContext(text, chat);
    if (isContextualAnswer) {
      decision.action = 'REPLY';
      decision.category = CATEGORIES.RESORT_QUERY;
      decision.intent = 'booking_flow';
      decision.resortRelated = true;
      decision.confidence = 0.92;
      decision.reason = 'Customer answered active booking question';
      logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent} (contextual answer)`);
      return decision;
    } else {
      decision.action = 'SILENT';
      decision.category = CATEGORIES.ACKNOWLEDGEMENT;
      decision.intent = 'acknowledgement';
      decision.resortRelated = false;
      decision.confidence = 0.95;
      decision.reason = 'Standalone customer acknowledgement; intentional silence';
      logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent}`);
      return decision;
    }
  }

  // 6. Explicit Irrelevant or Off-Topic message
  if (isIrrelevantOrOffTopic(text)) {
    decision.action = 'SILENT';
    decision.category = CATEGORIES.IRRELEVANT;
    decision.intent = 'irrelevant';
    decision.resortRelated = false;
    decision.confidence = 0.95;
    decision.reason = 'Off-topic or irrelevant inquiry';
    logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent}`);
    return decision;
  }

  // 7. Availability and Mixed Query Detection
  const asksAvailability = hasAvailabilityIntent(text);
  const asksOtherResort = hasOtherResortQuery(text);

  if (asksAvailability) {
    if (!asksOtherResort) {
      // PURE AVAILABILITY QUERY
      // Live availability checking is disabled -> SILENT!
      decision.action = 'SILENT';
      decision.category = CATEGORIES.AVAILABILITY_ONLY;
      decision.intent = 'availability';
      decision.resortRelated = true;
      decision.availabilityAsked = true;
      decision.suppressAvailability = true;
      decision.confidence = 0.96;
      decision.reason = 'Customer asked availability only while live check is disabled';
      logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent}`);
      return decision;
    } else {
      // MIXED AVAILABILITY + RESORT QUERY
      // Answer other resort questions, but strictly suppress availability!
      decision.action = 'REPLY';
      decision.category = CATEGORIES.MIXED_RESORT_AVAILABILITY;
      decision.intent = detectConversationTopic(text) || 'mixed_resort_query';
      decision.resortRelated = true;
      decision.availabilityAsked = true;
      decision.suppressAvailability = true;
      decision.confidence = 0.95;
      decision.reason = 'Mixed query: answer resort inquiry, suppress availability';
      logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent} suppressAvailability=true`);
      return decision;
    }
  }

  // 8. Active Booking Context (dates, guest counts, meal preferences, name submission)
  // Takes precedence over static topic matching when customer is answering an active booking step (e.g. "Dinner")
  if (hasActiveBookingContext(text, chat)) {
    decision.action = 'REPLY';
    decision.category = CATEGORIES.RESORT_QUERY;
    decision.intent = 'booking_flow';
    decision.resortRelated = true;
    decision.confidence = 0.92;
    decision.reason = 'Message provides relevant detail for ongoing booking context';
    logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent}`);
    return decision;
  }

  // 9. Explicit Resort Query (Pricing, activities, location, food, packages, etc.)
  if (asksOtherResort) {
    decision.action = 'REPLY';
    decision.category = CATEGORIES.RESORT_QUERY;
    decision.intent = detectConversationTopic(text) || 'resort_query';
    decision.resortRelated = true;
    decision.confidence = 0.92;
    decision.reason = 'Valid Nandibaag Resort inquiry';
    logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent}`);
    return decision;
  }

  // 10. Check if booking details (dates, guest counts, nights) can be extracted independently
  const { extractBookingDetails } = require('./messageHandler');
  if (typeof extractBookingDetails === 'function') {
    const extracted = extractBookingDetails(text);
    if (extracted.date || extracted.adults || extracted.nights || (extracted.kids && extracted.kids.length > 0)) {
      decision.action = 'REPLY';
      decision.category = CATEGORIES.RESORT_QUERY;
      decision.intent = 'booking_details';
      decision.resortRelated = true;
      decision.confidence = 0.88;
      decision.reason = 'Booking details detected in message';
      logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent}`);
      return decision;
    }
  }

  // 11. Conservative default: UNCERTAIN -> SILENT
  decision.action = 'SILENT';
  decision.category = CATEGORIES.UNCERTAIN;
  decision.intent = 'uncertain';
  decision.resortRelated = false;
  decision.confidence = 0.6;
  decision.reason = 'Uncertain intent; defaulted to silence for staff review';
  logger.info(`[MessageRouter] action=${decision.action} category=${decision.category} intent=${decision.intent} reason="${decision.reason}"`);
  return decision;
}

module.exports = {
  CATEGORIES,
  routeIncomingMessage,
  detectConversationTopic,
  isExactPaymentIntent,
  isExactVideoIntent,
  isStandaloneAcknowledgement,
  hasActiveBookingContext,
  hasAvailabilityIntent,
  hasOtherResortQuery,
  isIrrelevantOrOffTopic,
  isGreetingOnly,
  isRelativeDateToken
};
