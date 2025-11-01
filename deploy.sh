#!/bin/bash

set -euo pipefail

# Deployment script for DigitalOcean server
# This script is invoked by the /redeploy slash command (executes /opt/synapseai-bot/deploy.sh)
# It is written to be idempotent and resilient to local changes.

echo "🚀 Deploying SynapseAI Bot to DigitalOcean..."

# Navigate to bot directory
cd /opt/synapseai-bot || exit 1

# Ensure the repo is considered safe by git (some environments require this)
git config --global --add safe.directory /opt/synapseai-bot || true

# Pull latest changes from git (discard any local modifications to tracked files)
echo "📥 Pulling latest code from GitHub (hard reset to origin/main)..."
git fetch --all
git reset --hard origin/main

# Install dependencies exactly as locked (prevents package-lock.json drift on servers)
echo "📦 Installing dependencies with npm ci..."
npm ci

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Restart PM2 process (reload env vars too)
echo "🔄 Restarting bot with PM2..."
# --update-env ensures any changes in .env are picked up by the running process
pm2 restart synapseai-bot --update-env || pm2 start dist/index.js --name synapseai-bot

# Save PM2 configuration
pm2 save

# Show status
echo "✅ Deployment complete!"
echo ""
pm2 status
echo ""
pm2 logs synapseai-bot --lines 20
