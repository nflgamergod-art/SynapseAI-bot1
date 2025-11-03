#!/bin/bash
# Quick deployment script for droplet

echo "🚀 Deploying to droplet..."
echo ""
echo "Run these commands on your droplet:"
echo ""
echo "cd /opt/synapseai-bot"
echo "git pull origin main"
echo "npm ci"
echo "npm run build"
echo "pm2 restart synapseai-bot"
echo ""
echo "Or if you have the deploy script already:"
echo "./deploy.sh"
