---
kind: external_dependency
name: OpenRouter AI Gateway
slug: openrouter
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

Primary AI provider gateway using OpenAI-compatible API format. Configured via OPENROUTER_API_KEY environment variable with base URL https://openrouter.ai/api/v1. Serves as fallback tier (TIER 5) with a 3-model chain: Meta Llama 70B primary, Qwen 80B, and Google Gemma 31B — all free-tier models sharing the same API key.