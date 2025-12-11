// Simple in-memory rate limiter
const requests = new Map();

function createRateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    maxRequests = 100, // 100 requests per minute
    message = "Too many requests, please try again later",
  } = options;

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of requests) {
      if (now - data.windowStart > windowMs) {
        requests.delete(key);
      }
    }
  }, windowMs);

  return function rateLimiter(req, res, next) {
    // Use API key or IP as identifier
    const key = req.headers["x-api-key"] || req.ip || req.connection.remoteAddress;
    const now = Date.now();

    let requestData = requests.get(key);

    if (!requestData || now - requestData.windowStart > windowMs) {
      // Start new window
      requestData = { count: 1, windowStart: now };
      requests.set(key, requestData);
      setRateLimitHeaders(res, maxRequests, maxRequests - 1, windowMs);
      return next();
    }

    requestData.count++;

    if (requestData.count > maxRequests) {
      const retryAfter = Math.ceil((windowMs - (now - requestData.windowStart)) / 1000);
      setRateLimitHeaders(res, maxRequests, 0, windowMs, retryAfter);
      return res.status(429).json({
        error: message,
        retryAfter,
      });
    }

    setRateLimitHeaders(res, maxRequests, maxRequests - requestData.count, windowMs);
    next();
  };
}

function setRateLimitHeaders(res, limit, remaining, windowMs, retryAfter = null) {
  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, remaining));
  res.setHeader("X-RateLimit-Reset", Date.now() + windowMs);
  if (retryAfter !== null) {
    res.setHeader("Retry-After", retryAfter);
  }
}

module.exports = createRateLimiter;
