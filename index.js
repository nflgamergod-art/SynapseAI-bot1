const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
require('dotenv').config();
const { globalCommands } = require('./src/commands/enhancedCommands');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
    console.log('Bot is ready and connected to Discord!');

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Clearing global commands...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
        console.log('Successfully cleared global commands.');

        console.log('Registering new commands...');

        // Register the global commands from the imported array
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: globalCommands });
        console.log(`Successfully registered ${globalCommands.length} global commands.`);
    } catch (error) {
        console.error('Error clearing or registering commands:', error);
    }
});

// Add global error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

client.on('error', (error) => {
    console.error('Client encountered an error:', error);
});

client.login(process.env.DISCORD_TOKEN);

module.exports = { client };
