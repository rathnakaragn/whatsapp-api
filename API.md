# WhatsApp API - REST API Reference

Reply-only WhatsApp API with message queuing and webhook support. Built on Baileys library with Express.js and SQLite.

> 🏗️ **Architecture:** [DESIGN.md](./DESIGN.md) | 🔧 **Implementation:** [IMPLEMENTATION.md](./IMPLEMENTATION.md) | 📋 **Requirements:** [PRD.md](./PRD.md)

**Base URL:**
- Production: `https://your-domain.com`
- Local Development: `http://localhost:3001`

**API Version:** 2.0.0

**Technology Stack:** Node.js 20 | Express 4.18.2 | Baileys 7.0.0-rc.9 | SQLite (better-sqlite3)

---

## Quick Start

```bash
# 1. Check if WhatsApp is connected
curl http://localhost:3001/api/v1/health

# 2. Get your API key from the dashboard
# Visit http://localhost:3001 (admin/admin123)

# 3. Get unread messages
curl -H "X-API-Key: your-api-key" http://localhost:3001/api/v1/inbox

# 4. Reply to a message
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}' \
  http://localhost:3001/api/v1/messages/{message-id}/reply
```

---

## Authentication

All API v1 endpoints (except `/api/v1/health`) require authentication using an API key.

### Methods

| Method | Example |
|--------|---------|
| Header | `X-API-Key: your-api-key` |

### Error Response

```json
{
  "error": "Unauthorized"
}
```
**Status Code:** `401`

---

## Rate Limiting

API v1 endpoints are rate limited to **100 requests per minute** per API key.

### Rate Limit Headers

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Timestamp when window resets |
| `Retry-After` | Seconds to wait (when rate limited) |

### Rate Limit Error

```json
{
  "error": "Too many requests, please try again later",
  "retryAfter": 45
}
```
**Status Code:** `429`

---

## API v1 Endpoints

### 1. Health Check

Check if the WhatsApp connection is active.

**Endpoint:** `GET /api/v1/health`

**Authentication:** Not required

**Response:**
```json
{
  "status": "connected"
}
```

| Field | Type | Values |
|-------|------|--------|
| status | string | `connected` or `disconnected` |

**Example:**
```bash
curl https://your-domain.com/api/v1/health
```

---

### 2. Connection Status

Get detailed connection status.

**Endpoint:** `GET /api/v1/status`

**Authentication:** Required

**Response:**
```json
{
  "connected": true,
  "qrReady": false,
  "sessionExists": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| connected | boolean | WhatsApp connection active |
| qrReady | boolean | QR code available for scanning |
| sessionExists | boolean | Session files exist on server |

**Example:**
```bash
curl -H "X-API-Key: your-api-key" https://your-domain.com/api/v1/status
```

---

### 3. Get Messages

Retrieve incoming messages filtered by status with pagination and search.

**Endpoint:** `GET /api/v1/inbox/:status?`

**Authentication:** Required

**Path Parameters:**

| Parameter | Type | Required | Default | Values |
|-----------|------|----------|---------|--------|
| status | path | No | `unread` | `unread`, `read`, `replied`, `ignored`, `all` |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 50 | Items per page (max 100) |
| search | string | | Search message content |
| phone | string | | Filter by phone number |
| startDate | string | | Filter from date (YYYY-MM-DD) |
| endDate | string | | Filter to date (YYYY-MM-DD) |

**Response:**
```json
{
  "count": 2,
  "messages": [
    {
      "id": "c3cc63db-cc08-488d-9824-e45fb5e93de6",
      "direction": "incoming",
      "phone": "919740333323@s.whatsapp.net",
      "message": "Hello, how are you?",
      "reply_status": "unread",
      "media_type": null,
      "media_url": null,
      "created_at": "2025-12-11 07:30:04"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3
  }
}
```

**Message Object:**

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique message identifier |
| direction | string | `incoming` or `outgoing` |
| phone | string | WhatsApp JID (e.g., `919740333323@s.whatsapp.net`) |
| message | string | Message content (text or media caption) |
| reply_status | string | Message status (`unread`, `read`, `replied`, `ignored`, `sent`) |
| media_type | string\|null | Media type: `image`, `video`, `document`, `sticker`, `location`, `contact` or null |
| media_url | string\|null | Local media file URL (e.g., `/media/uuid.jpg`) or null |
| created_at | string | Timestamp in format `YYYY-MM-DD HH:MM:SS` (UTC) |

**Examples:**
```bash
# Get unread messages (default)
curl -H "X-API-Key: your-api-key" http://localhost:3001/api/v1/inbox

# Get all messages with pagination
curl -H "X-API-Key: your-api-key" "http://localhost:3001/api/v1/inbox/all?page=2&limit=20"

# Get only replied messages
curl -H "X-API-Key: your-api-key" http://localhost:3001/api/v1/inbox/replied

# Search messages containing keyword
curl -H "X-API-Key: your-api-key" "http://localhost:3001/api/v1/inbox/all?search=hello"

# Filter by phone number (partial match)
curl -H "X-API-Key: your-api-key" "http://localhost:3001/api/v1/inbox/all?phone=919740"

# Filter by date range
curl -H "X-API-Key: your-api-key" \
  "http://localhost:3001/api/v1/inbox/all?startDate=2025-12-01&endDate=2025-12-31"

# Combined filters: unread messages from specific phone
curl -H "X-API-Key: your-api-key" \
  "http://localhost:3001/api/v1/inbox/unread?phone=919740333323&limit=10"
```

---

### 4. Reply to Message

Send a reply to a specific message.

**Endpoint:** `POST /api/v1/messages/:id/reply`

**Authentication:** Required

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | path | Yes | Message UUID to reply to |

**Request Body:**
```json
{
  "message": "Your reply text here"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| message | string | Yes | Reply message content |

**Response:**
```json
{
  "success": true,
  "replyId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Operation result |
| replyId | string (UUID) | ID of the sent message |

**Error Responses:**

| Status | Response | Description |
|--------|----------|-------------|
| 400 | `{"error": "Missing message"}` | No message in request body |
| 404 | `{"error": "Message not found"}` | Invalid message ID |
| 503 | `{"error": "WhatsApp not connected"}` | WhatsApp disconnected |
| 500 | `{"error": "error message"}` | Send failed |

**Examples:**
```bash
# Simple reply
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "Thank you for your message!"}' \
  http://localhost:3001/api/v1/messages/c3cc63db-cc08-488d-9824-e45fb5e93de6/reply

# Reply with multi-line message
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!\n\nThank you for contacting us.\nWe will get back to you soon."}' \
  http://localhost:3001/api/v1/messages/c3cc63db-cc08-488d-9824-e45fb5e93de6/reply
```

**Note:**
- Replying to a message automatically updates its status to `replied`
- The reply is sent to the same phone number as the original message
- A new message record is created with direction `outgoing` and status `sent`
- Triggers `message.sent` webhook event if configured

---

### 5. Update Message Status

Update the status of a single message.

**Endpoint:** `PATCH /api/v1/messages/:id/status`

**Authentication:** Required

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | path | Yes | Message UUID |

**Request Body:**
```json
{
  "status": "read"
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| status | string | Yes | `unread`, `read`, `replied`, `ignored`, `sent` |

**Response:**
```json
{
  "success": true
}
```

**Error Responses:**

| Status | Response | Description |
|--------|----------|-------------|
| 400 | `{"error": "Invalid status"}` | Invalid status value |
| 404 | `{"error": "Not found"}` | Message not found |

**Examples:**
```bash
# Mark as read
curl -X PATCH \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "read"}' \
  http://localhost:3001/api/v1/messages/c3cc63db-cc08-488d-9824-e45fb5e93de6/status

# Mark as ignored
curl -X PATCH \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "ignored"}' \
  http://localhost:3001/api/v1/messages/c3cc63db-cc08-488d-9824-e45fb5e93de6/status
```

---

### 6. Batch Update Message Status

Update the status of multiple messages at once.

**Endpoint:** `PATCH /api/v1/messages/batch/status`

**Authentication:** Required

**Request Body:**
```json
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"],
  "status": "read"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ids | array | Yes | Array of message UUIDs |
| status | string | Yes | `unread`, `read`, `replied`, `ignored`, `sent` |

**Response:**
```json
{
  "success": true,
  "updated": 3
}
```

**Error Responses:**

| Status | Response | Description |
|--------|----------|-------------|
| 400 | `{"error": "Missing or invalid ids array"}` | Invalid ids parameter |
| 400 | `{"error": "Invalid status"}` | Invalid status value |

**Examples:**
```bash
# Mark multiple messages as read
curl -X PATCH \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["uuid-1", "uuid-2", "uuid-3"], "status": "read"}' \
  http://localhost:3001/api/v1/messages/batch/status

# Ignore multiple messages at once
curl -X PATCH \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["uuid-1", "uuid-2"], "status": "ignored"}' \
  http://localhost:3001/api/v1/messages/batch/status
```

**Note:** This is useful for bulk operations from automation workflows.

---

### 7. List Webhooks

Get all configured webhooks.

**Endpoint:** `GET /api/v1/webhooks`

**Authentication:** Required

**Response:**
```json
{
  "webhooks": [
    {
      "id": 1,
      "url": "https://example.com/webhook",
      "events": "message.received,message.sent",
      "secret": "your-secret",
      "active": 1,
      "created_at": "2025-12-11 07:30:04"
    }
  ]
}
```

**Webhook Object:**

| Field | Type | Description |
|-------|------|-------------|
| id | number | Webhook ID |
| url | string | Webhook endpoint URL |
| events | string | Comma-separated list of subscribed events |
| secret | string\|null | HMAC secret for signature verification (optional) |
| active | number | 1 = active, 0 = inactive |
| created_at | string | Creation timestamp |

**Example:**
```bash
curl -H "X-API-Key: your-api-key" http://localhost:3001/api/v1/webhooks
```

**Note:** Webhooks can only be created/edited via the dashboard at `/webhooks`

---

## Message Statuses

| Status | Description |
|--------|-------------|
| `unread` | New incoming message (default) |
| `read` | Message has been read |
| `replied` | Reply sent via API |
| `ignored` | Marked as ignored |
| `sent` | Outgoing message |

---

## Webhook Events

Configure webhooks via the dashboard to receive real-time notifications.

### Events

| Event | Description |
|-------|-------------|
| `message.received` | New incoming message |
| `message.sent` | Reply sent |
| `connection.connected` | WhatsApp connection established |
| `connection.disconnected` | WhatsApp connection lost (includes reason and reconnect status) |

### Webhook Payloads

**message.received:**
```json
{
  "event": "message.received",
  "data": {
    "id": "c3cc63db-cc08-488d-9824-e45fb5e93de6",
    "phone": "919740333323@s.whatsapp.net",
    "message": "Hello, I need help",
    "mediaType": null,
    "mediaUrl": null,
    "timestamp": "2025-12-11T07:30:04.000Z"
  }
}
```

**message.sent:**
```json
{
  "event": "message.sent",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "phone": "919740333323@s.whatsapp.net",
    "message": "Thank you for your message!",
    "inReplyTo": "c3cc63db-cc08-488d-9824-e45fb5e93de6",
    "timestamp": "2025-12-11T07:31:15.000Z"
  }
}
```

**connection.connected:**
```json
{
  "event": "connection.connected",
  "data": {
    "timestamp": "2025-12-11T07:25:00.000Z"
  }
}
```

**connection.disconnected:**
```json
{
  "event": "connection.disconnected",
  "data": {
    "reason": "logged out",
    "willReconnect": false,
    "timestamp": "2025-12-11T09:45:00.000Z"
  }
}
```

### Signature Verification

When a webhook secret is configured, requests include an HMAC-SHA256 signature:

**Header:** `X-Webhook-Signature: sha256=<hex_digest>`

**Verification (Node.js):**
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

// Express middleware example
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = 'your-webhook-secret';

  if (!verifyWebhookSignature(req.body, signature, secret)) {
    return res.status(401).send('Invalid signature');
  }

  const payload = JSON.parse(req.body);
  // Process webhook...
  res.status(200).send('OK');
});
```

### Delivery Behavior

- **Retry Logic:** 3 attempts with exponential backoff (1s, 2s, 4s)
- **Timeout:** 10 seconds per attempt
- **Queue:** In-memory (pending webhooks lost on server restart)
- **Ordering:** FIFO (First In, First Out)

---

## Phone Number Format

WhatsApp uses JID (Jabber ID) format:

```
{country_code}{phone_number}@s.whatsapp.net
```

**Examples:**
- India: `919740333323@s.whatsapp.net`
- US: `14155551234@s.whatsapp.net`
- UK: `447911123456@s.whatsapp.net`

---

## Workflow Example

### 1. Check Connection Status

```bash
curl -H "X-API-Key: your-api-key" http://localhost:3001/api/v1/status
```

### 2. Poll for New Messages

```bash
curl -H "X-API-Key: your-api-key" http://localhost:3001/api/v1/inbox
```

### 3. Process and Reply

```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "Thanks for contacting us!"}' \
  http://localhost:3001/api/v1/messages/{message-id}/reply
```

### 4. Mark as Read/Ignored

```bash
# Single message
curl -X PATCH \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "read"}' \
  http://localhost:3001/api/v1/messages/{message-id}/status

# Multiple messages
curl -X PATCH \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["id1", "id2"], "status": "ignored"}' \
  http://localhost:3001/api/v1/messages/batch/status
```

---

## Advanced Workflows

### Automated Reply Bot

```bash
#!/bin/bash
API_KEY="your-api-key"
BASE_URL="http://localhost:3001/api/v1"

while true; do
  # Get unread messages
  MESSAGES=$(curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/inbox/unread")

  # Process each message
  echo "$MESSAGES" | jq -r '.messages[].id' | while read MSG_ID; do
    # Send automated reply
    curl -X POST \
      -H "X-API-Key: $API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"message": "Thank you! We received your message."}' \
      "$BASE_URL/messages/$MSG_ID/reply"
  done

  sleep 30  # Poll every 30 seconds
done
```

### Webhook-Based Integration

Set up a webhook endpoint to receive real-time notifications:

```javascript
const express = require('express');
const app = express();

app.post('/webhook', express.json(), (req, res) => {
  const { event, data } = req.body;

  if (event === 'message.received') {
    console.log('New message:', data);
    // Process message, trigger automation, etc.
  }

  res.status(200).send('OK');
});

app.listen(3002, () => console.log('Webhook server running on port 3002'));
```

---

## Error Codes

| HTTP Code | Description |
|-----------|-------------|
| 200 | Success |
| 400 | Bad Request (invalid input) |
| 401 | Unauthorized (invalid/missing API key) |
| 404 | Not Found (message doesn't exist) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |
| 503 | Service Unavailable (WhatsApp disconnected) |

---

## Dashboard

Access the web dashboard at `http://localhost:3001` (or your domain) with HTTP Basic Auth.

**Default Credentials:**
- Username: `admin`
- Password: `admin123`

**Features:**
- **Inbox** (`/`) - View, search, and filter messages with pagination
- **Reply** (`/reply/:id`) - Send replies to messages
- **Connection Status** (`/status`) - View WhatsApp connection state
- **QR Login** (`/login`) - Scan QR code to authenticate WhatsApp
- **Webhook Management** (`/webhooks`) - Create, edit, and manage webhooks
- **Settings** (`/settings`) - View API documentation and regenerate API key
- **Audit Logs** (`/audit-logs`) - View all API activity and changes

**Technology:** Astro SSR with Tailwind CSS (minimal JavaScript, fast performance)

---

## Media Files

Media files (images, videos, documents, etc.) are stored locally and served at `/media/:filename`.

**Access:**
- Dashboard users: Accessible via HTTP Basic Auth
- API users: Include media URLs in webhook/API responses

**Supported Media Types:**
- `image` - JPG, PNG, WebP (downloaded from WhatsApp)
- `video` - MP4, MKV
- `document` - PDF, DOCX, XLSX, etc.
- `sticker` - WebP stickers
- `location` - Stored as text coordinates
- `contact` - vCard format

**Storage Path:** Configurable via `MEDIA_PATH` environment variable (default: `./media`)

---

## Rate Limiting Best Practices

**Limits:**
- 100 requests/minute per API key
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**Recommendations:**
1. **Polling:** Use 30-60 second intervals for `/inbox` polling
2. **Webhooks:** Preferred over polling for real-time updates
3. **Batch Operations:** Use `/messages/batch/status` for bulk updates
4. **Caching:** Cache `/status` responses (connection state changes infrequently)
5. **Retry Logic:** Implement exponential backoff on 429 errors

---

## Security Considerations

**API Key Management:**
- Store API keys securely (environment variables, secret managers)
- Regenerate keys periodically via dashboard (`/settings`)
- Never commit keys to version control
- Use HTTPS in production

**Webhook Security:**
- Always configure webhook secrets
- Verify HMAC signatures on webhook endpoints
- Use HTTPS endpoints only
- Validate webhook URLs before adding

**Network Security:**
- Use firewall rules to restrict API access
- Enable HTTPS/TLS in production
- Consider API key rotation policies
- Monitor audit logs for suspicious activity

---

## Troubleshooting

**WhatsApp Not Connected (503 errors):**
1. Check `/api/v1/health` - should return `{"status": "connected"}`
2. Visit `/login` in dashboard to scan QR code
3. Check server logs for connection errors
4. Verify session files exist in `SESSION_PATH`

**Rate Limited (429 errors):**
- Check `X-RateLimit-Reset` header for reset time
- Implement exponential backoff
- Reduce polling frequency
- Use webhooks instead of polling

**Message Not Found (404 errors):**
- Verify message ID is a valid UUID
- Check message exists in database
- Ensure message wasn't deleted

**Authentication Failed (401 errors):**
- Verify API key is correct
- Check `X-API-Key` header is set
- Regenerate API key if compromised
- Ensure API key is active in database

---

## Related Documentation

- **[PRD.md](./PRD.md)** - Business requirements and product features
- **[DESIGN.md](./DESIGN.md)** - Architecture and design decisions
- **[IMPLEMENTATION.md](./IMPLEMENTATION.md)** - Implementation details and code examples
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history
- **[README.md](./README.md)** - Getting started guide
- **[CLAUDE.md](./CLAUDE.md)** - Developer quick reference

---

## Support

For issues or questions:
- Check the [DESIGN.md](./DESIGN.md) for architecture details
- Review audit logs in the dashboard
- Check server logs via `docker service logs` or `pm2 logs`
- Contact the API administrator
