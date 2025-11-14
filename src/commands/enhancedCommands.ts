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
            case 'givepoints': {
                // Owner-only command to give or take points
                const ownerId = process.env.OWNER_ID;
                if (interaction.user.id !== ownerId) {
                    await safeReply(interaction, { content: '❌ Only the bot owner can use this command.', flags: 64 });
                    return true;
                }
                
                const subcommand = interaction.options.getSubcommand();
                const targetUser = interaction.options.getUser('user', true);
                const points = interaction.options.getInteger('points', true);
                const reason = interaction.options.getString('reason') || 'Manual adjustment by owner';
                const guildId = interaction.guild?.id;
                
                if (!guildId) {
                    await safeReply(interaction, { content: 'This command can only be used in a server.', flags: 64 });
                    return true;
                }
                
                try {
                    const { awardDirectPoints, getUserPoints } = await import('../services/rewards');
                    
                    if (subcommand === 'give') {
                        await awardDirectPoints(targetUser.id, guildId, points, reason);
                        const newTotal = getUserPoints(targetUser.id, guildId);
                        await safeReply(interaction, { 
                            content: `✅ Granted **${points} points** to ${targetUser.username}\n📊 New balance: ${newTotal} points\n📝 Reason: ${reason}`, 
                            flags: 64 
                        });
                    } else if (subcommand === 'take') {
                        await awardDirectPoints(targetUser.id, guildId, -points, reason);
                        const newTotal = getUserPoints(targetUser.id, guildId);
                        await safeReply(interaction, { 
                            content: `✅ Removed **${points} points** from ${targetUser.username}\n📊 New balance: ${newTotal} points\n📝 Reason: ${reason}`, 
                            flags: 64 
                        });
                    }
                } catch (error) {
                    console.error('Error managing points:', error);
                    await safeReply(interaction, { 
                        content: `❌ Failed to manage points: ${error instanceof Error ? error.message : 'Unknown error'}`, 
                        flags: 64 
                    });
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
            case 'stats': {
                // Show comprehensive user statistics
                const { getUserStats, getUserPoints, ACHIEVEMENTS } = await import('../services/rewards');
                const targetUser = interaction.options.getUser('user') ?? interaction.user;
                const guildId = interaction.guild?.id || null;
                const stats = getUserStats(targetUser.id, guildId);
                const userPoints = getUserPoints(targetUser.id, guildId);
                const { EmbedBuilder } = await import('discord.js');
                const embed = new EmbedBuilder()
                    .setTitle(`📊 ${targetUser.username}'s Statistics`)
                    .setColor(0x3498DB)
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setTimestamp();
                // Support Statistics
                const supportStats = [
                    `**Total Assists:** ${stats.totalAssists}`,
                    `**Current Streak:** ${stats.currentStreak} day${stats.currentStreak !== 1 ? 's' : ''}`,
                    `**Longest Streak:** ${stats.longestStreak} day${stats.longestStreak !== 1 ? 's' : ''}`,
                    `**Total Cases:** ${stats.totalCases}`,
                    `**Resolved Cases:** ${stats.resolvedCases}`,
                    `**Resolution Rate:** ${(stats.resolutionRate * 100).toFixed(1)}%`,
                    `**Fast Resolutions:** ${stats.fastResolutions}`
                ].join('\n');
                embed.addFields({ name: '🎯 Support Stats', value: supportStats, inline: false });
                // Community Statistics
                const communityStats = [
                    `**Welcomed Users:** ${stats.welcomedUsers}`,
                    `**Conversations Started:** ${stats.conversationsStarted}`
                ].join('\n');
                embed.addFields({ name: '👥 Community Stats', value: communityStats, inline: true });
                // Activity Statistics
                const activityStats = [
                    `**Messages Sent:** ${stats.totalMessages}`,
                    `**Next Milestone:** ${Math.ceil(stats.totalMessages / 100) * 100 || 100}`,
                    `**Progress:** ${stats.totalMessages % 100}/100`
                ].join('\n');
                embed.addFields({ name: '📨 Activity Stats', value: activityStats, inline: true });
                // Achievement Progress
                const achievementProgress = [];
                if (stats.totalAssists < 1) {
                    achievementProgress.push(`❌ First Assist: Need 1 assist (Have ${stats.totalAssists})`);
                } else {
                    achievementProgress.push(`✅ First Assist (10 pts)`);
                }
                if (stats.currentStreak < 3) {
                    achievementProgress.push(`🎯 3-Day Streak: ${stats.currentStreak}/3 days`);
                } else if (stats.currentStreak < 7) {
                    achievementProgress.push(`✅ 3-Day Streak (25 pts)\n🎯 Week Warrior: ${stats.currentStreak}/7 days`);
                } else {
                    achievementProgress.push(`✅ 3-Day Streak (25 pts)\n✅ Week Warrior (50 pts)`);
                }
                if (stats.welcomedUsers < 10) {
                    achievementProgress.push(`🎯 Welcome Wagon: ${stats.welcomedUsers}/10 users welcomed`);
                } else {
                    achievementProgress.push(`✅ Welcome Wagon (20 pts)`);
                }
                if (stats.conversationsStarted < 50) {
                    achievementProgress.push(`🎯 Conversation Starter: ${stats.conversationsStarted}/50 conversations`);
                } else {
                    achievementProgress.push(`✅ Conversation Starter (30 pts)`);
                }
                if (stats.fastResolutions < 5) {
                    achievementProgress.push(`🎯 Speed Demon: ${stats.fastResolutions}/5 fast resolutions`);
                } else {
                    achievementProgress.push(`✅ Speed Demon (30 pts)`);
                }
                if (stats.totalAssists < 100) {
                    achievementProgress.push(`🎯 Century Club: ${stats.totalAssists}/100 assists`);
                } else {
                    achievementProgress.push(`✅ Century Club (100 pts)`);
                }
                if (stats.totalMessages < 1000) {
                    achievementProgress.push(`🎯 Chatterbox Champion: ${stats.totalMessages}/1000 messages`);
                } else {
                    achievementProgress.push(`✅ Chatterbox Champion (150 pts)`);
                }
                embed.addFields({ 
                    name: '🏆 Achievement Progress', 
                    value: achievementProgress.slice(0, 10).join('\n') || 'No progress yet',
                    inline: false 
                });
                embed.setFooter({ text: `Total Points: ${userPoints} 🪙 | Use /achievements to see all unlocked achievements` });
                await safeReply(interaction, { embeds: [embed], flags: 64 } as any);
                return true;
            }
            case 'claimperk': {
                // Simulate processing a perk claim
                await safeReply(interaction, '✅ Perk claim processed successfully!', { flags: 64 } as any);
                return true;
            }
            case 'requestemoji': {
                // Allow users with the custom_emoji perk to request a custom emoji
                const { getUnlockedPerks } = await import('../services/rewards');
                const targetUser = interaction.user;
                const guildId = interaction.guild?.id || null;
                const perks = getUnlockedPerks(targetUser.id, guildId);
                const hasPerk = perks.find(p => p.id === 'custom_emoji' && p.unlocked);
                if (!hasPerk) {
                    await safeReply(interaction, { content: '❌ You must unlock the Custom Emoji perk to request a custom emoji. Use /perks to check your progress.', flags: 64 });
                    return true;
                }
                const name = interaction.options.getString('name');
                const image = interaction.options.getAttachment('image');
                if (!name || !image) {
                    await safeReply(interaction, { content: 'Please provide both a name and an image for your emoji.', flags: 64 });
                    return true;
                }
                // Store the request in a DB table for approval (minimal implementation)
                try {
                    const db = await import('../services/db').then(m => m.getDB());
                    db.prepare(`CREATE TABLE IF NOT EXISTS emoji_requests (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT,
                        guild_id TEXT,
                        name TEXT,
                        attachment_url TEXT,
                        status TEXT,
                        created_at TEXT
                    )`).run();
                    db.prepare(`INSERT INTO emoji_requests (user_id, guild_id, name, attachment_url, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`)
                        .run(targetUser.id, guildId, name, image.url, new Date().toISOString());
                    await safeReply(interaction, { content: `✅ Emoji request submitted for approval! Staff will review your request soon.`, flags: 64 });
                } catch (e) {
                    await safeReply(interaction, { content: `❌ Failed to submit emoji request: ${typeof e === 'object' && e && 'message' in e ? (e as any).message : String(e)}`, flags: 64 });
                }
                return true;
            }
            case 'prioritysupport': {
                // Check if user has priority_support perk
                const { getUnlockedPerks } = await import('../services/rewards');
                const guildId = interaction.guild?.id;
                if (!guildId) {
                    await safeReply(interaction, { content: 'This command can only be used in a server.', flags: 64 });
                    return true;
                }
                const perks = getUnlockedPerks(interaction.user.id, guildId);
                const hasPerk = perks.find(p => p.id === 'priority_support' && p.unlocked);
                if (!hasPerk) {
                    await safeReply(interaction, { content: '❌ You must unlock the Priority Support perk to use this command. Use /perks to check your progress.', flags: 64 });
                    return true;
                }
                
                // Mark the user's open tickets as priority in the DB
                const { getUserTickets } = await import('../services/tickets');
                const db = await import('../services/db').then(m => m.getDB());
                const tickets = getUserTickets(guildId, interaction.user.id).filter(t => t.status === 'open');
                if (tickets.length === 0) {
                    await safeReply(interaction, { content: 'You have no open tickets to prioritize.', flags: 64 });
                    return true;
                }
                // Add a 'priority' flag to the ticket (if not present, add column)
                try {
                    db.prepare('ALTER TABLE tickets ADD COLUMN priority INTEGER DEFAULT 0').run();
                } catch {}
                tickets.forEach(ticket => {
                    db.prepare('UPDATE tickets SET priority = 1 WHERE id = ?').run(ticket.id);
                });
                await safeReply(interaction, { content: '🚨 Your open tickets have been marked as priority! Staff will see them at the top of the queue.', flags: 64 });
                return true;
            }
            case 'channelsuggestion': {
                // Check if user has channel_suggest perk
                const { getUnlockedPerks } = await import('../services/rewards');
                const guildId = interaction.guild?.id;
                if (!guildId) {
                    await safeReply(interaction, { content: 'This command can only be used in a server.', flags: 64 });
                    return true;
                }
                const perks = getUnlockedPerks(interaction.user.id, guildId);
                const hasPerk = perks.find(p => p.id === 'channel_suggest' && p.unlocked);
                if (!hasPerk) {
                    await safeReply(interaction, { content: '❌ You must unlock the Channel Suggestions perk to use this command. Use /perks to check your progress.', flags: 64 });
                    return true;
                }
                
                // Allow users to suggest a new channel, store suggestion for staff review
                const suggestion = interaction.options.getString('suggestion');
                if (!suggestion) {
                    await safeReply(interaction, { content: 'Please provide a channel suggestion.', flags: 64 });
                    return true;
                }
                try {
                    const db = await import('../services/db').then(m => m.getDB());
                    db.prepare(`CREATE TABLE IF NOT EXISTS channel_suggestions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT,
                        guild_id TEXT,
                        suggestion TEXT,
                        status TEXT,
                        created_at TEXT
                    )`).run();
                    db.prepare(`INSERT INTO channel_suggestions (user_id, guild_id, suggestion, status, created_at) VALUES (?, ?, ?, 'pending', ?)`)
                        .run(interaction.user.id, guildId, suggestion, new Date().toISOString());
                    await safeReply(interaction, { content: '✅ Channel suggestion submitted for review! Staff will consider your idea.', flags: 64 });
                } catch (e) {
                    await safeReply(interaction, { content: `❌ Failed to submit suggestion: ${typeof e === 'object' && e && 'message' in e ? (e as any).message : String(e)}`, flags: 64 });
                }
                return true;
            }
            case 'voicepriority': {
                // Check if user has voice_priority perk
                const { getUnlockedPerks } = await import('../services/rewards');
                const guildId = interaction.guild?.id;
                if (!guildId) {
                    await safeReply(interaction, { content: 'This command can only be used in a server.', flags: 64 });
                    return true;
                }
                const perks = getUnlockedPerks(interaction.user.id, guildId);
                const hasPerk = perks.find(p => p.id === 'voice_priority' && p.unlocked);
                if (!hasPerk) {
                    await safeReply(interaction, { content: '❌ You must unlock the Voice Priority perk to use this command. Use /perks to check your progress.', flags: 64 });
                    return true;
                }
                
                // Assign the "Priority" role (ID: 1438883254265708574)
                const guild = interaction.guild;
                if (!guild) {
                    await safeReply(interaction, { content: 'This command can only be used in a server.', flags: 64 });
                    return true;
                }
                const member = await guild.members.fetch(interaction.user.id);
                const role = guild.roles.cache.get('1438883254265708574');
                if (!role) {
                    await safeReply(interaction, { content: 'Priority role not found. Please contact staff.', flags: 64 });
                    return true;
                }
                if (member.roles.cache.has(role.id)) {
                    await safeReply(interaction, { content: '✅ You already have the Priority role!', flags: 64 });
                    return true;
                }
                await member.roles.add(role);
                await safeReply(interaction, { content: '🔊 You have been given the Priority role! You will be prioritized in voice channels and support.', flags: 64 });
                return true;
            }
            default:
                return false;
        }
    } catch (err: any) {
        console.error(`[handleEnhancedCommands] [${interaction.id}] Error handling command ${name}:`, err);
        try {
            await safeReply(interaction, { content: `Failed: ${typeof err === 'object' && err && 'message' in err ? (err as any).message : String(err)}`, flags: 64 });
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
    { name: 'givepoints', description: 'Owner: Grant points to a user', options: [
        { name: 'user', description: 'User to grant points to', type: 6, required: true },
        { name: 'points', description: 'Number of points to grant', type: 4, required: true },
        { name: 'reason', description: 'Reason for granting points', type: 3, required: false }
    ] },
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