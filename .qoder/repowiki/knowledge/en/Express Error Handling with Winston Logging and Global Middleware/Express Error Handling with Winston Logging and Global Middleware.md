---
kind: error_handling
name: Express Error Handling with Winston Logging and Global Middleware
category: error_handling
scope:
    - '**'
source_files:
    - backend/src/middleware/errorHandler.js
    - backend/src/config/logger.js
    - backend/src/server.js
    - backend/src/routes/authRoutes.js
    - backend/src/middleware/auth.js
    - backend/src/config/db.js
---

The Nandibaag Resort WhatsApp Bot uses a straightforward Express.js error handling strategy built around a single global middleware, structured logging via Winston, and process-level unhandled error guards. There is no custom error class hierarchy or sentinel-error library — errors are plain JavaScript `Error` objects propagated through the standard Express `(err, req, res, next)` chain.

**Core components**
- **Global Express error handler** (`backend/src/middleware/errorHandler.js`): A single middleware registered last in `server.js`. It reads `err.statusCode` (defaulting to 500), logs via Winston, and returns a consistent `{ success: false, message }` JSON body. Stack traces are included only when `NODE_ENV === 'development'`, never in production.
- **Structured logger** (`backend/src/config/logger.js`): Winston instance writing two file transports under `backend/logs/` — `error.log` (level `error`) and `combined.log` (all levels) — both as timestamped JSON. In development a colored console transport is added.
- **Process-level guards** (`backend/src/server.js`): `unhandledRejection` and `uncaughtException` listeners log the failure and exit the process; there is no `try/catch` recovery at this level.
- **Graceful shutdown** (`server.js`): Listens for `SIGTERM` / `SIGINT` / `SIGUSR2`, destroys all active WhatsApp sessions, closes the HTTP server, disconnects MongoDB, then exits. Errors during shutdown are logged but do not prevent termination.

**Propagation patterns across the codebase**
- Routes wrap async handlers in `try { ... } catch (error) { next(error); }` blocks so that any thrown error bubbles to the global handler. Examples: `authRoutes.js`, `bookingRoutes.js`, `chatRoutes.js`.
- Validation failures (Joi) return early with `res.status(400).json({ success: false, message })` rather than throwing, keeping them out of the error pipeline.
- Authentication middleware (`middleware/auth.js`) catches JWT verification failures, logs them, and responds directly with 401 instead of calling `next(err)`.
- Database connection failures (`config/db.js`) use retry logic with exponential backoff, log each attempt via `logger.error`, and ultimately call `process.exit(1)` after exhausting retries.
- The health endpoint (`/health`) catches its own errors and returns a 500 JSON response inline rather than delegating to the global handler.

**Response shape convention**
- Successful responses: `{ success: true, ...payload }`
- Client errors (validation, auth, not-found): `{ success: false, message }` with appropriate HTTP status (400/401/404)
- Server errors: handled by the global middleware → `{ success: false, message }` plus optional `stack` in dev

**What is NOT present**
- No custom `AppError` / `NotFoundError` / `ValidationError` classes.
- No centralized error-code constants or enum mapping.
- No `panic`/`recover` equivalent (Node.js has none).
- No per-route try/catch-free async wrapper (e.g., `express-async-handler`).
- No request-id correlation attached to error logs.