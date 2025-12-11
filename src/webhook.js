const crypto = require("crypto");
const logger = require("./logger");

// Queue for webhook delivery
const webhookQueue = [];
let isProcessing = false;

async function triggerWebhooks(database, event, payload) {
  const { getActiveWebhooks } = require("./database");
  const webhooks = getActiveWebhooks(database, event);

  for (const webhook of webhooks) {
    webhookQueue.push({ webhook, event, payload, retries: 0 });
  }

  processQueue();
}

async function processQueue() {
  if (isProcessing || webhookQueue.length === 0) return;

  isProcessing = true;

  while (webhookQueue.length > 0) {
    const item = webhookQueue.shift();
    await deliverWebhook(item);
  }

  isProcessing = false;
}

async function deliverWebhook(item) {
  const { webhook, event, payload, retries } = item;
  const maxRetries = 3;

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const headers = {
    "Content-Type": "application/json",
    "X-Webhook-Event": event,
  };

  // Add signature if secret is configured
  if (webhook.secret) {
    const signature = crypto
      .createHmac("sha256", webhook.secret)
      .update(body)
      .digest("hex");
    headers["X-Webhook-Signature"] = `sha256=${signature}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    logger.info({ webhookId: webhook.id, event, url: webhook.url }, "Webhook delivered");
  } catch (error) {
    logger.warn(
      { webhookId: webhook.id, event, url: webhook.url, error: error.message, retries },
      "Webhook delivery failed"
    );

    // Retry with exponential backoff
    if (retries < maxRetries) {
      const delay = Math.pow(2, retries) * 1000; // 1s, 2s, 4s
      setTimeout(() => {
        webhookQueue.push({ ...item, retries: retries + 1 });
        processQueue();
      }, delay);
    }
  }
}

// Test a webhook URL
async function testWebhook(url, secret = null) {
  const body = JSON.stringify({
    event: "test",
    timestamp: new Date().toISOString(),
    data: { message: "Test webhook delivery" },
  });

  const headers = {
    "Content-Type": "application/json",
    "X-Webhook-Event": "test",
  };

  if (secret) {
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
    headers["X-Webhook-Signature"] = `sha256=${signature}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  triggerWebhooks,
  testWebhook,
};
