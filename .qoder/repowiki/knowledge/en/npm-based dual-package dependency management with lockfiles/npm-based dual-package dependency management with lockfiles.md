---
kind: dependency_management
name: npm-based dual-package dependency management with lockfiles
category: dependency_management
scope:
    - '**'
source_files:
    - nandibaag-bot/backend/package.json
    - nandibaag-bot/backend/package-lock.json
    - nandibaag-bot/frontend/package.json
    - nandibaag-bot/frontend/package-lock.json
---

The repository uses a standard npm-based dependency management approach across two independent Node.js packages — backend/ and frontend/ — each with its own package.json and package-lock.json. There is no monorepo setup (no root package.json, no workspaces, no pnpm/yarn/polyglot tooling). Each package resolves dependencies from the public npm registry (https://registry.npmjs.org) as recorded in their respective package-lock.json files; no private registry or .npmrc configuration was found.

Backend (nandibaag-bot/backend/package.json)
- Runtime deps include Express server stack (express, cors, helmet, compression, morgan), authentication (jsonwebtoken, bcryptjs), validation (joi), database (mongoose), real-time (socket.io), WhatsApp automation (whatsapp-web.js), AI providers (@google/generative-ai, openai), scheduling (node-cron), QR generation (qrcode), and logging (winston).
- Dev-only dep: nodemon for hot-reload during development.
- Scripts expose start, dev, setup, check-ports, smoke-test, seed-rooms, and test-ai.

Frontend (nandibaag-bot/frontend/package.json)
- Vite + React 18 app using ESM (type: module).
- Runtime deps: react, react-dom, react-router-dom, axios, socket.io-client, lucide-react, react-hot-toast.
- Dev deps: vite, @vitejs/plugin-react, tailwindcss v4, @tailwindcss/vite, vite-plugin-pwa.
- Scripts: dev, build, preview.

Lockfiles & reproducibility
- Both packages ship a committed package-lock.json, pinning exact transitive versions so npm ci produces deterministic installs. No vendoring strategy (no vendor/ directory) is used.

Versioning policy
- All dependencies use caret (^) ranges in package.json, allowing minor/patch upgrades within the major version. No explicit version-alignment rules between backend and frontend were found beyond shared socket.io client/server pair (4.6.1).

Runtime environment
- The backend is intended to be managed by PM2 via ecosystem.config.js; this is an operational concern rather than a dependency-management mechanism.

Rules developers should follow
- Add new dependencies only inside the relevant sub-package's package.json (never at repo root).
- Commit the updated package-lock.json alongside any package.json change to keep installs reproducible.
- Prefer ^ semver ranges as already used; avoid bare version numbers unless a breaking change is intentional.
- Keep backend and frontend socket.io versions aligned when upgrading, since they communicate over the same protocol.