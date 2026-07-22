---
kind: external_dependency
name: WhatsApp Web Integration
slug: whatsapp-web-js
category: external_dependency
category_hints:
    - vendor_identity
    - framework_behavior
scope:
    - '**'
---

WhatsApp Business API integration via whatsapp-web.js library. Manages multiple WhatsApp sessions per configured resort contact numbers. Sessions are stored in backend/sessions/ directory and persist authentication state. Includes session lifecycle management with restart capabilities and graceful shutdown handling.