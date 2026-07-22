---
kind: configuration_system
name: Environment-Driven Configuration with Joi Validation and Runtime Settings
category: configuration_system
scope:
    - '**'
source_files:
    - nandibaag-bot/backend/src/config/env.js
    - nandibaag-bot/backend/.env.example
    - nandibaag-bot/backend/src/config/db.js
    - nandibaag-bot/backend/src/config/logger.js
    - nandibaag-bot/backend/src/server.js
    - nandibaag-bot/backend/src/models/Settings.js
    - nandibaag-bot/frontend/.env.example
---

The application uses a layered configuration system combining static environment variables, runtime database settings, and per-environment toggles.

Static Environment Configuration (Backend)
- dotenv loads .env at startup; src/config/env.js defines the canonical schema using Joi for validation and defaults.
- Required fields include MongoDB URI, JWT secret/expires-in, OpenRouter API key/model, server port, node environment, resort contact numbers, default admin credentials, and frontend URL.
- Optional AI provider tiers are gated by empty-string defaults: Google Gemini, Groq, Cloudflare Workers AI, Cerebras, plus local Ollama dev mode (AI_TEST_MODE).
- On validation failure the process exits immediately with a formatted error listing each missing/invalid variable.
- The module re-exports camelCase aliases (e.g. mongoUri, jwtSecret) consumed throughout the app.

Database Runtime Settings
- src/models/Settings.js persists operational toggles in MongoDB: globalMode (ai | human), whatsappNumbers[], openRouterModelOverride, followUpEnabled.
- server.js seeds a default Settings document on first run if none exists, and reads it during health checks and WhatsApp session restarts.

Logging Configuration
- src/config/logger.js builds a Winston logger whose transports depend on NODE_ENV: development adds a colored console transport; both environments write JSON files to backend/logs/error.log and backend/logs/combined.log.

Frontend Configuration
- Vite env vars in frontend/.env.example define VITE_API_URL and VITE_SOCKET_URL; these are injected at build time into the React client.

Startup Wiring
- src/server.js is the single entry point: it imports config/env, connects to MongoDB via config/db.js (with retry logic up to 10 attempts), initializes Socket.io, mounts routes, and listens on the configured port. It also creates a default admin user from env-derived credentials when none exist.

Conventions & Rules
- All new environment variables must be added to the Joi schema in src/config/env.js with a description; otherwise the app will refuse to start.
- Secrets (JWT_SECRET, API keys) live only in .env — never commit .env; use .env.example as the source of truth for required keys.
- Per-instance runtime flags (mode, model override, follow-up toggle) go through the Settings model, not env vars.
- Frontend-only URLs must use the VITE_ prefix so Vite can bake them into the bundle.