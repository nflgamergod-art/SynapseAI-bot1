# SynapseAI-bot1

SynapseAI Bot made by PobKC

A Discord bot built with Discord.js that can be deployed to run 24/7 on a DigitalOcean droplet or any other server.

## Features

- 🤖 Basic Discord bot functionality
- 📝 Command handling with customizable prefix
- 🔄 Auto-restart capability
- 📊 Server statistics
- 🏓 Ping/latency checker

## Quick Start (Local Development)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nflgamergod-art/SynapseAI-bot1.git
   cd SynapseAI-bot1
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure the bot:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Discord bot token:
   ```
   DISCORD_TOKEN=your_bot_token_here
   PREFIX=!
   ```

4. **Run the bot:**
   ```bash
   npm start
   ```

## Getting a Discord Bot Token

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Under the bot's username, click "Reset Token" to reveal your token
5. Copy the token and paste it in your `.env` file
6. Enable "Message Content Intent" under Privileged Gateway Intents
7. Go to OAuth2 > URL Generator, select "bot" scope and required permissions
8. Use the generated URL to invite the bot to your server

## Available Commands

- `!ping` - Check bot latency and response time
- `!help` - Display available commands
- `!info` - Show bot information and statistics

## Deploying to DigitalOcean Droplet (24/7)

For detailed deployment instructions to keep your bot running 24/7 on a DigitalOcean droplet, see [DEPLOYMENT.md](DEPLOYMENT.md).

Quick summary:
1. Set up an Ubuntu droplet
2. Install Node.js and Git
3. Clone this repository
4. Configure your bot token
5. Run `./start.sh` for an interactive setup, or manually use PM2/systemd

## Project Structure

```
SynapseAI-bot1/
├── index.js                 # Main bot file
├── package.json             # Node.js dependencies
├── ecosystem.config.js      # PM2 configuration
├── start.sh                 # Interactive startup script
├── .env.example             # Environment variables template
├── .gitignore              # Git ignore rules
├── synapseai-bot.service   # Systemd service file
├── DEPLOYMENT.md           # Deployment guide
└── README.md               # This file
```

## Customizing Your Bot

You can easily extend the bot by adding more commands in `index.js`. Follow the existing command pattern:

```javascript
if (command === 'yourcommand') {
  message.reply('Your response here');
}
```

## Support

If you encounter any issues:
- Check the [DEPLOYMENT.md](DEPLOYMENT.md) troubleshooting section
- Verify your bot token is correct
- Ensure you have the required Node.js version (16.9.0+)
- Check that Message Content Intent is enabled in Discord Developer Portal

## License

MIT

## Author

PobKC
