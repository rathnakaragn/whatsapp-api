const { makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require("baileys");
const qrcode = require("qrcode");
const pino = require("pino");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { SESSION_PATH } = require("./config");
const { insertMessage } = require("./database");
const { setSock, setQrCodeData, setIsConnected } = require("./state");
const { triggerWebhooks } = require("./webhook");
const logger = require("./logger");

// Ensure media directory exists
const MEDIA_PATH = process.env.MEDIA_PATH || "./media";
if (!fs.existsSync(MEDIA_PATH)) {
  fs.mkdirSync(MEDIA_PATH, { recursive: true });
}

// Extract message content and media type
function extractMessageContent(msg) {
  const message = msg.message;
  if (!message) return { text: "", mediaType: null };

  // Text messages
  if (message.conversation) {
    return { text: message.conversation, mediaType: null };
  }
  if (message.extendedTextMessage?.text) {
    return { text: message.extendedTextMessage.text, mediaType: null };
  }

  // Image messages
  if (message.imageMessage) {
    return {
      text: message.imageMessage.caption || "[Image]",
      mediaType: "image",
      mimeType: message.imageMessage.mimetype,
    };
  }

  // Video messages
  if (message.videoMessage) {
    return {
      text: message.videoMessage.caption || "[Video]",
      mediaType: "video",
      mimeType: message.videoMessage.mimetype,
    };
  }

  // Document messages
  if (message.documentMessage) {
    return {
      text: message.documentMessage.fileName || "[Document]",
      mediaType: "document",
      mimeType: message.documentMessage.mimetype,
    };
  }

  // Sticker messages
  if (message.stickerMessage) {
    return { text: "[Sticker]", mediaType: "sticker" };
  }

  // Location messages
  if (message.locationMessage) {
    const loc = message.locationMessage;
    return {
      text: `[Location: ${loc.degreesLatitude}, ${loc.degreesLongitude}]`,
      mediaType: "location",
    };
  }

  // Contact messages
  if (message.contactMessage) {
    return {
      text: `[Contact: ${message.contactMessage.displayName}]`,
      mediaType: "contact",
    };
  }

  return { text: "", mediaType: null };
}

// Download and save media
async function saveMedia(sock, msg, mediaType) {
  try {
    const buffer = await downloadMediaMessage(msg, "buffer", {});
    const ext = getExtension(mediaType, msg.message);
    const filename = `${uuidv4()}.${ext}`;
    const filepath = path.join(MEDIA_PATH, filename);
    fs.writeFileSync(filepath, buffer);
    return `/media/${filename}`;
  } catch (error) {
    logger.warn(
      {
        error: error.message,
        msgId: msg.key.id,
        mediaType,
      },
      "Failed to download media"
    );
    return null;
  }
}

function getExtension(mediaType, message) {
  const mimeMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
  };

  let mimetype;
  if (message.imageMessage) mimetype = message.imageMessage.mimetype;
  else if (message.videoMessage) mimetype = message.videoMessage.mimetype;
  else if (message.documentMessage) {
    const filename = message.documentMessage.fileName;
    if (filename) return filename.split(".").pop() || "bin";
    mimetype = message.documentMessage.mimetype;
  }
  else if (message.stickerMessage) return "webp";

  return mimeMap[mimetype] || "bin";
}

async function connectWhatsApp(database) {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["WhatsApp API", "Chrome", "120.0.0"],
  });

  setSock(sock);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrCodeData = await qrcode.toDataURL(qr);
      setQrCodeData(qrCodeData);
      setIsConnected(false);
      logger.info("QR Code ready - scan to connect");
    }

    if (connection === "close") {
      setIsConnected(false);
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      // Trigger webhook for disconnection
      triggerWebhooks(database, "connection.disconnected", {
        reason: lastDisconnect?.error?.message || "unknown",
        willReconnect: shouldReconnect,
      });

      if (shouldReconnect) {
        setTimeout(() => connectWhatsApp(database), 5000);
      }
    } else if (connection === "open") {
      logger.info("WhatsApp connected");
      setIsConnected(true);
      setQrCodeData(null);

      // Trigger webhook for connection
      triggerWebhooks(database, "connection.connected", {
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Receive messages
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const { text, mediaType, mimeType } = extractMessageContent(msg);
      if (!text && !mediaType) continue;

      const id = uuidv4();
      let mediaUrl = null;

      // Download media if present
      if (mediaType && ["image", "video", "document", "sticker"].includes(mediaType)) {
        mediaUrl = await saveMedia(sock, msg, mediaType);
      }

      insertMessage(database, id, "incoming", msg.key.remoteJid, text, "unread", mediaType, mediaUrl);

      const messageData = {
        id,
        phone: msg.key.remoteJid,
        message: text,
        mediaType,
        mediaUrl,
        timestamp: new Date().toISOString(),
      };

      logger.info(
        { from: msg.key.remoteJid, text: text.substring(0, 50), mediaType },
        "Message received"
      );

      // Trigger webhook for new message
      triggerWebhooks(database, "message.received", messageData);
    }
  });

  return sock;
}

module.exports = connectWhatsApp;
