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
                const subCommand = interaction.options.getSubcommand();
                const { searchKnowledge, buildFAQ, getKnowledgeStats } = await import('../services/preventiveSupport');
                const guildId = interaction.guild?.id || null;
                
                if (subCommand === 'search') {
                    const query = interaction.options.getString('query', true);
                    const results = searchKnowledge(guildId, query, 5);
                    
                    if (results.length === 0) {
                        await safeReply(interaction, '🔍 No matching knowledge base entries found. The bot learns from conversations automatically!', { flags: 64 } as any);
                        return true;
                    }
                    
                    const { EmbedBuilder } = await import('discord.js');
                    const embed = new EmbedBuilder()
                        .setTitle('📚 Knowledge Base Results')
                        .setColor(0x5865F2)
                        .setDescription(`Found ${results.length} result${results.length === 1 ? '' : 's'} for "${query}"`)
                        .setTimestamp();
                    
                    results.slice(0, 3).forEach((entry: any, i: number) => {
                        embed.addFields({
                            name: `${i + 1}. ${entry.category.toUpperCase()} - ${entry.question}`,
                            value: entry.answer.length > 200 ? entry.answer.slice(0, 200) + '...' : entry.answer
                        });
                    });
                    
                    await safeReply(interaction, { embeds: [embed], flags: 64 } as any);
                    return true;
                }
                
                if (subCommand === 'list') {
                    const faqData = buildFAQ(guildId);
                    
                    if (faqData.length === 0) {
                        await safeReply(interaction, '📚 Knowledge base is empty. The bot will automatically learn from conversations!', { flags: 64 } as any);
                        return true;
                    }
                    
                    const totalEntries = faqData.reduce((sum, cat) => sum + cat.entries.length, 0);
                    const categoryList = faqData
                        .map(cat => `• **${cat.category}**: ${cat.entries.length} entries`)
                        .join('\n');
                    
                    const { EmbedBuilder } = await import('discord.js');
                    const embed = new EmbedBuilder()
                        .setTitle('📚 Knowledge Base Overview')
                        .setColor(0x5865F2)
                        .setDescription(`Total entries: **${totalEntries}**\n\n${categoryList}`)
                        .setFooter({ text: 'Use /kb search <query> to find specific entries' })
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed], flags: 64 } as any);
                    return true;
                }
                
                if (subCommand === 'stats') {
                    const stats = getKnowledgeStats(guildId);
                    
                    const { EmbedBuilder } = await import('discord.js');
                    const embed = new EmbedBuilder()
                        .setTitle('📊 Knowledge Base Statistics')
                        .setColor(0x00AE86)
                        .addFields(
                            { name: 'Total Entries', value: stats.totalEntries.toString(), inline: true },
                            { name: 'Categories', value: stats.totalCategories.toString(), inline: true },
                            { name: 'Recent (7d)', value: stats.recentContributions.toString(), inline: true },
                            { name: 'Avg Helpfulness', value: stats.averageHelpfulness.toFixed(1), inline: true }
                        )
                        .setTimestamp();
                    
                    if (stats.mostHelpfulEntry) {
                        embed.addFields({
                            name: '🏆 Most Helpful Entry',
                            value: `**Q:** ${stats.mostHelpfulEntry.question}\n**Helpful count:** ${stats.mostHelpfulEntry.times_helpful}`
                        });
                    }
                    
                    await safeReply(interaction, { embeds: [embed], flags: 64 } as any);
                    return true;
                }
                
                return true;
            }

            case 'achievements': {
                // Simulate fetching and displaying user achievements
                const user = interaction.user;
                await safeReply(interaction, `🏆 Achievements for ${user.username}:\n- First Login\n- 100 Messages Sent\n- 1 Year Member`, { flags: 64 } as any);
                return true;
            }

            case 'perks': {
                // Show user's actual points and unlockable perks with progress
                const { getUserPoints, getUnlockedPerks, getUserMessageStats } = await import('../services/rewards');
                const targetUser = interaction.options.getUser('user') ?? interaction.user;
                const guildId = interaction.guild?.id || null;
                
                const userPoints = getUserPoints(targetUser.id, guildId);
                const perks = getUnlockedPerks(targetUser.id, guildId);
                const messageStats = getUserMessageStats(targetUser.id, guildId);
                
                const { EmbedBuilder } = await import('discord.js');
                const embed = new EmbedBuilder()
                    .setTitle(`✨ ${targetUser.username}'s Perks & Progress`)
                    .setColor(0xFFD700)
                    .setDescription(
                        `**Current Points:** ${userPoints} 🪙\n\n` +
                        `**Activity Stats:**\n` +
                        `📨 Messages Sent: ${messageStats.messageCount}\n` +
                        `🎯 Next Milestone: ${messageStats.nextMilestone} messages (+10 points)\n` +
                        `📊 Progress: ${messageStats.messageCount}/${messageStats.nextMilestone} (${messageStats.messagesToNextMilestone} to go)\n\n` +
                        `Earn points by helping others, contributing to the community, and being active!`
                    )
                    .setTimestamp();
                
                // Group perks by status
                const unlocked = perks.filter(p => p.unlocked);
                const locked = perks.filter(p => !p.unlocked);
                
                if (unlocked.length > 0) {
                    const unlockedList = unlocked.map(p => 
                        `✅ **${p.name}** - ${p.description}`
                    ).join('\n');
                    embed.addFields({ name: '🎁 Unlocked Perks', value: unlockedList, inline: false });
                }
                
                if (locked.length > 0) {
                    const lockedList = locked.map(p => {
                        const needed = (p as any).requiredPoints - userPoints;
                        const progress = Math.min(100, Math.floor((userPoints / (p as any).requiredPoints) * 100));
                        const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
                        return `🔒 **${p.name}** (${(p as any).requiredPoints} points)\n   ${progressBar} ${progress}% - Need ${needed} more points\n   ${p.description}`;
                    }).join('\n\n');
                    embed.addFields({ name: '🎯 Locked Perks', value: lockedList, inline: false });
                }
                
                embed.setFooter({ text: 'Use /claimperk <perk> to claim unlocked perks!' });
                
                await safeReply(interaction, { embeds: [embed], flags: 64 } as any);
                return true;
            }

            case 'claimperk': {
                // Simulate processing a perk claim
                await safeReply(interaction, '✅ Perk claim processed successfully!', { flags: 64 } as any);
                return true;
            }

            case 'setcolor': {
                // Discord allows max 25 options in select menu
                const colors = [
                    { label: '🔴 Red', value: '#ED4245' },
                    { label: '🟠 Orange', value: '#F26522' },
                    { label: '🟡 Yellow', value: '#FEE75C' },
                    { label: '🟢 Green', value: '#57F287' },
                    { label: '🔵 Blue', value: '#5865F2' },
                    { label: '🟣 Purple', value: '#9B59B6' },
                    { label: '🩷 Pink', value: '#EB459E' },
                    { label: '💎 Aqua', value: '#1ABC9C' },
                    { label: '💛 Gold', value: '#F1C40F' },
                    { label: '❤️ Crimson', value: '#DC143C' },
                    { label: '💚 Dark Green', value: '#2ECC71' },
                    { label: '💙 Dark Blue', value: '#3498DB' },
                    { label: '💜 Dark Purple', value: '#8E44AD' },
                    { label: '🌊 Navy', value: '#34495E' },
                    { label: '� Dark Red', value: '#992D22' },
                    { label: '🩶 Gray', value: '#95A5A6' },
                    { label: '🖤 Dark Gray', value: '#607D8B' },
                    { label: '⚫ Black', value: '#23272A' },
                    { label: '⚪ White', value: '#FFFFFF' },
                    { label: '🌈 Gradient Sunset', value: '#FF6B35' },
                    { label: '🌸 Gradient Rose', value: '#FF66B2' },
                    { label: '🌅 Gradient Ocean', value: '#00D9FF' },
                    { label: '💫 Holographic Blue', value: '#7DF9FF' },
                    { label: '⭐ Holographic Gold', value: '#FFD700' },
                    { label: '✨ Default', value: 'default' },
                ];

                const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('setcolor-menu')
                        .setPlaceholder('🎨 Choose your color')
                        .setMaxValues(1)
                        .addOptions(colors.map(c => ({
                            label: c.label,
                            value: c.value,
                            description: c.value === 'default' ? 'Remove custom color' : `Hex: ${c.value}`
                        })))
                );

                await interaction.reply({
                    content: '🎨 **Select your custom color:**\nChoose a color from the dropdown menu below to customize your role color!',
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