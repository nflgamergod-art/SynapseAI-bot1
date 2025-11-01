# Deploying SynapseAI Bot to DigitalOcean Droplet

This guide will help you deploy your Discord bot to a DigitalOcean droplet and keep it running 24/7.

## Prerequisites

- A DigitalOcean droplet (Ubuntu 20.04 or later recommended)
- SSH access to your droplet
- A Discord bot token from [Discord Developer Portal](https://discord.com/developers/applications)

## Step 1: Initial Server Setup

1. **SSH into your droplet:**
   ```bash
   ssh root@your_droplet_ip
   ```

2. **Update system packages:**
   ```bash
   apt update && apt upgrade -y
   ```

3. **Install Node.js (v18 or later):**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   apt install -y nodejs
   ```

4. **Verify installation:**
   ```bash
   node --version
   npm --version
   ```

## Step 2: Install Git and Clone Your Repository

1. **Install Git:**
   ```bash
   apt install -y git
   ```

2. **Clone your repository:**
   ```bash
   cd /opt
   git clone https://github.com/nflgamergod-art/SynapseAI-bot1.git
   cd SynapseAI-bot1
   ```

## Step 3: Configure the Bot

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   nano .env
   ```

3. **Add your bot token:**
   ```
   DISCORD_TOKEN=your_actual_bot_token_here
   PREFIX=!
   ```
   Save and exit (Ctrl+X, then Y, then Enter)

## Step 4: Test the Bot

Run the bot manually to ensure it works:
```bash
node index.js
```

You should see: `✅ Ready! Logged in as YourBotName#1234`

Press `Ctrl+C` to stop the bot.

## Step 5: Keep the Bot Running 24/7

### Quick Setup with start.sh (Easiest)

We provide an interactive script that simplifies the setup:

```bash
chmod +x start.sh
./start.sh
```

The script will guide you through:
- Installing dependencies
- Choosing how to run the bot (foreground, PM2, or systemd)
- Setting up auto-start on boot

### Manual Setup Options

You have two manual options to keep your bot running:

### Option A: Using PM2 (Recommended)

PM2 is a production process manager that will keep your bot running and restart it if it crashes.

1. **Install PM2 globally:**
   ```bash
   npm install -g pm2
   ```

2. **Start the bot with PM2:**
   
   You can use the provided ecosystem config file:
   ```bash
   pm2 start ecosystem.config.js
   ```
   
   Or start it manually:
   ```bash
   pm2 start index.js --name synapseai-bot
   ```

3. **Set PM2 to start on system boot:**
   ```bash
   pm2 startup systemd
   pm2 save
   ```

4. **Useful PM2 commands:**
   ```bash
   pm2 status              # Check bot status
   pm2 logs synapseai-bot  # View logs
   pm2 restart synapseai-bot  # Restart bot
   pm2 stop synapseai-bot  # Stop bot
   pm2 delete synapseai-bot  # Remove from PM2
   ```

### Option B: Using systemd Service

1. **Copy the service file:**
   ```bash
   cp synapseai-bot.service /etc/systemd/system/
   ```

2. **Edit the service file if needed:**
   ```bash
   nano /etc/systemd/system/synapseai-bot.service
   ```
   Update the paths if you installed in a different directory.

3. **Enable and start the service:**
   ```bash
   systemctl daemon-reload
   systemctl enable synapseai-bot.service
   systemctl start synapseai-bot.service
   ```

4. **Check status:**
   ```bash
   systemctl status synapseai-bot.service
   ```

5. **View logs:**
   ```bash
   journalctl -u synapseai-bot.service -f
   ```

## Step 6: Updating Your Bot

When you make changes to your code:

1. **SSH into your droplet**
2. **Navigate to bot directory:**
   ```bash
   cd /opt/SynapseAI-bot1
   ```

3. **Pull latest changes:**
   ```bash
   git pull
   ```

4. **Install any new dependencies:**
   ```bash
   npm install
   ```

5. **Restart the bot:**
   - If using PM2: `pm2 restart synapseai-bot`
   - If using systemd: `systemctl restart synapseai-bot.service`

## Security Best Practices

1. **Create a non-root user:**
   ```bash
   adduser botuser
   usermod -aG sudo botuser
   ```

2. **Use the new user for running the bot:**
   ```bash
   chown -R botuser:botuser /opt/SynapseAI-bot1
   ```

3. **Set up a firewall:**
   ```bash
   ufw allow ssh
   ufw enable
   ```

4. **Never commit your .env file or bot token to Git**

## Troubleshooting

- **Bot not starting:** Check logs with `pm2 logs` or `journalctl -u synapseai-bot.service`
- **Permission errors:** Ensure the bot directory has proper permissions
- **Token errors:** Verify your DISCORD_TOKEN in the .env file
- **Node version issues:** Ensure you're using Node.js v16.9.0 or higher

## Additional Resources

- [Discord.js Guide](https://discordjs.guide/)
- [DigitalOcean Documentation](https://docs.digitalocean.com/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
