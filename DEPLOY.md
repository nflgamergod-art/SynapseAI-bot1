# Deployment Instructions for DigitalOcean

## Quick Deploy (Recommended)

SSH into your DigitalOcean server and run:

```bash
ssh root@64.23.133.2
cd /opt/synapseai-bot
bash deploy.sh
```

The deployment script will automatically:
- Pull latest code from GitHub
- Install dependencies
- Build TypeScript
- Restart the bot with PM2
- Show you the bot status and logs

## Manual Deployment Steps

If you prefer to deploy manually:

### 1. SSH into the server
```bash
ssh root@64.23.133.2
```

### 2. Navigate to the bot directory
```bash
cd /opt/synapseai-bot
```

### 3. Pull latest changes
```bash
git pull origin main
```

### 4. Install dependencies
```bash
npm install
```

### 5. Build the TypeScript code
```bash
npm run build
```

### 6. Restart the bot
```bash
pm2 restart synapseai-bot
```

Or if the bot isn't running yet:
```bash
pm2 start dist/index.js --name synapseai-bot
pm2 save
```

### 7. Check the bot status
```bash
pm2 status
pm2 logs synapseai-bot
```

## Verify Deployment

After deployment, check that:
1. Bot shows as "online" in Discord
2. PM2 shows the process as "online"
3. No errors in the logs

## Recent Changes

Latest deployment includes:
- ✅ All commands now admin-only (except help, ping, pong, joke, dadjoke, membercount)
- ✅ Unified authorization message: "You are not authorized to use this feature."
- ✅ Fixed AI response complexity (max_tokens: 1500, detailed responses)
- ✅ Moderation commands now use admin/bypass check
- ✅ Prefix commands updated with authorization checks

## Troubleshooting

### Bot not starting
```bash
pm2 logs synapseai-bot --lines 50
```

### Check if .env is configured
```bash
cat /opt/synapseai-bot/.env
```

### Restart PM2 completely
```bash
pm2 delete synapseai-bot
pm2 start dist/index.js --name synapseai-bot
pm2 save
```

### View real-time logs
```bash
pm2 logs synapseai-bot --lines 100
```
