const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getMessages, getMessage, updateMessageStatus, updateMessageStatusBatch, insertMessage, getWebhooks } = require("../database");
const { getIsConnected, getSock } = require("../state");
const { triggerWebhooks } = require("../webhook");

function createApiRoutes(database, auth) {
  const router = express.Router();

  // Health (no auth)
  router.get("/health", (req, res) => {
    res.json({ status: getIsConnected() ? "connected" : "disconnected" });
  });

  // Status
  router.get("/status", auth, (req, res) => {
    const fs = require("fs");
    const { SESSION_PATH } = require("../config");
    res.json({
      connected: getIsConnected(),
      qrReady: !!require("../state").getQrCodeData(),
      sessionExists: fs.existsSync(SESSION_PATH),
    });
  });

  // Inbox with pagination and search
  router.get("/inbox/:status?", auth, (req, res) => {
    const status = req.params.status || "unread";
    let { page = 1, limit = 50, search = "", phone = "", startDate = "", endDate = "" } = req.query;

    // Validate and sanitize pagination parameters
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (isNaN(page) || page < 1) {
      page = 1;
    }
    if (isNaN(limit) || limit < 1) {
      limit = 1;
    } else if (limit > 100) {
      limit = 100;
    }

    const result = getMessages(database, {
      status,
      page,
      limit,
      search,
      phone,
      startDate,
      endDate,
    });

    res.json({
      count: result.messages.length,
      messages: result.messages,
      pagination: result.pagination,
    });
  });

  // Reply
  router.post("/messages/:id/reply", auth, async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    const original = getMessage(database, req.params.id);
    if (!original) return res.status(404).json({ error: "Message not found" });

    if (!getIsConnected()) {
      return res.status(503).json({ error: "WhatsApp not connected" });
    }

    try {
      const sock = getSock();
      await sock.sendMessage(original.phone, { text: message });
      updateMessageStatus(database, req.params.id, "replied");

      const replyId = uuidv4();
      insertMessage(database, replyId, "outgoing", original.phone, message, "sent");

      // Trigger webhook for message sent
      triggerWebhooks(database, "message.sent", {
        id: replyId,
        phone: original.phone,
        message,
        inReplyTo: req.params.id,
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true, replyId });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Batch update status (must be before :id route to avoid matching)
  router.patch("/messages/batch/status", auth, (req, res) => {
    const { ids, status } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Missing or invalid ids array" });
    }
    if (!["unread", "read", "replied", "ignored", "sent"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const result = updateMessageStatusBatch(database, ids, status);
    res.json({ success: true, updated: result.changes });
  });

  // Update status
  router.patch("/messages/:id/status", auth, (req, res) => {
    const { status } = req.body;
    if (!["unread", "read", "replied", "ignored", "sent"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const result = updateMessageStatus(database, req.params.id, status);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ success: true });
  });

  // List configured webhooks
  router.get("/webhooks", auth, (req, res) => {
    const webhooks = getWebhooks(database);
    res.json({ webhooks });
  });

  return router;
}

module.exports = createApiRoutes;
