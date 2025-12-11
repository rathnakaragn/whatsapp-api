# WhatsApp API

Reply-only WhatsApp API using Baileys library. Receive messages, read content, and manually reply. Features an Astro SSR dashboard, webhooks, rate limiting, and versioned REST API.

## Setup

### Docker Swarm (Production)

```bash
# Build and deploy
docker build -t whatsapp-api:latest .
docker stack deploy -c docker-compose.yml whatsap

# Check status
docker service ls
docker service logs whatsap_whatsapp-api
```

### Local Development

```bash
npm install
npm start
```

Access the dashboard at `http://localhost:3001` (default credentials: admin/admin123)

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
tests/                  # Jest test suite (74 tests)
docker-compose.yml      # Docker Swarm config
ecosystem.config.js     # PM2 config
```

## Development

```bash
# Install dependencies
npm install
cd dashboard && npm install

# Build dashboard (required before first run)
cd dashboard && npm run build

# Start server
npm start

# Run tests
npm test
npm run test:coverage
```
