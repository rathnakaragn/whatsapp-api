const express = require("express");
const path = require("path");
const config = require("./src/config");
const logger = require("./src/logger");
const { createDatabase, initApiKey, getActiveApiKey, createNewApiKey } = require("./src/database");
const { getState, setState, getIsConnected, getQrCodeData, getSock, setSock, setIsConnected, setQrCodeData } = require("./src/state");
const { createApiAuth, dashboardAuth } = require("./src/middleware/auth");
const createRateLimiter = require("./src/middleware/rateLimiter");
const createAuditLogger = require("./src/middleware/auditLog");
const createApiRoutes = require("./src/routes/api");
const connectWhatsApp = require("./src/whatsapp");

const { PORT, API_KEY, DB_PATH, SESSION_PATH, isTestEnv } = config;

// Initialize database
const db = createDatabase(DB_PATH);

// Expose shared state for Astro SSR pages via globalThis
globalThis.__whatsapp_api = {
  db,
  config,
  getIsConnected,
  getQrCodeData,
  getSock,
  setSock,
  setIsConnected,
  setQrCodeData,
  connectWhatsApp: () => connectWhatsApp(db),
};

// Create Express app
function createApp(database, initialApiKey) {
  const app = express();

  // Only parse JSON/urlencoded for API routes, not Astro routes
  // Astro's request.formData() needs the raw body
  const jsonParser = express.json();
  const urlencodedParser = express.urlencoded({ extended: true });
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return jsonParser(req, res, (err) => {
        if (err) return next(err);
        urlencodedParser(req, res, next);
      });
    }
    next();
  });

  // Initialize API key
  initApiKey(database, initialApiKey);

  // Create middleware
  const auth = createApiAuth(database);
  const rateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 100,
  });
  const auditLogger = createAuditLogger(database);

  // Apply rate limiting to API routes
  app.use("/api/v1", rateLimiter);

  // Apply audit logging
  app.use(auditLogger);

  // Mount API v1 routes (uses API key auth)
  app.use("/api/v1", createApiRoutes(database, auth));

  // Serve Astro client assets (before auth)
  const astroClientPath = path.join(__dirname, "dashboard", "dist", "client");
  app.use("/_astro", express.static(path.join(astroClientPath, "_astro")));
  app.use("/favicon.svg", express.static(path.join(astroClientPath, "favicon.svg")));

  // Serve media files (protected by Basic Auth)
  const mediaPath = process.env.MEDIA_PATH || "./media";
  app.use("/media", dashboardAuth, express.static(mediaPath));

  // Astro SSR handler placeholder
  app.astroHandler = null;

  // Dashboard routes - protected by Basic Auth, handled by Astro
  app.use(dashboardAuth, (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
      return next();
    }

    // If Astro handler not ready, show loading message
    if (!app.astroHandler) {
      return res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
            <div style="text-align: center;">
              <h2>Loading dashboard...</h2>
              <p>Please refresh in a moment.</p>
            </div>
          </body>
        </html>
      `);
    }

    // Inject locals for Astro pages using Astro's symbol
    const locals = {
      db: database,
      isConnected: getIsConnected(),
      qrCodeData: getQrCodeData(),
      sessionPath: SESSION_PATH,
      sock: getSock(),
      setSock,
      setIsConnected,
      setQrCodeData,
      connectWhatsApp: () => connectWhatsApp(database),
    };

    // Set locals using both methods for compatibility
    req.locals = locals;
    req[Symbol.for('astro.locals')] = locals;

    // Pass to Astro handler
    app.astroHandler(req, res, next);
  });

  return app;
}

// Setup Astro SSR handler
async function setupAstro(app) {
  try {
    const { handler } = await import('./dashboard/dist/server/entry.mjs');
    app.astroHandler = handler;
    logger.info("Astro SSR dashboard loaded");
  } catch (e) {
    logger.error({ error: e.message }, "Failed to load Astro dashboard - run 'npm run build' in dashboard folder");
  }
}

// Exports for testing
module.exports = {
  createApp,
  createDatabase,
  getState,
  setState,
  connectWhatsApp: () => connectWhatsApp(db),
  db,
  getActiveApiKey,
  createNewApiKey,
  initApiKey,
};

// Start server
if (!isTestEnv) {
  const app = createApp(db, API_KEY);
  const activeKey = getActiveApiKey(db);

  app.listen(PORT, "0.0.0.0", async () => {
    logger.info(`
╔════════════════════════════════════════════════════╗
║  WhatsApp API - http://localhost:${PORT}              ║
╠════════════════════════════════════════════════════╣
║  DASHBOARD (HTTP Basic Auth)                       ║
╠════════════════════════════════════════════════════╣
║  /                 - Inbox                         ║
║  /status           - Connection Status             ║
║  /login            - QR Code Login                 ║
║  /webhooks         - Webhook Management            ║
║  /settings         - API Documentation             ║
╠════════════════════════════════════════════════════╣
║  API v1 ENDPOINTS (X-API-Key auth)                 ║
╠════════════════════════════════════════════════════╣
║  GET  /api/v1/health              - Health check   ║
║  GET  /api/v1/status              - Conn status    ║
║  GET  /api/v1/inbox               - Unread msgs    ║
║  GET  /api/v1/inbox/all           - All messages   ║
║  POST /api/v1/messages/:id/reply  - Reply          ║
║  PATCH /api/v1/messages/:id/status - Update        ║
╚════════════════════════════════════════════════════╝
`);

    // Setup Astro SSR handler
    await setupAstro(app);

    // Connect to WhatsApp
    connectWhatsApp(db);
  });

  process.on("SIGINT", () => {
    db.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    db.close();
    process.exit(0);
  });
}
