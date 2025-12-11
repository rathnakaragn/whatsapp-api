const { insertAuditLog } = require("../database");

function createAuditLogger(database) {
  return function auditLog(req, res, next) {
    // Skip logging for static files and health checks
    if (
      req.path.startsWith("/assets") ||
      req.path === "/api/v1/health" ||
      req.method === "GET"
    ) {
      return next();
    }

    const originalEnd = res.end;
    const startTime = Date.now();

    res.end = function (chunk, encoding) {
      res.end = originalEnd;
      res.end(chunk, encoding);

      const duration = Date.now() - startTime;
      const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

      const action = `${req.method} ${req.path}`;
      const details = {
        statusCode: res.statusCode,
        duration,
        userAgent: req.headers["user-agent"],
        body: sanitizeBody(req.body),
      };

      try {
        insertAuditLog(database, action, details, ipAddress);
      } catch (error) {
        // Don't let audit logging errors affect the request
        console.error("Audit log error:", error.message);
      }
    };

    next();
  };
}

// Remove sensitive data from request body before logging
function sanitizeBody(body) {
  if (!body) return null;

  const sanitized = { ...body };
  const sensitiveFields = ["password", "secret", "api_key", "apiKey", "token"];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}

module.exports = createAuditLogger;
