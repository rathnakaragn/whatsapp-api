const crypto = require("crypto");
const { getActiveApiKey } = require("../database");
const { DASHBOARD_USER, DASHBOARD_PASSWORD } = require("../config");

// API key authentication middleware
function createApiAuth(database) {
  return function auth(req, res, next) {
    const activeKey = getActiveApiKey(database);
    const providedKey = req.headers["x-api-key"] || req.query.api_key;

    // A constant-time comparison is used to prevent timing attacks.
    const keyBuffer = Buffer.from(activeKey);
    const providedKeyBuffer = Buffer.from(providedKey || "");
    
    let match = false;
    try {
      match = crypto.timingSafeEqual(keyBuffer, providedKeyBuffer);
    } catch {
      // Ignore errors from different buffer lengths
    }

    if (match) return next();
    
    // For security, a dummy comparison is performed when the keys don't match.
    // This ensures that the response time is consistent, whether the key is valid or not.
    try {
      crypto.timingSafeEqual(keyBuffer, keyBuffer);
    } catch {}

    res.status(401).json({ error: "Unauthorized" });
  };
}

// Dashboard Basic Auth middleware for Astro SSR dashboard
function dashboardAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="WhatsApp Dashboard"');
    return res.status(401).send("Authentication required");
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf8");
  const [username, password] = credentials.split(":");

  // Constant-time comparison for credentials
  const userBuffer = Buffer.from(username || "");
  const passwordBuffer = Buffer.from(password || "");
  const expectedUserBuffer = Buffer.from(DASHBOARD_USER);
  const expectedPasswordBuffer = Buffer.from(DASHBOARD_PASSWORD);
  
  let userMatch = false;
  try {
    userMatch = crypto.timingSafeEqual(userBuffer, expectedUserBuffer);
  } catch {
    //
  }
  
  let passwordMatch = false;
  try {
    passwordMatch = crypto.timingSafeEqual(passwordBuffer, expectedPasswordBuffer);
  } catch {
    //
  }

  if (userMatch && passwordMatch) {
    return next();
  }

  // Dummy comparison for consistent response time
  try {
    crypto.timingSafeEqual(expectedUserBuffer, expectedUserBuffer);
    crypto.timingSafeEqual(expectedPasswordBuffer, expectedPasswordBuffer);
  } catch {}

  res.setHeader("WWW-Authenticate", 'Basic realm="WhatsApp Dashboard"');
  return res.status(401).send("Invalid credentials");
}

module.exports = {
  createApiAuth,
  dashboardAuth,
};
