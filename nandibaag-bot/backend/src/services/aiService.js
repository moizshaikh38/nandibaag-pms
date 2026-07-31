const OpenAI = require('openai');
const logger = require('../config/logger');
const { buildSystemPrompt } = require('./systemPrompt');
const {
  openrouterApiKey, openrouterModelPrimary, openrouterSiteUrl, openrouterAppName,
  geminiApiKey, geminiModel,
  aiTestMode, ollamaBaseUrl, ollamaModel,
  groqApiKey, groqModel, groqBaseUrl,
  cloudflareAccountId, cloudflareApiToken, cloudflareModel,
  cerebrasApiKey, cerebrasModel, cerebrasBaseUrl
} = require('../config/env');
const crypto = require('crypto');

// ── OpenRouter client (OpenAI-compatible) ─────────────────────────────
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: openrouterApiKey || process.env.OPENROUTER_API_KEY || 'missing_key',
  defaultHeaders: {
    'HTTP-Referer': openrouterSiteUrl || process.env.OPENROUTER_SITE_URL || 'https://nandibaag.com',
    'X-Title': openrouterAppName || process.env.OPENROUTER_APP_NAME || 'Nandibaag WhatsApp AI'
  },
  maxRetries: 0
});

// ── Gemini client (lazy-initialized) ──────────────────────────────────
let geminiClientInstance = null;
function getGeminiClient() {
  if (!geminiClientInstance && geminiApiKey) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    geminiClientInstance = new GoogleGenerativeAI(geminiApiKey);
  }
  return geminiClientInstance;
}

// ── Ollama client (local dev/testing ONLY) ─────────────────────────────
let ollamaClientInstance = null;
function getOllamaClient() {
  if (!ollamaClientInstance) {
    ollamaClientInstance = new OpenAI({
      baseURL: ollamaBaseUrl,
      apiKey: 'ollama', // Ollama runs unauthenticated locally
      maxRetries: 0
    });
  }
  return ollamaClientInstance;
}

// ── Groq client (production tier) ──────────────────────────────────────
let groqClientInstance = null;
function getGroqClient() {
  if (!groqClientInstance && groqApiKey) {
    groqClientInstance = new OpenAI({
      baseURL: groqBaseUrl,
      apiKey: groqApiKey,
      maxRetries: 0
    });
  }
  return groqClientInstance;
}

// ── Cerebras client (production tier, OpenAI-compatible) ─────────────────
let cerebrasClientInstance = null;
function getCerebrasClient() {
  if (!cerebrasClientInstance && cerebrasApiKey) {
    cerebrasClientInstance = new OpenAI({
      baseURL: cerebrasBaseUrl,
      apiKey: cerebrasApiKey,
      maxRetries: 0
    });
  }
  return cerebrasClientInstance;
}

/**
 * Adapter that calls Gemini via the official @google/generative-ai SDK.
 * Converts our internal OpenAI-style messages into Gemini's format.
 *
 * @param {Array} messages - [{role: 'user'|'assistant', content: string}]
 * @param {string} systemPrompt - The system instruction text
 * @param {number} timeoutMs - Abort timeout in milliseconds
 * @returns {string} The model's text reply
 */
async function callGemini(messages, systemPrompt, timeoutMs = 15000) {
  const genAI = getGeminiClient();
  if (!genAI) throw new Error('Gemini client not configured (missing GEMINI_API_KEY)');

  const model = genAI.getGenerativeModel({
    model: geminiModel,
    systemInstruction: systemPrompt
  });

  // Convert messages to Gemini's contents format
  // Gemini uses "user" and "model" roles (not "assistant")
  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await model.generateContent({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500
      }
    }, { signal: controller.signal });

    clearTimeout(timeoutId);

    const response = result.response;
    const text = response.text();
    return text?.trim() || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw Object.assign(new Error('timeout'), { name: 'AbortError' });
    }
    throw error;
  }
}

/**
 * Adapter that calls Cloudflare Workers AI via REST API.
 * Cloudflare does NOT use OpenAI-compatible format, so this is a dedicated adapter.
 *
 * @param {Array} messages - [{role: 'user'|'assistant', content: string}]
 * @param {string} systemPrompt - The system instruction text
 * @param {number} timeoutMs - Abort timeout in milliseconds
 * @returns {string} The model's text reply
 */
async function callCloudflare(messages, systemPrompt, timeoutMs = 8000) {
  if (!cloudflareAccountId || !cloudflareApiToken) {
    throw new Error('Cloudflare client not configured (missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN)');
  }

  // Convert messages to Cloudflare's format
  // Cloudflare expects a simple array of messages with role/content
  const cloudflareMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  const url = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/run/${cloudflareModel}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cloudflareApiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: cloudflareMessages,
        max_tokens: 200
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    // Cloudflare Workers AI response format: { result: { response: "text" } }
    const aiText = data?.result?.response?.trim();
    if (!aiText) {
      throw new Error('Empty response from Cloudflare');
    }

    return aiText;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw Object.assign(new Error('timeout'), { name: 'AbortError' });
    }
    throw error;
  }
}

/**
 * In-memory response cache for FAQ-type questions only.
 * TTL: 5 minutes. Keyed by hash of (last customer message + booking stage).
 * 
 * IMPORTANT: This cache is ONLY for pure static-info questions (timing, facilities, etc.).
 * NEVER cache anything involving:
 * - Price calculations (depends on date, guest count, etc.)
 * - Dates or time-sensitive info
 * - Personal data (name, phone)
 * - Booking-specific queries
 * 
 * This tradeoff reduces API calls for repeated FAQs while ensuring
 * dynamic booking queries always get fresh responses.
 */
const responseCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Simple hash function for cache key generation
 */
function hashString(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Sanitizes AI response to strip leaked reasoning tokens and markdown
 */
function sanitizeReply(text) {
  if (!text) return '';
  
  let sanitized = text;
  
  // Remove content between <thought> and </thought> tags (including tags)
  sanitized = sanitized.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  
  // Remove content between <reasoning> and </reasoning> tags (including tags)
  sanitized = sanitized.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  
  // Remove markdown code blocks
  sanitized = sanitized.replace(/```[\s\S]*?```/g, '');
  
  // Remove markdown bold (**text**)
  sanitized = sanitized.replace(/\*\*([^*]+)\*\*/g, '$1');
  
  // Remove markdown headers (# text, ## text, etc.)
  sanitized = sanitized.replace(/^#{1,6}\s+/gm, '');
  
  // Remove markdown links [text](url)
  sanitized = sanitized.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // Remove any remaining markdown-style formatting
  sanitized = sanitized.replace(/\*([^*]+)\*/g, '$1');
  
  // Remove banned words if present
  const BANNED_WORDS = ['kripya', 'sahayta', 'tithi', 'dastur', 'niyojan', 'pradan', 'vivaran', 'krupaya', 'sahayya', 'dinank'];
  for (const banned of BANNED_WORDS) {
    const regex = new RegExp(`\\b${banned}\\b`, 'gi');
    sanitized = sanitized.replace(regex, '');
  }

  // Force-substitute any unauthorized phone numbers with official primary contact number
  const { resortContact1, resortContact2, resortContact3 } = require('../config/env');
  const OFFICIAL_NUMBERS = [resortContact1, resortContact2, resortContact3, '9257657665', '9257657664', '9257657663']
    .filter(Boolean)
    .map(n => n.replace(/\D/g, '').slice(-10));

  const primaryClean = (resortContact1 || '9257657665').replace(/\D/g, '').slice(-10);

  sanitized = sanitized.replace(/(?:\+?91[\s-]*)?\b[6-9]\d{9}\b/g, (match) => {
    const cleanMatch = match.replace(/\D/g, '').slice(-10);
    if (OFFICIAL_NUMBERS.includes(cleanMatch)) {
      return match;
    }
    return primaryClean;
  });

  // Trim whitespace & clean double spaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  return sanitized;
}

/**
 * Trims response to max 700 chars at nearest sentence boundary if needed
 */
function trimToSentenceBoundary(text, maxLength = 700) {
  if (text.length <= maxLength) return text;
  
  const trimmed = text.substring(0, maxLength);
  
  // Find last sentence boundary (., !, ?, ।,॥)
  const sentenceEnds = ['.', '!', '?', '।', '॥'];
  let lastBoundary = -1;
  
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (sentenceEnds.includes(trimmed[i])) {
      lastBoundary = i;
      break;
    }
  }
  
  if (lastBoundary > 0) {
    return trimmed.substring(0, lastBoundary + 1);
  }
  
  // Fallback: return as-is with ellipsis
  return trimmed + '...';
}

/**
 * Enforces max 4 lines and ~500 characters
 */
function enforceLengthLimits(text) {
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length > 4) {
    logger.warn(`Response exceeded 4 lines (${lines.length} lines), truncating`);
    return lines.slice(0, 4).join('\n');
  }
  
  if (text.length > 500) {
    logger.warn(`Response exceeded 500 characters (${text.length} chars), will trim at sentence boundary`);
    return trimToSentenceBoundary(text, 700);
  }
  
  return text;
}

// Common English words that are NOT expected resort loanwords
const commonEnglishWords = new Set([
  'the', 'and', 'with', 'for', 'about', 'from', 'this', 'that', 'these', 'those',
  'what', 'when', 'where', 'which', 'who', 'how', 'why', 'will', 'would', 'should',
  'could', 'can', 'may', 'might', 'must', 'shall', 'been', 'were', 'was', 'are',
  'is', 'am', 'have', 'has', 'had', 'having', 'does', 'did', 'done',
  'verifier', 'processor', 'handler', 'manager', 'controller', 'service', 'helper',
  'system', 'prompt', 'variable', 'function', 'object', 'array', 'string', 'number',
  'boolean', 'null', 'undefined', 'error', 'timeout', 'exception', 'validation',
  'status', 'token', 'response', 'request', 'client', 'server', 'host', 'database',
  'connection', 'index', 'loop', 'class', 'module', 'import', 'export', 'require',
  'test', 'case', 'debug', 'code', 'file', 'stack', 'trace', 'memory', 'process',
  'thread', 'run', 'execute', 'build', 'compile', 'load', 'render', 'template',
  'component', 'layout', 'view', 'route', 'router', 'middle', 'end', 'fetch',
  'get', 'post', 'patch', 'delete', 'put', 'options', 'aborted', 'timeout', 'timed',
  'buffer', 'buffering', 'terminated', 'close', 'open', 'exit', 'quit',
  'write', 'read', 'update', 'create', 'insert', 'select', 'where', 'limit', 'offset',
  'count', 'sum', 'avg', 'min', 'max', 'order', 'group', 'by', 'having', 'join',
  'inner', 'left', 'right', 'outer', 'full', 'cross', 'natural', 'on', 'using',
  'their', 'them', 'they', 'him', 'her', 'his', 'its', 'our', 'us', 'you', 'your',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'yourselves',
  'themselves', 'someone', 'somebody', 'something', 'somewhere', 'anyone', 'anybody',
  'anything', 'anywhere', 'everyone', 'everybody', 'everything', 'everywhere',
  'nobody', 'nothing', 'nowhere', 'none', 'neither', 'either', 'each', 'every',
  'other', 'another', 'such', 'what', 'whatever', 'whichever', 'whoever', 'whomever',
  'whose', 'whyever', 'however', 'indeed', 'perhaps', 'probably', 'possibly',
  'maybe', 'always', 'never', 'sometimes', 'often', 'seldom', 'rarely', 'usually',
  'generally', 'especially', 'particularly', 'specifically', 'mostly', 'mainly',
  'first', 'second', 'third', 'last', 'next', 'previous', 'early', 'late', 'soon',
  'already', 'yet', 'still', 'anymore', 'ago', 'since', 'until', 'till', 'before',
  'after', 'during', 'while', 'meanwhile', 'meantime', 'whereas', 'although',
  'though', 'even', 'only', 'just', 'almost', 'nearly', 'about', 'around', 'above',
  'below', 'under', 'over', 'between', 'among', 'through', 'into', 'onto', 'upon',
  'within', 'without', 'behind', 'beside', 'besides', 'beyond', 'toward', 'towards',
  'across', 'along', 'against', 'amongst', 'around', 'beneath', 'underneath',
  'except', 'instead', 'because', 'since', 'unless', 'whether', 'whereas', 'lest'
]);

const allowedResortWords = new Set();

function initializeAllowedWords() {
  const manualWhitelist = [
    // Safe common Hinglish / Resort English loanwords & URLs
    'booking', 'couple', 'group', 'picnic', 'resort', 'ac', 'dj', 'wifi', 'pool', 
    'cafe', 'cottages', 'kayaking', 'boating', 'games', 'buffet', 'veg', 'jain', 
    'pet', 'check', 'checkout', 'tea', 'taxi', 'rickshaw', 'instagram', 'website', 
    'maps', 'aadhaar', 'pan', 'license', 'room', 'rooms', 'deluxe', 'bathtub', 
    'price', 'rates', 'pricing', 'details', 'detail', 'date', 'dates', 'weekend', 
    'weekends', 'weekday', 'weekdays', 'person', 'people', 'per', 'rs', 'rupees', 
    'rupee', 'married', 'marriage', 'unmarried', 'postpone', 'cancel', 'cancellation', 
    'refund', 'non-refundable', 'reschedule', 'year', 'morning', 'evening', 'day', 
    'night', 'nights', 'breakfast', 'lunch', 'dinner', 'sunset', 'baby', 'family', 
    'anniversary', 'wedding', 'event', 'events', 'corporate', 'birthday', 'birthdays', 
    'alcohol', 'byob', 'team', 'call', 'phone', 'number', 'numbers', 'ok', 'yes', 'no', 
    'hi', 'hello', 'hey', 'sorry', 'thank', 'thanks', 'welcome', 'please', 'enquiry', 'enquiries',
    'swagat', 'kuch', 'kuchh', 'log', 'raat', 'bahut', 'bohot', 'bhut', 'madad', 'shayad', 'umeed', 
    'ummeed', 'waqt', 'vakt', 'soch', 'bach', 'baat', 'baatein', 'respect', 'package', 'packages', 'budget',
    'https', 'http', 'www', 'com', 'org', 'net', 'nandibaag', 'rooms', 'maps', 'instagram', 'goo', 'gl', 'app', 'link', 'byob', 'pax', 'hrs', 'per', 'summary', 'breakdown', 'final', 'charge', 'charges',
    
    // User requested supplementary whitelist
    'okay', 'sure', 'thanks', 'card', 'cash', 'upi', 'google', 'id',
    'valid', 'friends', 'stay', 'possible', 'allow', 'allows', 'allowed', 
    'support', 'customer', 'assistant', 'proof', 'confirm', 'help',

    // Booking-flow words that AI models commonly use in replies
    'options', 'option', 'offer', 'offers', 'choice', 'choices', 'choose',
    'includes', 'included', 'including', 'inclusive', 'available', 'availability',
    'great', 'nice', 'good', 'wonderful', 'lovely', 'perfect', 'excellent',
    'total', 'guests', 'guest', 'adult', 'adults', 'child', 'children', 'kids',
    'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'visitor', 'visitors', 'member', 'members', 'order', 'cater', 'catering',
    'need', 'want', 'like', 'visit', 'visiting', 'plan', 'planning',
    'time', 'hour', 'hours', 'minutes', 'tomorrow', 'today',
    'tell', 'send', 'share', 'know', 'book', 'booked'
  ];
  
  for (const word of manualWhitelist) {
    allowedResortWords.add(word.toLowerCase());
  }

  // Programmatically extract all English words from systemPrompt.js
  try {
    const fs = require('fs');
    const path = require('path');
    const systemPromptPath = path.join(__dirname, 'systemPrompt.js');
    if (fs.existsSync(systemPromptPath)) {
      const fileContent = fs.readFileSync(systemPromptPath, 'utf8');
      const extractedWords = fileContent.toLowerCase().match(/[a-z]+/g) || [];
      for (const word of extractedWords) {
        if (word.length >= 3) {
          allowedResortWords.add(word);
        }
      }
    } else {
      // Fallback if file doesn't exist
      const promptText = buildSystemPrompt('Monday, 1 January 2026', 'Monday', {});
      const words = promptText.toLowerCase().match(/[a-z]+/g) || [];
      for (const word of words) {
        if (word.length >= 3) {
          allowedResortWords.add(word);
        }
      }
    }
  } catch (err) {
    logger.error(`Failed to programmatically read systemPrompt.js: ${err.message}`);
  }
}

// Run allowed word extraction on module load
initializeAllowedWords();

// ══════════════════════════════════════════════════════════════════════
// Per-provider health + latency metrics (hourly reset, in-memory)
// ══════════════════════════════════════════════════════════════════════

/**
 * providerMetrics structure:
 * {
 *   "blueminds": { success: 0, invalid: 0, error: 0, totalLatencyMs: 0, callCount: 0 },
 *   "gemini":    { ... },
 *   "openrouter/meta-llama/llama-3.3-70b-instruct:free": { ... },
 *   ...
 * }
 */
let providerMetrics = {};
let metricsResetTimestamp = Date.now();

function checkMetricsReset() {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  if (now - metricsResetTimestamp >= oneHour) {
    providerMetrics = {};
    metricsResetTimestamp = now;
  }
}

function ensureProvider(providerKey) {
  checkMetricsReset();
  if (!providerMetrics[providerKey]) {
    providerMetrics[providerKey] = { success: 0, invalid: 0, error: 0, totalLatencyMs: 0, callCount: 0 };
  }
  return providerMetrics[providerKey];
}

function recordSuccess(providerKey, latencyMs) {
  const m = ensureProvider(providerKey);
  m.success++;
  m.totalLatencyMs += latencyMs;
  m.callCount++;
}

function recordInvalid(providerKey, latencyMs) {
  const m = ensureProvider(providerKey);
  m.invalid++;
  m.totalLatencyMs += latencyMs;
  m.callCount++;
}

function recordError(providerKey, latencyMs) {
  const m = ensureProvider(providerKey);
  m.error++;
  m.totalLatencyMs += latencyMs;
  m.callCount++;
}

/**
 * Returns per-provider health + latency snapshot for the current hour.
 * Consumed by GET /api/dashboard/stats.
 */
function getModelHealthLast1Hour() {
  checkMetricsReset();
  const snapshot = {};
  for (const [key, m] of Object.entries(providerMetrics)) {
    snapshot[key] = {
      success: m.success,
      invalid: m.invalid,
      error: m.error,
      avgLatencyMs: m.callCount > 0 ? Math.round(m.totalLatencyMs / m.callCount) : 0
    };
  }
  return snapshot;
}

function isReplyValid(text) {
  if (!text || typeof text !== 'string') return false;
  
  const trimmed = text.trim();
  
  // 1. Length boundaries check
  if (trimmed.length < 3 || trimmed.length > 2000) {
    return false;
  }
  
  // 2. Unexpected script check (Allows ASCII, Latin-1 Supplement \\u00A0-\\u00FF, Devanagari, Box Drawing U+2500-U+257F, Punctuation, Emojis)
  if (/[^\x00-\x7F\u{00A0}-\u{00FF}\u{0900}-\u{097F}\u{0A80}-\u{0AFF}\u{2000}-\u{206F}\u{20A0}-\u{20CF}\u{2100}-\u{214F}\u{2190}-\u{21FF}\u{2500}-\u{257F}\u{2600}-\u{27BF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u.test(trimmed)) {
    return false;
  }
  
  // 3. Leftover markdown code blocks or HTML tags
  if (/`{3}|[<>]/.test(trimmed)) {
    return false;
  }

  // 4. Room number leak check (hard business rule: never state specific room numbers)
  const roomLeakRegex = /(?:room|cottage)\s*(?:no\.?|number)?\s*\d{1,4}\b/i;
  if (roomLeakRegex.test(trimmed)) {
    return false;
  }

  // 5. Banned words check (Google-Translate sounding words)
  const BANNED_WORDS = ['kripya', 'sahayta', 'tithi', 'dastur', 'niyojan', 'pradan', 'vivaran', 'krupaya', 'sahayya', 'dinank'];
  for (const banned of BANNED_WORDS) {
    const bannedRegex = new RegExp(`\\b${banned}\\b`, 'i');
    if (bannedRegex.test(trimmed)) {
      return false;
    }
  }

  // 6. FORBIDDEN BOOKING CONFIRMATION CLAIMS CHECK
  const FORBIDDEN_CONFIRMATIONS = [
    /booking\s+(?:is\s+)?confirm(?:ed)?/i,
    /room\s+(?:is\s+)?booked/i,
    /reservation\s+confirm(?:ed)?/i,
    /booking\s+confirm\s+ho\s+gayi/i,
    /room\s+book\s+ho\s+gaya/i,
    /booking\s+zali(?:\s+aahe)?/i,
    /room\s+book\s+zala/i,
    /booking\s+ho\s+gayi/i,
    /room\s+confirm\s+zala/i
  ];
  for (const pattern of FORBIDDEN_CONFIRMATIONS) {
    if (pattern.test(trimmed)) {
      return false; // Rejects any AI reply claiming unauthorized booking confirmation!
    }
  }

  // 7. Phone number validation check
  const { resortContact1, resortContact2, resortContact3 } = require('../config/env');
  const OFFICIAL_NUMBERS = [resortContact1, resortContact2, resortContact3, '9257657665', '9257657664', '9257657663']
    .filter(Boolean)
    .map(n => n.replace(/\D/g, '').slice(-10));

  const phoneMatches = trimmed.match(/(?:\+?91[\s-]*)?\b\d{10,12}\b/g) || [];
  for (const match of phoneMatches) {
    const cleanMatch = match.replace(/\D/g, '').slice(-10);
    if (!OFFICIAL_NUMBERS.includes(cleanMatch)) {
      return false; // Fabricated/unauthorized phone number detected!
    }
  }

  // 8. Repeated word duplication checks
  const repeatedWordRegex = /\b(\w+)\s+\1\b/ig;
  let match;
  const allowedReduplications = new Set([
    'kabhi', 'dhire', 'garam', 'gol', 'sath', 'saath', 'thoda', 'thodi', 
    'bade', 'chote', 'door', 'pass', 'paas', 'chal', 'chalo', 'ruko', 
    'suno', 'haan', 'acha', 'accha', 'ek', 'naye', 'nayee', 'garma', 'sirf'
  ]);
  
  while ((match = repeatedWordRegex.exec(trimmed)) !== null) {
    const word = match[1].toLowerCase();
    if (!allowedReduplications.has(word)) {
      return false;
    }
  }
  
  // 9. English word whitelist and Hinglish truncation checks
  const words = trimmed.toLowerCase().match(/[a-z]+/g) || [];
  const safeNoVowelWords = new Set(['https', 'http', 'www', 'byob', 'pax', 'hrs', 'sms', 'pdf']);

  for (const word of words) {
    if (word.length < 3) continue;
    if (allowedResortWords.has(word)) continue;
    if (!/[aeiouy]/.test(word) && !safeNoVowelWords.has(word)) return false;
    if (/sakt$|chah$|karn$/.test(word)) return false;
  }
  
  return true;
}

/**
 * Diagnostic helper: returns reason for reply rejection
 */
function getReplyRejectionReason(text) {
  if (!text || typeof text !== 'string') return 'EMPTY_OR_NOT_STRING';
  const trimmed = text.trim();
  if (trimmed.length < 3) return `TOO_SHORT (${trimmed.length} chars)`;
  if (trimmed.length > 2000) return `TOO_LONG (${trimmed.length} chars)`;

  const scriptMatch = trimmed.match(/[^\x00-\x7F\u{00A0}-\u{00FF}\u{0900}-\u{097F}\u{0A80}-\u{0AFF}\u{2000}-\u{206F}\u{20A0}-\u{20CF}\u{2100}-\u{214F}\u{2190}-\u{21FF}\u{2500}-\u{257F}\u{2600}-\u{27BF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u);
  if (scriptMatch) return `UNEXPECTED_SCRIPT: char="${scriptMatch[0]}" U+${scriptMatch[0].codePointAt(0).toString(16).toUpperCase()}`;

  if (/`{3}/.test(trimmed)) return 'MARKDOWN_CODE_BLOCK';

  const roomLeakRegex = /(?:room|cottage)\s*(?:no\.?|number)?\s*\d{1,4}\b/i;
  if (roomLeakRegex.test(trimmed)) {
    const leakMatch = trimmed.match(roomLeakRegex);
    return `ROOM_NUMBER_LEAK: "${leakMatch[0]}"`;
  }

  const BANNED_WORDS = ['kripya', 'sahayta', 'tithi', 'dastur', 'niyojan', 'pradan', 'vivaran', 'krupaya', 'sahayya', 'dinank'];
  for (const banned of BANNED_WORDS) {
    const bannedRegex = new RegExp(`\\b${banned}\\b`, 'i');
    if (bannedRegex.test(trimmed)) return `BANNED_WORD: "${banned}"`;
  }

  const FORBIDDEN_CONFIRMATIONS = [
    /booking\s+(?:is\s+)?confirm(?:ed)?/i,
    /room\s+(?:is\s+)?booked/i,
    /reservation\s+confirm(?:ed)?/i,
    /booking\s+confirm\s+ho\s+gayi/i,
    /room\s+book\s+ho\s+gaya/i,
    /booking\s+zali(?:\s+aahe)?/i,
    /room\s+book\s+zala/i,
    /booking\s+ho\s+gayi/i,
    /room\s+confirm\s+zala/i
  ];
  for (const pattern of FORBIDDEN_CONFIRMATIONS) {
    if (pattern.test(trimmed)) return `UNAUTHORIZED_BOOKING_CONFIRMATION_CLAIM`;
  }

  const { resortContact1, resortContact2, resortContact3 } = require('../config/env');
  const OFFICIAL_NUMBERS = [resortContact1, resortContact2, resortContact3, '9257657665', '9257657664', '9257657663']
    .filter(Boolean)
    .map(n => n.replace(/\D/g, '').slice(-10));

  const phoneMatches = trimmed.match(/(?:\+?91[\s-]*)?\b\d{10,12}\b/g) || [];
  for (const match of phoneMatches) {
    const cleanMatch = match.replace(/\D/g, '').slice(-10);
    if (!OFFICIAL_NUMBERS.includes(cleanMatch)) {
      return `UNAUTHORIZED_PHONE_NUMBER: "${match}"`;
    }
  }

  const repeatedWordRegex = /\b(\w+)\s+\1\b/ig;
  const allowedReduplications = new Set([
    'kabhi', 'dhire', 'garam', 'gol', 'sath', 'saath', 'thoda', 'thodi',
    'bade', 'chote', 'door', 'pass', 'paas', 'chal', 'chalo', 'ruko',
    'suno', 'haan', 'acha', 'accha', 'ek', 'naye', 'nayee', 'garma', 'sirf'
  ]);
  let match;
  while ((match = repeatedWordRegex.exec(trimmed)) !== null) {
    const word = match[1].toLowerCase();
    if (!allowedReduplications.has(word)) return `REPEATED_WORD: "${word} ${word}"`;
  }

  const words = trimmed.toLowerCase().match(/[a-z]+/g) || [];
  const safeNoVowelWords = new Set(['https', 'http', 'www', 'byob', 'pax', 'hrs', 'sms', 'pdf']);

  for (const word of words) {
    if (word.length < 3) continue;
    if (allowedResortWords.has(word)) continue;
    if (!/[aeiouy]/.test(word) && !safeNoVowelWords.has(word)) return `NO_VOWELS: "${word}"`;
    if (/sakt$|chah$|karn$/.test(word)) return `TRUNCATED_WORD: "${word}"`;
  }

  return 'UNKNOWN (passed all checks)';
}

/**
 * Language detection scoring system.
 * Supported values: 'hinglish', 'roman_marathi', 'marathi', 'english'.
 */
function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'hinglish';
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'hinglish';

  const lower = trimmed.toLowerCase();

  // 1. Check Devanagari script
  if (/[\u0900-\u097F]/.test(trimmed)) {
    return 'marathi';
  }

  // 2. Check Roman script Marathi
  const romanMarathiPatterns = [
    /\baahe\b/i, /\bahet\b/i, /\bnahiye\b/i, /\bpahije\b/i, /\bsanga\b/i,
    /\bkiti\b/i, /\bkontya\b/i, /\bkuthun\b/i, /\bkadhi\b/i, /\byenar\b/i,
    /\bkaraycha\b/i, /\bkaraychi\b/i, /\bkarayche\b/i, /\bkarta\s+yeil\b/i,
    /\bshakto\b/i, /\bshakta\b/i, /\bsathi\b/i, /\bmadhye\b/i, /\bbagha\b/i,
    /\byeil\b/i, /\bjavaycha\b/i, /\baamhi\b/i, /\btumhi\b/i, /\btumhala\b/i,
    /\baamchya\b/i, /\btumchya\b/i, /\blokanji\b/i, /\bjanansathi\b/i, /\btarakh\b/i,
    /\bweekend\s+la\b/i, /\bdates\s+sanga\b/i, /\broom\s+available\s+aahe\b/i,
    /\bnamaskar\b/i, /\budya\b/i, /\bkay\b/i, /\bpathva\b/i, /\bdya\b/i, /\bswast\b/i,
    /\bkasa\b/i, /\bkashi\b/i, /\bjanan\b/i, /\bjanansathi\b/i
  ];

  let romanMarathiScore = 0;
  for (const pat of romanMarathiPatterns) {
    if (pat.test(lower)) romanMarathiScore += 2;
  }

  if (romanMarathiScore >= 2) {
    return 'roman_marathi';
  }

  // 3. Check English vs Hinglish
  const englishPatterns = [
    /\bwhat\b/i, /\bwhen\b/i, /\bwhere\b/i, /\bwhich\b/i, /\bhow\b/i, /\bwhy\b/i,
    /\bcan\b/i, /\bwould\b/i, /\bis\b/i, /\bare\b/i, /\bdo\b/i, /\bdoes\b/i,
    /\bplease\b/i, /\bthank\b/i, /\bprice\b/i, /\brates\b/i, /\bavailable\b/i,
    /\bphotos\b/i, /\blocation\b/i, /\bcheck-in\b/i, /\bcheck-out\b/i, /\bconfirm\b/i,
    /\bignore\b/i, /\bshow\b/i, /\bgive\b/i, /\bsystem\b/i, /\bprompt\b/i, /\bkey\b/i,
    /\bmodel\b/i, /\bstore\b/i, /\bhello\b/i, /\bhi\b/i, /\bbook\b/i, /\breservation\b/i
  ];
  let englishScore = 0;
  for (const pat of englishPatterns) {
    if (pat.test(lower)) englishScore += 2;
  }

  const hinglishPatterns = [
    /\bkya\b/i, /\bhai\b/i, /\bhain\b/i, /\bkaise\b/i, /\bkahan\b/i, /\bkab\b/i,
    /\bkaun\b/i, /\bkyun\b/i, /\bbhai\b/i, /\bji\b/i, /\baccha\b/i, /\bachha\b/i,
    /\btheek\b/i, /\bthik\b/i, /\bsahi\b/i, /\bchahiye\b/i, /\bbatao\b/i,
    /\bbatayein\b/i, /\bkaro\b/i, /\bkarne\b/i, /\bhun\b/i, /\bhoon\b/i,
    /\bhoga\b/i, /\bhogi\b/i, /\blog\b/i, /\blogo\b/i, /\bke\s+liye\b/i, /\bbhejo\b/i
  ];
  let hinglishScore = 0;
  for (const pat of hinglishPatterns) {
    if (pat.test(lower)) hinglishScore += 2;
  }

  if (englishScore > hinglishScore && englishScore >= 2) {
    return 'english';
  }

  return 'hinglish';
}

// ══════════════════════════════════════════════════════════════════════
// Core getAIResponse — tiered chain when AI_CHAIN_ENABLED=true
// ══════════════════════════════════════════════════════════════════════

/**
 * Attempts a single OpenAI-compatible provider call.
 * Used for both Blueminds and OpenRouter models.
 *
 * @returns {string|null} sanitized+validated reply, or null if failed
 */
async function tryOpenAICompatibleCall(client, modelName, providerKey, tierLabel, messages, systemPrompt, timeoutMs = 8000) {
  const t0 = Date.now();
  let timeoutId;
  console.log(`[TIMING] [${tierLabel}] Starting API request to model: ${modelName} at ${new Date().toISOString()}`);

  if (tierLabel.includes('BLUEMINDS')) {
    const payload = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 200
    };
    console.log(`[DIAGNOSTIC] [${tierLabel}] Raw Request Payload:\n`, JSON.stringify(payload, null, 2));
  }

  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 200
    }, { signal: controller.signal });

    clearTimeout(timeoutId);

    if (tierLabel.includes('BLUEMINDS')) {
      console.log(`[DIAGNOSTIC] [${tierLabel}] Raw Response:\n`, JSON.stringify(response, null, 2));
    }

    const aiText = response?.choices?.[0]?.message?.content?.trim();
    if (!aiText) {
      throw new Error('Empty response from model');
    }

    let sanitized = sanitizeReply(aiText);
    sanitized = enforceLengthLimits(sanitized);

    const latency = Date.now() - t0;

    if (!isReplyValid(sanitized)) {
      recordInvalid(providerKey, latency);
      const rejectionReason = getReplyRejectionReason(sanitized);
      logger.warn(`[${tierLabel}] Model ${providerKey} produced an invalid/corrupted reply (reason: ${rejectionReason}): "${aiText}"`);
      console.log(`[DIAGNOSTIC] [${tierLabel}] RAW reply BEFORE sanitize: "${aiText}"`);
      console.log(`[DIAGNOSTIC] [${tierLabel}] SANITIZED reply: "${sanitized}"`);
      console.log(`[DIAGNOSTIC] [${tierLabel}] REJECTION REASON: ${rejectionReason}`);
      console.log(`[TIMING] [${tierLabel}] Completed in ${latency}ms (invalid output generated)`);
      return null;
    }

    recordSuccess(providerKey, latency);
    logger.info(`[${tierLabel}] success (${latency}ms)`);
    console.log(`[TIMING] [${tierLabel}] Completed successfully in ${latency}ms`);
    return sanitized;

  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const latency = Date.now() - t0;
    recordError(providerKey, latency);

    const reason = error.name === 'AbortError' ? 'timeout' :
                   error.status === 429 ? 'rate limit' :
                   error.status >= 500 ? 'server error' : error.message;
    logger.warn(`[${tierLabel}] failed: ${reason} (${latency}ms)`);
    console.error(`[DIAGNOSTIC] [${tierLabel}] Full error details: Name=${error.name}, Message=${error.message}, Status=${error.status}, Code=${error.code}`);
    if (error.stack) console.error(error.stack);
    console.log(`[TIMING] [${tierLabel}] Failed in ${latency}ms due to: ${reason}`);
    return null;
  }
}

/**
 * Attempts a Gemini call via the official SDK.
 *
 * @returns {string|null} sanitized+validated reply, or null if failed
 */
async function tryGeminiCall(tierLabel, messages, systemPrompt, timeoutMs = 8000) {
  const providerKey = `gemini/${geminiModel}`;
  const t0 = Date.now();
  console.log(`[TIMING] [${tierLabel}] Starting Gemini API request at ${new Date().toISOString()}`);
  try {
    const rawText = await callGemini(messages, systemPrompt, timeoutMs);
    if (!rawText) throw new Error('Empty response from Gemini');

    let sanitized = sanitizeReply(rawText);
    sanitized = enforceLengthLimits(sanitized);

    const latency = Date.now() - t0;

    if (!isReplyValid(sanitized)) {
      recordInvalid(providerKey, latency);
      const rejectionReason = getReplyRejectionReason(sanitized);
      logger.warn(`[${tierLabel}] Gemini (${geminiModel}) produced an invalid/corrupted reply (reason: ${rejectionReason}): "${rawText}"`);
      console.log(`[DIAGNOSTIC] [${tierLabel}] RAW reply: "${rawText}"`);
      console.log(`[DIAGNOSTIC] [${tierLabel}] SANITIZED reply: "${sanitized}"`);
      console.log(`[DIAGNOSTIC] [${tierLabel}] REJECTION REASON: ${rejectionReason}`);
      console.log(`[TIMING] [${tierLabel}] Completed in ${latency}ms (invalid output generated)`);
      return null;
    }

    recordSuccess(providerKey, latency);
    logger.info(`[${tierLabel}] success (${latency}ms)`);
    console.log(`[TIMING] [${tierLabel}] Completed successfully in ${latency}ms`);
    return sanitized;

  } catch (error) {
    const latency = Date.now() - t0;
    recordError(providerKey, latency);

    const reason = error.name === 'AbortError' ? 'timeout' : error.message;
    logger.warn(`[${tierLabel}] failed: ${reason} (${latency}ms)`);
    console.error(`[DIAGNOSTIC] [${tierLabel}] Full error details: Name=${error.name}, Message=${error.message}, Status=${error.status}, Code=${error.code}`);
    if (error.stack) console.error(error.stack);
    console.log(`[TIMING] [${tierLabel}] Failed in ${latency}ms due to: ${reason}`);
    return null;
  }
}

/**
 * Attempts a Cloudflare Workers AI call via the REST API.
 *
 * @returns {string|null} sanitized+validated reply, or null if failed
 */
async function tryCloudflareCall(tierLabel, messages, systemPrompt, timeoutMs = 8000) {
  const providerKey = `cloudflare/${cloudflareModel}`;
  const t0 = Date.now();
  console.log(`[TIMING] [${tierLabel}] Starting Cloudflare API request at ${new Date().toISOString()}`);
  try {
    const rawText = await callCloudflare(messages, systemPrompt, timeoutMs);
    if (!rawText) throw new Error('Empty response from Cloudflare');

    let sanitized = sanitizeReply(rawText);
    sanitized = enforceLengthLimits(sanitized);

    const latency = Date.now() - t0;

    if (!isReplyValid(sanitized)) {
      recordInvalid(providerKey, latency);
      const rejectionReason = getReplyRejectionReason(sanitized);
      logger.warn(`[${tierLabel}] Cloudflare (${cloudflareModel}) produced an invalid/corrupted reply (reason: ${rejectionReason}): "${rawText}"`);
      console.log(`[DIAGNOSTIC] [${tierLabel}] RAW reply: "${rawText}"`);
      console.log(`[DIAGNOSTIC] [${tierLabel}] SANITIZED reply: "${sanitized}"`);
      console.log(`[DIAGNOSTIC] [${tierLabel}] REJECTION REASON: ${rejectionReason}`);
      console.log(`[TIMING] [${tierLabel}] Completed in ${latency}ms (invalid output generated)`);
      return null;
    }

    recordSuccess(providerKey, latency);
    logger.info(`[${tierLabel}] success (${latency}ms)`);
    console.log(`[TIMING] [${tierLabel}] Completed successfully in ${latency}ms`);
    return sanitized;

  } catch (error) {
    const latency = Date.now() - t0;
    recordError(providerKey, latency);

    const reason = error.name === 'AbortError' ? 'timeout' : error.message;
    logger.warn(`[${tierLabel}] failed: ${reason} (${latency}ms)`);
    console.error(`[DIAGNOSTIC] [${tierLabel}] Full error details: Name=${error.name}, Message=${error.message}`);
    if (error.stack) console.error(error.stack);
    console.log(`[TIMING] [${tierLabel}] Failed in ${latency}ms due to: ${reason}`);
    return null;
  }
}

/**
 * Gets AI response with tiered fallback logic.
 *
 * When AI_TEST_MODE=true (local dev/testing ONLY):
 *   TIER 1 — Ollama (local, OpenAI-compatible, 8s timeout)
 *   TIER 2 — Hardcoded safe fallback (no further retries if Ollama fails validation)
 *
 * When AI_TEST_MODE=false (production):
 *   TIER 1 — Groq (OpenAI-compatible, 8s timeout)
 *   TIER 2 — Cerebras (OpenAI-compatible, 8s timeout)
 *   TIER 3 — Cloudflare Workers AI (REST API, 8s timeout)
 *   TIER 4 — Google Gemini (official SDK, 8s timeout)
 *   TIER 5 — OpenRouter 3-model chain (8s timeout per model)
 *   TIER 6 — Hardcoded safe fallback
 */
async function getAIResponse(chat, incomingMessage, resortSettings, systemNotes = '') {
  const bookingStage = chat.bookingStage || 'none';
  const detectedLang = detectLanguage(incomingMessage);
  if (chat && (chat.language === 'unknown' || !chat.language || chat.language !== detectedLang)) {
    chat.language = detectedLang;
  }
  const languageToUse = (chat && chat.language && chat.language !== 'unknown') ? chat.language : detectedLang;
  const staticFaqPattern = /\b(photo|photos|pic|image|gallery|location|address|map|maps|instagram|contact|phone|number|call|jain|veg|non-veg|nonveg|alcohol|byob|kayaking|activity|activities|pool|check-?in|check-?out|cancellation|taxi|auto|pet|dog|review|rating)\b/i;
  
  // Check cache for FAQ-type questions only (not booking-related)
  const nonBookingStages = ['none', 'type_selected'];
  const isBookingQuery = !nonBookingStages.includes(bookingStage);
  const canUseCache = !isBookingQuery && !systemNotes && staticFaqPattern.test(incomingMessage || '');
  
  if (canUseCache) {
    const cacheKey = hashString(`${languageToUse}|${bookingStage}|${incomingMessage}`);
    const cached = responseCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      logger.debug(`Cache hit for FAQ query: ${incomingMessage.substring(0, 30)}...`);
      return cached.response;
    }
  }
  
  const tPromptStart = Date.now();
 
  // Trim message history (last 10 messages max to optimize token speed)
  const messageList = Array.isArray(chat?.messages) ? chat.messages : [];
  const messageHistory = messageList
    .slice(-10)
    .map(msg => ({
      role: msg.sender === 'customer' ? 'user' : 'assistant',
      content: msg.text
    }));
  
  // Add current incoming message only if the handler has not already saved it.
  const lastHistoryMessage = messageHistory[messageHistory.length - 1];
  if (!lastHistoryMessage || lastHistoryMessage.role !== 'user' || lastHistoryMessage.content !== incomingMessage) {
    messageHistory.push({
      role: 'user',
      content: incomingMessage
    });
  }

  // Build system prompt with today's date and detected language
  const today = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[today.getDay()];
  const todayDateString = today.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  
  const systemPrompt = buildSystemPrompt(languageToUse, todayDateString, dayOfWeek, resortSettings);
  
  // Append any system-level notes (e.g. availability/pricing results) to system prompt
  const finalSystemPrompt = systemNotes
    ? systemPrompt + '\n\n' + systemNotes
    : systemPrompt;
  
  console.log(`[TIMING] [3/6] System prompt (${languageToUse}) and message history built in ${Date.now() - tPromptStart}ms`);

  let result = null;
 
  // ── AI_TEST_MODE: Local Ollama-only mode (for dev/testing ONLY) ──
  if (aiTestMode) {
    logger.info(`[TIER 1 - OLLAMA] attempting (AI_TEST_MODE=true, local only)...`);
    const ollamaClient = getOllamaClient();
    const providerKey = `ollama/${ollamaModel}`;
    
    result = await tryOpenAICompatibleCall(
      ollamaClient, ollamaModel, providerKey, 'TIER 1 - OLLAMA',
      messageHistory, finalSystemPrompt, 8000
    );

    if (!result) {
      logger.warn(`[TIER 1 - OLLAMA] failed, using fallback`);
    }
  } else {
    // ── PRODUCTION FALLBACK TIER CHAIN ───────────────────────────────
    // OpenRouter: PRIMARY | Groq: SECONDARY (Verified Live Slugs)
    const TIER_CHAIN = [
      {
        name: 'openrouter_primary_gpt4o',
        provider: 'openrouter',
        model: openrouterModelPrimary || 'openai/gpt-4o-mini',
        timeout: 8000,
        priority: 1
      },
      {
        name: 'openrouter_llama_70b',
        provider: 'openrouter',
        model: 'meta-llama/llama-3.1-70b-instruct',
        timeout: 8000,
        priority: 2
      },
      {
        name: 'groq_secondary_llama33',
        provider: 'groq',
        model: groqModel || 'llama-3.3-70b-versatile',
        timeout: 8000,
        priority: 3
      }
    ];

    for (const tier of TIER_CHAIN) {
      if (result) break;

      const tierLabel = `TIER ${tier.priority} - ${tier.name.toUpperCase()}`;

      if (tier.provider === 'openrouter') {
        const apiKey = openrouterApiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          logger.warn(`[${tierLabel}] Skipped (missing OPENROUTER_API_KEY)`);
          continue;
        }
        logger.info(`[${tierLabel}] attempting model: ${tier.model}...`);
        result = await tryOpenAICompatibleCall(
          openai, tier.model, `openrouter/${tier.model}`, tierLabel,
          messageHistory, finalSystemPrompt, tier.timeout
        );
      } else if (tier.provider === 'groq') {
        if (!groqApiKey) {
          logger.warn(`[${tierLabel}] Skipped (missing GROQ_API_KEY)`);
          continue;
        }
        logger.info(`[${tierLabel}] attempting model: ${tier.model}...`);
        const groqClient = getGroqClient();
        result = await tryOpenAICompatibleCall(
          groqClient, tier.model, `groq/${tier.model}`, tierLabel,
          messageHistory, finalSystemPrompt, tier.timeout
        );
      }
    }
  }

  // ── FINAL FALLBACK: Multilingual Smart Resort Intent Assistant ──────────
  if (!result) {
    logger.warn(`Using Smart Resort Assistant fallback for message: "${incomingMessage}" (language: ${languageToUse})`);

    const { resortContact1 } = require('../config/env');
    const primaryNumber = (resortContact1 || '9257657665').replace(/\D/g, '');

    const msgLower = (incomingMessage || '').toLowerCase();
    const isDiscountRequest = /\b(discount|offer|kam|kum|less|negotiate|negotiable|sasta|cheap|budget|final price|best price)\b/i.test(msgLower);

    // Check confirmation request -> NEVER confirm booking!
    const isConfirming = /confirm|book\s+kar\s+do|pakka|book\s+it|payment\s+kar|reservation|zali/i.test(msgLower);

    if (isDiscountRequest) {
      if (languageToUse === 'roman_marathi') {
        result = `Ho ji, rates already best ahet karan food + activities included aahet. Special approval sathi staff la call kara: ${primaryNumber} 📞`;
      } else if (languageToUse === 'marathi') {
        result = `हो जी, rates आधीच best आहेत कारण food + activities included आहेत. Special approval साठी staff ला call करा: ${primaryNumber} 📞`;
      } else if (languageToUse === 'english') {
        result = `Our rates are already best because food and activities are included. For any special approval, please call staff: ${primaryNumber} 📞`;
      } else {
        result = `Ji, rates already best hain kyunki food + activities included hain. Special approval ke liye staff se baat kar sakte hain: ${primaryNumber} 📞`;
      }
    } else if (isConfirming) {
      if (languageToUse === 'roman_marathi') {
        result = `Ho ji 👍 Booking confirm karayla staff sobat bolava lagel 👇 ${primaryNumber}`;
      } else if (languageToUse === 'marathi') {
        result = `हो जी 👍 बुकिंग कन्फर्म करण्यासाठी स्टाफ सोबत बोलून घ्या 👇 ${primaryNumber}`;
      } else if (languageToUse === 'english') {
        result = `To confirm your booking, please connect with our staff 👇 ${primaryNumber}`;
      } else {
        result = `Booking confirm karne ke liye staff se baat karein 👇 ${primaryNumber}`;
      }
    } else if (msgLower.includes('contact') || msgLower.includes('phone') || msgLower.includes('number') || msgLower.includes('call')) {
      result = `Resort contact number: ${primaryNumber} 📞`;
    } else if (msgLower.includes('location') || msgLower.includes('address') || msgLower.includes('kaha') || msgLower.includes('where') || msgLower.includes('kuth')) {
      if (languageToUse === 'roman_marathi') {
        result = `📍 Location: Vaijnath Tata Power Road, Karjat (Mumbai/Pune ~2 hrs). Google Maps link: https://maps.app.goo.gl/h6PB4y4G4oSWyFxdA 📍`;
      } else if (languageToUse === 'marathi') {
        result = `📍 लोकेशन: वैजनाथ टाटा पॉवर रोड, कर्जत. Google Maps लिंक: https://maps.app.goo.gl/h6PB4y4G4oSWyFxdA 📍`;
      } else {
        result = `📍 Location: Vaijnath Tata Power Road, Karjat, Maharashtra. Google Maps link: https://maps.app.goo.gl/h6PB4y4G4oSWyFxdA 📍`;
      }
    } else if (msgLower.includes('photo') || msgLower.includes('pic') || msgLower.includes('image') || msgLower.includes('gallery')) {
      if (languageToUse === 'roman_marathi') {
        result = `Nandibaag Resort ke AC rooms ani cottages che photos gallery madhe baghu shakta: https://nandibaag.com/rooms 📷`;
      } else if (languageToUse === 'marathi') {
        result = `नंदीबाग रिसॉर्टच्या कॉटेजचे फोटो गॅलरीमध्ये पाहू शकता: https://nandibaag.com/rooms 📷`;
      } else {
        result = `Nandibaag Resort ke AC rooms aur cottages ke photos gallery me dekhein: https://nandibaag.com/rooms 📷`;
      }
    } else if (msgLower.includes('rate') || msgLower.includes('price') || msgLower.includes('cost') || msgLower.includes('kitn') || msgLower.includes('charge') || msgLower.includes('kay')) {
      if (languageToUse === 'roman_marathi') {
        result = `Nandibaag Resort Rates:\n1. 🏡 Couple Stay: ₹5,000 (Weekday) / ₹6,500 (Weekend)\n2. 👨‍👩‍👧‍👦 Group Stay: ₹2,000 (Weekday) / ₹3,000 (Weekend) per person\n3. 🌊 Day Picnic: ₹1,200/person (12 PM - 8 PM)\n\nDates sanga, exact availability ani total sangto! 🗓️`;
      } else if (languageToUse === 'marathi') {
        result = `नंदीबाग रिसॉर्ट दर:\n1. 🏡 कपल्स: ₹५,००० (Weekdays) / ₹६,५०० (Weekends)\n2. 👨‍👩‍👧‍👦 फॅमिली: ₹२,००० (Weekdays) / ₹३,००० (Weekends) प्रति व्यक्ती\n3. 🌊 पिकनिक: ₹१,२००/व्यक्ती (12 PM - 8 PM)\n\nतारखा सांगा, availability सांगतो! 🗓️`;
      } else if (languageToUse === 'english') {
        result = `Nandibaag Resort Rates:\n1. 🏡 Couple Stay: ₹5,000 (Weekday) / ₹6,500 (Weekend)\n2. 👨‍👩‍👧‍👦 Group Stay: ₹2,000 (Weekday) / ₹3,000 (Weekend) per person\n3. 🌊 Day Picnic: ₹1,200/person (12 PM - 8 PM)\n\nPlease share your dates for availability! 🗓️`;
      } else {
        result = `Nandibaag Resort Packages:\n1. 🏡 Couple Stay: ₹5,000 (Weekday) / ₹6,500 (Weekend)\n2. 👨‍👩‍👧‍👦 Group Stay: ₹2,000 (Weekday) / ₹3,000 (Weekend) per person\n3. 🌊 Day Picnic: ₹1,200/person (12 PM - 8 PM)\n\nCheck-in date aur total guests batayein! 🗓️`;
      }
    } else {
      if (languageToUse === 'roman_marathi') {
        result = `Namaste! 🌿 Nandibaag Resort madhe aaple swagat aahe. Couple stay, family group stay ki day picnic — konta pahije?`;
      } else if (languageToUse === 'marathi') {
        result = `नमस्ते! 🌿 नंदीबाग रिसॉर्टमध्ये आपले स्वागत आहे. कपल स्टे, फॅमिली स्टे की वन डे पिकनिक — कोणतं बुकिंग हवं आहे?`;
      } else if (languageToUse === 'english') {
        result = `Namaste! 🌿 Welcome to Nandibaag Resort. Are you planning for a Couple Stay, Family Group Stay, or Day Picnic?`;
      } else {
        result = `Namaste! 🌿 Welcome to Nandibaag Resort. Aap Couple Stay, Family Group Stay ya Day Picnic kis package ke baare mein enquire karna chahte hain?`;
      }
    }
  }

  // Final sanitation pass: guarantee no banned words, markdown, or fake phone numbers remain
  result = sanitizeReply(result);

  // Cache FAQ responses
  if (canUseCache) {
    const cacheKey = hashString(`${languageToUse}|${bookingStage}|${incomingMessage}`);
    responseCache.set(cacheKey, {
      response: result,
      timestamp: Date.now()
    });
  }

  return result;
}

// ── Startup fallback check ──────────────────────────────────────────
function checkStartupFallbackPhone() {
  const { resortContact1 } = require('../config/env');
  if (!resortContact1 || !/^\+?\d+$/.test(resortContact1)) {
    logger.warn(`[WARNING] RESORT_CONTACT_1 is not set or contains non-numeric characters: "${resortContact1}". Fallback messages might render with invalid phone numbers.`);
  } else {
    logger.info(`Startup check: Fallback contact phone number validated: ${resortContact1}`);
  }
}

// ── Startup AI_TEST_MODE warning ─oooooooo────────────────────────────
function checkStartupTestMode() {
  if (aiTestMode) {
    logger.warn('');
    logger.warn('⚠️  AI_TEST_MODE IS ON — using local Ollama only, NOT connected to real AI providers.');
    logger.warn('⚠️  Do not use this mode with the live resort WhatsApp number.');
    logger.warn('');
  }
}
checkStartupTestMode();
checkStartupFallbackPhone();

module.exports = {
  getAIResponse,
  detectLanguage,
  sanitizeReply,
  getModelHealthLast1Hour,
  isReplyValid
};
