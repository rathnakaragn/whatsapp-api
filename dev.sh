#!/bin/bash

set -e

echo "================================"
echo "  WhatsApp API - Dev Setup"
echo "================================"

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18+ required"
  exit 1
fi
echo "✓ Node.js $(node -v)"

# Install backend dependencies
if [ ! -d "node_modules" ]; then
  echo "Installing backend dependencies..."
  npm install
else
  echo "✓ Backend dependencies installed"
fi

# Install and build Astro dashboard
if [ ! -d "dashboard/dist" ]; then
  echo "Building Astro dashboard..."
  cd dashboard
  npm install
  npm run build
  cd ..
else
  echo "✓ Dashboard already built"
fi

# Create .env if not exists
if [ ! -f ".env" ]; then
  echo "Creating .env file..."
  cat > .env << EOF
PORT=3001
DB_PATH=./messages.db
SESSION_PATH=./session
MEDIA_PATH=./media
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=admin123
EOF
  echo "✓ Created .env with defaults"
else
  echo "✓ .env exists"
fi

# Create directories
mkdir -p session media

echo ""
echo "================================"
echo "  Starting server..."
echo "================================"
echo ""

npm start
