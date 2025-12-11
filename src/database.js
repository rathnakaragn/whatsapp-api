const Database = require("better-sqlite3");
const crypto = require("crypto");

function createDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      reply_status TEXT DEFAULT 'unread',
      media_type TEXT,
      media_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(reply_status);
    CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY,
      key TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      events TEXT NOT NULL,
      secret TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

// API Key Management
function generateApiKey() {
  return crypto.randomBytes(32).toString("base64");
}

function getActiveApiKey(database) {
  const row = database.prepare("SELECT key FROM api_keys ORDER BY id DESC LIMIT 1").get();
  return row ? row.key : null;
}

function createNewApiKey(database) {
  const newKey = generateApiKey();
  database.prepare("INSERT INTO api_keys (key) VALUES (?)").run(newKey);
  return newKey;
}

function initApiKey(database, envKey) {
  let activeKey = getActiveApiKey(database);
  if (!activeKey && envKey) {
    database.prepare("INSERT INTO api_keys (key) VALUES (?)").run(envKey);
    activeKey = envKey;
  } else if (!activeKey) {
    activeKey = createNewApiKey(database);
  }
  return activeKey;
}

// Message operations with pagination and search
function getMessages(database, options = {}) {
  const { status = "unread", page = 1, limit = 50, search = "", phone = "", startDate = "", endDate = "" } = options;

  let query = "SELECT * FROM messages WHERE direction = ?";
  const params = ["incoming"];

  if (status !== "all") {
    query += " AND reply_status = ?";
    params.push(status);
  }

  if (search) {
    query += " AND message LIKE ?";
    params.push(`%${search}%`);
  }

  if (phone) {
    query += " AND phone LIKE ?";
    params.push(`%${phone}%`);
  }

  if (startDate) {
    query += " AND created_at >= ?";
    params.push(startDate);
  }

  if (endDate) {
    query += " AND created_at <= ?";
    params.push(endDate);
  }

  // Get total count
  const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
  const totalResult = database.prepare(countQuery).get(...params);
  const total = totalResult.total;

  // Add pagination
  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, (page - 1) * limit);

  const messages = database.prepare(query).all(...params);

  return {
    messages,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

function getMessage(database, id) {
  return database.prepare("SELECT * FROM messages WHERE id = ?").get(id);
}

function updateMessageStatus(database, id, status) {
  return database.prepare("UPDATE messages SET reply_status = ? WHERE id = ?").run(status, id);
}

function updateMessageStatusBatch(database, ids, status) {
  const placeholders = ids.map(() => "?").join(",");
  return database
    .prepare(`UPDATE messages SET reply_status = ? WHERE id IN (${placeholders})`)
    .run(status, ...ids);
}

function insertMessage(database, id, direction, phone, message, status = "unread", mediaType = null, mediaUrl = null) {
  return database
    .prepare("INSERT INTO messages (id, direction, phone, message, reply_status, media_type, media_url) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, direction, phone, message, status, mediaType, mediaUrl);
}

// Webhook operations
function getWebhooks(database) {
  return database.prepare("SELECT * FROM webhooks ORDER BY created_at DESC").all();
}

function getActiveWebhooks(database, event) {
  return database
    .prepare("SELECT * FROM webhooks WHERE active = 1 AND events LIKE ?")
    .all(`%${event}%`);
}

function createWebhook(database, url, events, secret = null) {
  const eventsStr = Array.isArray(events) ? events.join(",") : events;
  return database
    .prepare("INSERT INTO webhooks (url, events, secret) VALUES (?, ?, ?)")
    .run(url, eventsStr, secret);
}

function updateWebhook(database, id, url, events, active) {
  const eventsStr = Array.isArray(events) ? events.join(",") : events;
  return database
    .prepare("UPDATE webhooks SET url = ?, events = ?, active = ? WHERE id = ?")
    .run(url, eventsStr, active ? 1 : 0, id);
}

function deleteWebhook(database, id) {
  return database.prepare("DELETE FROM webhooks WHERE id = ?").run(id);
}

// Audit log operations
function insertAuditLog(database, action, details = null, ipAddress = null) {
  return database
    .prepare("INSERT INTO audit_logs (action, details, ip_address) VALUES (?, ?, ?)")
    .run(action, details ? JSON.stringify(details) : null, ipAddress);
}

function getAuditLogs(database, limit = 100, offset = 0) {
  return database
    .prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset);
}

// Settings operations
function getSetting(database, key) {
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setSetting(database, key, value) {
  return database
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(key, value);
}

// Export messages
function exportMessages(database, format = "json", options = {}) {
  const { status = "all", startDate = "", endDate = "" } = options;

  let query = "SELECT * FROM messages WHERE 1=1";
  const params = [];

  if (status !== "all") {
    query += " AND reply_status = ?";
    params.push(status);
  }

  if (startDate) {
    query += " AND created_at >= ?";
    params.push(startDate);
  }

  if (endDate) {
    query += " AND created_at <= ?";
    params.push(endDate);
  }

  query += " ORDER BY created_at DESC";

  return database.prepare(query).all(...params);
}

module.exports = {
  createDatabase,
  generateApiKey,
  getActiveApiKey,
  createNewApiKey,
  initApiKey,
  getMessages,
  getMessage,
  updateMessageStatus,
  updateMessageStatusBatch,
  insertMessage,
  getWebhooks,
  getActiveWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  insertAuditLog,
  getAuditLogs,
  getSetting,
  setSetting,
  exportMessages,
};
