# Message Processing Pipeline

<cite>
**Referenced Files in This Document**
- [messageHandler.js](file://backend/src/services/messageHandler.js)
- [aiService.js](file://backend/src/services/aiService.js)
- [systemPrompt.js](file://backend/src/services/systemPrompt.js)
- [Chat.js](file://backend/src/models/Chat.js)
- [Booking.js](file://backend/src/models/Booking.js)
- [FollowUp.js](file://backend/src/models/FollowUp.js)
- [leadScoring.js](file://backend/src/services/leadScoring.js)
- [followUpService.js](file://backend/src/services/followUpService.js)
- [chatRoutes.js](file://backend/src/routes/chatRoutes.js)
- [bookingRoutes.js](file://backend/src/routes/bookingRoutes.js)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document explains the end-to-end message processing pipeline for the WhatsApp-based resort booking assistant. It covers how incoming messages are routed, how conversation state is managed across multi-turn dialogues, how the booking flow progresses (price quoting, availability cues, and confirmation handover), and how human-in-the-loop mode switching allows staff intervention. It also documents integration points with lead scoring and follow-up scheduling, along with examples of booking states and manual override procedures.

## Project Structure
The backend implements a modular service-oriented architecture:
- Services orchestrate messaging, AI generation, lead scoring, and follow-ups
- Models define persistent entities for chats, bookings, and follow-ups
- Routes expose REST endpoints for dashboard operations (mode switching, manual messaging, resets, archiving, listing)
- System prompt centralizes business rules and conversation flow instructions for the AI

```mermaid
graph TB
subgraph "Services"
MH["Message Handler"]
AIS["AI Service"]
SYS["System Prompt Builder"]
LS["Lead Scoring"]
FU["Follow-Up Service"]
WA["WhatsApp Service"]
end
subgraph "Models"
CHAT["Chat"]
BOOK["Booking"]
FUP["FollowUp"]
end
subgraph "Routes"
CR["Chat Routes"]
BR["Booking Routes"]
end
MH --> AIS
AIS --> SYS
MH --> LS
MH --> FU
MH --> WA
CR --> CHAT
BR --> BOOK
FU --> FUP
LS --> CHAT
```

**Diagram sources**
- [messageHandler.js:1-183](file://backend/src/services/messageHandler.js#L1-L183)
- [aiService.js:1-800](file://backend/src/services/aiService.js#L1-L800)
- [systemPrompt.js:1-94](file://backend/src/services/systemPrompt.js#L1-L94)
- [leadScoring.js:1-235](file://backend/src/services/leadScoring.js#L1-L235)
- [followUpService.js:1-126](file://backend/src/services/followUpService.js#L1-L126)
- [Chat.js:1-107](file://backend/src/models/Chat.js#L1-L107)
- [Booking.js:1-69](file://backend/src/models/Booking.js#L1-L69)
- [FollowUp.js:1-49](file://backend/src/models/FollowUp.js#L1-L49)
- [chatRoutes.js:1-254](file://backend/src/routes/chatRoutes.js#L1-L254)
- [bookingRoutes.js:1-71](file://backend/src/routes/bookingRoutes.js#L1-L71)

**Section sources**
- [messageHandler.js:1-183](file://backend/src/services/messageHandler.js#L1-L183)
- [aiService.js:1-800](file://backend/src/services/aiService.js#L1-L800)
- [systemPrompt.js:1-94](file://backend/src/services/systemPrompt.js#L1-L94)
- [Chat.js:1-107](file://backend/src/models/Chat.js#L1-L107)
- [Booking.js:1-69](file://backend/src/models/Booking.js#L1-L69)
- [FollowUp.js:1-49](file://backend/src/models/FollowUp.js#L1-L49)
- [leadScoring.js:1-235](file://backend/src/services/leadScoring.js#L1-L235)
- [followUpService.js:1-126](file://backend/src/services/followUpService.js#L1-L126)
- [chatRoutes.js:1-254](file://backend/src/routes/chatRoutes.js#L1-L254)
- [bookingRoutes.js:1-71](file://backend/src/routes/bookingRoutes.js#L1-L71)

## Core Components
- Message routing and orchestration: Loads settings, finds or creates chat records, detects opt-out, updates language, persists messages, decides AI vs human mode, sends replies, scores leads, and schedules follow-ups.
- AI response generation: Multi-provider chain (OpenAI-compatible, Gemini, Cloudflare), sanitization, length enforcement, reply validation, and per-provider metrics.
- Conversation state model: Tracks customer phone, mode, language, messages, last activity, booking stage, draft details, new-conversation flag, reset timestamp, and archive status.
- Booking model: Stores finalized booking details including type, date, adults/kids, total amount, price breakdown, special requests, status, and creator source.
- Lead scoring: Heuristic-based point system that upgrades lead status (cold/warm/hot) based on signals like pricing interest, dates, guest counts, name/phone sharing, and intent phrases.
- Follow-up automation: Schedules staged reminders after first booking interest; cancels pending follow-ups when customers engage, opt out, or staff take over.
- Dashboard routes: Per-chat mode switching, manual staff messaging, conversation reset, soft archive, and listing/search.

**Section sources**
- [messageHandler.js:1-183](file://backend/src/services/messageHandler.js#L1-L183)
- [aiService.js:1-800](file://backend/src/services/aiService.js#L1-L800)
- [Chat.js:1-107](file://backend/src/models/Chat.js#L1-L107)
- [Booking.js:1-69](file://backend/src/models/Booking.js#L1-L69)
- [leadScoring.js:1-235](file://backend/src/services/leadScoring.js#L1-L235)
- [followUpService.js:1-126](file://backend/src/services/followUpService.js#L1-L126)
- [chatRoutes.js:1-254](file://backend/src/routes/chatRoutes.js#L1-L254)

## Architecture Overview
The pipeline processes an incoming WhatsApp message through a deterministic sequence:
- Identify or create a Chat record
- Check opt-out and update language
- Persist the customer message
- Decide mode (human vs AI)
- If AI: generate response via provider chain, sanitize/validate, persist, send via WhatsApp, score lead, schedule follow-ups if first interest
- If human: persist and notify staff via socket events

```mermaid
sequenceDiagram
participant WA as "WhatsApp"
participant MH as "Message Handler"
participant DB as "Database (Chat)"
participant AI as "AI Service"
participant SP as "System Prompt"
participant LS as "Lead Scoring"
participant FU as "Follow-Up Service"
participant WS as "WebSocket"
WA->>MH : Incoming message
MH->>DB : Find/Create Chat
MH->>MH : Detect opt-out & language
MH->>DB : Append customer message
alt Mode = human
MH->>WS : Emit "chat : new_message"
MH-->>WA : No auto-reply
else Mode = ai
MH->>SP : Build system prompt
MH->>AI : Generate reply
AI-->>MH : Sanitized + validated text
MH->>DB : Append bot message
MH->>WA : Send reply
MH->>LS : Score message
MH->>FU : Schedule follow-ups (first interest)
end
```

**Diagram sources**
- [messageHandler.js:1-183](file://backend/src/services/messageHandler.js#L1-L183)
- [aiService.js:1-800](file://backend/src/services/aiService.js#L1-L800)
- [systemPrompt.js:1-94](file://backend/src/services/systemPrompt.js#L1-L94)
- [leadScoring.js:1-235](file://backend/src/services/leadScoring.js#L1-L235)
- [followUpService.js:1-126](file://backend/src/services/followUpService.js#L1-L126)
- [chatRoutes.js:1-254](file://backend/src/routes/chatRoutes.js#L1-L254)

## Detailed Component Analysis

### Message Routing and Human-in-the-Loop
- Entry point loads global settings and resolves per-chat mode.
- Opt-out detection immediately halts automation and marks the chat opted out.
- Language detection updates the chat’s language field for analytics and personalization.
- In human mode, no auto-reply is sent; instead, a socket event notifies the dashboard for staff to respond manually.
- In AI mode, the handler orchestrates AI generation, persistence, delivery, lead scoring, and follow-up scheduling.

```mermaid
flowchart TD
Start(["Incoming Message"]) --> LoadSettings["Load Settings"]
LoadSettings --> FindOrCreate["Find or Create Chat"]
FindOrCreate --> OptOut{"Contains opt-out?"}
OptOut --> |Yes| MarkOpted["Mark opted out<br/>Cancel follow-ups"]
MarkOpted --> End(["Exit"])
OptOut --> |No| UpdateLang["Update language"]
UpdateLang --> SaveMsg["Append customer message"]
SaveMsg --> ModeCheck{"Mode = human?"}
ModeCheck --> |Yes| NotifyStaff["Emit socket event<br/>No auto-reply"]
NotifyStaff --> End
ModeCheck --> |No| GenAI["Generate AI reply"]
GenAI --> PersistReply["Append bot message"]
PersistReply --> SendWA["Send via WhatsApp"]
SendWA --> ScoreLead["Score lead"]
ScoreLead --> FirstInterest{"First booking interest?"}
FirstInterest --> |Yes| ScheduleFU["Schedule follow-ups"]
FirstInterest --> |No| End
ScheduleFU --> End
```

**Diagram sources**
- [messageHandler.js:1-183](file://backend/src/services/messageHandler.js#L1-L183)
- [followUpService.js:1-126](file://backend/src/services/followUpService.js#L1-L126)
- [chatRoutes.js:1-254](file://backend/src/routes/chatRoutes.js#L1-L254)

**Section sources**
- [messageHandler.js:1-183](file://backend/src/services/messageHandler.js#L1-L183)
- [chatRoutes.js:76-126](file://backend/src/routes/chatRoutes.js#L76-L126)

### AI Response Generation and Validation
- Provider chain attempts multiple backends (OpenAI-compatible, Gemini, Cloudflare). Each attempt is wrapped with timeouts, error handling, and metrics recording.
- Responses are sanitized to remove reasoning tags and markdown, then enforced to line/character limits.
- A strict validator checks script ranges, repeated words, and English word heuristics to ensure safe, natural Hinglish/Hindi/Marathi/Gujarati outputs.
- The system prompt defines identity, pricing, facilities, policies, link-sharing rules, language behavior, and the golden rule of one question at a time.

```mermaid
classDiagram
class AIService {
+tryOpenAICompatibleCall()
+tryGeminiCall()
+tryCloudflareCall()
+sanitizeReply(text)
+enforceLengthLimits(text)
+isReplyValid(text)
+detectLanguage(text)
}
class SystemPrompt {
+buildSystemPrompt(today, day, settings)
}
AIService --> SystemPrompt : "uses"
```

**Diagram sources**
- [aiService.js:1-800](file://backend/src/services/aiService.js#L1-L800)
- [systemPrompt.js:1-94](file://backend/src/services/systemPrompt.js#L1-L94)

**Section sources**
- [aiService.js:1-800](file://backend/src/services/aiService.js#L1-L800)
- [systemPrompt.js:1-94](file://backend/src/services/systemPrompt.js#L1-L94)

### Conversation State Management and Multi-Turn Dialogue
- The Chat model stores:
  - Mode (ai/human)
  - Language (auto-detected)
  - Messages array (sender, text, timestamp, type)
  - Last activity timestamp
  - Booking stage (progression through the flow)
  - Booking draft (type, date, nights, adults, kids, marital check, calculated price, breakdown, special requests)
  - New conversation flag and reset timestamp
  - Archive flag for soft deletion
- Multi-turn context is preserved by appending both customer and bot messages to the same Chat document, enabling the AI to reference prior turns via the stored history.

```mermaid
erDiagram
CHAT {
string customerPhone
string whatsappNumberUsed
enum mode
enum language
array messages
datetime lastMessageAt
enum bookingStage
object bookingDraft
boolean isNewConversation
datetime conversationResetAt
boolean isArchived
}
BOOKING {
objectId chatId
string customerName
string customerPhone
enum bookingType
string date
boolean isWeekend
number adults
array kids
number totalAmount
string priceBreakdown
string specialRequests
enum status
enum createdBy
}
FOLLOWUP {
objectId chatId
string customerPhone
enum stage
datetime scheduledFor
enum status
string cancelReason
datetime sentAt
}
CHAT ||--o{ BOOKING : "has many"
CHAT ||--o{ FOLLOWUP : "has many"
```

**Diagram sources**
- [Chat.js:1-107](file://backend/src/models/Chat.js#L1-L107)
- [Booking.js:1-69](file://backend/src/models/Booking.js#L1-L69)
- [FollowUp.js:1-49](file://backend/src/models/FollowUp.js#L1-L49)

**Section sources**
- [Chat.js:1-107](file://backend/src/models/Chat.js#L1-L107)

### Booking Flow Automation
- The system prompt defines a stepwise flow:
  1) Select booking type (Couple Stay / Group Stay / One Day Picnic / Event)
  2) Collect date (reject past dates; same-day prompts direct call)
  3) Collect guest count
  4) Collect kids ages
  5) For couple stays, verify married-only policy
  6) Quote price with breakdown (weekday vs weekend)
  7) Collect name
  8) Collect phone
  9) Capture special requests
  10) Handover to staff with contact number
- The Chat.bookingStage tracks progress through these steps, while bookingDraft accumulates structured data. When the stage transitions from none to a non-none value, follow-ups are scheduled.
- Finalized bookings can be persisted using the Booking model with fields for type, date, adults/kids, totals, breakdown, special requests, status, and creator source.

```mermaid
stateDiagram-v2
[*] --> None
None --> TypeSelected : "booking_type_selected"
TypeSelected --> DateGiven : "date_given"
DateGiven --> GuestsGiven : "guests_given"
GuestsGiven --> KidsGiven : "kids_given"
KidsGiven --> MarriedChecked : "married_checked"
MarriedChecked --> PriceQuoted : "price_quoted"
PriceQuoted --> NameGiven : "name_given"
NameGiven --> PhoneGiven : "phone_given"
PhoneGiven --> SpecialRequests : "special_requests"
SpecialRequests --> HandedOver : "handed_over"
HandedOver --> Completed : "completed"
```

**Diagram sources**
- [Chat.js:74-78](file://backend/src/models/Chat.js#L74-L78)
- [systemPrompt.js:75-77](file://backend/src/services/systemPrompt.js#L75-L77)

**Section sources**
- [systemPrompt.js:1-94](file://backend/src/services/systemPrompt.js#L1-L94)
- [Chat.js:1-107](file://backend/src/models/Chat.js#L1-L107)
- [Booking.js:1-69](file://backend/src/models/Booking.js#L1-L69)

### Human-in-the-Loop Mode Switching and Manual Overrides
- Staff can switch a specific chat into human mode via API; this prevents auto-replies and cancels pending follow-ups.
- Staff can send manual messages from the dashboard; these are appended as staff-sender entries and delivered via WhatsApp.
- Staff can reset a conversation to start fresh while preserving history, and can archive chats for soft deletion.

```mermaid
sequenceDiagram
participant Admin as "Dashboard"
participant API as "Chat Routes"
participant DB as "Database"
participant WS as "WebSocket"
participant FU as "Follow-Up Service"
Admin->>API : PATCH /api/chats/ : id/mode {mode : "human"}
API->>DB : Update Chat.mode
API->>FU : Cancel pending follow-ups
API->>WS : Emit "chat : mode_updated"
Admin->>API : POST /api/chats/ : id/message {text}
API->>DB : Append staff message
API-->>Admin : Success
Admin->>API : POST /api/chats/ : id/reset
API->>DB : Reset flags & booking state
API->>FU : Cancel pending follow-ups
Admin->>API : PATCH /api/chats/ : id/archive
API->>DB : Set isArchived=true
```

**Diagram sources**
- [chatRoutes.js:76-254](file://backend/src/routes/chatRoutes.js#L76-L254)
- [followUpService.js:1-126](file://backend/src/services/followUpService.js#L1-L126)

**Section sources**
- [chatRoutes.js:76-254](file://backend/src/routes/chatRoutes.js#L76-L254)

### Lead Scoring Integration
- After each AI reply, the message is scored based on signals such as pricing interest, date/guest mentions, name/phone sharing, browsing photos/location, and explicit booking intent.
- Leads transition between cold/warm/hot statuses; hot leads trigger real-time alerts to the dashboard.
- On conversion (e.g., completed booking), leads can be marked converted with maximum score.

```mermaid
flowchart TD
Msg["Customer message + AI reply"] --> Signals["Extract signals"]
Signals --> Points["Add points for factors"]
Points --> UpdateStatus{"Score >= 61?"}
UpdateStatus --> |Yes| Hot["Set status=hot"]
UpdateStatus --> |No| WarmCold["Set warm/cold"]
Hot --> Alert["Emit hot alert to dashboard"]
WarmCold --> Save["Persist lead"]
Alert --> Save
```

**Diagram sources**
- [leadScoring.js:1-235](file://backend/src/services/leadScoring.js#L1-L235)

**Section sources**
- [leadScoring.js:1-235](file://backend/src/services/leadScoring.js#L1-L235)

### Follow-Up Automation
- When a chat first shows booking interest (transition from none to any other stage), four follow-ups are scheduled at staggered intervals.
- Follow-ups are cancelled when the customer replies, opts out, staff takes over, or the conversation is reset/archived.

```mermaid
flowchart TD
Interest["bookingStage != 'none'"] --> CheckExisting{"Existing follow-ups?"}
CheckExisting --> |Yes| Skip["Skip scheduling"]
CheckExisting --> |No| Create["Create 4 follow-ups (3hr, 1day, 3day, 7day)"]
Create --> Done["Done"]
```

**Diagram sources**
- [followUpService.js:1-126](file://backend/src/services/followUpService.js#L1-L126)

**Section sources**
- [followUpService.js:1-126](file://backend/src/services/followUpService.js#L1-L126)

## Dependency Analysis
- messageHandler depends on:
  - aiService for response generation
  - leadScoring for post-reply scoring
  - followUpService for opt-out handling and follow-up scheduling
  - whatsappService for outbound delivery
  - models.Chat and models.Settings for persistence and configuration
- aiService depends on:
  - systemPrompt for dynamic prompt construction
  - environment config for provider credentials and model selection
- Routes depend on:
  - models.Chat and models.Booking for CRUD operations
  - services.followUpService for cancellation logic
  - sockets for real-time notifications

```mermaid
graph LR
MH["messageHandler.js"] --> AIS["aiService.js"]
MH --> LS["leadScoring.js"]
MH --> FU["followUpService.js"]
MH --> WA["whatsappService.js"]
MH --> CHAT["models/Chat.js"]
AIS --> SYS["systemPrompt.js"]
CR["routes/chatRoutes.js"] --> CHAT
CR --> FU
BR["routes/bookingRoutes.js"] --> BOOK["models/Booking.js"]
```

**Diagram sources**
- [messageHandler.js:1-183](file://backend/src/services/messageHandler.js#L1-L183)
- [aiService.js:1-800](file://backend/src/services/aiService.js#L1-L800)
- [systemPrompt.js:1-94](file://backend/src/services/systemPrompt.js#L1-L94)
- [leadScoring.js:1-235](file://backend/src/services/leadScoring.js#L1-L235)
- [followUpService.js:1-126](file://backend/src/services/followUpService.js#L1-L126)
- [Chat.js:1-107](file://backend/src/models/Chat.js#L1-L107)
- [Booking.js:1-69](file://backend/src/models/Booking.js#L1-L69)
- [chatRoutes.js:1-254](file://backend/src/routes/chatRoutes.js#L1-L254)
- [bookingRoutes.js:1-71](file://backend/src/routes/bookingRoutes.js#L1-L71)

**Section sources**
- [messageHandler.js:1-183](file://backend/src/services/messageHandler.js#L1-L183)
- [aiService.js:1-800](file://backend/src/services/aiService.js#L1-L800)
- [systemPrompt.js:1-94](file://backend/src/services/systemPrompt.js#L1-L94)
- [leadScoring.js:1-235](file://backend/src/services/leadScoring.js#L1-L235)
- [followUpService.js:1-126](file://backend/src/services/followUpService.js#L1-L126)
- [Chat.js:1-107](file://backend/src/models/Chat.js#L1-L107)
- [Booking.js:1-69](file://backend/src/models/Booking.js#L1-L69)
- [chatRoutes.js:1-254](file://backend/src/routes/chatRoutes.js#L1-L254)
- [bookingRoutes.js:1-71](file://backend/src/routes/bookingRoutes.js#L1-L71)

## Performance Considerations
- Provider fallback chain reduces single-point failures and improves latency resilience.
- In-memory caching for FAQ-type responses reduces API calls for static information.
- Strict output validation and sanitization prevent costly retries due to malformed content.
- Socket events for real-time dashboards avoid polling overhead.
- Indexes on frequently queried fields (customerPhone, lastMessageAt, mode, bookingStage, isArchived, language) improve database performance.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- AI failure alerts: When all providers fail, an alert is emitted to the dashboard for immediate attention.
- Opt-out handling: Ensure opt-out phrases are recognized and follow-ups are cancelled promptly.
- Mode switching issues: Verify that switching to human mode cancels pending follow-ups and emits socket updates.
- Conversation resets: Confirm that resetting clears booking stage and draft without losing historical messages.
- Booking status updates: Use the booking status endpoint to correct or finalize reservations created by AI or staff.

**Section sources**
- [messageHandler.js:163-172](file://backend/src/services/messageHandler.js#L163-L172)
- [leadScoring.js:184-202](file://backend/src/services/leadScoring.js#L184-L202)
- [followUpService.js:92-118](file://backend/src/services/followUpService.js#L92-L118)
- [chatRoutes.js:76-254](file://backend/src/routes/chatRoutes.js#L76-L254)
- [bookingRoutes.js:33-68](file://backend/src/routes/bookingRoutes.js#L33-L68)

## Conclusion
The message processing pipeline integrates robust routing, resilient AI generation, precise conversation state management, and automated follow-ups with clear human-in-the-loop controls. The design supports multi-turn dialogues, preserves context, and provides actionable integrations for lead scoring and dashboard operations. With well-defined booking flow stages and manual override capabilities, the system balances automation with operational flexibility.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Examples of Booking Flow States
- none → type_selected → date_given → guests_given → kids_given → married_checked → price_quoted → name_given → phone_given → special_requests → handed_over → completed

**Section sources**
- [Chat.js:74-78](file://backend/src/models/Chat.js#L74-L78)

### Manual Override Procedures
- Switch per-chat mode to human to stop auto-replies and notify staff.
- Send manual messages from the dashboard to continue the conversation.
- Reset conversations to restart the flow while retaining history.
- Archive chats for soft deletion and compliance.

**Section sources**
- [chatRoutes.js:76-254](file://backend/src/routes/chatRoutes.js#L76-L254)

### Integration Points
- Lead scoring: Real-time alerts for hot leads and conversion tracking.
- Follow-up scheduling: Automated reminders after initial booking interest.
- Dashboard APIs: Listing chats/bookings, updating booking status, and managing chat lifecycle.

**Section sources**
- [leadScoring.js:1-235](file://backend/src/services/leadScoring.js#L1-L235)
- [followUpService.js:1-126](file://backend/src/services/followUpService.js#L1-L126)
- [chatRoutes.js:1-254](file://backend/src/routes/chatRoutes.js#L1-L254)
- [bookingRoutes.js:1-71](file://backend/src/routes/bookingRoutes.js#L1-L71)