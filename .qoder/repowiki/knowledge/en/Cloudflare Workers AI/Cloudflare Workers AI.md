---
kind: external_dependency
name: Cloudflare Workers AI
slug: cloudflare-workers-ai
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

AI provider accessed via Cloudflare's REST API (not OpenAI-compatible). Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables. Uses model @cf/meta/llama-3.1-8b-instruct by default. Integrated as TIER 3 in the production fallback chain with dedicated adapter due to non-standard API format.