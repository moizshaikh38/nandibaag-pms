---
kind: external_dependency
name: Google Gemini AI
slug: google-gemini
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

Secondary AI provider accessed via the official @google/generative-ai SDK. Requires GEMINI_API_KEY environment variable. Uses model gemini-2.0-flash by default. Integrated as TIER 4 in the production fallback chain with custom message format conversion from OpenAI-style messages to Gemini's contents format.