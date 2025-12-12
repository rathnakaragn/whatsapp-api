# WhatsApp Reply-Only API

**Version 2.0.0** | Node.js 20 | Express 4.18.2 | Baileys 7.0.0 | SQLite | Astro 5.16.5

Reply-only WhatsApp API using Baileys library. Receive messages, store in SQLite, and reply via REST API or web dashboard. Features webhooks, audit logging, media handling, and advanced filtering.

## 🎯 Key Features

- ✅ **Reply-Only Workflow** - Compliant with WhatsApp ToS (no unsolicited messages)
- ✅ **REST API v1** - 7 endpoints with rate limiting (100 req/min)
- ✅ **Astro SSR Dashboard** - Fast, minimal JavaScript, HTTP Basic Auth
- ✅ **Webhooks** - Real-time notifications with HMAC signatures
- ✅ **Media Support** - Images, videos, documents, stickers, locations, contacts
- ✅ **Audit Logging** - Track all API and dashboard activity
- ✅ **Auto-Reconnect** - Maintains WhatsApp connection automatically
- ✅ **87 Tests** - Comprehensive test coverage with Jest

## 📚 Documentation

**Quick Links:**

| Document | Purpose | Audience |
|----------|---------|----------|
| **[README.md](./README.md)** (this file) | Getting started | Everyone |
| **[API.md](./API.md)** | REST API reference | Developers |
| **[PRD.md](./PRD.md)** | Product requirements | Product Managers |
| **[DESIGN.md](./DESIGN.md)** | Technical architecture | Architects |
| **[IMPLEMENTATION.md](./IMPLEMENTATION.md)** | Implementation details | Engineers |
| **[CHANGELOG.md](./CHANGELOG.md)** | Version history | All users |
| **[CLAUDE.md](./CLAUDE.md)** | Development guide | Developers |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ (Node.js 20 recommended)
- Docker (for production deployment)
- WhatsApp account (for QR code authentication)

### Installation

Choose one of the following methods:

---

### Option 1: Docker Swarm (Production)

```bash
# Build and deploy
docker build -t whatsapp-api:latest .
docker stack deploy -c docker-compose.yml whatsap

# Check status
docker service ls
docker service logs whatsap_whatsapp-api
```

### Option 2: Local Development

```bash
# 1. Install dependencies
npm install
cd dashboard && npm install && cd ..

# 2. Build Astro dashboard (required before first run)
cd dashboard && npm run build && cd ..

# 3. Start the server
npm start
```

Access the dashboard at `http://localhost:3001`

**Default credentials:** `admin` / `admin123`

### Option 3: PM2 (Alternative)

```bash
# Start with PM2
npm run pm2:start

# View logs
npm run pm2:logs

# Stop
npm run pm2:stop
```

---

## 📋 First-Time Setup Checklist

After starting the server:

1. ✅ **Access Dashboard** - Visit `http://localhost:3001`
   - Login with credentials (default: admin/admin123)

2. ✅ **Scan QR Code** - Visit `/login` page
   - Scan with WhatsApp mobile app
   - Wait for "Connected" status

3. ✅ **Get API Key** - Visit `/settings` page
   - Copy the API key
   - Use in API requests via `X-API-Key` header

4. ✅ **Test Connection**
   ```bash
   curl http://localhost:3001/api/v1/health
   # Should return: {"status":"connected"}
   ```

5. ✅ **Send Test Message**
   - Send a WhatsApp message to your connected number
   - Check dashboard at `/` to see the message
   - Click "Reply" to send a response

6. ✅ **Setup Webhooks (Optional)** - Visit `/webhooks` page
   - Add webhook URL for automation
   - Configure events and secret

---

## Configuration

**Docker (Production):** Edit `docker-compose.yml` environment section.

**Local Development:** Create `.env` file:

```
API_KEY=your-secret-api-key
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=your-password
```

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | API port |
| API_KEY | (auto-generated) | Initial API key (auto-generated if not set, check logs for key) |
| DB_PATH | ./messages.db | SQLite database path |
| SESSION_PATH | ./session | WhatsApp session storage |
| DASHBOARD_USER | admin | Dashboard HTTP Basic Auth username |
| DASHBOARD_PASSWORD | admin123 | Dashboard HTTP Basic Auth password |
| MEDIA_PATH | ./media | Media files storage |

## Authentication

### API v1 (X-API-Key)
```bash
curl -H "X-API-Key: your-api-key" http://localhost:3001/api/v1/status
```

### Dashboard (HTTP Basic Auth)
Protected by username/password. Access via browser at `/`.

## API v1 Endpoints

All endpoints (except health) require `X-API-Key` header. Rate limited to 100 requests/minute.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Connection status (no auth) |
| GET | `/api/v1/status` | Detailed connection status |
| GET | `/api/v1/inbox` | Unread messages (with pagination) |
| GET | `/api/v1/inbox/:status` | Messages by status (all/read/replied/ignored) |
| POST | `/api/v1/messages/:id/reply` | Reply to a message |
| PATCH | `/api/v1/messages/:id/status` | Update message status |
| PATCH | `/api/v1/messages/batch/status` | Batch update statuses |
| GET | `/api/v1/webhooks` | List configured webhooks |

### Query Parameters (inbox)

| Parameter | Description |
|-----------|-------------|
| page | Page number (default: 1) |
| limit | Items per page (default: 50) |
| search | Search message content |
| phone | Filter by phone number |
| startDate | Filter from date |
| endDate | Filter to date |

## Workflow

1. **Connect WhatsApp** - Open dashboard at `/login` and scan QR code

2. **Check unread messages**
   ```bash
   curl -H "X-API-Key: your-api-key" http://localhost:3001/api/v1/inbox
   ```

3. **Reply to a message**
   ```bash
   curl -X POST -H "X-API-Key: your-api-key" \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello!"}' \
     http://localhost:3001/api/v1/messages/MESSAGE_ID/reply
   ```

4. **Mark as read/ignored**
   ```bash
   curl -X PATCH -H "X-API-Key: your-api-key" \
     -H "Content-Type: application/json" \
     -d '{"status": "read"}' \
     http://localhost:3001/api/v1/messages/MESSAGE_ID/status
   ```

## Message Statuses

- `unread` - New incoming message
- `read` - Message has been read
- `replied` - Message has been replied to
- `ignored` - Message marked as ignored
- `sent` - Outgoing message

## Webhooks

Configure webhooks via the dashboard to receive real-time notifications:

- `message.received` - New incoming message
- `message.sent` - Reply sent
- `connection.connected` - WhatsApp connection established
- `connection.disconnected` - WhatsApp connection lost

Webhooks include HMAC-SHA256 signature in `X-Webhook-Signature` header when secret is configured.

## Docker Commands

```bash
docker build -t whatsapp-api:latest .
docker stack deploy -c docker-compose.yml whatsap
docker service logs whatsap_whatsapp-api -f
docker stack rm whatsap
```

## PM2 (Alternative)

```bash
npm run pm2:start
npm run pm2:logs
npm run pm2:stop
```

## Dashboard Pages

The Astro SSR dashboard provides a web interface for managing messages:

| Route | Description |
|-------|-------------|
| `/` | Inbox - view, filter, search messages |
| `/status` | Connection status and info |
| `/login` | QR code scanner for WhatsApp login |
| `/webhooks` | Manage webhook configurations |
| `/webhooks/new` | Add new webhook |
| `/webhooks/edit/:id` | Edit existing webhook |
| `/settings` | API documentation and key management |
| `/audit-logs` | View system audit logs |
| `/reply/:id` | Reply to specific message |

## Project Structure

```
app.js                  # Entry point, Express + Astro integration
src/
├── config.js           # Environment configuration
├── logger.js           # Pino logger setup
├── state.js            # Global state management
├── database.js         # SQLite operations (better-sqlite3)
├── whatsapp.js         # Baileys client, message handling
├── webhook.js          # Webhook delivery with retry
├── middleware/
│   ├── auth.js         # API key + Basic Auth
│   ├── rateLimiter.js  # Rate limiting (100 req/min)
│   └── auditLog.js     # Request audit logging
└── routes/
    └── api.js          # REST API v1 routes
dashboard/              # Astro SSR dashboard
├── src/
│   ├── layouts/        # Shared layout components
│   ├── pages/          # SSR pages and form actions
│   └── lib/server.ts   # Shared state access
└── dist/               # Built SSR output
tests/                  # Jest test suite (87 tests)
docker-compose.yml      # Docker Swarm config
ecosystem.config.js     # PM2 config
```

## 🧪 Testing

```bash
# Run all tests (87 tests)
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

**Test Coverage:**
- Database operations (20+ tests)
- Authentication (15+ tests)
- API endpoints (20+ tests)
- WhatsApp connection (19+ tests)

---

## 🏗️ Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js (Alpine) | 20 |
| Backend Framework | Express.js | 4.18.2 |
| WhatsApp Client | Baileys | 7.0.0-rc.9 |
| Database | SQLite (better-sqlite3) | 12.5.0 |
| Dashboard Framework | Astro (SSR) | 5.16.5 |
| CSS Framework | Tailwind CSS | 3.4.19 |
| Logger | Pino | 8.16.0 |
| Testing | Jest + Supertest | 30.2.0 + 7.1.4 |
| Container | Docker (multi-stage) | Latest |

> 📖 **For detailed tech stack rationale, see [DESIGN.md](./DESIGN.md#technology-stack)**

---

## 📊 Project Statistics

- **Code Lines:** ~5,000 lines (src/ + dashboard/)
- **Test Coverage:** 87 tests across 4 suites
- **Dependencies:** 11 production packages
- **Documentation:** 2,500+ lines across 6 files
- **API Endpoints:** 7 REST endpoints
- **Dashboard Pages:** 11 routes + 8 form actions
- **Webhook Events:** 4 event types

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines (if open source).

---

## 🔒 Security

- **API Key:** 32-byte random keys with timing-safe comparison
- **Basic Auth:** Dashboard protected with HTTP Basic Auth
- **Webhooks:** HMAC-SHA256 signature verification
- **SQL Injection:** Prevented via prepared statements
- **Audit Logs:** All activity tracked with IP addresses

> 📖 **For security best practices, see [API.md](./API.md#security-considerations)**

---

## 📈 Performance

- **Message Throughput:** 1,000 messages/day recommended
- **API Response Time:** < 500ms for inbox queries
- **Concurrent Users:** Supports 5-10 simultaneous users
- **Database:** SQLite with WAL mode for concurrent reads
- **Rate Limiting:** 100 requests/minute per API key

> 📖 **For scaling considerations, see [DESIGN.md](./DESIGN.md#scalability-limitations)**

---

## 📝 Version History

**Current Version:** 2.0.0 (Released 2025-12-11)

**Major Changes in 2.0:**
- Migrated dashboard from React to Astro SSR
- Added webhook system with retry logic
- Added audit logging
- Added media file handling
- Added batch operations

> 📖 **For full changelog, see [CHANGELOG.md](./CHANGELOG.md)**

---

## 📄 License

[Add your license here]

---

## 🆘 Support

**Getting Help:**

1. **Common Issues** - Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) (when created)
2. **API Questions** - See [API.md](./API.md)
3. **Architecture Questions** - See [DESIGN.md](./DESIGN.md)
4. **Implementation Details** - See [IMPLEMENTATION.md](./IMPLEMENTATION.md)
5. **Feature Requests** - See [PRD.md](./PRD.md)
6. **Version History** - See [CHANGELOG.md](./CHANGELOG.md)

**Useful Commands:**

```bash
# View logs (Docker)
docker service logs whatsap_whatsapp-api -f

# View logs (PM2)
npm run pm2:logs

# Check connection status
curl http://localhost:3001/api/v1/health

# Regenerate API key
# Visit dashboard at /settings
```

---

**Built with ❤️ using Node.js, Express, Baileys, and Astro**
