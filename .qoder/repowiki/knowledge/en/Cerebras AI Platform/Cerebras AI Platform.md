---
kind: external_dependency
name: Cerebras AI Platform
slug: cerebras
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

Production-tier AI provider using OpenAI-compatible API format. Configured via CEREBRAS_API_KEY, CEREBRAS_MODEL (default: gemma-4-31b), and CEREBRAS_BASE_URL. Serves as TIER 2 in the production fallback chain, providing redundancy across different infrastructure than Groq.