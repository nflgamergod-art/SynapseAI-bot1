// Script to clear ALL commands and let bot re-register fresh
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  const guildId = process.env.GUILD_ID;
  
  if (!guildId) {
    console.error('GUILD_ID not set');
    process.exit(1);
  }
  
  try {
    // Clear ALL guild commands
    console.log('Clearing all guild commands...');
    await client.application.commands.set([], guildId);
    console.log('✅ All guild commands cleared!');
    console.log('Now restart the bot to register fresh commands.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_TOKEN);
