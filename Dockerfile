FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for better-sqlite3 and curl for healthcheck
RUN apk add --no-cache python3 make g++ curl

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy application source
COPY app.js ./
COPY src/ ./src/
COPY dashboard/ ./dashboard/

# Build Astro dashboard
WORKDIR /app/dashboard
RUN npm ci && npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install dependencies for better-sqlite3 and curl for healthcheck
RUN apk add --no-cache python3 make g++ curl

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application code from builder
COPY --from=builder /app/app.js ./
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/dashboard/dist/ ./dashboard/dist/
COPY --from=builder /app/dashboard/node_modules/ ./dashboard/node_modules/
COPY --from=builder /app/dashboard/package*.json ./dashboard/

# Create directories for persistent data
RUN mkdir -p /app/session /app/data /app/media

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3001/api/v1/health || exit 1

# Start application
CMD ["node", "app.js"]
