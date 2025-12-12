# WhatsApp API - Technical Design

> 📋 **Business requirements:** [PRD.md](./PRD.md) | 📖 **API reference:** [API.md](./API.md) | 🔧 **Implementation details:** [IMPLEMENTATION.md](./IMPLEMENTATION.md)

**Version:** 2.0.0 | **Status:** Production

---

## Overview

Self-hosted WhatsApp API built on Baileys library for automated message handling.

**Target Scale:** 5-10 users | ~1,000 messages/day | Single instance deployment

---

## System Architecture

```
┌─────────────────────────────────────────┐
│          WhatsApp Web                    │
│       (Baileys WebSocket)                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│       Express.js Server                  │
│  ┌───────────────────────────────────┐  │
│  │ Rate Limiter → Audit → Auth       │  │
│  └───────────────────────────────────┘  │
│               │                          │
│     ┌─────────┴─────────┐               │
│     ▼                   ▼               │
│  ┌─────┐         ┌──────────┐           │
│  │ API │         │ Dashboard│           │
│  └─────┘         └──────────┘           │
└─────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  SQLite Database + Global State         │
│  - messages, webhooks, api_keys         │
│  - audit_logs, settings                 │
└─────────────────────────────────────────┘
```

---

## Core Components

### 1. WhatsApp Client
**Purpose:** Connect to WhatsApp Web via Baileys WebSocket

**Responsibilities:**
- QR code authentication
- Receive incoming messages
- Send replies
- Download media files
- Auto-reconnect on disconnect (5-second delay)

### 2. Database
**Purpose:** Persistent storage for messages and configuration

**Technology:** SQLite with WAL mode (concurrent reads)

**Tables:** messages, api_keys, webhooks, audit_logs, settings

> 📖 **Schema details:** [IMPLEMENTATION.md](./IMPLEMENTATION.md#database-schema)

### 3. REST API
**Purpose:** Programmatic access for automation

**Authentication:** X-API-Key header

**Rate Limiting:** 100 requests/minute per API key

> 📖 **API usage:** [API.md](./API.md)

### 4. Dashboard
**Purpose:** Web interface for team members

**Technology:** Astro SSR + Tailwind CSS

**Authentication:** HTTP Basic Auth

**Integration:** Direct database access via `globalThis.__whatsapp_api`

### 5. Webhook System
**Purpose:** Real-time event notifications

**Events:** message.received, message.sent, connection.connected, connection.disconnected

**Delivery:** In-memory queue with 3 retry attempts (exponential backoff: 1s, 2s, 4s)

**Security:** HMAC-SHA256 signatures (optional)

**Limitation:** Queue is in-memory; pending webhooks lost on restart

> 📖 **Implementation:** [IMPLEMENTATION.md](./IMPLEMENTATION.md#webhook-system)

---

## Technology Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| **Runtime** | Node.js (Alpine) | 20 | LTS, native fetch |
| **Backend** | Express.js | 4.18.2 | Mature, lightweight |
| **WhatsApp** | Baileys | 7.0.0-rc.9 | WhatsApp Web API |
| **Database** | better-sqlite3 | 12.5.0 | Fast, embedded, zero config |
| **Dashboard** | Astro (SSR) | 5.16.5 | Server-rendered, minimal JS |
| **Styling** | Tailwind CSS | 3.4.19 | Utility-first CSS |
| **Logger** | Pino | 8.16.0 | High performance logging |
| **Testing** | Jest + Supertest | 30.2.0 | Industry standard |

**Design Principle:** Simple, proven technologies with minimal dependencies (8 production packages)

---

## Key Design Decisions

### 1. SQLite over PostgreSQL
**Decision:** Use SQLite for data storage

**Rationale:**
- Single instance deployment (no horizontal scaling needed)
- Zero external dependencies (no database server to manage)
- Sufficient for 1,000 messages/day workload
- Simple backup (just copy the file)
- WAL mode provides concurrent reads

**Trade-off:** Cannot scale horizontally (single writer limit)

---

### 2. Astro SSR over React SPA
**Decision:** Server-side rendering with Astro instead of client-side React

**Rationale:**
- Faster page loads (no client-side hydration)
- Direct database access (no need for API calls from dashboard)
- Minimal JavaScript shipped to browser
- Simpler state management (server-side only)
- Better for internal tools (SEO not needed)

**Trade-off:** Less interactive than SPA (page reloads on actions)

---

### 3. In-Memory Webhook Queue
**Decision:** Don't persist webhook queue to database or Redis

**Rationale:**
- Acceptable for internal use (5-10 users)
- Avoids Redis dependency and complexity
- Webhooks retry 3 times before giving up
- Simplicity over bulletproof delivery
- Restart events are rare in production

**Trade-off:** Pending webhooks lost if server crashes/restarts

---

### 4. Reply-Only Workflow
**Decision:** Cannot initiate new conversations (only reply to incoming messages)

**Rationale:**
- WhatsApp Terms of Service compliance
- Prevents spam and abuse
- Focuses on customer service use case
- Simpler implementation (no conversation tracking)

**Trade-off:** Cannot send proactive messages to customers

---

### 5. Single Shared API Key
**Decision:** One API key shared by all users (regenerable via dashboard)

**Rationale:**
- Internal tool (5-10 trusted users)
- Avoids per-user API key management complexity
- Audit logs track activity by IP address anyway
- Easy to regenerate if compromised

**Trade-off:** Cannot track which user made which API call

---

## Data Flow

### Message Reception
```
WhatsApp → Baileys → Store in SQLite → Trigger Webhook
```

### Message Reply
```
API/Dashboard → Validate → Send via Baileys → Update DB → Trigger Webhook
```

---

## Performance Targets

- **Message processing:** < 5 seconds end-to-end
- **API response time:** < 500ms for inbox queries
- **Dashboard load:** < 2 seconds first paint
- **Throughput:** 1,000 messages/day sustained
- **Concurrent users:** 5-10 simultaneous

**How we achieve this:** SQLite WAL mode, prepared statements, database indexes, in-memory rate limiting, Pino logging

> 📖 **Performance implementation:** [IMPLEMENTATION.md](./IMPLEMENTATION.md#performance-optimizations)

---

## Security Model

**Authentication:**
- API: X-API-Key header (32-byte random, timing-safe comparison)
- Dashboard: HTTP Basic Auth (username/password, timing-safe comparison)

**Data Protection:**
- SQL injection: Prevented via prepared statements
- Timing attacks: Mitigated with `crypto.timingSafeEqual()`
- Webhook spoofing: Prevented via HMAC-SHA256 signatures

**Audit Trail:**
- All API requests logged with IP address
- Dashboard actions tracked
- Queryable via dashboard at `/audit-logs`

> 📖 **Security implementation:** [IMPLEMENTATION.md](./IMPLEMENTATION.md#security-implementation)

---

## Scalability Limitations

**Current Architecture Supports:**
- ✅ 5-10 users: Excellent
- ✅ 100-200 messages/day: Excellent
- ✅ 1,000 messages/day: Good
- ⚠️ 10,000+ messages/day: Need architecture changes

**Known Limitations:**
- Single instance only (cannot run multiple servers)
- SQLite has single writer (no concurrent writes)
- In-memory state (sock, qrCodeData) not shared across instances
- In-memory webhook queue (lost on restart)

**When to Scale (>1,000 msg/day or >10 users):**
1. Migrate SQLite → PostgreSQL (multi-instance writes)
2. Add Redis (shared state, persistent queue)
3. Add load balancer with sticky sessions
4. Consider separate webhook worker process

---

## Deployment Options

**Production (Recommended):** Docker Swarm
- Multi-stage builds for smaller images
- Health checks and auto-restart
- Resource limits (512MB RAM, 0.5 CPU)
- Persistent volumes for session, data, media

**Alternative:** PM2 process manager
- Single instance, fork mode
- Auto-restart on crash
- Memory limit: 500MB

> 📖 **Deployment details:** [README.md](./README.md#deployment) and [IMPLEMENTATION.md](./IMPLEMENTATION.md#deployment-configuration)

---

## Testing Strategy

**87 tests across 4 suites:**
- Database operations (15 tests)
- Authentication (14 tests)
- API endpoints (35 tests)
- WhatsApp connection (23 tests)

**Approach:** Baileys library is mocked (no real WhatsApp calls during tests)

> 📖 **Testing implementation:** [IMPLEMENTATION.md](./IMPLEMENTATION.md#testing-implementation)

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| **[PRD.md](./PRD.md)** | Business requirements (what & why) |
| **[API.md](./API.md)** | REST API usage guide |
| **[IMPLEMENTATION.md](./IMPLEMENTATION.md)** | Technical implementation details |
| **[CHANGELOG.md](./CHANGELOG.md)** | Version history |
| **[README.md](./README.md)** | Setup and getting started |
| **[CLAUDE.md](./CLAUDE.md)** | Developer quick reference |

---

**Maintained by:** Engineering Team
**Last Updated:** December 12, 2025
