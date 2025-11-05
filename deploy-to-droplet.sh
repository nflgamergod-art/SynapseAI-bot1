#!/bin/bash

# Deploy SynapseAI Bot to DigitalOcean Droplet
# Usage: ./deploy-to-droplet.sh [DROPLET_IP]

set -euo pipefail

DROPLET_IP=${1:-"162.243.193.162"}
REPO_URL="https://github.com/nflgamergod-art/SynapseAI-bot1.git"
BOT_DIR="/opt/synapseai-bot"

echo "🚀 Deploying SynapseAI Bot to droplet: $DROPLET_IP"

# Function to run commands on the droplet
run_remote() {
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP "$@"
}

# Function to copy files to the droplet
copy_to_droplet() {
    scp -o StrictHostKeyChecking=no "$1" "root@$DROPLET_IP:$2"
}

echo "📦 Setting up the droplet..."

# Update system and install required packages
run_remote "
    apt update && apt upgrade -y
    apt install -y curl git build-essential ufw
    
    # Install Node.js 18
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    
    # Install PM2 globally
    npm install -g pm2
    
    # Setup firewall
    ufw --force enable
    ufw allow OpenSSH
"

echo "👤 Creating synapseai user..."
run_remote "
    if ! id synapseai &>/dev/null; then
        adduser --disabled-password --gecos '' synapseai
        usermod -aG sudo synapseai
    fi
"

echo "📁 Setting up bot directory..."
run_remote "
    # Create bot directory
    mkdir -p $BOT_DIR
    chown synapseai:synapseai $BOT_DIR
    
    # Clone or update repository
    if [ -d '$BOT_DIR/.git' ]; then
        cd $BOT_DIR
        sudo -u synapseai git pull origin main
    else
        sudo -u synapseai git clone $REPO_URL $BOT_DIR
    fi
    
    cd $BOT_DIR
    chown -R synapseai:synapseai .
"

echo "🔐 Setting up environment file..."
# Copy the .env file to the droplet
copy_to_droplet ".env" "/tmp/synapseai.env"
run_remote "
    mv /tmp/synapseai.env /etc/synapseai.env
    chmod 600 /etc/synapseai.env
    chown root:root /etc/synapseai.env
"

echo "📦 Installing dependencies and building..."
run_remote "
    cd $BOT_DIR
    sudo -u synapseai npm ci
    sudo -u synapseai npm run build
"

echo "⚙️ Setting up systemd service..."
run_remote "
    # Create systemd service file
    cat > /etc/systemd/system/synapseai.service << 'EOF'
[Unit]
Description=SynapseAI Discord Bot
After=network.target

[Service]
Type=simple
User=synapseai
WorkingDirectory=$BOT_DIR
EnvironmentFile=/etc/synapseai.env
ExecStart=/usr/bin/node $BOT_DIR/dist/index.js
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=600
StartLimitBurst=5

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and start service
    systemctl daemon-reload
    systemctl enable synapseai
    systemctl restart synapseai
"

echo "✅ Deployment complete!"
echo ""
echo "📊 Service status:"
run_remote "systemctl status synapseai --no-pager"
echo ""
echo "📝 Recent logs:"
run_remote "journalctl -u synapseai --no-pager -n 20"
echo ""
echo "🔗 To view live logs: ssh root@$DROPLET_IP 'journalctl -u synapseai -f'"
echo "🔄 To restart the bot: ssh root@$DROPLET_IP 'systemctl restart synapseai'"
echo "⏹️  To stop the bot: ssh root@$DROPLET_IP 'systemctl stop synapseai'"