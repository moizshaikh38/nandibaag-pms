require('dotenv').config();
const Joi = require('joi');

const envSchema = Joi.object({
  MONGO_URI: Joi.string().allow('', null).default('mongodb+srv://moizsh786786_db_user:RvSja2R0ytcXg6QZ@cluster0.ly5dxxy.mongodb.net/nandibaag-pms?retryWrites=true&w=majority').description('MongoDB connection URI'),
  JWT_SECRET: Joi.string().allow('', null).default('super-secret-jwt-key-nandibaag-prod-2026-x9k2').description('Secret key for JWT token signing'),
  JWT_EXPIRES_IN: Joi.string().allow('', null).default('7d').description('JWT token expiration time (e.g., "7d")'),
  OPENROUTER_API_KEY: Joi.string().allow('', null).default('').description('OpenRouter API key for AI calls'),
  OPENROUTER_MODEL_PRIMARY: Joi.string().allow('', null).default('meta-llama/llama-3.3-70b-instruct').description('Primary OpenRouter model to use'),
  PORT: Joi.number().default(7000).description('Server port'),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development').description('Environment'),
  RESORT_CONTACT_1: Joi.string().allow('', null).default('+919257657665').description('Primary resort contact number'),
  RESORT_CONTACT_2: Joi.string().allow('', null).default('+919257657664').description('Secondary resort contact number'),
  RESORT_CONTACT_3: Joi.string().allow('', null).default('+919257657663').description('Tertiary resort contact number'),
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
  CEREBRAS_MODEL: Joi.string().default('gemma-4-31b').description('Cerebras AI Model')
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  console.warn('Environment validation warning:', error.message);
}

module.exports = {
  mongoUri: envVars.MONGO_URI,
  jwtSecret: envVars.JWT_SECRET,
  jwtExpiresIn: envVars.JWT_EXPIRES_IN,
  openrouterApiKey: envVars.OPENROUTER_API_KEY,
  openrouterModelPrimary: envVars.OPENROUTER_MODEL_PRIMARY,
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
  groqBaseUrl: envVars.GROQ_BASE_URL
};
