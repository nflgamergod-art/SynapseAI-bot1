#!/bin/bash
# Deployment script for DigitalOcean droplet
# This script updates the bot on the droplet with the latest code from GitHub

set -e  # Exit on error

echo "🚀 Starting deployment to DigitalOcean droplet..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📥 Pulling latest code from GitHub (hard reset to origin/main)...${NC}"
cd /root/SynapseAI/SynapseAI-bot1
git config --global --add safe.directory /root/SynapseAI/SynapseAI-bot1 || true
git fetch --all
git reset --hard origin/main

echo -e "${YELLOW}📦 Installing dependencies with npm ci...${NC}"
npm ci

echo -e "${YELLOW}🔨 Building TypeScript...${NC}"
npm run build

echo -e "${YELLOW}🔄 Restarting PM2 process...${NC}"
pm2 restart synapseai --update-env || pm2 start dist/index.js --name synapseai

echo -e "${YELLOW}💾 Saving PM2 configuration...${NC}"
pm2 save

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}📊 Bot status:${NC}"
pm2 status synapseai

echo ""
echo -e "${GREEN}📋 Recent logs (last 20 lines):${NC}"
pm2 logs synapseai --lines 20 --nostream
