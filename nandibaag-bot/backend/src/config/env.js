const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const Joi = require('joi');

const envSchema = Joi.object({
  MONGO_URI: Joi.string().allow('', null).default('mongodb+srv://moizsh786786_db_user:RvSja2R0ytcXg6QZ@cluster0.ly5dxxy.mongodb.net/nandibaag-pms?retryWrites=true&w=majority').description('MongoDB connection URI'),
  JWT_SECRET: Joi.string().allow('', null).default('super-secret-jwt-key-nandibaag-prod-2026-x9k2').description('Secret key for JWT token signing'),
  JWT_EXPIRES_IN: Joi.string().allow('', null).default('7d').description('JWT token expiration time (e.g., "7d")'),
  OPENROUTER_API_KEY: Joi.string().allow('', null).default('').description('OpenRouter API key for AI calls'),
  OPENROUTER_MODEL_PRIMARY: Joi.string().allow('', null).default('openai/gpt-4o-mini').description('Primary OpenRouter model to use'),
  OPENROUTER_SITE_URL: Joi.string().allow('', null).default('https://nandibaag.com').description('OpenRouter site URL header'),
  OPENROUTER_APP_NAME: Joi.string().allow('', null).default('Nandibaag WhatsApp AI').description('OpenRouter app name header'),
  PORT: Joi.number().default(7000).description('Server port'),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development').description('Environment'),
  RESORT_CONTACT_1: Joi.string().allow('', null).default('+919257657664').description('Primary resort contact number'),
  RESORT_CONTACT_2: Joi.string().allow('', null).default('+919257657665').description('Secondary resort contact number (Reception)'),
  RESORT_CONTACT_3: Joi.string().allow('', null).default('+917558269653').description('Tertiary resort contact number (Kitchen)'),
  ADMIN_DEFAULT_EMAIL: Joi.string().allow('', null).default('admin@nandibaag.com').description('Default admin email'),
  ADMIN_DEFAULT_PASSWORD: Joi.string().allow('', null).default('admin12345').description('Default admin password'),
  FRONTEND_URL: Joi.string().allow('', null).default('http://localhost:5173').description('Frontend application URL'),

  // ── Google Gemini Tier (optional first fallback tier) ─────────────
  GEMINI_API_KEY: Joi.string().allow('', null).default('').description('Google Gemini API key'),
  GEMINI_MODEL: Joi.string().default('gemini-2.0-flash').description('Google Gemini model name'),

  // ── Ollama (local dev/testing ONLY — never in production) ───────────
  AI_TEST_MODE: Joi.boolean().default(false).description('Enable local Ollama-only mode for testing'),
  OLLAMA_BASE_URL: Joi.string().default('http://localhost:11434/v1').description('Ollama OpenAI-compatible endpoint'),
  OLLAMA_MODEL: Joi.string().default('llama3.2').description('Ollama model name'),

  // ── Groq (production tier) ──────────────────────────────────────────
  GROQ_API_KEY: Joi.string().allow('', null).default('').description('Groq API key'),
  GROQ_MODEL: Joi.string().default('llama-3.3-70b-versatile').description('Groq model name'),
  GROQ_BASE_URL: Joi.string().default('https://api.groq.com/openai/v1').description('Groq OpenAI-compatible endpoint'),

  // ── Cloudflare Workers AI Tier (optional) ─────────────────────────
  CLOUDFLARE_ACCOUNT_ID: Joi.string().allow('', null).default('').description('Cloudflare Account ID'),
  CLOUDFLARE_API_TOKEN: Joi.string().allow('', null).default('').description('Cloudflare API Token'),
  CLOUDFLARE_MODEL: Joi.string().default('@cf/meta/llama-3.1-8b-instruct').description('Cloudflare AI Model'),

  // ── Cerebras Tier (optional) ────────────────────────────────────────
  CEREBRAS_API_KEY: Joi.string().allow('', null).default('').description('Cerebras API Key'),
  CEREBRAS_MODEL: Joi.string().default('gemma-4-31b').description('Cerebras AI Model'),

  // ── Fast2SMS WhatsApp Business Channel (parallel to Baileys) ────────
  FAST2SMS_ENABLED: Joi.boolean().default(true).description('Enable/disable Fast2SMS WhatsApp channel'),
  FAST2SMS_API_KEY: Joi.string().allow('', null).default('').description('Fast2SMS WhatsApp API key (from Fast2SMS dashboard)'),
  FAST2SMS_API_URL: Joi.string().allow('', null).default('https://www.fast2sms.com/dev/whatsapp-session').description('Fast2SMS WhatsApp send endpoint'),
  FAST2SMS_SENDER_NUMBERS: Joi.string().allow('', null).default('').description('Comma-separated Fast2SMS WhatsApp sender numbers, e.g. 9257657664,9257657663'),
  FAST2SMS_PHONE_NUMBER_ID: Joi.string().allow('', null).default('').description('Meta-style phone number ID of the sender from the Fast2SMS dashboard (Get Phone Numbers API)'),
  FAST2SMS_WEBHOOK_SECRET: Joi.string().allow('', null).default('').description('Shared secret used to verify Fast2SMS webhook authenticity')
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  console.warn('Environment validation warning:', error.message);
}

const rawMongoUri = envVars.MONGO_URI || 'mongodb+srv://moizsh786786_db_user:RvSja2R0ytcXg6QZ@cluster0.ly5dxxy.mongodb.net/nandibaag-pms?retryWrites=true&w=majority';
let cleanMongoUri = rawMongoUri.replace(/<|>/g, '').trim();

if (cleanMongoUri.includes('.mongodb.net') && !cleanMongoUri.includes('/nandibaag-pms')) {
  if (cleanMongoUri.includes('.mongodb.net/?')) {
    cleanMongoUri = cleanMongoUri.replace('.mongodb.net/?', '.mongodb.net/nandibaag-pms?');
  } else if (cleanMongoUri.includes('.mongodb.net/')) {
    cleanMongoUri = cleanMongoUri.replace('.mongodb.net/', '.mongodb.net/nandibaag-pms/');
  } else if (cleanMongoUri.endsWith('.mongodb.net')) {
    cleanMongoUri = cleanMongoUri + '/nandibaag-pms';
  }
}

module.exports = {
  mongoUri: cleanMongoUri,
  jwtSecret: envVars.JWT_SECRET,
  jwtExpiresIn: envVars.JWT_EXPIRES_IN,
  openrouterApiKey: envVars.OPENROUTER_API_KEY,
  openrouterModelPrimary: envVars.OPENROUTER_MODEL_PRIMARY,
  openrouterSiteUrl: envVars.OPENROUTER_SITE_URL,
  openrouterAppName: envVars.OPENROUTER_APP_NAME,
  port: envVars.PORT,
  nodeEnv: envVars.NODE_ENV,
  resortContact1: envVars.RESORT_CONTACT_1,
  resortContact2: envVars.RESORT_CONTACT_2,
  resortContact3: envVars.RESORT_CONTACT_3,
  adminDefaultEmail: envVars.ADMIN_DEFAULT_EMAIL,
  adminDefaultPassword: envVars.ADMIN_DEFAULT_PASSWORD,
  frontendUrl: envVars.FRONTEND_URL,

  // Google Gemini settings
  geminiApiKey: envVars.GEMINI_API_KEY,
  geminiModel: envVars.GEMINI_MODEL,

  // Cloudflare settings
  cloudflareAccountId: envVars.CLOUDFLARE_ACCOUNT_ID,
  cloudflareApiToken: envVars.CLOUDFLARE_API_TOKEN,
  cloudflareModel: envVars.CLOUDFLARE_MODEL,

  // Cerebras settings
  cerebrasApiKey: envVars.CEREBRAS_API_KEY,
  cerebrasModel: envVars.CEREBRAS_MODEL,
  cerebrasBaseUrl: 'https://api.cerebras.ai/v1',

  // Ollama settings (local dev/testing only)
  aiTestMode: envVars.AI_TEST_MODE,
  ollamaBaseUrl: envVars.OLLAMA_BASE_URL,
  ollamaModel: envVars.OLLAMA_MODEL,

  // Groq settings (production tier)
  groqApiKey: envVars.GROQ_API_KEY,
  groqModel: envVars.GROQ_MODEL,
  groqBaseUrl: envVars.GROQ_BASE_URL,

  // Fast2SMS WhatsApp channel settings
  fast2smsEnabled: envVars.FAST2SMS_ENABLED === true || envVars.FAST2SMS_ENABLED === 'true',
  fast2smsApiKey: envVars.FAST2SMS_API_KEY,
  fast2smsApiUrl: envVars.FAST2SMS_API_URL,
  fast2smsSenderNumbers: envVars.FAST2SMS_SENDER_NUMBERS,
  fast2smsPhoneNumberId: envVars.FAST2SMS_PHONE_NUMBER_ID,
  fast2smsWebhookSecret: envVars.FAST2SMS_WEBHOOK_SECRET
};
