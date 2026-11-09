# Nandibaag PMS

Repository for the Nandibaag Resort WhatsApp bot and its monitoring dashboard. The application lives in [`nandibaag-bot/`](nandibaag-bot/), which has its own README.

## What is inside

- `nandibaag-bot/backend`: Node.js and Express API with MongoDB (Mongoose), Socket.IO, WhatsApp integration (Baileys) and AI replies through several providers.
- `nandibaag-bot/frontend`: React, Vite and Tailwind CSS monitoring dashboard (PWA), with Recharts and a Socket.IO client.
- Root `package.json`: the `start` script runs `node nandibaag-bot/backend/src/server.js`.
- `render.yaml` (Render web service with health check `/health`) and `vercel.json` for deployment settings.

## Run locally

```bash
npm install
cd nandibaag-bot/backend && cp .env.example .env     # fill in your own values
cd ../frontend && cp .env.example .env
```

Start the backend from the repository root with `npm start`. Start the dashboard with `npm run dev` inside `nandibaag-bot/frontend`. See `nandibaag-bot/README.md` for details.

## Environment variables

Names only, see `nandibaag-bot/backend/.env.example`: `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `NODE_ENV`, `FRONTEND_URL`, `RESORT_CONTACT_1` to `RESORT_CONTACT_3`, AI provider keys (`OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `CEREBRAS_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`) and model settings.

Never commit real values. Use environment variables or a local `.env` that is not tracked.

## License

No license has been granted for this repository. Contact the repository owner for permission to use the code.
