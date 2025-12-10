#!/bin/bash

echo "🚀 Deploying SynapseAI-Extra (Secondary Bot) to server..."

SERVER="root@162.243.193.162"
BOT_DIR="/root/SynapseAI"

# Step 1: Copy main bot to secondary bot directory on server
echo "Copying bot files..."
ssh $SERVER "cd $BOT_DIR && rm -rf SynapseAI-bot2 && cp -r SynapseAI-bot1 SynapseAI-bot2"
echo "✅ Copied bot files"

# Step 2: Update .env file with secondary bot credentials
echo "Updating .env file..."
# Note: Set SECONDARY_BOT_TOKEN and SECONDARY_BOT_APP_ID in your environment before running
ssh $SERVER "cd $BOT_DIR/SynapseAI-bot2 && sed -i 's/^DISCORD_TOKEN=.*/DISCORD_TOKEN=${SECONDARY_BOT_TOKEN}/' .env && sed -i 's/^DISCORD_APPLICATION_ID=.*/DISCORD_APPLICATION_ID=${SECONDARY_BOT_APP_ID}/' .env && echo 'IS_SECONDARY_BOT=true' >> .env"
echo "✅ Updated .env file"

# Step 3: Upload filter script to server
echo "Uploading filter script..."
scp filter-commands.js $SERVER:$BOT_DIR/
echo "✅ Uploaded filter script"

# Step 4: Run the filter script
echo "Filtering commands..."
ssh $SERVER "cd $BOT_DIR && node filter-commands.js SynapseAI-bot1/src/index.ts SynapseAI-bot2/src/index.ts"
echo "✅ Commands filtered"

# Step 5: Build the secondary bot
echo "🔨 Building secondary bot..."
ssh $SERVER "cd $BOT_DIR/SynapseAI-bot2 && npm run build"

if ssh $SERVER "[ -d $BOT_DIR/SynapseAI-bot2/dist ]"; then
  echo "✅ Build successful"
  
  # Step 6: Start with PM2
  echo "🚀 Starting secondary bot with PM2..."
  ssh $SERVER "cd $BOT_DIR/SynapseAI-bot2 && pm2 delete synapseai-extra 2>/dev/null || true && pm2 start dist/index.js --name synapseai-extra && pm2 save"
  echo "✅ Secondary bot started"
  
  # Show PM2 status
  echo ""
  echo "📊 PM2 Status:"
  ssh $SERVER "pm2 list"
else
  echo "❌ Build failed"
  exit 1
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Both bots should now be running on the server."
echo ""
echo "Check status:"
echo "  ssh root@162.243.193.162 'pm2 list'"
echo ""
echo "View logs:"
echo "  ssh root@162.243.193.162 'pm2 logs synapseai'"
echo "  ssh root@162.243.193.162 'pm2 logs synapseai-extra'"
