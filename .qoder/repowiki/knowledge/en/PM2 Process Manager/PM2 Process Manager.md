---
kind: external_dependency
name: PM2 Process Manager
slug: pm2
category: external_dependency
category_hints:
    - vendor_identity
scope:
    - '**'
---

Production process manager for Node.js applications. Configured via ecosystem.config.js with single instance, 500M memory limit, auto-restart on failure, and log rotation to logs/ directory. Used for deployment with pm2 start ecosystem.config.js command.