# WhatsApp API Documentation

**Base URL:** `https://your-domain.com`

**API Version:** 2.0.0

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
| message | string | Message content |
| reply_status | string | Message status |
| media_type | string | Media type (image/video/audio/document) or null |
| media_url | string | Media file URL or null |
| created_at | string | Timestamp (UTC) |

**Examples:**
```bash
# Get unread messages (default)
curl -H "X-API-Key: your-api-key" https://your-domain.com/api/v1/inbox

# Get all messages with pagination
curl -H "X-API-Key: your-api-key" "https://your-domain.com/api/v1/inbox/all?page=2&limit=20"

# Search messages
curl -H "X-API-Key: your-api-key" "https://your-domain.com/api/v1/inbox/all?search=hello"

# Filter by phone and date
curl -H "X-API-Key: your-api-key" \
  "https://your-domain.com/api/v1/inbox/all?phone=919740&startDate=2025-12-01"
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

**Example:**
```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "Thank you for your message!"}' \
  https://your-domain.com/api/v1/messages/c3cc63db-cc08-488d-9824-e45fb5e93de6/reply
```

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

**Example:**
```bash
curl -X PATCH \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "read"}' \
  https://your-domain.com/api/v1/messages/c3cc63db-cc08-488d-9824-e45fb5e93de6/status
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

**Example:**
```bash
curl -X PATCH \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["uuid-1", "uuid-2"], "status": "ignored"}' \
  https://your-domain.com/api/v1/messages/batch/status
```

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

### Webhook Payload

```json
{
  "event": "message.received",
  "data": {
    "id": "uuid",
    "phone": "919740333323@s.whatsapp.net",
    "message": "Hello",
    "timestamp": "2025-12-11T07:30:04.000Z"
  }
}
```

### Signature Verification

When a webhook secret is configured, requests include an HMAC-SHA256 signature:

**Header:** `X-Webhook-Signature: sha256=...`

Verify by computing HMAC-SHA256 of the raw request body using your secret.

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
curl -H "X-API-Key: your-api-key" https://your-domain.com/api/v1/status
```

### 2. Poll for New Messages

```bash
curl -H "X-API-Key: your-api-key" https://your-domain.com/api/v1/inbox
```

### 3. Process and Reply

```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "Thanks for contacting us!"}' \
  https://your-domain.com/api/v1/messages/{message-id}/reply
```

### 4. Mark as Read/Ignored

```bash
# Single message
curl -X PATCH \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "read"}' \
  https://your-domain.com/api/v1/messages/{message-id}/status

# Multiple messages
curl -X PATCH \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["id1", "id2"], "status": "ignored"}' \
  https://your-domain.com/api/v1/messages/batch/status
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

Access the web dashboard at the root URL (`/`) with HTTP Basic Auth credentials.

**Features:**
- View and manage messages
- Reply to messages
- Scan QR code for WhatsApp login
- Configure webhooks
- Manage reply templates
- Export messages (JSON/CSV)
- View audit logs
- Regenerate API key

---

## Support

For issues or questions, contact the API administrator.
