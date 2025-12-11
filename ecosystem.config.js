module.exports = {
  apps: [{
    name: 'whatsapp-api',
    script: 'app.js',
    // Environment variables are loaded from .env file via dotenv
    // Only override here if you need PM2-specific values
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
