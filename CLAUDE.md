# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Reply-only WhatsApp API built on the Baileys library. Receives WhatsApp messages, stores them in SQLite, and allows manual replies via REST API. Features an Astro SSR dashboard and versioned REST API.

## Commands

```bash
# Development
npm start                    # Run directly with Node.js

# Dashboard (rebuild after changes)
cd dashboard && npm run build  # Rebuild Astro dashboard

# Testing
npm test                     # Run all tests
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Run tests with coverage report

# Docker Swarm (Production)
docker build -t whatsapp-api:latest .           # Build image
docker stack deploy -c docker-compose.yml whatsap  # Deploy stack
docker service ls                               # Check service status
docker service logs whatsap_whatsapp-api        # View logs
docker stack rm whatsap                         # Remove stack

# PM2 (Alternative)
npm run pm2:start            # Start with PM2
npm run pm2:stop             # Stop PM2 process
npm run pm2:restart          # Restart PM2 process
npm run pm2:logs             # View PM2 logs
npm run pm2:status           # Check PM2 status
```

## Architecture

Modular Express application with Astro SSR dashboard:

```
app.js                      # Entry point, server setup, Astro integration
src/
├── config.js               # Environment configuration
├── logger.js               # Pino logger setup
├── state.js                # Global state (connection, QR, socket)
├── database.js             # SQLite operations (better-sqlite3)
├── whatsapp.js             # Baileys client, message handling
├── webhook.js              # Webhook trigger logic
├── middleware/
│   ├── auth.js             # API key + Basic Auth middleware
│   ├── rateLimiter.js      # Rate limiting (100 req/min)
│   └── auditLog.js         # Audit logging middleware
└── routes/
    └── api.js              # Public API v1 routes (X-API-Key auth)
dashboard/                  # Astro SSR dashboard
├── src/
│   ├── layouts/Base.astro  # Shared layout with navigation
│   ├── lib/server.ts       # Shared state access via globalThis
│   ├── middleware.ts       # Astro middleware
│   └── pages/              # SSR pages (direct DB access)
│       ├── index.astro     # Inbox
│       ├── status.astro    # Connection status
│       ├── login.astro     # QR code login
│       ├── webhooks.astro  # Webhook management
│       ├── webhooks/new.astro
│       ├── webhooks/edit/[id].astro
│       ├── settings.astro  # API documentation
│       ├── audit-logs.astro # Audit log viewer
│       ├── reply/[id].astro # Reply to message
│       └── actions/        # Form action handlers (POST endpoints)
│           ├── reply.ts
│           ├── status.ts
│           ├── logout.ts
│           ├── regenerate-key.ts
│           ├── webhook-create.ts
│           ├── webhook-update.ts
│           ├── webhook-toggle.ts
│           └── webhook-delete.ts
└── dist/                   # Built SSR output
tests/                      # Jest test suite
├── database.test.js        # SQLite operations
├── auth.test.js            # Authentication middleware
├── api.test.js             # API endpoint integration
├── whatsapp.test.js        # WhatsApp connection state
└── __mocks__/baileys.js    # Baileys mock for testing
```

### Core Components

- **Baileys WebSocket client** (`src/whatsapp.js`): Connects to WhatsApp Web, handles QR authentication, auto-reconnects
- **SQLite database** (`src/database.js`): Messages, API keys, webhooks, templates, settings, audit logs
- **REST API v1** (`src/routes/api.js`): Protected by X-API-Key header, rate limited
- **Astro SSR Dashboard** (`dashboard/`): Server-rendered pages with direct database access, protected by HTTP Basic Auth

### API v1 Routes (X-API-Key auth)
- `GET  /api/v1/health` - Health check (no auth)
- `GET  /api/v1/status` - Connection status
- `GET  /api/v1/inbox/:status?` - Get messages (pagination, search, filters)
- `POST /api/v1/messages/:id/reply` - Reply to message
- `PATCH /api/v1/messages/:id/status` - Update message status
- `PATCH /api/v1/messages/batch/status` - Batch update statuses
- `GET  /api/v1/webhooks` - List webhooks

### Dashboard Routes (Astro SSR, Basic Auth)
- `/` - Inbox (view/filter messages, reply)
- `/status` - Connection status
- `/login` - QR code login
- `/webhooks` - Webhook management
- `/webhooks/new` - Add webhook
- `/webhooks/edit/:id` - Edit webhook
- `/settings` - API documentation & settings
- `/audit-logs` - View audit logs
- `/reply/:id` - Reply to specific message

### Dashboard Form Actions
- `POST /actions/reply` - Send reply
- `POST /actions/status` - Update message status
- `POST /actions/logout` - Logout WhatsApp
- `POST /actions/regenerate-key` - Generate new API key
- `POST /actions/webhook-create` - Create webhook
- `POST /actions/webhook-update` - Update webhook
- `POST /actions/webhook-toggle` - Enable/disable webhook
- `POST /actions/webhook-delete` - Delete webhook

### Data Flow

1. WhatsApp messages arrive via Baileys WebSocket
2. Stored in SQLite with `unread` status
3. Webhook triggered for `message.received` event
4. External system polls `/api/v1/inbox` or receives webhook
5. Replies sent via `POST /api/v1/messages/:id/reply`
6. Webhook triggered for `message.sent` event

## Database Schema

```sql
messages (id, direction, phone, message, reply_status, media_type, media_url, created_at)
api_keys (id, key, created_at)
webhooks (id, url, events, secret, active, created_at)
audit_logs (id, action, details, ip_address, created_at)
settings (key, value)
```

## Testing

74 tests in `tests/` directory using Jest and Supertest. Baileys is mocked for testing.

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | API port |
| API_KEY | (auto-generated) | Initial API key (auto-generated if not set, stored in DB, can be regenerated via dashboard) |
| DB_PATH | ./messages.db | SQLite database path |
| SESSION_PATH | ./session | WhatsApp session storage |
| DASHBOARD_USER | admin | Dashboard HTTP Basic Auth username |
| DASHBOARD_PASSWORD | admin123 | Dashboard HTTP Basic Auth password |
| MEDIA_PATH | ./media | Media files storage path |

## Persistent Data

Docker volumes:
- `whatsapp_session`: WhatsApp authentication state
- `whatsapp_data`: SQLite database (WAL journaling)

Local development:
- `session/`: WhatsApp auth state
- `messages.db`: SQLite database

## Message Statuses

- `unread` - New incoming message (default)
- `read` - Marked as read
- `replied` - Reply sent via API
- `ignored` - Marked as ignored
- `sent` - Outgoing message

## Webhook Events

- `message.received` - New incoming message
- `message.sent` - Reply sent
- `connection.connected` - WhatsApp connection established
- `connection.disconnected` - WhatsApp connection lost (includes reason and reconnect status)

Webhooks support optional HMAC-SHA256 signature verification via secret.

**Webhook Delivery:**
- Automatic retry with exponential backoff (1s, 2s, 4s) for up to 3 attempts
- 10-second timeout per delivery attempt
- **Note:** Webhook queue is in-memory. Pending/retrying webhooks will be lost if the server restarts.

## Astro SSR Integration

The dashboard uses Astro in SSR middleware mode, integrated with Express:

1. Express initializes database and state
2. State is shared via `globalThis.__whatsapp_api`
3. Astro pages access state through `dashboard/src/lib/server.ts`
4. All dashboard routes are protected by HTTP Basic Auth
5. Form actions handle POST requests and redirect with toast messages
