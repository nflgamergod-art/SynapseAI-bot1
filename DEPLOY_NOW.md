# 🚀 Deploy Your Bot Now!

## Quick Deploy (Copy-Paste This)

Replace `YOUR_DROPLET_IP` with your actual droplet IP address, then run:

```bash
ssh root@YOUR_DROPLET_IP << 'ENDSSH'
cd /root/SynapseAI/SynapseAI-bot1
git pull origin main
npm install
npm run build
pm2 restart synapseai --update-env
pm2 save
echo "✅ Deployment complete!"
pm2 status synapseai
pm2 logs synapseai --lines 20 --nostream
ENDSSH
```

## OR Use This Simpler Version

```bash
ssh root@YOUR_DROPLET_IP "cd /root/SynapseAI/SynapseAI-bot1 && git pull && npm install && npm run build && pm2 restart synapseai --update-env && pm2 save && pm2 logs synapseai --lines 30 --nostream"
```

## What This Does

1. ✅ Connects to your droplet via SSH
2. ✅ Pulls the latest code from GitHub (with mute fix + joke commands)
3. ✅ Installs any new dependencies
4. ✅ Builds the TypeScript code
5. ✅ Restarts the bot with fresh code
6. ✅ Saves PM2 configuration
7. ✅ Shows you the status and recent logs

## After Deploy - Test These Commands in Discord

- `!help` - Shows all commands
- `!joke` - Should work now! 🎉
- `!dadjoke` - Should work now! 🎉
- `!mute @user 20s testing` - Should timeout for 20 seconds (not 1 hour!) 🎉
- `!ping` - Check latency
- `/mute` - Slash command also works with durations like "10m" or "1h"

## Check Bot Status Anytime

```bash
ssh root@YOUR_DROPLET_IP "pm2 status"
```

## View Logs

```bash
ssh root@YOUR_DROPLET_IP "pm2 logs synapseai --lines 100"
```

## Your Bot is 24/7! 🎊

✅ You can close your laptop
✅ You can turn off your computer  
✅ The bot keeps running on DigitalOcean
✅ PM2 auto-restarts it if it crashes
✅ It survives server reboots

---

**Need help?** Check `deploy/QUICK_DEPLOY.md` for troubleshooting!
