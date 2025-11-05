/**
 * Clean, minimal enhanced commands handlers.
 * This version is rewritten to be type-safe and to use `safeReply` for all replies.
 * It intentionally implements only lightweight behavior (placeholders) for each command
 * so the bot is stable and avoids InteractionAlreadyReplied errors.
 */

import { ActionRowBuilder, ChatInputCommandInteraction, EmbedBuilder, StringSelectMenuBuilder, CommandInteraction, GuildMember, Role, ColorResolvable, Client } from 'discord.js';
import { safeReply } from '../utils/safeReply';
import { isWhitelisted, addWhitelistEntry, removeWhitelistEntry } from '../services/whitelistService';

// Extend the Client type to include `whitelistCache`
interface ExtendedClient extends Client {
    whitelistCache?: Set<string>;
}

export async function handleEnhancedCommands(interaction: ChatInputCommandInteraction): Promise<boolean> {
    // Only handle chat input commands
    if (!interaction.isCommand()) return false;

    // Prevent handling the same interaction twice
    if (interaction.replied || interaction.deferred) {
        console.log(`[handleEnhancedCommands] [${interaction.id}] Interaction already handled; skipping.`);
        return false;
    }

    const name = interaction.commandName;

    try {
        switch (name) {
            case 'supportstats': {
                const targetUser = interaction.options.getUser('member') ?? interaction.user;
                const stats = {
                    resolutionRate: 92.3,
                    avgResponseTime: 3600,
                    avgRating: 4.7,
                    totalInteractions: 123,
                };

                const embed = new EmbedBuilder()
                    .setTitle(`📊 Support Stats: ${targetUser.tag}`)
                    .setColor(0x3498db)
                    .addFields(
                        { name: 'Resolution Rate', value: `${stats.resolutionRate.toFixed(1)}%`, inline: true },
                        { name: 'Avg Response Time', value: `${Math.round(stats.avgResponseTime / 60)} min`, inline: true },
                        { name: 'Rating', value: `${stats.avgRating?.toFixed(1) || 0}/5.0⭐`, inline: true }
                    );

                await safeReply(interaction, { embeds: [embed], flags: 64 });
                return true;
            }

            case 'leaderboard': {
                const embed = new EmbedBuilder()
                    .setTitle('🏆 Leaderboard (placeholder)')
                    .setColor(0xf1c40f)
                    .setDescription('No real data in this lightweight build.');

                await safeReply(interaction, { embeds: [embed], flags: 64 });
                return true;
            }

            case 'kb': {
                await safeReply(interaction, '📚 Knowledge base command is under development. Stay tuned for updates!', { flags: 64 } as any);
                return true;
            }

            case 'achievements': {
                // Simulate fetching and displaying user achievements
                const user = interaction.user;
                await safeReply(interaction, `🏆 Achievements for ${user.username}:\n- First Login\n- 100 Messages Sent\n- 1 Year Member`, { flags: 64 } as any);
                return true;
            }

            case 'perks': {
                // Restore previous perks
                await safeReply(interaction, `🎁 Your perks:\n- Custom Role\n- Exclusive Channel Access\n- Priority Support\n- Early Access to Features\n- Beta Tester Role`, { flags: 64 } as any);
                return true;
            }

            case 'claimperk': {
                // Simulate processing a perk claim
                await safeReply(interaction, '✅ Perk claim processed successfully!', { flags: 64 } as any);
                return true;
            }

            case 'setcolor': {
                const colors = [
                    { label: 'Red', value: '#FF0000' },
                    { label: 'Green', value: '#00FF00' },
                    { label: 'Blue', value: '#0000FF' },
                    { label: 'Yellow', value: '#FFFF00' },
                    { label: 'Purple', value: '#800080' },
                    { label: 'Default', value: 'default' },
                ];

                const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('setcolor-menu')
                        .setPlaceholder('Select a color')
                        .addOptions(colors)
                );

                await interaction.reply({
                    content: '🎨 Please select a color from the dropdown menu:',
                    components: [row],
                    flags: 64,
                });
                return true;
            }

            // Update `/whitelist` command to respect existing roles and fix interaction handling
            case 'whitelist': {
                const targetUser = interaction.options.getUser('user');
                const action = interaction.options.getString('action');

                if (!targetUser || !action) {
                    console.log(`[whitelist] Missing parameters: user=${targetUser}, action=${action}`);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'Please specify a user and an action (add/remove).', ephemeral: true });
                    }
                    return false;
                }

                const guild = interaction.guild;
                if (!guild) {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
                    }
                    return false;
                }

                const member = await guild.members.fetch(targetUser.id).catch(() => null);
                if (!member) {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'User not found in this server.', ephemeral: true });
                    }
                    return false;
                }

                // Check for existing roles
                const whitelistRoles = ['SynapseAIWhitelist', 'SynapseAI User'];
                const whitelistRole = guild.roles.cache.find(role => whitelistRoles.includes(role.name));

                if (!whitelistRole) {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'Whitelist role not found. Please create a role named "SynapseAIWhitelist" or "SynapseAI User".', ephemeral: true });
                    }
                    return false;
                }

                // Add logging to verify cache updates and usage
                if (action === 'add') {
                    if (isWhitelisted(targetUser.id, 'user')) {
                        console.log(`[whitelist] User ${targetUser.id} is already whitelisted.`);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: `${targetUser.username} is already whitelisted.`, ephemeral: true });
                        }
                        return true;
                    }

                    await member.roles.add(whitelistRole);
                    console.log(`[whitelist] Added role ${whitelistRole.name} to user ${targetUser.username}`);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: `${targetUser.username} has been added to the whitelist and can now use the bot.`, ephemeral: true });
                    }

                    addWhitelistEntry({ id: targetUser.id, type: 'user' });
                    console.log(`[whitelistService] User ${targetUser.id} added to the whitelist.`);

                    return true;
                } else if (action === 'remove') {
                    if (!isWhitelisted(targetUser.id, 'user')) {
                        console.log(`[whitelist] User ${targetUser.id} is not whitelisted.`);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: `${targetUser.username} is not whitelisted.`, ephemeral: true });
                        }
                        return true;
                    }

                    await member.roles.remove(whitelistRole);
                    console.log(`[whitelist] Removed role ${whitelistRole.name} from user ${targetUser.username}`);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: `${targetUser.username} has been removed from the whitelist.`, ephemeral: true });
                    }

                    removeWhitelistEntry(targetUser.id, 'user');
                    console.log(`[whitelistService] User ${targetUser.id} removed from the whitelist.`);

                    return true;
                } else {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'Invalid action. Use "add" or "remove".', ephemeral: true });
                    }
                    return false;
                }
            }

            default:
                return false;
        }
    } catch (err: any) {
        console.error(`[handleEnhancedCommands] [${interaction.id}] Error handling command ${name}:`, err);
        try {
            await safeReply(interaction, { content: `Failed: ${err?.message ?? String(err)}`, flags: 64 });
        } catch (e) {
            console.error(`[handleEnhancedCommands] [${interaction.id}] Failed to send error reply:`, e);
        }
        return true;
    }
}

// Ensure `handleWhitelist` is properly declared and exported
export async function handleWhitelist(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const targetUser = interaction.options.getUser('user');
  const action = interaction.options.getString('action');

  if (!targetUser || !action) {
    await interaction.reply({ content: 'Please specify a user and an action (add/remove).', flags: 64 });
    return false;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', flags: 64 });
    return false;
  }

  const member = await guild.members.fetch(targetUser.id);
  if (!member) {
    await interaction.reply({ content: 'User not found in this server.', flags: 64 });
    return false;
  }

  // Check for existing roles
  const whitelistRoles = ['SynapseAIWhitelist', 'SynapseAI User'];
  let whitelistRole = guild.roles.cache.find(role => whitelistRoles.includes(role.name));

  if (!whitelistRole) {
    try {
      // Fix color assignment to use correct case for ColorResolvable
      whitelistRole = await guild.roles.create({
        name: 'SynapseAIWhitelist',
        color: 'Blue', // Corrected case
        reason: 'Automatically created for whitelist command',
      });
    } catch (error) {
      console.error(`[whitelist] Failed to create "SynapseAIWhitelist" role:`, error);
      await interaction.reply({ content: 'Failed to create the "SynapseAIWhitelist" role. Please check the bot permissions.', flags: 64 });
      return false;
    }
  }

  if (action === 'add') {
    await member.roles.add(whitelistRole);
    await interaction.reply({ content: `${targetUser.username} has been added to the whitelist.`, flags: 64 });
    return true;
  } else if (action === 'remove') {
    await member.roles.remove(whitelistRole);
    await interaction.reply({ content: `${targetUser.username} has been removed from the whitelist.`, flags: 64 });
    return true;
  } else {
    await interaction.reply({ content: 'Invalid action. Use "add" or "remove".', flags: 64 });
    return false;
  }
}

// Define and export globalCommands
export const globalCommands = [
    { name: 'supportstats', description: 'View support member performance metrics' },
    { name: 'leaderboard', description: 'Rankings for achievements or support' },
    { name: 'kb', description: 'Knowledge Base (FAQ System)' },
    { name: 'achievements', description: 'View earned achievements' },
    { name: 'perks', description: 'See unlocked special abilities' },
    { name: 'claimperk', description: 'Claim a perk' },
    { name: 'setcolor', description: 'Set a custom color' },
    { 
        name: 'whitelist', 
        description: 'Manage whitelist role for testing commands on alt accounts',
        options: [
            {
                name: 'user',
                description: 'The user to add or remove from the whitelist',
                type: 6, // USER type
                required: true
            },
            {
                name: 'action',
                description: 'Action to perform (add/remove)',
                type: 3, // STRING type
                required: true,
                choices: [
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' }
                ]
            }
        ]
    },

    // Commands from index.ts
    { name: "help", description: "Show help for bot commands" },
    { name: "ping", description: "Check bot latency or return pong", options: [
        { name: "response", description: "Type of response (ping/pong)", type: 3, required: false }
    ] },
    { name: "joke", description: "Tell a joke", options: [
        { name: "type", description: "Type of joke (random/dad)", type: 3, required: false }
    ] },
    { name: "config", description: "Admin: Configure bot settings", options: [
        { name: "action", description: "Action to perform (setgeminikey/setopenai/setprovider)", type: 3, required: true },
        { name: "value", description: "Value for the action", type: 3, required: true }
    ] },
    { name: "redeploy", description: "Admin: Pull latest code and restart bot (runs deploy.sh)" },
];

export default handleEnhancedCommands;
/**
 * Enhanced Features Command Handlers
 * Handles all slash commands for the 10 new advanced features
 * 
 * COMMAND CATEGORIES:
 * 
 * 📊 Support & Analytics:
 * - /supportstats - View support member performance metrics
 * - /leaderboard - Rankings for achievements or support
 * - /commonissues - Detect recurring support patterns
 * 
 * 📚 Knowledge Base (FAQ System):
 * - /kb search - Find answers in knowledge base
 * - /kb add - Add new FAQ entries (Admin)
 * - /kb trending - See popular FAQs
 * - /kb suggest - AI-suggested FAQs to create (Admin)
 * - /kb stats - Knowledge base analytics (Admin)
 * - /faq - Quick FAQ lookup
 * 
 * 🏆 Gamification & Rewards:
 * - /achievements - View earned achievements
 * - /perks - See unlocked special abilities
 * 
 * 🔮 AI Intelligence:
 * - /patterns - Detected user behavior patterns (Admin)
 * - /insights - AI predictions for server activity (Admin)
 * - /sentiment - Real-time emotional analysis (Admin)
 * 
 * 📋 Proactive Support:
 * - /checkins - Scheduled user follow-ups (Admin)
 */