const request = require('supertest');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Set test environment before requiring app
process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';

const { createApp, createDatabase, setState, getState } = require('../app');

describe('API Endpoints', () => {
  let app;
  let db;
  const testDbPath = path.join(__dirname, 'test-api.db');
  const TEST_API_KEY = 'test-api-key';

  beforeAll(() => {
    db = createDatabase(testDbPath);
    app = createApp(db, TEST_API_KEY);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  });

  beforeEach(() => {
    // Clear database and reset state
    db.exec('DELETE FROM messages');
    setState({ isConnected: false, qrCodeData: null, sock: null });
  });

  describe('GET /api/v1/health', () => {
    test('should return disconnected when not connected', async () => {
      setState({ isConnected: false });
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('disconnected');
    });

    test('should return connected when connected', async () => {
      setState({ isConnected: true });
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('connected');
    });
  });

  describe('GET /api/v1/status', () => {
    test('should return connection status details', async () => {
      setState({ isConnected: true, qrCodeData: null });
      const res = await request(app)
        .get('/api/v1/status')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('connected');
      expect(res.body).toHaveProperty('qrReady');
      expect(res.body).toHaveProperty('sessionExists');
      expect(res.body.connected).toBe(true);
      expect(res.body.qrReady).toBe(false);
    });

    test('should show qrReady when QR is available', async () => {
      setState({ isConnected: false, qrCodeData: 'data:image/png;base64,abc123' });
      const res = await request(app)
        .get('/api/v1/status')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.body.connected).toBe(false);
      expect(res.body.qrReady).toBe(true);
    });
  });

  describe('GET /api/v1/inbox', () => {
    beforeEach(() => {
      // Insert test messages
      const messages = [
        { id: 'msg1', direction: 'incoming', phone: 'phone1@s.whatsapp.net', message: 'Unread 1', status: 'unread' },
        { id: 'msg2', direction: 'incoming', phone: 'phone2@s.whatsapp.net', message: 'Unread 2', status: 'unread' },
        { id: 'msg3', direction: 'incoming', phone: 'phone1@s.whatsapp.net', message: 'Read 1', status: 'read' },
        { id: 'msg4', direction: 'incoming', phone: 'phone2@s.whatsapp.net', message: 'Replied 1', status: 'replied' },
        { id: 'msg5', direction: 'outgoing', phone: 'phone1@s.whatsapp.net', message: 'Outgoing 1', status: 'sent' },
        { id: 'msg6', direction: 'incoming', phone: 'phone3@s.whatsapp.net', message: 'Ignored 1', status: 'ignored' },
      ];

      for (const msg of messages) {
        db.prepare('INSERT INTO messages (id, direction, phone, message, reply_status) VALUES (?, ?, ?, ?, ?)').run(msg.id, msg.direction, msg.phone, msg.message, msg.status);
      }
    });

    test('should return unread messages by default', async () => {
      const res = await request(app)
        .get('/api/v1/inbox')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages.every(m => m.reply_status === 'unread')).toBe(true);
    });

    test('should return read messages when status is read', async () => {
      const res = await request(app)
        .get('/api/v1/inbox/read')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.messages[0].reply_status).toBe('read');
    });

    test('should return replied messages when status is replied', async () => {
      const res = await request(app)
        .get('/api/v1/inbox/replied')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.messages[0].reply_status).toBe('replied');
    });

    test('should return all incoming messages when status is all', async () => {
      const res = await request(app)
        .get('/api/v1/inbox/all')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5); // All incoming, not outgoing
      expect(res.body.messages.every(m => m.direction === 'incoming')).toBe(true);
    });

    test('should return ignored messages when status is ignored', async () => {
      const res = await request(app)
        .get('/api/v1/inbox/ignored')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.messages[0].reply_status).toBe('ignored');
    });

    test('should return empty array when no messages match', async () => {
      db.exec('DELETE FROM messages');
      const res = await request(app)
        .get('/api/v1/inbox')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.messages).toEqual([]);
    });
  });

  describe('POST /api/v1/messages/:id/reply', () => {
    let testMessageId;

    beforeEach(() => {
      testMessageId = uuidv4();
      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(testMessageId, 'incoming', 'phone1@s.whatsapp.net', 'Test message');
    });

    test('should return 400 when message body is missing', async () => {
      const res = await request(app)
        .post(`/api/v1/messages/${testMessageId}/reply`)
        .set('X-API-Key', TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing message');
    });

    test('should return 404 when message not found', async () => {
      const res = await request(app)
        .post('/api/v1/messages/nonexistent-id/reply')
        .set('X-API-Key', TEST_API_KEY)
        .send({ message: 'Reply' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Message not found');
    });

    test('should return 503 when WhatsApp not connected', async () => {
      setState({ isConnected: false });
      const res = await request(app)
        .post(`/api/v1/messages/${testMessageId}/reply`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ message: 'Reply' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('WhatsApp not connected');
    });

    test('should send reply successfully when connected', async () => {
      const mockSock = {
        sendMessage: jest.fn().mockResolvedValue({})
      };
      setState({ isConnected: true, sock: mockSock });

      const res = await request(app)
        .post(`/api/v1/messages/${testMessageId}/reply`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ message: 'Hello reply!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.replyId).toBeDefined();
      expect(mockSock.sendMessage).toHaveBeenCalledWith('phone1@s.whatsapp.net', { text: 'Hello reply!' });

      // Verify original message status updated
      const original = db.prepare('SELECT * FROM messages WHERE id = ?').get(testMessageId);
      expect(original.reply_status).toBe('replied');

      // Verify outgoing message saved
      const outgoing = db.prepare('SELECT * FROM messages WHERE id = ?').get(res.body.replyId);
      expect(outgoing.direction).toBe('outgoing');
      expect(outgoing.message).toBe('Hello reply!');
      expect(outgoing.reply_status).toBe('sent');
    });

    test('should return 500 when send fails', async () => {
      const mockSock = {
        sendMessage: jest.fn().mockRejectedValue(new Error('Send failed'))
      };
      setState({ isConnected: true, sock: mockSock });

      const res = await request(app)
        .post(`/api/v1/messages/${testMessageId}/reply`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ message: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Send failed');
    });
  });

  describe('PATCH /api/v1/messages/:id/status', () => {
    let testMessageId;

    beforeEach(() => {
      testMessageId = uuidv4();
      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(testMessageId, 'incoming', 'phone1@s.whatsapp.net', 'Test message');
    });

    test('should update status to read', async () => {
      const res = await request(app)
        .patch(`/api/v1/messages/${testMessageId}/status`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ status: 'read' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(testMessageId);
      expect(msg.reply_status).toBe('read');
    });

    test('should update status to replied', async () => {
      const res = await request(app)
        .patch(`/api/v1/messages/${testMessageId}/status`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ status: 'replied' });

      expect(res.status).toBe(200);
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(testMessageId);
      expect(msg.reply_status).toBe('replied');
    });

    test('should update status to ignored', async () => {
      const res = await request(app)
        .patch(`/api/v1/messages/${testMessageId}/status`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ status: 'ignored' });

      expect(res.status).toBe(200);
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(testMessageId);
      expect(msg.reply_status).toBe('ignored');
    });

    test('should update status back to unread', async () => {
      // First set to read
      db.prepare('UPDATE messages SET reply_status = ? WHERE id = ?').run('read', testMessageId);

      const res = await request(app)
        .patch(`/api/v1/messages/${testMessageId}/status`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ status: 'unread' });

      expect(res.status).toBe(200);
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(testMessageId);
      expect(msg.reply_status).toBe('unread');
    });

    test('should return 400 for invalid status', async () => {
      const res = await request(app)
        .patch(`/api/v1/messages/${testMessageId}/status`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid status');
    });

    test('should return 400 when status is missing', async () => {
      const res = await request(app)
        .patch(`/api/v1/messages/${testMessageId}/status`)
        .set('X-API-Key', TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid status');
    });

    test('should return 404 when message not found', async () => {
      const res = await request(app)
        .patch('/api/v1/messages/nonexistent-id/status')
        .set('X-API-Key', TEST_API_KEY)
        .send({ status: 'read' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });
  });

  describe('PATCH /api/v1/messages/batch/status', () => {
    let messageIds;

    beforeEach(() => {
      messageIds = [uuidv4(), uuidv4(), uuidv4()];
      messageIds.forEach(id => {
        db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(id, 'incoming', 'phone1@s.whatsapp.net', 'Test message');
      });
    });

    test('should update multiple messages status', async () => {
      const res = await request(app)
        .patch('/api/v1/messages/batch/status')
        .set('X-API-Key', TEST_API_KEY)
        .send({ ids: messageIds, status: 'read' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.updated).toBe(3);

      messageIds.forEach(id => {
        const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
        expect(msg.reply_status).toBe('read');
      });
    });

    test('should return 400 when ids is missing', async () => {
      const res = await request(app)
        .patch('/api/v1/messages/batch/status')
        .set('X-API-Key', TEST_API_KEY)
        .send({ status: 'read' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing or invalid ids array');
    });

    test('should return 400 when ids is empty array', async () => {
      const res = await request(app)
        .patch('/api/v1/messages/batch/status')
        .set('X-API-Key', TEST_API_KEY)
        .send({ ids: [], status: 'read' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing or invalid ids array');
    });

    test('should return 400 for invalid status', async () => {
      const res = await request(app)
        .patch('/api/v1/messages/batch/status')
        .set('X-API-Key', TEST_API_KEY)
        .send({ ids: messageIds, status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid status');
    });
  });

  describe('GET /api/v1/webhooks', () => {
    beforeEach(() => {
      db.exec('DELETE FROM webhooks');
    });

    test('should return empty array when no webhooks configured', async () => {
      const res = await request(app)
        .get('/api/v1/webhooks')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.webhooks).toEqual([]);
    });

    test('should return configured webhooks', async () => {
      db.prepare('INSERT INTO webhooks (url, events, secret, active) VALUES (?, ?, ?, ?)').run('https://example.com/webhook', 'message.received', 'secret123', 1);
      db.prepare('INSERT INTO webhooks (url, events, secret, active) VALUES (?, ?, ?, ?)').run('https://example.com/webhook2', 'message.sent', null, 0);

      const res = await request(app)
        .get('/api/v1/webhooks')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.webhooks).toHaveLength(2);
      expect(res.body.webhooks[0].url).toBe('https://example.com/webhook');
      expect(res.body.webhooks[0].events).toBe('message.received');
      expect(res.body.webhooks[0].active).toBe(1);
    });
  });

  describe('GET /api/v1/inbox - Pagination', () => {
    beforeEach(() => {
      db.exec('DELETE FROM messages');
      // Insert 10 test messages
      for (let i = 1; i <= 10; i++) {
        db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(`msg-${i}`, 'incoming', `phone${i}@s.whatsapp.net`, `Message ${i}`);
      }
    });

    test('should return paginated results with default limit', async () => {
      const res = await request(app)
        .get('/api/v1/inbox')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBeLessThanOrEqual(50);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.total).toBe(10);
    });

    test('should return second page when requested', async () => {
      const res = await request(app)
        .get('/api/v1/inbox?page=2&limit=5')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(5);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(5);
    });

    test('should limit results per page', async () => {
      const res = await request(app)
        .get('/api/v1/inbox?limit=3')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(3);
      expect(res.body.pagination.limit).toBe(3);
    });

    test('should enforce max limit of 100', async () => {
      const res = await request(app)
        .get('/api/v1/inbox?limit=200')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(100);
    });
  });

  describe('GET /api/v1/inbox - Filters', () => {
    beforeEach(() => {
      db.exec('DELETE FROM messages');
      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run('msg-1', 'incoming', '1234567890@s.whatsapp.net', 'Hello world');
      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run('msg-2', 'incoming', '9876543210@s.whatsapp.net', 'Test message');
      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run('msg-3', 'incoming', '1234567890@s.whatsapp.net', 'Another test');
    });

    test('should filter by search term', async () => {
      const res = await request(app)
        .get('/api/v1/inbox?search=world')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].message).toContain('world');
    });

    test('should filter by phone number', async () => {
      const res = await request(app)
        .get('/api/v1/inbox?phone=1234567890')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages[0].phone).toContain('1234567890');
    });

    test('should combine multiple filters', async () => {
      const res = await request(app)
        .get('/api/v1/inbox?phone=1234567890&search=Another')
        .set('X-API-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].message).toBe('Another test');
    });
  });
});
