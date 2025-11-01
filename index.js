require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const PREFIX = process.env.PREFIX || '!';

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Ready! Logged in as ${c.user.tag}`);
  console.log(`🤖 Bot is running on ${client.guilds.cache.size} server(s)`);
});

// Listen for messages
client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Check if message starts with prefix
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Example commands
  if (command === 'ping') {
    const sent = await message.reply('🏓 Pinging...');
    const timeDiff = sent.createdTimestamp - message.createdTimestamp;
    sent.edit(`🏓 Pong! Latency is ${timeDiff}ms. API Latency is ${Math.round(client.ws.ping)}ms`);
  }

  if (command === 'help') {
    message.reply(`**SynapseAI Bot Commands**\n\n\`${PREFIX}ping\` - Check bot latency\n\`${PREFIX}help\` - Show this help message\n\`${PREFIX}info\` - Show bot information`);
  }

  if (command === 'info') {
    message.reply(`**SynapseAI Bot**\nMade by PobKC\nServers: ${client.guilds.cache.size}\nUptime: ${Math.floor(client.uptime / 1000 / 60)} minutes`);
  }
});

// Error handling
client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Failed to login:', error);
  process.exit(1);
});
