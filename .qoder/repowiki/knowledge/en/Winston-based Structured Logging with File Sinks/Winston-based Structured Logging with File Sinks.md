---
kind: logging_system
name: Winston-based Structured Logging with File Sinks
category: logging_system
scope:
    - '**'
source_files:
    - nandibaag-bot/backend/src/config/logger.js
    - nandibaag-bot/backend/src/server.js
    - nandibaag-bot/backend/src/middleware/errorHandler.js
    - nandibaag-bot/backend/src/config/db.js
---

The backend uses **Winston** as the centralized logging framework, configured in `src/config/logger.js` and imported wherever needed via `require('./config/logger')`. The logger is initialized once at startup and exported as a singleton instance used across services, routes, middleware, and process-level hooks.

### Framework & Transports
- **Framework**: Winston (v3+).
- **Transports**:
  - **Console** — enabled only in development (`NODE_ENV=development`). Uses colorized output with a human-readable format: `YYYY-MM-DD HH:mm:ss [level]: message {metadata}`.
  - **File: error.log** — captures all `error` level entries, written as JSON lines with timestamps.
  - **File: combined.log** — captures all levels, also JSON-lines with timestamps. Both files live under `backend/logs/`.
- **Log level strategy**: `debug` in development, `info` in production. This is set on the logger instance and applies globally to all transports.

### HTTP Request Logging
HTTP access logs are handled separately by **Morgan**, mounted conditionally in development only (`app.use(morgan('dev'))`). Morgan output goes to stdout; it does not write to the Winston file sinks.

### Structured Fields & Conventions
- Application code logs structured metadata as the second argument to `logger.<level>(message, fields)`. Examples:
  - Global error handler attaches `{ stack, url, method, ip }` to every unhandled request error.
  - MongoDB connection events log contextual messages like retry counts and failure reasons.
  - Startup/shutdown flows log environment details, admin creation warnings, and session lifecycle events.
- No custom Winston `logLevel` or `category` field is injected automatically; callers pass free-form key/value pairs that get serialized into the JSON line.

### Process-Level & Graceful Shutdown Logging
- `unhandledRejection` and `uncaughtException` handlers log fatal errors via `logger.error` before exiting.
- A graceful shutdown routine logs each step (`SIGTERM/SIGINT/SIGUSR2 received`, session destruction, server close, MongoDB disconnect), with a hard timeout fallback if cleanup hangs.

### Error Response Policy
The global Express error handler (`src/middleware/errorHandler.js`) always logs full stack traces through Winston regardless of environment, but returns stack traces to clients only when `NODE_ENV=development`. This keeps production responses clean while preserving diagnostics in logs.

### What Is Not Present
- No log rotation configuration (e.g., `winston-daily-rotate-file`); long-running deployments will grow `combined.log` / `error.log` indefinitely.
- No correlation IDs, request-scoped child loggers, or per-route context injection.
- No external sink (Datadog, CloudWatch, ELK, etc.) — all output is local filesystem + console.