---
kind: external_dependency
name: Ollama Local AI Server
slug: ollama
category: external_dependency
category_hints:
    - vendor_identity
    - client_constraint
scope:
    - '**'
---

Local AI server for development/testing only. Runs unauthenticated at http://localhost:11434/v1 by default. Activated when AI_TEST_MODE=true environment variable is set. Provides local-only mode that bypasses all cloud providers. Never intended for production use with live WhatsApp numbers.