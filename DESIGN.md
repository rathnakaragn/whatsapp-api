# WhatsApp Reply-Only API - Design Document

## Overview

A production-ready WhatsApp API service built on top of the Baileys library, designed for automated message handling with a reply-only workflow. The system receives WhatsApp messages, stores them in SQLite, and provides both REST API and web dashboard interfaces for replying to messages. Optimized for internal use with 5 users focused on automation workflows.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         WhatsApp Web                             │
│                    (via Baileys WebSocket)                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Express.js Server                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Rate Limiter → Audit Logger → Auth Middleware             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                               │                                  │
│        ┌──────────────────────┴──────────────────────┐          │
│        ▼                                              ▼          │
│  ┌──────────┐                              ┌──────────────────┐ │
│  │ API v1   │                              │ Astro SSR        │ │
│  │ Routes   │                              │ Dashboard        │ │
│  │          │                              │                  │ │
│  │ X-API-Key│                              │ Basic Auth       │ │
│  └────┬─────┘                              └────────┬─────────┘ │
│       │                                             │           │
└───────┼─────────────────────────────────────────────┼───────────┘
        │                                             │
        └──────────────────┬──────────────────────────┘
                           ▼
        ┌──────────────────────────────────────────────┐
        │         Shared State & Database              │
        │  ┌────────────┐        ┌──────────────────┐ │
        │  │  SQLite    │        │  Global State    │ │
        │  │  (WAL)     │        │  - sock          │ │
        │  │            │        │  - isConnected   │ │
        │  │  - messages│        │  - qrCodeData    │ │
        │  │  - webhooks│        └──────────────────┘ │
        │  │  - api_keys│                             │
        │  │  - audit_log│                            │
        │  └────────────┘                             │
        └──────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────────┐
        │         Webhook Delivery Queue               │
        │  - In-memory queue with retry                │
        │  - Exponential backoff (1s, 2s, 4s)         │
        │  - HMAC-SHA256 signatures                    │
        └──────────────────────────────────────────────┘
```

### Component Architecture

The application follows a modular architecture with clear separation of concerns:

```
app.js                          # Application entry point & orchestration
│
├─── Express Setup              # HTTP server, middleware, routing
│    ├── JSON/form parsing (API routes only)
│    ├── Rate limiting (100 req/min per API key)
│    ├── Audit logging (all requests)
│    └── Static file serving
│
├─── State Management           # Global state via globalThis
│    └── Exposed to Astro SSR via globalThis.__whatsapp_api
│
├─── API Routes                 # REST API v1 (X-API-Key auth)
│    └── /api/v1/*
│
└─── Dashboard Routes           # Astro SSR (Basic Auth)
     └── /*
```

## Core Components

### 1. WhatsApp Connection Layer (src/whatsapp.js)

**Responsibilities:**
- Maintains WebSocket connection to WhatsApp Web via Baileys
- Handles QR code authentication
- Processes incoming messages
- Manages auto-reconnection with exponential backoff
- Downloads and stores media files

**Key Features:**
- Multi-file auth state persistence
- Automatic reconnection on disconnect (except logout)
- Media download and storage (images, videos, documents, stickers)
- Message content extraction for various message types
- Webhook triggers on message events

**Design Decisions:**
- **QR Code Generation:** Generated as base64 data URL for easy embedding in web UI
- **Media Storage:** Local filesystem with UUID-based filenames to prevent collisions
- **Auto-reconnect:** 5-second delay before reconnection attempts
- **Message Filtering:** Ignores own messages (`msg.key.fromMe`)

### 2. Database Layer (src/database.js)

**Technology:** better-sqlite3 with WAL (Write-Ahead Logging) mode

**Schema:**
```sql
messages (
  id TEXT PRIMARY KEY,              -- UUID
  direction TEXT NOT NULL,          -- 'incoming' | 'outgoing'
  phone TEXT NOT NULL,              -- WhatsApp JID (e.g., 1234567890@s.whatsapp.net)
  message TEXT NOT NULL,
  reply_status TEXT DEFAULT 'unread', -- 'unread' | 'read' | 'replied' | 'ignored' | 'sent'
  media_type TEXT,                  -- 'image' | 'video' | 'document' | 'sticker' | 'location' | 'contact'
  media_url TEXT,                   -- Local path (e.g., /media/uuid.jpg)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

api_keys (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL,                -- Base64-encoded 32-byte random key
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

webhooks (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  events TEXT NOT NULL,             -- Comma-separated list
  secret TEXT,                      -- Optional HMAC secret
  active INTEGER DEFAULT 1,         -- Boolean flag
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

audit_logs (
  id INTEGER PRIMARY KEY,
  action TEXT NOT NULL,
  details TEXT,                     -- JSON string
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
```

**Indexes:**
- `idx_messages_status` on `messages(reply_status)` - Fast filtering by status
- `idx_messages_phone` on `messages(phone)` - Fast phone number lookups
- `idx_messages_created` on `messages(created_at)` - Efficient pagination
- `idx_audit_created` on `audit_logs(created_at)` - Audit log queries

**Design Decisions:**
- **SQLite over PostgreSQL:** Simple deployment, no external dependencies, sufficient for 5-user load
- **WAL Mode:** Allows concurrent reads during writes, better performance
- **Prepared Statements:** All queries use parameterized statements to prevent SQL injection
- **Auto-generated API Keys:** Base64-encoded 32-byte random keys using crypto module

### 3. REST API v1 (src/routes/api.js)

**Authentication:** X-API-Key header or api_key query parameter

**Endpoints:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/health` | ❌ | Health check (connected/disconnected) |
| GET | `/api/v1/status` | ✅ | Connection status with QR and session info |
| GET | `/api/v1/inbox/:status?` | ✅ | Get messages with pagination & filters |
| POST | `/api/v1/messages/:id/reply` | ✅ | Send reply to a message |
| PATCH | `/api/v1/messages/:id/status` | ✅ | Update message status |
| PATCH | `/api/v1/messages/batch/status` | ✅ | Batch update message statuses |
| GET | `/api/v1/webhooks` | ✅ | List configured webhooks |

**Pagination & Filtering:**
```
GET /api/v1/inbox/unread?page=1&limit=50&search=hello&phone=1234567890&startDate=2024-01-01&endDate=2024-12-31
```

**Design Decisions:**
- **Version prefix:** `/api/v1/` allows future versioning without breaking changes
- **Status in URL:** `/inbox/:status` makes intent clearer than query params
- **Max page size:** Limited to 100 items to prevent abuse
- **503 on disconnect:** Returns proper HTTP status when WhatsApp not connected
- **Webhook triggers:** All state changes trigger appropriate webhooks

### 4. Astro SSR Dashboard (dashboard/src/)

**Technology:** Astro with SSR mode, Node.js adapter

**Authentication:** HTTP Basic Auth (credentials from environment)

**Architecture:**
```
dashboard/
├── src/
│   ├── layouts/
│   │   └── Base.astro           # Shared layout with navigation
│   ├── lib/
│   │   └── server.ts            # Access to shared state via globalThis
│   ├── middleware.ts            # Astro middleware (future use)
│   ├── pages/
│   │   ├── index.astro          # Inbox view
│   │   ├── status.astro         # Connection status
│   │   ├── login.astro          # QR code display
│   │   ├── webhooks.astro       # Webhook list
│   │   ├── webhooks/
│   │   │   ├── new.astro        # Create webhook
│   │   │   └── edit/[id].astro  # Edit webhook
│   │   ├── settings.astro       # API docs & settings
│   │   ├── audit-logs.astro     # Audit log viewer
│   │   ├── reply/[id].astro     # Reply form
│   │   └── actions/             # Form POST handlers
│   │       ├── reply.ts         # Send reply
│   │       ├── status.ts        # Update status
│   │       ├── logout.ts        # WhatsApp logout
│   │       ├── regenerate-key.ts # New API key
│   │       ├── webhook-create.ts
│   │       ├── webhook-update.ts
│   │       ├── webhook-toggle.ts
│   │       └── webhook-delete.ts
│   └── env.d.ts
└── dist/                        # Built SSR output
    ├── client/                  # Static assets
    └── server/                  # SSR handler
        └── entry.mjs            # Express-compatible handler
```

**Integration with Express:**
```javascript
// app.js - Astro handler setup
const { handler } = await import('./dashboard/dist/server/entry.mjs');
app.astroHandler = handler;

// All non-API routes go to Astro
app.use(dashboardAuth, (req, res, next) => {
  // Inject locals for Astro pages
  req[Symbol.for('astro.locals')] = { db, isConnected, sock, ... };
  app.astroHandler(req, res, next);
});
```

**Design Decisions:**
- **SSR over SPA:** Direct database access, no API layer needed, simpler deployment
- **Form actions pattern:** Each action is a separate file for clear separation
- **Toast notifications:** URL-based toast messages for post-redirect feedback
- **Direct DB access:** Astro pages query SQLite directly via shared db instance
- **globalThis for state:** Cleanest way to share state between Express and Astro

### 5. State Management (src/state.js)

**Shared State:**
```javascript
{
  sock: WASocket | null,           // Baileys socket instance
  isConnected: boolean,            // Connection status
  qrCodeData: string | null        // Base64 QR code data URL
}
```

**Access Pattern:**
- Module-level state in `src/state.js`
- Exposed via `globalThis.__whatsapp_api` for Astro SSR
- Getter/setter functions for controlled access

**Design Decisions:**
- **globalThis over EventEmitter:** Simpler for SSR integration, no event management overhead
- **Minimal state:** Only connection-critical data; everything else in SQLite
- **No Redis:** In-memory state sufficient for single-instance deployment

### 6. Webhook System (src/webhook.js)

**Events:**
- `message.received` - New incoming WhatsApp message
- `message.sent` - Reply sent (via API or dashboard)
- `connection.connected` - WhatsApp connection established
- `connection.disconnected` - Connection lost (includes reason and reconnect status)

**Delivery Mechanism:**
```
Trigger → Queue → Retry (3x with backoff) → Success/Fail
           │         1s → 2s → 4s
           │
           └─> In-memory FIFO queue
```

**Security:**
- HMAC-SHA256 signature in `X-Webhook-Signature` header
- Signature format: `sha256=<hex_digest>`
- Configurable secret per webhook

**Design Decisions:**
- **In-memory queue:** Acceptable for 5-user internal use; lost on restart
- **No persistent queue:** Would require additional complexity (worker queue, Redis)
- **Fire-and-forget:** No webhook delivery status stored
- **10-second timeout:** Prevents slow webhook endpoints from blocking queue
- **Retry strategy:** Exponential backoff balances reliability and resource usage

### 7. Middleware Stack

**Request Flow:**
```
Request
  │
  ├─> JSON/Form Parser (API routes only)
  │
  ├─> Rate Limiter (API routes only)
  │   └─> 100 requests/minute per API key/IP
  │
  ├─> Audit Logger (all routes)
  │   └─> Logs to SQLite audit_logs table
  │
  ├─> Authentication
  │   ├─> API: X-API-Key (timing-safe comparison)
  │   └─> Dashboard: Basic Auth (timing-safe comparison)
  │
  └─> Route Handler
```

**Rate Limiter Design:**
- In-memory Map with sliding window
- Periodic cleanup (every 60 seconds)
- Custom headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Returns 429 with `Retry-After` header

**Audit Logger:**
- Captures: action, details (JSON), IP address, timestamp
- Applied globally to track all activity
- Used for security monitoring and debugging

## Data Flow

### Incoming Message Flow

```
WhatsApp Web
  │
  ├─> Baileys WebSocket receives message
  │
  ├─> whatsapp.js: messages.upsert event
  │   ├─> Extract message content
  │   ├─> Download media (if present)
  │   ├─> Generate UUID
  │   └─> Store in SQLite (status: 'unread')
  │
  ├─> Trigger webhook: message.received
  │   └─> Queue for delivery
  │
  └─> Available via:
      ├─> API: GET /api/v1/inbox
      └─> Dashboard: GET /
```

### Reply Flow (API)

```
POST /api/v1/messages/:id/reply
  │
  ├─> Validate authentication
  ├─> Validate message exists
  ├─> Check WhatsApp connection
  │
  ├─> sock.sendMessage(phone, { text })
  │
  ├─> Update original message (status: 'replied')
  ├─> Insert outgoing message (status: 'sent')
  │
  ├─> Trigger webhook: message.sent
  │
  └─> Return success { replyId }
```

### Reply Flow (Dashboard)

```
POST /actions/reply
  │
  ├─> Validate Basic Auth
  ├─> Parse form data
  ├─> Check WhatsApp connection
  │
  ├─> sock.sendMessage(phone, { text })
  │
  ├─> Update original message (status: 'replied')
  ├─> Insert outgoing message (status: 'sent')
  │
  ├─> Trigger webhook: message.sent
  │
  └─> Redirect with toast notification
```

## Security Considerations

### Authentication

**API Key Security:**
- 32-byte random keys (256-bit entropy)
- Base64-encoded for safe transmission
- Timing-safe comparison prevents timing attacks
- Stored in database, regenerable via dashboard
- Supports both header (`X-API-Key`) and query param (`api_key`)

**Basic Auth Security:**
- Timing-safe comparison for username and password
- Credentials from environment variables with defaults
- Protected against brute force by rate limiting

### Input Validation

**Current State:**
- SQL injection: Protected via prepared statements
- XSS: Limited (API returns JSON, dashboard server-rendered)
- Command injection: Not applicable (no shell commands with user input)
- Path traversal: Not applicable (no file path operations with user input)

**Limitations (acceptable for 5-user internal use):**
- No message length validation
- No phone number format validation
- No CSRF tokens (Basic Auth provides some protection)
- No SSRF protection for webhook URLs

### Rate Limiting

- 100 requests/minute per API key/IP
- In-memory tracking (cleared on restart)
- Unbounded Map (acceptable for 5 users)

## Deployment Architecture

### Docker Deployment

**Multi-stage Build:**
```dockerfile
Stage 1: Builder
  - Install dependencies
  - Build Astro dashboard

Stage 2: Production
  - Copy built artifacts
  - Install production dependencies only
  - Minimal image size
```

**Volumes:**
- `whatsapp_session`: WhatsApp authentication state (persistent across restarts)
- `whatsapp_data`: SQLite database (persistent)
- `whatsapp_media`: Media files (persistent)

**Health Check:**
```bash
wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/v1/health
```

### PM2 Deployment

**Configuration (ecosystem.config.js):**
```javascript
{
  name: "whatsapp-api",
  script: "app.js",
  instances: 1,               // Single instance (SQLite limitation)
  exec_mode: "fork",
  autorestart: true,
  watch: false,
  max_memory_restart: "500M"
}
```

**Design Decisions:**
- Single instance only (SQLite + in-memory state)
- No clustering (would require external state management)

## Technology Stack

### Backend
- **Node.js 18+**: LTS version with fetch API
- **Express 4.x**: Mature, stable web framework
- **Baileys**: WhatsApp Web WebSocket client
- **better-sqlite3**: Synchronous SQLite with best performance

### Frontend (Dashboard)
- **Astro**: Modern SSR framework with minimal JS
- **TypeScript**: Type safety for dashboard code
- **Tailwind CSS**: Utility-first CSS (implied from dashboard structure)

### Database
- **SQLite**: Embedded database, WAL mode for concurrency

### Logging
- **Pino**: High-performance JSON logger
- **pino-pretty**: Pretty-print for development

### Testing
- **Jest**: Test runner and assertion library
- **Supertest**: HTTP assertion library
- **Babel**: Transpile ES6 for tests

## Design Patterns

### 1. Factory Pattern
```javascript
// Middleware factories
createRateLimiter(options)
createApiAuth(database)
createAuditLogger(database)
```

### 2. Module Pattern
```javascript
// State encapsulation
module.exports = {
  getState,
  setState,
  getIsConnected,
  setIsConnected
}
```

### 3. Dependency Injection
```javascript
// Database passed to functions
function createApiRoutes(database, auth)
function connectWhatsApp(database)
```

### 4. Middleware Chain
```javascript
app.use(rateLimiter)
app.use(auditLogger)
app.use("/api/v1", auth, routes)
```

## Performance Considerations

### Database
- **Indexes on hot paths:** status, phone, created_at
- **WAL mode:** Concurrent reads during writes
- **Prepared statements:** Query plan caching
- **Pagination:** Limit result sets to prevent memory issues

### Rate Limiting
- **In-memory Map:** Fast lookups
- **Periodic cleanup:** Prevents unbounded growth (somewhat)
- **100 req/min:** Sufficient for automation, prevents abuse

### Webhook Delivery
- **Async processing:** Non-blocking queue
- **10-second timeout:** Prevents slow endpoints from blocking
- **Exponential backoff:** Reduces load during failures

### Media Files
- **Local filesystem:** No S3/CDN overhead for internal use
- **UUID filenames:** Fast generation, no collisions
- **Direct serving:** Nginx/static middleware (no API overhead)

## Scalability Limitations

### Current Architecture Constraints

**Single Instance:**
- SQLite restricts to single writer
- In-memory state (sock, qrCodeData)
- In-memory webhook queue

**Workarounds for Scale (if needed):**
1. **Database:** Migrate to PostgreSQL for multi-instance
2. **State:** Redis for shared state across instances
3. **Queue:** Bull/BullMQ with Redis for persistent webhook queue
4. **Load Balancer:** Sticky sessions required (for now)

**Current Capacity:**
- 5 concurrent users: ✅ Excellent
- 50 concurrent users: ✅ Good
- 500 concurrent users: ⚠️ Would need architecture changes

## Testing Strategy

### Test Structure
```
tests/
├── database.test.js       # 20+ tests - CRUD operations
├── auth.test.js          # 15+ tests - Authentication flows
├── api.test.js           # 20+ tests - API endpoints
└── whatsapp.test.js      # 19+ tests - Connection & messaging
```

### Test Coverage
- **74 total tests** covering critical paths
- **Mocked Baileys:** No external WhatsApp dependency
- **In-memory SQLite:** Fast, isolated test runs
- **Supertest:** HTTP assertions without network

### Areas NOT Tested (acceptable for internal use)
- Astro SSR pages (manual testing)
- Webhook delivery (manual testing)
- QR code generation (manual testing)
- Media download (manual testing)

## Future Enhancements (Optional)

### If Scaling Needed
1. **Persistent Webhook Queue:** SQLite table with worker
2. **Multi-instance Support:** Redis for state + PostgreSQL
3. **Webhook Delivery Status:** Track success/failure in DB
4. **Message Templates:** Predefined responses
5. **Bulk Operations:** Batch send messages

### If Security Required
1. **CSRF Protection:** Tokens for dashboard forms
2. **SSRF Protection:** Webhook URL validation
3. **Input Validation:** Length limits, format validation
4. **Rate Limiting per Endpoint:** More granular controls
5. **API Key Rotation:** Scheduled rotation policy

### If Features Needed
1. **Message Scheduling:** Queue messages for future delivery
2. **Contact Management:** Store contact names/metadata
3. **Conversation Threads:** Group messages by conversation
4. **Search:** Full-text search on messages
5. **Analytics:** Message volume, response times

## Operational Considerations

### Monitoring
- **Health endpoint:** `/api/v1/health` for uptime monitoring
- **Audit logs:** Track all activity in database
- **Pino logs:** Structured JSON logs for log aggregation

### Backup Strategy
- **Database:** Regular SQLite backups (simple file copy)
- **Session:** Backup `session/` directory to avoid re-authentication
- **Media:** Backup `media/` directory if messages need preservation

### Disaster Recovery
1. Restore SQLite database
2. Restore session directory
3. Restart application
4. Scan QR code (if session expired)

### Maintenance
- **API Key Rotation:** Via dashboard (`/settings` → Regenerate)
- **Database Cleanup:** Manual deletion of old messages
- **Audit Log Cleanup:** Manual deletion (no auto-cleanup)
- **Media Cleanup:** Manual deletion of orphaned files

## Configuration

### Environment Variables
```bash
PORT=3001                          # Server port
API_KEY=<optional>                 # Auto-generates if not set
DB_PATH=./messages.db              # SQLite database path
SESSION_PATH=./session             # WhatsApp session storage
DASHBOARD_USER=admin               # Dashboard username (default: admin)
DASHBOARD_PASSWORD=admin123        # Dashboard password (default: admin123)
MEDIA_PATH=./media                 # Media files directory
NODE_ENV=production|development    # Environment
```

### File Structure
```
whatsappapi/
├── app.js                    # Entry point
├── package.json
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.js       # PM2 config
├── CLAUDE.md                 # Usage guide
├── DESIGN.md                 # This file
├── README.md
├── src/
│   ├── config.js            # Environment config
│   ├── logger.js            # Pino setup
│   ├── state.js             # Global state
│   ├── database.js          # SQLite operations
│   ├── whatsapp.js          # Baileys integration
│   ├── webhook.js           # Webhook delivery
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── rateLimiter.js
│   │   └── auditLog.js
│   └── routes/
│       └── api.js
├── dashboard/               # Astro SSR dashboard
│   ├── astro.config.mjs
│   ├── package.json
│   ├── src/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── lib/
│   │   └── middleware.ts
│   └── dist/               # Built output
├── tests/
├── session/                # WhatsApp auth (gitignored)
├── media/                  # Media files (gitignored)
└── messages.db             # SQLite database (gitignored)
```

## Conclusion

This WhatsApp API is purpose-built for internal automation with a 5-user team. The architecture prioritizes:

✅ **Simplicity:** SQLite, single instance, minimal dependencies
✅ **Reliability:** Auto-reconnect, webhook retries, WAL mode
✅ **Security:** Timing-safe auth, prepared statements, audit logs
✅ **Developer Experience:** Clear separation of concerns, comprehensive tests
✅ **Production Ready:** Docker, PM2, health checks, structured logging

The design intentionally trades horizontal scalability for operational simplicity. For the target use case (5 users, internal automation), this is the optimal architecture.
