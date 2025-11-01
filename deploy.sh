#!/bin/bash

# Deployment script for DigitalOcean server
# Run this on your DigitalOcean server after pulling the latest code

echo "🚀 Deploying SynapseAI Bot to DigitalOcean..."

# Navigate to bot directory
cd /opt/synapseai-bot || exit 1

# Pull latest changes from git
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Restart PM2 process
echo "🔄 Restarting bot with PM2..."
pm2 restart synapseai-bot || pm2 start dist/index.js --name synapseai-bot

# Save PM2 configuration
pm2 save

# Show status
echo "✅ Deployment complete!"
echo ""
pm2 status
echo ""
pm2 logs synapseai-bot --lines 20
