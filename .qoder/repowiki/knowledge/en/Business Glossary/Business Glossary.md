---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### PMS
- Definition：Property Management System — the internal module being built for managing room inventory, bookings, and calendar operations for Nandibaag Resort. Phase A covers Room/Series Inventory Management; future phases include Calendar and Bookings.
- Aliases：property-management-system

### Series
- Definition：A grouping of rooms within the PMS inventory system. Each Series contains multiple Rooms and represents a collection like '100 Series', '500 Series', etc. Series can be created, edited, deleted (with cascading soft-delete to all contained rooms), and bulk status changes applied.

### Room Status
- Definition：Three-state classification for rooms in the PMS: active (green), maintenance (amber), or wellness (blue). Status affects availability calculations and is displayed via StatusBadge components throughout the UI.
- Aliases：room-status、status-badge

### Optimistic UI
- Definition：User interface pattern used throughout the application where actions appear to complete instantly (visual feedback) while API calls execute in background. If API calls fail, the UI reverts to previous state with toast notification. Used for inventory CRUD operations and AI/Human mode toggles.
- Aliases：optimistic-updates、pessimistic-fallback

### Nandibaag Bot
- Definition：The full-stack WhatsApp AI booking bot for Nandibaag Resort management. Combines WhatsApp customer service automation with real-time monitoring dashboard and admin controls.
- Aliases：nandibaag-bot、resort-bot

### Follow-up Message
- Definition：Scheduled automated messages sent to customers after initial interactions. Managed through cron jobs and tracked in the FollowUp model. Part of the customer engagement workflow.
- Aliases：follow-up、scheduled-message

### Lead Scoring
- Definition：Automated system for evaluating and prioritizing potential customers based on their interaction patterns and booking intent. Uses Socket.io for real-time score updates to the dashboard.
- Aliases：lead-score、customer-scoring
