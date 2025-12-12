# Implementation Guide

> 🏗️ **Architecture:** [DESIGN.md](./DESIGN.md) | 📋 **Requirements:** [PRD.md](./PRD.md) | 📖 **API Usage:** [API.md](./API.md)

**Version:** 2.0.0 | **For:** Developers and Engineers

---

## Overview

This document contains detailed technical implementation information for the WhatsApp Reply-Only API. For high-level architecture and design decisions, see [DESIGN.md](./DESIGN.md).

---

## Database Schema

### SQLite Configuration

```javascript
// WAL mode for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
```

### Table Definitions

#### messages

```sql
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  reply_status TEXT DEFAULT 'unread' CHECK(
    reply_status IN ('unread', 'read', 'replied', 'ignored', 'sent')
  ),
  media_type TEXT,
  media_url TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(reply_status);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
```

#### api_keys

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  created_at INTEGER DEFAULT (unixepoch())
);
```

#### webhooks

```sql
CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  events TEXT NOT NULL,  -- JSON array: ["message.received", "message.sent"]
  secret TEXT,           -- Optional HMAC secret
  active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);
```

#### audit_logs

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  details TEXT,          -- JSON object with action details
  ip_address TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
```

#### settings

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## Component Implementation

### 1. WhatsApp Client (`src/whatsapp.js`)

#### Connection Flow

```javascript
// 1. Initialize Baileys client
const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
const sock = makeWASocket({
  auth: state,
  printQRInTerminal: false,
  browser: ['WhatsApp API', 'Chrome', '1.0.0']
});

// 2. Handle connection updates
sock.ev.on('connection.update', async (update) => {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    // Generate QR code for dashboard
    globalThis.__whatsapp_api.qrCodeData = qr;
  }

  if (connection === 'close') {
    // Auto-reconnect with 5-second delay
    const shouldReconnect =
      lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
    if (shouldReconnect) {
      setTimeout(() => connectToWhatsApp(), 5000);
    }
  }
});

// 3. Handle incoming messages
sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type === 'notify') {
    for (const msg of messages) {
      await processIncomingMessage(msg);
    }
  }
});
```

#### Media Download

```javascript
async function downloadMedia(message) {
  try {
    const buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      { logger, reuploadRequest: sock.updateMediaMessage }
    );

    // Determine media type and extension
    const mediaType = Object.keys(message.message)[0];
    const ext = getExtension(mediaType);
    const filename = `${uuidv4()}.${ext}`;

    // Save to media directory
    fs.writeFileSync(path.join(MEDIA_PATH, filename), buffer);

    return { mediaType, mediaUrl: `/media/${filename}` };
  } catch (error) {
    logger.error('Media download failed:', error);
    return { mediaType: null, mediaUrl: null };
  }
}
```

#### Message Processing

```javascript
async function processIncomingMessage(msg) {
  // Extract message content
  const phone = msg.key.remoteJid.split('@')[0];
  const messageContent = extractMessageText(msg);

  // Handle media
  const { mediaType, mediaUrl } = await downloadMedia(msg);

  // Store in database
  db.insertMessage({
    id: msg.key.id,
    direction: 'incoming',
    phone,
    message: messageContent,
    reply_status: 'unread',
    media_type: mediaType,
    media_url: mediaUrl
  });

  // Trigger webhook
  triggerWebhook('message.received', {
    id: msg.key.id,
    phone,
    message: messageContent,
    media_type: mediaType,
    media_url: mediaUrl,
    timestamp: msg.messageTimestamp
  });
}
```

#### Sending Replies

```javascript
async function sendReply(phone, text) {
  const jid = `${phone}@s.whatsapp.net`;

  const sentMsg = await sock.sendMessage(jid, { text });

  return {
    id: sentMsg.key.id,
    timestamp: sentMsg.messageTimestamp
  };
}
```

---

### 2. Database Operations (`src/database.js`)

#### Connection Setup

```javascript
const Database = require('better-sqlite3');
const db = new Database(DB_PATH);

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
```

#### Prepared Statements

```javascript
// Insert message
const insertMessageStmt = db.prepare(`
  INSERT INTO messages (id, direction, phone, message, reply_status, media_type, media_url)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function insertMessage({ id, direction, phone, message, reply_status, media_type, media_url }) {
  insertMessageStmt.run(id, direction, phone, message, reply_status, media_type, media_url);
}

// Get messages with filters
const getMessagesStmt = db.prepare(`
  SELECT * FROM messages
  WHERE
    (:status IS NULL OR reply_status = :status) AND
    (:search IS NULL OR message LIKE '%' || :search || '%') AND
    (:phone IS NULL OR phone LIKE '%' || :phone || '%') AND
    (:startDate IS NULL OR created_at >= :startDate) AND
    (:endDate IS NULL OR created_at <= :endDate)
  ORDER BY created_at DESC
  LIMIT :limit OFFSET :offset
`);

function getMessages({ status, search, phone, startDate, endDate, page = 1, limit = 50 }) {
  const offset = (page - 1) * limit;
  return getMessagesStmt.all({
    status: status || null,
    search: search || null,
    phone: phone || null,
    startDate: startDate ? new Date(startDate).getTime() / 1000 : null,
    endDate: endDate ? new Date(endDate).getTime() / 1000 : null,
    limit,
    offset
  });
}

// Update message status
const updateStatusStmt = db.prepare(`
  UPDATE messages SET reply_status = ? WHERE id = ?
`);

function updateMessageStatus(id, status) {
  updateStatusStmt.run(status, id);
}

// Batch update
const batchUpdateStmt = db.prepare(`
  UPDATE messages SET reply_status = ? WHERE id = ?
`);

function batchUpdateStatuses(ids, status) {
  const updateMany = db.transaction((ids, status) => {
    for (const id of ids) {
      batchUpdateStmt.run(status, id);
    }
  });
  updateMany(ids, status);
}
```

---

### 3. Webhook System (`src/webhook.js`)

#### Queue Implementation

```javascript
const webhookQueue = [];

async function triggerWebhook(event, payload) {
  // Get active webhooks for this event
  const webhooks = db.getWebhooks().filter(
    w => w.active && JSON.parse(w.events).includes(event)
  );

  for (const webhook of webhooks) {
    webhookQueue.push({
      id: uuidv4(),
      url: webhook.url,
      event,
      payload,
      secret: webhook.secret,
      attempts: 0,
      maxAttempts: 3
    });
  }

  processQueue();
}
```

#### Delivery with Retry

```javascript
async function processQueue() {
  if (processing || webhookQueue.length === 0) return;
  processing = true;

  while (webhookQueue.length > 0) {
    const job = webhookQueue[0];

    try {
      await deliverWebhook(job);
      webhookQueue.shift(); // Success - remove from queue
    } catch (error) {
      job.attempts++;

      if (job.attempts >= job.maxAttempts) {
        logger.error(`Webhook failed after ${job.maxAttempts} attempts:`, error);
        webhookQueue.shift(); // Failed - remove from queue
      } else {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, job.attempts - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  processing = false;
}

async function deliverWebhook(job) {
  const body = JSON.stringify({
    event: job.event,
    timestamp: Date.now(),
    data: job.payload
  });

  // Generate HMAC signature
  const headers = { 'Content-Type': 'application/json' };
  if (job.secret) {
    const signature = crypto
      .createHmac('sha256', job.secret)
      .update(body)
      .digest('hex');
    headers['X-Webhook-Signature'] = `sha256=${signature}`;
  }

  const response = await fetch(job.url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(10000) // 10-second timeout
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}
```

---

### 4. Authentication (`src/middleware/auth.js`)

#### API Key Authentication

```javascript
const crypto = require('crypto');

function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  // Get stored API key from database
  const storedKey = db.getApiKey();

  if (!storedKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Timing-safe comparison
  const providedBuffer = Buffer.from(apiKey);
  const storedBuffer = Buffer.from(storedKey);

  if (providedBuffer.length !== storedBuffer.length) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const valid = crypto.timingSafeEqual(providedBuffer, storedBuffer);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
}
```

#### Basic Auth (Dashboard)

```javascript
function basicAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Dashboard"');
    return res.status(401).send('Authentication required');
  }

  const credentials = Buffer.from(auth.slice(6), 'base64').toString();
  const [username, password] = credentials.split(':');

  const validUsername = crypto.timingSafeEqual(
    Buffer.from(username),
    Buffer.from(DASHBOARD_USER)
  );

  const validPassword = crypto.timingSafeEqual(
    Buffer.from(password),
    Buffer.from(DASHBOARD_PASSWORD)
  );

  if (!validUsername || !validPassword) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Dashboard"');
    return res.status(401).send('Invalid credentials');
  }

  next();
}
```

---

### 5. Rate Limiting (`src/middleware/rateLimiter.js`)

#### Sliding Window Implementation

```javascript
const rateLimitMap = new Map();

function rateLimiter(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 100;

  if (!rateLimitMap.has(apiKey)) {
    rateLimitMap.set(apiKey, []);
  }

  const requests = rateLimitMap.get(apiKey);

  // Remove expired entries
  const validRequests = requests.filter(time => now - time < windowMs);

  if (validRequests.length >= maxRequests) {
    const oldestRequest = Math.min(...validRequests);
    const resetTime = new Date(oldestRequest + windowMs);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', resetTime.toISOString());
    res.setHeader('Retry-After', Math.ceil((resetTime - now) / 1000));

    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((resetTime - now) / 1000)
    });
  }

  validRequests.push(now);
  rateLimitMap.set(apiKey, validRequests);

  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', maxRequests - validRequests.length);

  next();
}

// Cleanup every 60 seconds to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const windowMs = 60000;

  for (const [key, requests] of rateLimitMap.entries()) {
    const validRequests = requests.filter(time => now - time < windowMs);
    if (validRequests.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, validRequests);
    }
  }
}, 60000);
```

---

### 6. Audit Logging (`src/middleware/auditLog.js`)

```javascript
function auditLog(action) {
  return (req, res, next) => {
    const details = {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body
    };

    const ip = req.ip || req.connection.remoteAddress;

    db.insertAuditLog({
      action,
      details: JSON.stringify(details),
      ip_address: ip
    });

    next();
  };
}
```

---

## Astro SSR Integration

### Global State Setup (`app.js`)

```javascript
// Initialize global state
globalThis.__whatsapp_api = {
  sock: null,
  connectionStatus: 'disconnected',
  qrCodeData: null,
  db: db,
  logger: logger,
  triggerWebhook: triggerWebhook
};

// Start WhatsApp connection
connectToWhatsApp().then(sock => {
  globalThis.__whatsapp_api.sock = sock;
});

// Integrate Astro
const astroApp = await handler;
app.use(basicAuth);
app.use(astroApp);
```

### Accessing State in Astro (`dashboard/src/lib/server.ts`)

```typescript
export function getWhatsAppApi() {
  const api = (globalThis as any).__whatsapp_api;
  if (!api) {
    throw new Error('WhatsApp API not initialized');
  }
  return api;
}
```

### SSR Page Example (`dashboard/src/pages/index.astro`)

```astro
---
import { getWhatsAppApi } from '../lib/server';

const { db } = getWhatsAppApi();

const page = parseInt(Astro.url.searchParams.get('page') || '1');
const status = Astro.url.searchParams.get('status') || 'unread';
const search = Astro.url.searchParams.get('search') || '';

const messages = db.getMessages({ status, search, page, limit: 50 });
const total = db.countMessages({ status, search });
---

<html>
  <body>
    {messages.map(msg => (
      <div class="message">
        <p>{msg.phone}: {msg.message}</p>
        <a href={`/reply/${msg.id}`}>Reply</a>
      </div>
    ))}
  </body>
</html>
```

### Form Action Example (`dashboard/src/pages/actions/reply.ts`)

```typescript
import type { APIRoute } from 'astro';
import { getWhatsAppApi } from '../../lib/server';

export const POST: APIRoute = async ({ request, redirect }) => {
  const { sock, db, triggerWebhook } = getWhatsAppApi();

  const formData = await request.formData();
  const messageId = formData.get('messageId') as string;
  const replyText = formData.get('message') as string;

  // Get original message
  const message = db.getMessageById(messageId);

  // Send reply
  const sent = await sock.sendMessage(
    `${message.phone}@s.whatsapp.net`,
    { text: replyText }
  );

  // Update status
  db.updateMessageStatus(messageId, 'replied');

  // Trigger webhook
  triggerWebhook('message.sent', {
    id: sent.key.id,
    phone: message.phone,
    message: replyText,
    in_reply_to: messageId
  });

  return redirect('/?toast=Reply sent');
};
```

---

## Performance Optimizations

### 1. Database Indexes

```sql
-- Fast status filtering (most common query)
CREATE INDEX idx_messages_status ON messages(reply_status);

-- Phone number lookups
CREATE INDEX idx_messages_phone ON messages(phone);

-- Pagination (ORDER BY created_at DESC)
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- Audit log queries
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
```

### 2. Prepared Statements

All database queries use prepared statements for query plan caching:

```javascript
// Compiled once, executed many times
const getMessagesStmt = db.prepare(`SELECT * FROM messages WHERE ...`);
```

### 3. WAL Mode

```javascript
db.pragma('journal_mode = WAL');
```

Benefits:
- Concurrent reads while writing
- Better performance for read-heavy workloads
- Reduced "database is locked" errors

### 4. In-Memory Rate Limiting

```javascript
const rateLimitMap = new Map(); // No database queries
```

### 5. Pino Logging

```javascript
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});
```

Minimal overhead compared to other logging libraries.

---

## Security Implementation

### 1. API Key Generation

```javascript
const crypto = require('crypto');

function generateApiKey() {
  return crypto.randomBytes(32).toString('base64'); // 256-bit entropy
}
```

### 2. Timing-Safe Comparison

```javascript
crypto.timingSafeEqual(
  Buffer.from(provided),
  Buffer.from(stored)
);
```

Prevents timing attacks.

### 3. SQL Injection Prevention

```javascript
// ✅ Safe - parameterized
db.prepare('SELECT * FROM messages WHERE id = ?').get(id);

// ❌ Unsafe - concatenation
db.prepare(`SELECT * FROM messages WHERE id = '${id}'`).get();
```

### 4. HMAC Webhook Signatures

```javascript
const signature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');

headers['X-Webhook-Signature'] = `sha256=${signature}`;
```

### 5. Media File Protection

```javascript
// Media files require authentication
app.get('/media/:filename', basicAuth, (req, res) => {
  const filepath = path.join(MEDIA_PATH, req.params.filename);
  res.sendFile(filepath);
});
```

---

## Docker Implementation

### Multi-Stage Build

```dockerfile
# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY dashboard/package*.json ./dashboard/
RUN npm ci --only=production && \
    cd dashboard && npm ci && npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dashboard/dist ./dashboard/dist
COPY . .
CMD ["node", "app.js"]
```

### Health Check

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3001/api/v1/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### Resource Limits

```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 512M
    reservations:
      cpus: '0.25'
      memory: 256M
```

---

## Testing Implementation

### Mocking Baileys

```javascript
// tests/__mocks__/baileys.js
module.exports = {
  makeWASocket: jest.fn(() => ({
    sendMessage: jest.fn(),
    ev: {
      on: jest.fn(),
      off: jest.fn()
    }
  })),
  useMultiFileAuthState: jest.fn(() => ({
    state: {},
    saveCreds: jest.fn()
  }))
};
```

### Database Test Setup

```javascript
beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  initSchema(db);
});

afterEach(() => {
  db.close();
});
```

### API Integration Tests

```javascript
const request = require('supertest');
const app = require('../app');

describe('API v1', () => {
  it('should reject requests without API key', async () => {
    const res = await request(app).get('/api/v1/inbox');
    expect(res.status).toBe(401);
  });

  it('should return messages with valid API key', async () => {
    const res = await request(app)
      .get('/api/v1/inbox')
      .set('X-API-Key', 'test-key');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('messages');
  });
});
```

---

## File Structure Detail

```
whatsappapi/
├── app.js                           # 200 lines - Entry point
│   ├── Express setup
│   ├── Middleware chain
│   ├── API routes mounting
│   ├── Astro SSR integration
│   └── Server startup
│
├── src/
│   ├── config.js                    # 15 lines - Environment vars
│   ├── logger.js                    # 10 lines - Pino setup
│   ├── state.js                     # 20 lines - Global state
│   ├── database.js                  # 400 lines - SQLite operations
│   │   ├── Schema initialization
│   │   ├── Prepared statements
│   │   └── CRUD operations
│   ├── whatsapp.js                  # 300 lines - Baileys client
│   │   ├── Connection management
│   │   ├── QR code handling
│   │   ├── Message processing
│   │   └── Media download
│   ├── webhook.js                   # 150 lines - Webhook delivery
│   │   ├── Queue management
│   │   ├── Retry logic
│   │   └── HMAC signing
│   ├── middleware/
│   │   ├── auth.js                  # 80 lines - API key + Basic Auth
│   │   ├── rateLimiter.js           # 60 lines - Rate limiting
│   │   └── auditLog.js              # 40 lines - Audit logging
│   └── routes/
│       └── api.js                   # 350 lines - REST API v1
│           ├── GET /health
│           ├── GET /status
│           ├── GET /inbox/:status?
│           ├── POST /messages/:id/reply
│           ├── PATCH /messages/:id/status
│           ├── PATCH /messages/batch/status
│           └── GET /webhooks
│
├── dashboard/                       # Astro SSR
│   ├── astro.config.mjs             # Astro configuration
│   ├── tailwind.config.mjs          # Tailwind CSS config
│   ├── src/
│   │   ├── layouts/
│   │   │   └── Base.astro           # Shared layout
│   │   ├── lib/
│   │   │   └── server.ts            # State access helper
│   │   ├── middleware.ts            # Astro middleware
│   │   └── pages/
│   │       ├── index.astro          # Inbox
│   │       ├── status.astro         # Connection status
│   │       ├── login.astro          # QR code scanner
│   │       ├── webhooks.astro       # Webhook list
│   │       ├── webhooks/
│   │       │   ├── new.astro        # Create webhook
│   │       │   └── edit/[id].astro  # Edit webhook
│   │       ├── settings.astro       # API docs + settings
│   │       ├── audit-logs.astro     # Audit log viewer
│   │       ├── reply/[id].astro     # Reply form
│   │       └── actions/             # Form handlers
│   │           ├── reply.ts
│   │           ├── status.ts
│   │           ├── logout.ts
│   │           ├── regenerate-key.ts
│   │           ├── webhook-create.ts
│   │           ├── webhook-update.ts
│   │           ├── webhook-toggle.ts
│   │           └── webhook-delete.ts
│   └── dist/                        # Built output
│
├── tests/
│   ├── database.test.js             # 20+ tests
│   ├── auth.test.js                 # 15+ tests
│   ├── api.test.js                  # 20+ tests
│   ├── whatsapp.test.js             # 19+ tests
│   └── __mocks__/
│       └── baileys.js               # Baileys mock
│
├── session/                         # WhatsApp auth state
│   └── creds.json                   # Session credentials
│
├── media/                           # Media files
│   └── *.jpg, *.mp4, *.pdf, etc.
│
└── messages.db                      # SQLite database
    └── messages.db-wal              # WAL journal
```

---

## Deployment Configuration

### PM2 (`ecosystem.config.js`)

```javascript
module.exports = {
  apps: [{
    name: 'whatsapp-api',
    script: 'app.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
```

### Docker Swarm (`docker-compose.yml`)

```yaml
version: '3.8'
services:
  whatsapp-api:
    image: whatsapp-api:latest
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DASHBOARD_USER=admin
      - DASHBOARD_PASSWORD=admin123
    volumes:
      - whatsapp_session:/app/session
      - whatsapp_data:/app/data
      - whatsapp_media:/app/media
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  whatsapp_session:
  whatsapp_data:
  whatsapp_media:
```

---

## Environment Variables

```bash
# Server
PORT=3001                          # API port
NODE_ENV=production                # Environment

# Authentication
API_KEY=your-secret-api-key        # Initial API key (auto-generated if empty)
DASHBOARD_USER=admin               # Basic Auth username
DASHBOARD_PASSWORD=admin123        # Basic Auth password

# Storage
DB_PATH=./messages.db              # SQLite database path
SESSION_PATH=./session             # WhatsApp session directory
MEDIA_PATH=./media                 # Media files directory

# Logging
LOG_LEVEL=info                     # Pino log level (debug, info, warn, error)
```

---

## Monitoring

### Logs

```bash
# Docker
docker service logs whatsap_whatsapp-api -f

# PM2
npm run pm2:logs

# Direct
npm start  # Logs to stdout
```

### Health Check

```bash
curl http://localhost:3001/api/v1/health
# Returns: {"status":"connected","phone":"1234567890"}
```

### Audit Logs

View in dashboard at `/audit-logs` or query database:

```sql
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100;
```

---

## Related Documentation

- **[DESIGN.md](./DESIGN.md)** - Architecture and design decisions
- **[PRD.md](./PRD.md)** - Business requirements
- **[API.md](./API.md)** - REST API usage guide
- **[CLAUDE.md](./CLAUDE.md)** - Quick reference for developers
- **[README.md](./README.md)** - Getting started guide
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history

---

**For Developers:** Engineering Team
**Last Updated:** December 12, 2025
