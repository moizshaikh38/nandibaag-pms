---
kind: external_dependency
name: Groq AI Platform
slug: groq
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

Production-tier AI provider using OpenAI-compatible API format. Configured via GROQ_API_KEY, GROQ_MODEL (default: llama-3.3-70b-versatile), and GROQ_BASE_URL (https://api.groq.com/openai/v1). Serves as TIER 1 (highest priority) in the production fallback chain.