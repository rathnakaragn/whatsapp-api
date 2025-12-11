const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

describe('Database Operations', () => {
  let db;
  const testDbPath = path.join(__dirname, 'test-messages.db');

  beforeAll(() => {
    // Create test database
    db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        direction TEXT NOT NULL,
        phone TEXT NOT NULL,
        message TEXT NOT NULL,
        reply_status TEXT DEFAULT 'unread',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(reply_status);
    `);
  });

  afterAll(() => {
    db.close();
    // Clean up test database files
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  });

  beforeEach(() => {
    // Clear messages table before each test
    db.exec('DELETE FROM messages');
  });

  describe('Insert Operations', () => {
    test('should insert incoming message with default unread status', () => {
      const id = uuidv4();
      const phone = '1234567890@s.whatsapp.net';
      const message = 'Hello World';

      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(id, 'incoming', phone, message);

      const result = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      expect(result).toBeDefined();
      expect(result.id).toBe(id);
      expect(result.direction).toBe('incoming');
      expect(result.phone).toBe(phone);
      expect(result.message).toBe(message);
      expect(result.reply_status).toBe('unread');
      expect(result.created_at).toBeDefined();
    });

    test('should insert outgoing message with custom status', () => {
      const id = uuidv4();
      const phone = '1234567890@s.whatsapp.net';
      const message = 'Reply message';

      db.prepare('INSERT INTO messages (id, direction, phone, message, reply_status) VALUES (?, ?, ?, ?, ?)').run(id, 'outgoing', phone, message, 'sent');

      const result = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      expect(result.direction).toBe('outgoing');
      expect(result.reply_status).toBe('sent');
    });

    test('should reject duplicate primary key', () => {
      const id = uuidv4();
      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(id, 'incoming', 'phone1', 'msg1');

      expect(() => {
        db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(id, 'incoming', 'phone2', 'msg2');
      }).toThrow();
    });

    test('should handle special characters in message', () => {
      const id = uuidv4();
      const message = "Hello! 👋 This has 'quotes' and \"double quotes\" and émojis 🎉";

      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(id, 'incoming', 'phone', message);

      const result = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      expect(result.message).toBe(message);
    });

    test('should handle very long messages', () => {
      const id = uuidv4();
      const message = 'A'.repeat(10000);

      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(id, 'incoming', 'phone', message);

      const result = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      expect(result.message.length).toBe(10000);
    });
  });

  describe('Query Operations', () => {
    beforeEach(() => {
      // Insert test data
      const messages = [
        { id: 'msg1', direction: 'incoming', phone: 'phone1', message: 'Unread 1', status: 'unread' },
        { id: 'msg2', direction: 'incoming', phone: 'phone2', message: 'Unread 2', status: 'unread' },
        { id: 'msg3', direction: 'incoming', phone: 'phone1', message: 'Read 1', status: 'read' },
        { id: 'msg4', direction: 'incoming', phone: 'phone2', message: 'Replied 1', status: 'replied' },
        { id: 'msg5', direction: 'outgoing', phone: 'phone1', message: 'Outgoing 1', status: 'sent' },
        { id: 'msg6', direction: 'incoming', phone: 'phone3', message: 'Ignored 1', status: 'ignored' },
      ];

      for (const msg of messages) {
        db.prepare('INSERT INTO messages (id, direction, phone, message, reply_status) VALUES (?, ?, ?, ?, ?)').run(msg.id, msg.direction, msg.phone, msg.message, msg.status);
      }
    });

    test('should get all incoming messages', () => {
      const result = db.prepare('SELECT * FROM messages WHERE direction = ? ORDER BY created_at DESC').all('incoming');
      expect(result.length).toBe(5);
    });

    test('should get unread messages only', () => {
      const result = db.prepare('SELECT * FROM messages WHERE direction = ? AND reply_status = ? ORDER BY created_at DESC').all('incoming', 'unread');
      expect(result.length).toBe(2);
      expect(result.every(m => m.reply_status === 'unread')).toBe(true);
    });

    test('should get read messages only', () => {
      const result = db.prepare('SELECT * FROM messages WHERE direction = ? AND reply_status = ? ORDER BY created_at DESC').all('incoming', 'read');
      expect(result.length).toBe(1);
      expect(result[0].message).toBe('Read 1');
    });

    test('should get replied messages only', () => {
      const result = db.prepare('SELECT * FROM messages WHERE direction = ? AND reply_status = ? ORDER BY created_at DESC').all('incoming', 'replied');
      expect(result.length).toBe(1);
    });

    test('should get message by id', () => {
      const result = db.prepare('SELECT * FROM messages WHERE id = ?').get('msg1');
      expect(result).toBeDefined();
      expect(result.message).toBe('Unread 1');
    });

    test('should return undefined for non-existent id', () => {
      const result = db.prepare('SELECT * FROM messages WHERE id = ?').get('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('Update Operations', () => {
    test('should update message status', () => {
      const id = uuidv4();
      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(id, 'incoming', 'phone', 'test');

      const result = db.prepare('UPDATE messages SET reply_status = ? WHERE id = ?').run('read', id);
      expect(result.changes).toBe(1);

      const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      expect(updated.reply_status).toBe('read');
    });

    test('should return 0 changes for non-existent id', () => {
      const result = db.prepare('UPDATE messages SET reply_status = ? WHERE id = ?').run('read', 'nonexistent');
      expect(result.changes).toBe(0);
    });

    test('should update status from unread to replied', () => {
      const id = uuidv4();
      db.prepare('INSERT INTO messages (id, direction, phone, message) VALUES (?, ?, ?, ?)').run(id, 'incoming', 'phone', 'test');

      db.prepare('UPDATE messages SET reply_status = ? WHERE id = ?').run('replied', id);
      const result = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      expect(result.reply_status).toBe('replied');
    });
  });

  describe('Index Performance', () => {
    test('should have index on reply_status', () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='messages'").all();
      const indexNames = indexes.map(i => i.name);
      expect(indexNames).toContain('idx_messages_status');
    });
  });
});
