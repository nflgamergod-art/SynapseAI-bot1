# Quick Deployment Guide

This guide helps you deploy updates to your DigitalOcean droplet in just a few steps.

## 🚀 Deploy New Changes

### Method 1: One-Command Deploy (Recommended)

SSH into your droplet and run the deployment script:

```bash
ssh root@YOUR_DROPLET_IP "bash /root/SynapseAI/SynapseAI-bot1/deploy/update-droplet.sh"
```

Replace `YOUR_DROPLET_IP` with your actual droplet IP address.

### Method 2: Manual Deploy

1. **SSH into your droplet:**
   ```bash
   ssh root@YOUR_DROPLET_IP
   ```

2. **Navigate to the project:**
   ```bash
   cd /root/SynapseAI/SynapseAI-bot1
   ```

3. **Pull latest code:**
   ```bash
   git pull origin main
   ```

4. **Install dependencies (if package.json changed):**
   ```bash
   npm install
   ```

5. **Build the project:**
   ```bash
   npm run build
   ```

6. **Restart the bot:**
   ```bash
   pm2 restart synapseai --update-env
   pm2 save
   ```

7. **Check status:**
   ```bash
   pm2 status
   pm2 logs synapseai --lines 50
   ```

## 📋 Common Commands

### Check bot status
```bash
ssh root@YOUR_DROPLET_IP "pm2 status synapseai"
```

### View logs
```bash
ssh root@YOUR_DROPLET_IP "pm2 logs synapseai --lines 100"
```

### Restart bot
```bash
ssh root@YOUR_DROPLET_IP "pm2 restart synapseai"
```

### Stop bot
```bash
ssh root@YOUR_DROPLET_IP "pm2 stop synapseai"
```

### Start bot
```bash
ssh root@YOUR_DROPLET_IP "pm2 start synapseai"
```

## 🔧 Troubleshooting

### Bot not responding after deploy
1. Check PM2 status: `pm2 status`
2. View recent logs: `pm2 logs synapseai --lines 100`
3. Verify environment variables: `cd /root/SynapseAI/SynapseAI-bot1 && cat .env`

### Build errors
1. Delete node_modules and dist: `rm -rf node_modules dist`
2. Reinstall: `npm install`
3. Rebuild: `npm run build`

### PM2 process not found
1. Start fresh: `pm2 start dist/index.js --name synapseai`
2. Save: `pm2 save`
3. Setup startup: `pm2 startup` (run the command it outputs)

## 📝 What's Fixed

### Latest Changes (October 31, 2025)

1. **Mute Duration Parsing**
   - Fixed: `!mute @user 20s reason` now correctly applies 20 seconds (not 1 hour)
   - Supports: `20s`, `10m`, `1h`, `1h30m`, etc.
   - Works for both slash commands and prefix commands

2. **Missing Prefix Commands**
   - Added: `!joke` - Tell a random joke
   - Added: `!dadjoke` - Tell a dad joke
   - These now work the same as slash commands

3. **All Commands Work 24/7**
   - Bot runs independently on DigitalOcean
   - Your computer can be off
   - PM2 auto-restarts if bot crashes
   - Survives server reboots

## ✅ Verify Everything Works

After deploying, test these commands in Discord:

- `!help` - Should show all commands
- `!ping` - Should respond with latency
- `!joke` - Should tell a joke
- `!dadjoke` - Should tell a dad joke
- `!mute @user 20s testing` - Should timeout for 20 seconds with reason "testing"
- `/mute user:@user duration:1m reason:test` - Should timeout for 1 minute

## 🎯 Next Steps

1. **Set up the deployment script on droplet:**
   ```bash
   ssh root@YOUR_DROPLET_IP
   cd /root/SynapseAI/SynapseAI-bot1
   chmod +x deploy/update-droplet.sh
   ```

2. **Test the deployment:**
   ```bash
   ./deploy/update-droplet.sh
   ```

3. **Future deployments:**
   - Make changes locally
   - Commit and push to GitHub
   - Run: `ssh root@YOUR_DROPLET_IP "bash /root/SynapseAI/SynapseAI-bot1/deploy/update-droplet.sh"`

That's it! Your bot will be updated in seconds. 🚀
