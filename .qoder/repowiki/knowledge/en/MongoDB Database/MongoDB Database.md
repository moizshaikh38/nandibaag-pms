---
kind: external_dependency
name: MongoDB Database
slug: mongodb
category: external_dependency
category_hints:
    - vendor_identity
scope:
    - '**'
---

Primary document database for the application. Connected via Mongoose ODM using the MONGO_URI environment variable. Supports up to 10 retry attempts with 5-second intervals at startup before the server exits if connection fails.