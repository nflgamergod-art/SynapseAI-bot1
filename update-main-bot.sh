#!/bin/bash

echo "🔧 Updating Main Bot to only have priority commands..."

SERVER="root@162.243.193.162"
BOT_DIR="/root/SynapseAI"

# Step 1: Upload filter script to server
echo "Uploading filter script..."
scp filter-main-bot.js $SERVER:$BOT_DIR/
echo "✅ Uploaded filter script"

# Step 2: Backup current main bot
echo "Backing up current main bot..."
ssh $SERVER "cd $BOT_DIR && cp -r SynapseAI-bot1 SynapseAI-bot1-backup-$(date +%Y%m%d-%H%M%S)"
echo "✅ Backup created"

# Step 3: Filter main bot commands (keep only priority)
echo "Filtering main bot commands (keeping only priority)..."
ssh $SERVER "cd $BOT_DIR && cp SynapseAI-bot1/src/index.ts SynapseAI-bot1/src/index.ts.backup && node filter-main-bot.js SynapseAI-bot1/src/index.ts.backup SynapseAI-bot1/src/index.ts"
echo "✅ Main bot filtered"

# Step 4: Build main bot
echo "🔨 Building main bot..."
ssh $SERVER "cd $BOT_DIR/SynapseAI-bot1 && npm run build"

if ssh $SERVER "[ -d $BOT_DIR/SynapseAI-bot1/dist ]"; then
  echo "✅ Build successful"
  
  # Step 5: Restart main bot
  echo "🔄 Restarting main bot..."
  ssh $SERVER "pm2 restart synapseai"
  echo "✅ Main bot restarted"
  
  # Step 6: Show status
  echo ""
  echo "📊 PM2 Status:"
  ssh $SERVER "pm2 list"
  
  echo ""
  echo "Checking logs in 5 seconds..."
  sleep 5
  ssh $SERVER "pm2 logs synapseai --lines 30 --nostream | grep -E '(Registered|Priority found|Guild command)'"
else
  echo "❌ Build failed - restoring backup"
  ssh $SERVER "cd $BOT_DIR/SynapseAI-bot1/src && mv index.ts.backup index.ts"
  exit 1
fi

echo ""
echo "🎉 Main bot updated!"
echo ""
echo "Main Bot (SynapseAI): 32 priority commands only"
echo "Secondary Bot (SynapseAI-Extra): 81 utility commands"
echo ""
echo "Total: 113 commands available across both bots"
