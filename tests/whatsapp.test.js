const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Set test environment before requiring app
process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';

const { setState, getState, createDatabase } = require('../app');

describe('WhatsApp Integration', () => {
  let db;
  const testDbPath = path.join(__dirname, 'test-whatsapp.db');

  beforeAll(() => {
    db = createDatabase(testDbPath);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  });

  beforeEach(() => {
    db.exec('DELETE FROM messages');
    setState({ isConnected: false, qrCodeData: null, sock: null });
  });

  describe('State Management', () => {
    test('should initialize with disconnected state', () => {
      setState({ isConnected: false, qrCodeData: null, sock: null });
      const state = getState();
      expect(state.isConnected).toBe(false);
      expect(state.qrCodeData).toBeNull();
      expect(state.sock).toBeNull();
    });

    test('should update isConnected state', () => {
      setState({ isConnected: true });
      expect(getState().isConnected).toBe(true);

      setState({ isConnected: false });
      expect(getState().isConnected).toBe(false);
    });

    test('should update qrCodeData state', () => {
      const qrData = 'data:image/png;base64,test123';
      setState({ qrCodeData: qrData });
      expect(getState().qrCodeData).toBe(qrData);
    });

    test('should update sock state', () => {
      const mockSock = { sendMessage: jest.fn() };
      setState({ sock: mockSock });
      expect(getState().sock).toBe(mockSock);
    });

    test('should update multiple state properties at once', () => {
      const mockSock = { sendMessage: jest.fn() };
      setState({
        isConnected: true,
        qrCodeData: null,
        sock: mockSock
      });

      const state = getState();
      expect(state.isConnected).toBe(true);
      expect(state.qrCodeData).toBeNull();
      expect(state.sock).toBe(mockSock);
    });
  });

  describe('Message Processing Simulation', () => {
    test('should store incoming message correctly', () => {
      const id = uuidv4();
      const phone = '1234567890@s.whatsapp.net';
      const message = 'Hello from WhatsApp';

      // Simulate what happens in messages.upsert handler
      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(id, 'incoming', phone, message);

      const stored = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      expect(stored).toBeDefined();
      expect(stored.direction).toBe('incoming');
      expect(stored.phone).toBe(phone);
      expect(stored.message).toBe(message);
      expect(stored.reply_status).toBe('unread');
    });

    test('should handle group message JID format', () => {
      const id = uuidv4();
      const groupJid = '123456789-1234567890@g.us';
      const message = 'Group message';

      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(id, 'incoming', groupJid, message);

      const stored = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      expect(stored.phone).toBe(groupJid);
    });

    test('should handle individual message JID format', () => {
      const id = uuidv4();
      const individualJid = '1234567890@s.whatsapp.net';
      const message = 'Individual message';

      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(id, 'incoming', individualJid, message);

      const stored = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      expect(stored.phone).toBe(individualJid);
    });

    test('should extract text from conversation message', () => {
      // Simulate message extraction logic
      const msg = {
        message: {
          conversation: 'Plain text message'
        }
      };

      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      expect(text).toBe('Plain text message');
    });

    test('should extract text from extendedTextMessage', () => {
      const msg = {
        message: {
          extendedTextMessage: {
            text: 'Extended text with link'
          }
        }
      };

      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      expect(text).toBe('Extended text with link');
    });

    test('should return empty string for non-text messages', () => {
      const msg = {
        message: {
          imageMessage: { caption: 'Image caption' }
        }
      };

      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      expect(text).toBe('');
    });

    test('should skip messages from self (fromMe)', () => {
      const msg = {
        key: { fromMe: true, remoteJid: 'phone@s.whatsapp.net' },
        message: { conversation: 'My own message' }
      };

      // Simulate the check in messages.upsert handler
      const shouldSkip = msg.key.fromMe;
      expect(shouldSkip).toBe(true);
    });

    test('should process messages from others', () => {
      const msg = {
        key: { fromMe: false, remoteJid: 'phone@s.whatsapp.net' },
        message: { conversation: 'Message from contact' }
      };

      const shouldSkip = msg.key.fromMe;
      expect(shouldSkip).toBe(false);
    });
  });

  describe('Reply Processing Simulation', () => {
    test('should update original message status on reply', () => {
      const originalId = uuidv4();
      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(originalId, 'incoming', 'phone@s.whatsapp.net', 'Original');

      // Simulate reply
      db.prepare('UPDATE messages SET reply_status = ? WHERE id = ?').run('replied', originalId);

      const original = db.prepare('SELECT * FROM messages WHERE id = ?').get(originalId);
      expect(original.reply_status).toBe('replied');
    });

    test('should save outgoing message on reply', () => {
      const originalId = uuidv4();
      const originalPhone = 'phone@s.whatsapp.net';
      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(originalId, 'incoming', originalPhone, 'Original');

      // Simulate reply
      const replyId = uuidv4();
      const replyMessage = 'This is my reply';
      db.prepare('INSERT INTO messages (id, direction, phone, message, reply_status) VALUES (?, ?, ?, ?, ?)').run(replyId, 'outgoing', originalPhone, replyMessage, 'sent');

      const reply = db.prepare('SELECT * FROM messages WHERE id = ?').get(replyId);
      expect(reply.direction).toBe('outgoing');
      expect(reply.phone).toBe(originalPhone);
      expect(reply.message).toBe(replyMessage);
      expect(reply.reply_status).toBe('sent');
    });
  });

  describe('Connection State Transitions', () => {
    test('should transition from disconnected to QR ready', () => {
      setState({ isConnected: false, qrCodeData: null });

      // Simulate QR code generation
      const qrData = 'data:image/png;base64,qrcode123';
      setState({ qrCodeData: qrData, isConnected: false });

      const state = getState();
      expect(state.isConnected).toBe(false);
      expect(state.qrCodeData).toBe(qrData);
    });

    test('should transition from QR ready to connected', () => {
      setState({ isConnected: false, qrCodeData: 'data:image/png;base64,qr' });

      // Simulate connection open
      setState({ isConnected: true, qrCodeData: null });

      const state = getState();
      expect(state.isConnected).toBe(true);
      expect(state.qrCodeData).toBeNull();
    });

    test('should transition from connected to disconnected', () => {
      setState({ isConnected: true, qrCodeData: null });

      // Simulate connection close
      setState({ isConnected: false });

      expect(getState().isConnected).toBe(false);
    });

    test('should handle logout transition', () => {
      const mockSock = { logout: jest.fn() };
      setState({ isConnected: true, sock: mockSock, qrCodeData: null });

      // Simulate logout
      setState({ isConnected: false, sock: null, qrCodeData: null });

      const state = getState();
      expect(state.isConnected).toBe(false);
      expect(state.sock).toBeNull();
      expect(state.qrCodeData).toBeNull();
    });
  });

  describe('Mock Socket Operations', () => {
    test('should mock sendMessage successfully', async () => {
      const mockSock = {
        sendMessage: jest.fn().mockResolvedValue({ status: 1 })
      };
      setState({ sock: mockSock, isConnected: true });

      const result = await mockSock.sendMessage('phone@s.whatsapp.net', { text: 'Test' });

      expect(mockSock.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockSock.sendMessage).toHaveBeenCalledWith('phone@s.whatsapp.net', { text: 'Test' });
      expect(result.status).toBe(1);
    });

    test('should mock sendMessage failure', async () => {
      const mockSock = {
        sendMessage: jest.fn().mockRejectedValue(new Error('Network error'))
      };
      setState({ sock: mockSock, isConnected: true });

      await expect(mockSock.sendMessage('phone@s.whatsapp.net', { text: 'Test' }))
        .rejects.toThrow('Network error');
    });

    test('should mock logout successfully', async () => {
      const mockSock = {
        logout: jest.fn().mockResolvedValue({})
      };
      setState({ sock: mockSock, isConnected: true });

      await mockSock.logout();
      expect(mockSock.logout).toHaveBeenCalledTimes(1);
    });

    test('should mock logout failure', async () => {
      const mockSock = {
        logout: jest.fn().mockRejectedValue(new Error('Logout error'))
      };
      setState({ sock: mockSock, isConnected: true });

      await expect(mockSock.logout()).rejects.toThrow('Logout error');
    });
  });
});
