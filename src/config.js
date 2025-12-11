require("dotenv").config();

const config = {
  PORT: process.env.PORT || 3001,
  API_KEY: process.env.API_KEY, // Optional - will auto-generate if not provided
  DB_PATH: process.env.DB_PATH || "./messages.db",
  SESSION_PATH: process.env.SESSION_PATH || "./session",
  DASHBOARD_USER: process.env.DASHBOARD_USER || "admin",
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || "admin123",
  isTestEnv: process.env.NODE_ENV === "test",
};

module.exports = config;
