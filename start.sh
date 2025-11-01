#!/bin/bash

# SynapseAI Bot Startup Script
# This script helps you quickly start the bot on your droplet

echo "🤖 SynapseAI Bot Startup Script"
echo "================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and configure your bot token:"
    echo "  cp .env.example .env"
    echo "  nano .env"
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Ask user how they want to run the bot
echo "How would you like to run the bot?"
echo "1) Run in foreground (for testing)"
echo "2) Run with PM2 (recommended for production)"
echo "3) Install as systemd service"
echo ""
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo "🚀 Starting bot in foreground..."
        echo "Press Ctrl+C to stop"
        node index.js
        ;;
    2)
        # Check if PM2 is installed
        if ! command -v pm2 &> /dev/null; then
            echo "📦 PM2 not found. Installing PM2..."
            npm install -g pm2
        fi
        
        echo "🚀 Starting bot with PM2..."
        pm2 start ecosystem.config.js
        
        echo ""
        echo "✅ Bot started successfully!"
        echo ""
        echo "Useful commands:"
        echo "  pm2 status                 - Check bot status"
        echo "  pm2 logs synapseai-bot     - View logs"
        echo "  pm2 restart synapseai-bot  - Restart bot"
        echo "  pm2 stop synapseai-bot     - Stop bot"
        echo ""
        echo "To make PM2 start on boot:"
        echo "  pm2 startup systemd"
        echo "  pm2 save"
        ;;
    3)
        if [ "$EUID" -ne 0 ]; then
            echo "❌ Error: Installing systemd service requires root privileges"
            echo "Please run: sudo ./start.sh"
            exit 1
        fi
        
        echo "📋 Installing systemd service..."
        cp synapseai-bot.service /etc/systemd/system/
        systemctl daemon-reload
        systemctl enable synapseai-bot.service
        systemctl start synapseai-bot.service
        
        echo ""
        echo "✅ Service installed and started!"
        echo ""
        echo "Useful commands:"
        echo "  systemctl status synapseai-bot   - Check status"
        echo "  systemctl restart synapseai-bot  - Restart bot"
        echo "  systemctl stop synapseai-bot     - Stop bot"
        echo "  journalctl -u synapseai-bot -f   - View logs"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac
