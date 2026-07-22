---
kind: frontend_style
name: Tailwind CSS v4 + WhatsApp Brand Theme
category: frontend_style
scope:
    - '**'
source_files:
    - frontend/tailwind.config.js
    - frontend/src/index.css
    - frontend/package.json
---

The frontend uses **Tailwind CSS v4** (via `@tailwindcss/vite` plugin) with a Vite React build. All styling is utility-first — there are no separate CSS frameworks or component libraries beyond Tailwind and the icon set from `lucide-react`. Visual identity is built around a custom `whatsapp-*` color palette that mirrors WhatsApp's brand, plus an SVG-based chat background pattern.

**Design tokens** are declared in two places:
- `frontend/tailwind.config.js` — extends Tailwind's theme with `colors.whatsapp.*` (`DEFAULT`, `light`, `chat`, `bg`, `bubbleIn`, `bubbleOut`) and a `fontFamily.sans` stack starting with Inter.
- `frontend/src/index.css` — re-declares the same tokens as CSS variables under `@theme` (Tailwind v4 syntax), then adds global styles: a thin `.chat-scrollbar` for message lists and a `.whatsapp-bg` class that applies the classic WhatsApp doodle SVG background.

**Styling conventions observed across components:**
- Brand colors are applied via Tailwind utilities like `bg-whatsapp`, `text-whatsapp`, `border-whatsapp`, `hover:bg-whatsapp-light`.
- Chat bubbles use `bg-whatsapp-bubbleOut` for received messages and `bg-whatsapp-bubbleIn` for sent ones.
- A consistent transition rule is applied globally (`transition-duration: 150ms; cubic-bezier(0.4, 0, 0.2, 1)` on all properties).
- Loading spinners use `animate-spin rounded-full border-b-2 border-whatsapp`.
- The layout shell uses `min-h-screen bg-gray-100 pb-16` with a fixed bottom navigation bar.

**No design system library** (e.g., shadcn, MUI) is used; every visual element is composed from raw Tailwind classes. There is no dark-mode configuration, no responsive breakpoint overrides beyond Tailwind defaults, and no CSS-in-JS or styled-components usage.