/**
 * Clean, minimal enhanced commands handlers.
 * This version is rewritten to be type-safe and to use `safeReply` for all replies.
 * It intentionally implements only lightweight behavior (placeholders) for each command
 * so the bot is stable and avoids InteractionAlreadyReplied errors.
 */

import { ActionRowBuilder, ChatInputCommandInteraction, EmbedBuilder, StringSelectMenuBuilder, CommandInteraction, GuildMember, Role, ColorResolvable, Client, ButtonBuilder, ButtonStyle } from 'discord.js';
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
    const options = interaction.options;
    const guildId = interaction.guild?.id || '';

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
                // Refactored: Use emojiRequests service for full approval workflow
                const { getUnlockedPerks } = await import('../services/rewards');
                const { submitEmojiRequest } = await import('../services/emojiRequests');
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
                // Basic validation for name
                if (!/^\w{2,32}$/.test(name)) {
                    await safeReply(interaction, { content: 'Emoji name must be 2-32 characters (letters, numbers, underscore).', flags: 64 });
                    return true;
                }
                try {
                    const requestId = await submitEmojiRequest(interaction, name, image.url);
                    await safeReply(interaction, { content: `✅ Emoji request #${requestId} submitted for approval! You will receive a DM when reviewed.`, flags: 64 });
                } catch (e) {
                    console.error('Emoji request submission error:', e);
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
                // Add priority columns if not present
                try {
                    db.prepare('ALTER TABLE tickets ADD COLUMN priority INTEGER DEFAULT 0').run();
                } catch {}
                try {
                    db.prepare('ALTER TABLE tickets ADD COLUMN priority_set_at TEXT').run();
                } catch {}
                
                // Update tickets and rename channels
                const guild = interaction.guild;
                for (const ticket of tickets) {
                    const now = new Date().toISOString();
                    db.prepare('UPDATE tickets SET priority = 1, priority_set_at = ? WHERE id = ?').run(now, ticket.id);
                    
                    // Rename channel to add "-priority" suffix
                    try {
                        const channel = await guild?.channels.fetch(ticket.channel_id).catch(() => null);
                        if (channel && 'name' in channel) {
                            const currentName = (channel as any).name;
                            if (!currentName.endsWith('-priority')) {
                                await (channel as any).setName(`${currentName}-priority`).catch((err: any) => {
                                    console.log('Failed to rename ticket channel:', err);
                                });
                            }
                        }
                    } catch (err) {
                        console.log('Error renaming ticket channel:', err);
                    }
                }
                await safeReply(interaction, { content: '🚨 Your open tickets have been marked as priority! Staff will see them at the top of the queue and channels have been renamed.', flags: 64 });
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
                    const { submitChannelSuggestion } = await import('../services/channelSuggestions');
                    await submitChannelSuggestion(interaction, suggestion);
                    await safeReply(interaction, { content: '✅ Channel suggestion submitted for review! You will receive a DM when a decision is made.', flags: 64 });
                } catch (e) {
                    console.error('Channel suggestion error:', e);
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
            
            // Fun Commands
            case '8ball': {
                const { get8BallResponse } = await import('../services/funCommands');
                const question = options.getString('question', true);
                const mood = options.getString('mood') || 'serious';
                
                const response = get8BallResponse(mood as 'serious' | 'funny' | 'sarcastic');
                
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('🔮 Magic 8-Ball')
                    .addFields(
                        { name: 'Question', value: question },
                        { name: 'Answer', value: response }
                    )
                    .setFooter({ text: `Mood: ${mood.charAt(0).toUpperCase() + mood.slice(1)}` })
                    .setTimestamp();
                
                await safeReply(interaction, { embeds: [embed] });
                return true;
            }
            
            case 'wouldyourather': {
                const subcommand = options.getSubcommand();
                const { createWYRQuestion, voteWYR, getWYRQuestion, getRandomWYR } = await import('../services/funCommands');
                
                if (subcommand === 'create') {
                    const optionA = options.getString('option_a', true);
                    const optionB = options.getString('option_b', true);
                    
                    const questionId = await createWYRQuestion(guildId, optionA, optionB, interaction.user.id);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FF69B4')
                        .setTitle('🤔 Would You Rather?')
                        .setDescription(`**A:** ${optionA}\n\n**B:** ${optionB}`)
                        .setFooter({ text: `ID: ${questionId} • Vote with the buttons below!` })
                        .setTimestamp();
                    
                    const row = new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`wyr_vote_${questionId}_a`)
                                .setLabel('Option A')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId(`wyr_vote_${questionId}_b`)
                                .setLabel('Option B')
                                .setStyle(ButtonStyle.Success)
                        );
                    
                    await safeReply(interaction, { embeds: [embed], components: [row] });
                    return true;
                } else if (subcommand === 'random') {
                    const question = await getRandomWYR(guildId);
                    
                    if (!question) {
                        await safeReply(interaction, { content: '❌ No Would You Rather questions found. Create one with `/wouldyourather create`!', flags: 64 });
                        return true;
                    }
                    
                    const totalVotes = question.votes_a + question.votes_b;
                    const percentA = totalVotes > 0 ? Math.round((question.votes_a / totalVotes) * 100) : 0;
                    const percentB = totalVotes > 0 ? Math.round((question.votes_b / totalVotes) * 100) : 0;
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FF69B4')
                        .setTitle('🤔 Would You Rather?')
                        .setDescription(`**A:** ${question.option_a}\n\n**B:** ${question.option_b}`)
                        .addFields(
                            { name: '📊 Votes', value: `A: ${question.votes_a} (${percentA}%) | B: ${question.votes_b} (${percentB}%)` }
                        )
                        .setFooter({ text: `ID: ${question.id} • Vote with the buttons below!` })
                        .setTimestamp();
                    
                    const row = new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`wyr_vote_${question.id}_a`)
                                .setLabel('Option A')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId(`wyr_vote_${question.id}_b`)
                                .setLabel('Option B')
                                .setStyle(ButtonStyle.Success)
                        );
                    
                    await safeReply(interaction, { embeds: [embed], components: [row] });
                    return true;
                } else if (subcommand === 'results') {
                    const questionId = options.getInteger('id', true);
                    const question = await getWYRQuestion(questionId);
                    
                    if (!question) {
                        await safeReply(interaction, { content: '❌ Question not found!', flags: 64 });
                        return true;
                    }
                    
                    const totalVotes = question.votes_a + question.votes_b;
                    const percentA = totalVotes > 0 ? Math.round((question.votes_a / totalVotes) * 100) : 0;
                    const percentB = totalVotes > 0 ? Math.round((question.votes_b / totalVotes) * 100) : 0;
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FF69B4')
                        .setTitle('🤔 Would You Rather Results')
                        .setDescription(`**A:** ${question.option_a}\n\n**B:** ${question.option_b}`)
                        .addFields(
                            { name: '📊 Final Results', value: `A: ${question.votes_a} votes (${percentA}%)\nB: ${question.votes_b} votes (${percentB}%)\n\n**Total Votes:** ${totalVotes}` }
                        )
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed] });
                    return true;
                }
                return false;
            }
            
            case 'story': {
                const subcommand = options.getSubcommand();
                const { createStory, addStoryLine, getStory, getActiveStory, completeStory } = await import('../services/funCommands');
                
                if (subcommand === 'start') {
                    const title = options.getString('title', true);
                    const firstLine = options.getString('first_line', true);
                    const channelId = interaction.channel?.id;
                    
                    if (!channelId) {
                        await safeReply(interaction, { content: '❌ Could not determine channel ID!', flags: 64 });
                        return true;
                    }
                    
                    // Check for existing active story
                    const existingStory = await getActiveStory(guildId, channelId);
                    if (existingStory) {
                        await safeReply(interaction, { content: `❌ There's already an active story in this channel: **${existingStory.title}**. Finish it first with \`/story finish\`!`, flags: 64 });
                        return true;
                    }
                    
                    const storyId = await createStory(guildId, title, channelId);
                    await addStoryLine(storyId, interaction.user.id, firstLine);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#9B59B6')
                        .setTitle(`📖 ${title}`)
                        .setDescription(`**Line 1** (by <@${interaction.user.id}>):\n${firstLine}\n\n*Add to the story with \`/story add\`!*`)
                        .setFooter({ text: `Story ID: ${storyId}` })
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed] });
                    return true;
                } else if (subcommand === 'add') {
                    const line = options.getString('line', true);
                    const channelId = interaction.channel?.id;
                    
                    if (!channelId) {
                        await safeReply(interaction, { content: '❌ Could not determine channel ID!', flags: 64 });
                        return true;
                    }
                    
                    const activeStory = await getActiveStory(guildId, channelId);
                    if (!activeStory) {
                        await safeReply(interaction, { content: '❌ No active story in this channel! Start one with `/story start`.', flags: 64 });
                        return true;
                    }
                    
                    // Add user's line
                    await addStoryLine(activeStory.id, interaction.user.id, line);
                    
                    // Get story context for AI continuation
                    const storyData = await getStory(activeStory.id);
                    const userLineNumber = storyData?.lines.length || 0;
                    
                    // Send user's line first
                    const userEmbed = new EmbedBuilder()
                        .setColor('#9B59B6')
                        .setTitle(`📖 ${activeStory.title}`)
                        .setDescription(`**Line ${userLineNumber}** (by <@${interaction.user.id}>):\n${line}`)
                        .setFooter({ text: '✍️ SynapseAI is writing...' })
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [userEmbed] });
                    
                    // Generate AI continuation
                    try {
                        const { generateReply } = await import('../services/openai');
                        
                        // Build story context for AI
                        const storyContext = storyData?.lines.map((l: any) => l.content).join('\n') || '';
                        const prompt = `You are continuing a collaborative story titled "${activeStory.title}". Here's the story so far:\n\n${storyContext}\n\nWrite a creative continuation paragraph (2-4 sentences) that builds on the story naturally. Keep it engaging and maintain the story's tone.`;
                        
                        const aiContinuation = await generateReply(prompt, guildId);
                        
                        if (aiContinuation && aiContinuation.trim()) {
                            // Add AI's continuation to the story
                            await addStoryLine(activeStory.id, interaction.client.user!.id, aiContinuation.trim());
                            
                            // Get updated line number
                            const updatedStory = await getStory(activeStory.id);
                            const aiLineNumber = updatedStory?.lines.length || 0;
                            
                            // Send AI continuation
                            const aiEmbed = new EmbedBuilder()
                                .setColor('#5865F2')
                                .setTitle(`📖 ${activeStory.title}`)
                                .setDescription(`**Line ${aiLineNumber}** (by SynapseAI):\n${aiContinuation.trim()}`)
                                .setFooter({ text: 'Your turn! Add more with /story add' })
                                .setTimestamp();
                            
                            await interaction.followUp({ embeds: [aiEmbed] });
                        }
                    } catch (error) {
                        console.error('[Story AI] Failed to generate continuation:', error);
                        // Don't fail the whole command if AI fails
                    }
                    
                    return true;
                } else if (subcommand === 'read') {
                    const channelId = interaction.channel?.id;
                    
                    if (!channelId) {
                        await safeReply(interaction, { content: '❌ Could not determine channel ID!', flags: 64 });
                        return true;
                    }
                    
                    const activeStory = await getActiveStory(guildId, channelId);
                    if (!activeStory) {
                        await safeReply(interaction, { content: '❌ No active story in this channel!', flags: 64 });
                        return true;
                    }
                    
                    const storyData = await getStory(activeStory.id);
                    if (!storyData) {
                        await safeReply(interaction, { content: '❌ Story not found!', flags: 64 });
                        return true;
                    }
                    
                    const storyText = storyData.lines
                        .map((l: any) => `**Line ${l.line_number}** (by <@${l.user_id}>):\n${l.content}`)
                        .join('\n\n');
                    
                    const embed = new EmbedBuilder()
                        .setColor('#9B59B6')
                        .setTitle(`📖 ${storyData.story.title}`)
                        .setDescription(storyText.slice(0, 4000) + (storyText.length > 4000 ? '...' : ''))
                        .setFooter({ text: `${storyData.lines.length} lines • Story ID: ${storyData.story.id}` })
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed] });
                    return true;
                } else if (subcommand === 'finish') {
                    const channelId = interaction.channel?.id;
                    
                    if (!channelId) {
                        await safeReply(interaction, { content: '❌ Could not determine channel ID!', flags: 64 });
                        return true;
                    }
                    
                    const activeStory = await getActiveStory(guildId, channelId);
                    if (!activeStory) {
                        await safeReply(interaction, { content: '❌ No active story in this channel!', flags: 64 });
                        return true;
                    }
                    
                    await completeStory(activeStory.id);
                    
                    const storyData = await getStory(activeStory.id);
                    if (!storyData) {
                        await safeReply(interaction, { content: '✅ Story marked as complete!', flags: 64 });
                        return true;
                    }
                    
                    const storyText = storyData.lines
                        .map((l: any) => `**Line ${l.line_number}** (by <@${l.user_id}>):\n${l.content}`)
                        .join('\n\n');
                    
                    const embed = new EmbedBuilder()
                        .setColor('#2ECC71')
                        .setTitle(`📖 ${storyData.story.title} - THE END`)
                        .setDescription(storyText.slice(0, 4000) + (storyText.length > 4000 ? '...' : ''))
                        .setFooter({ text: `Completed story with ${storyData.lines.length} lines` })
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed] });
                    return true;
                }
                return false;
            }
            
            case 'birthday': {
                const subcommand = options.getSubcommand();
                const { setBirthday, getBirthday, getTodaysBirthdays, getUpcomingBirthdays, setBirthdayChannel } = await import('../services/funCommands');
                
                if (subcommand === 'set') {
                    const month = options.getInteger('month', true);
                    const day = options.getInteger('day', true);
                    const year = options.getInteger('year');
                    const timezone = options.getString('timezone');
                    
                    if (month < 1 || month > 12) {
                        await safeReply(interaction, { content: '❌ Month must be between 1 and 12!', flags: 64 });
                        return true;
                    }
                    if (day < 1 || day > 31) {
                        await safeReply(interaction, { content: '❌ Day must be between 1 and 31!', flags: 64 });
                        return true;
                    }
                    
                    await setBirthday(interaction.user.id, guildId, month, day, year || null, timezone || 'UTC');
                    
                    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                    const embed = new EmbedBuilder()
                        .setColor('#E91E63')
                        .setTitle('🎂 Birthday Set!')
                        .setDescription(`Your birthday has been set to **${monthNames[month]} ${day}${year ? `, ${year}` : ''}**`)
                        .setFooter({ text: `Timezone: ${timezone || 'UTC'}` })
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed], flags: 64 });
                    return true;
                } else if (subcommand === 'view') {
                    const targetUser = options.getUser('user') || interaction.user;
                    const birthday = await getBirthday(targetUser.id, guildId);
                    
                    if (!birthday) {
                        await safeReply(interaction, { content: `❌ ${targetUser.id === interaction.user.id ? 'You haven\'t' : 'That user hasn\'t'} set a birthday yet!`, flags: 64 });
                        return true;
                    }
                    
                    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                    const embed = new EmbedBuilder()
                        .setColor('#E91E63')
                        .setTitle(`🎂 ${targetUser.username}'s Birthday`)
                        .setDescription(`**${monthNames[birthday.month]} ${birthday.day}${birthday.year ? `, ${birthday.year}` : ''}**`)
                        .setFooter({ text: `Timezone: ${birthday.timezone}` })
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed] });
                    return true;
                } else if (subcommand === 'list') {
                    const days = options.getInteger('days') || 7;
                    const upcoming = await getUpcomingBirthdays(guildId, days);
                    
                    if (upcoming.length === 0) {
                        await safeReply(interaction, { content: `❌ No birthdays in the next ${days} days!`, flags: 64 });
                        return true;
                    }
                    
                    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                    const list = upcoming.map(b => `<@${b.user_id}> - ${monthNames[b.month]} ${b.day}`).join('\n');
                    
                    const embed = new EmbedBuilder()
                        .setColor('#E91E63')
                        .setTitle(`🎂 Upcoming Birthdays (Next ${days} days)`)
                        .setDescription(list)
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed] });
                    return true;
                } else if (subcommand === 'today') {
                    const now = new Date();
                    const today = await getTodaysBirthdays(guildId, now.getMonth() + 1, now.getDate());
                    
                    if (today.length === 0) {
                        await safeReply(interaction, { content: '❌ No birthdays today!', flags: 64 });
                        return true;
                    }
                    
                    const list = today.map(b => `<@${b.user_id}>`).join(', ');
                    
                    const embed = new EmbedBuilder()
                        .setColor('#E91E63')
                        .setTitle('🎂 Today\'s Birthdays!')
                        .setDescription(`🎉 ${list}`)
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed] });
                    return true;
                } else if (subcommand === 'setup') {
                    const channel = options.getChannel('channel', true);
                    const message = options.getString('message');
                    
                    await setBirthdayChannel(guildId, channel.id);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#E91E63')
                        .setTitle('🎂 Birthday Announcements Configured')
                        .setDescription(`Birthday announcements will be posted in <#${channel.id}>`)
                        .setFooter({ text: 'Use {user} as a placeholder for the birthday person' })
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed] });
                    return true;
                }
                return false;
            }
            
            case 'bingo': {
                const subcommand = options.getSubcommand();
                const { 
                    createBingoGame, 
                    generateBingoCard, 
                    createBingoCard, 
                    getBingoGame, 
                    getBingoCard, 
                    checkBingoWin,
                    callBingoWord
                } = await import('../services/funCommands');
                const { getDB } = await import('../services/db');
                
                if (subcommand === 'create') {
                    const theme = options.getString('theme', true);
                    const wordsStr = options.getString('words', true);
                    const words = wordsStr.split(',').map((w: string) => w.trim()).filter((w: string) => w.length > 0);
                    
                    if (words.length < 24) {
                        await safeReply(interaction, { content: '❌ You need at least 24 words to create a bingo game (5x5 grid with FREE center)!', flags: 64 });
                        return true;
                    }
                    
                    const gameId = await createBingoGame(guildId, interaction.channel?.id || '', interaction.user.id, theme, words);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle(`🎰 Bingo Game Created: ${theme}`)
                        .setDescription(`Players can join with \`/bingo join game_id:${gameId}\`\n\nHost can call words with \`/bingo call\``)
                        .addFields({ name: 'Words', value: words.slice(0, 10).join(', ') + (words.length > 10 ? '...' : '') })
                        .setFooter({ text: `Game ID: ${gameId}` })
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed] });
                    return true;
                } else if (subcommand === 'join') {
                    const gameId = options.getInteger('game_id', true);
                    const game = await getBingoGame(gameId);
                    
                    if (!game) {
                        await safeReply(interaction, { content: '❌ Game not found!', flags: 64 });
                        return true;
                    }
                    
                    if (game.status !== 'active') {
                        await safeReply(interaction, { content: '❌ This game has ended!', flags: 64 });
                        return true;
                    }
                    
                    const words = JSON.parse(game.words);
                    const cardData = generateBingoCard(gameId, words);
                    await createBingoCard(gameId, interaction.user.id, cardData);
                    
                    const gridText = cardData.map((row: string[], i: number) => 
                        row.map((word: string, j: number) => {
                            if (i === 2 && j === 2) return '🆓';
                            return word.slice(0, 10);
                        }).join(' | ')
                    ).join('\n');
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle(`🎰 Your Bingo Card - ${game.theme}`)
                        .setDescription('```\n' + gridText + '\n```')
                        .setFooter({ text: 'Use /bingo card to see your card again' })
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed], flags: 64 });
                    return true;
                } else if (subcommand === 'card') {
                    // Find user's most recent card
                    const db = getDB();
                    const card = db.prepare(`
                        SELECT bc.* FROM bingo_cards bc
                        JOIN bingo_games bg ON bc.game_id = bg.id
                        WHERE bc.user_id = ? AND bg.guild_id = ? AND bg.status = 'active'
                        ORDER BY bc.created_at DESC
                        LIMIT 1
                    `).get(interaction.user.id, guildId) as any;
                    
                    if (!card) {
                        await safeReply(interaction, { content: '❌ You haven\'t joined any active bingo games!', flags: 64 });
                        return true;
                    }
                    
                    const game = await getBingoGame(card.game_id);
                    if (!game) {
                        await safeReply(interaction, { content: '❌ Game not found!', flags: 64 });
                        return true;
                    }
                    
                    const marked = JSON.parse(card.marked || '[]');
                    const cardData = JSON.parse(card.card_data);
                    const gridText = cardData.map((row: string[], i: number) => 
                        row.map((word: string, j: number) => {
                            const pos = `${i},${j}`;
                            if (i === 2 && j === 2) return '✅';
                            if (marked.includes(pos)) return '✅';
                            return word.slice(0, 10);
                        }).join(' | ')
                    ).join('\n');
                    
                    const calledWords = JSON.parse(game.called_words || '[]');
                    const embed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle(`🎰 Your Bingo Card - ${game.theme}`)
                        .setDescription('```\n' + gridText + '\n```')
                        .addFields({ name: 'Called Words', value: calledWords.join(', ') || 'None yet' })
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed], flags: 64 });
                    return true;
                } else if (subcommand === 'call') {
                    const word = options.getString('word', true);
                    
                    // Find game where user is host
                    const db = getDB();
                    const game = db.prepare('SELECT * FROM bingo_games WHERE host_id = ? AND guild_id = ? AND status = ?').get(interaction.user.id, guildId, 'active') as any;
                    
                    if (!game) {
                        await safeReply(interaction, { content: '❌ You don\'t have an active game to host!', flags: 64 });
                        return true;
                    }
                    
                    const words = JSON.parse(game.words);
                    if (!words.includes(word)) {
                        await safeReply(interaction, { content: '❌ That word is not in this game!', flags: 64 });
                        return true;
                    }
                    
                    await callBingoWord(game.id, word);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle(`🎰 Word Called: ${word}`)
                        .setDescription(`All players can now mark **${word}** on their cards!`)
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed] });
                    return true;
                } else if (subcommand === 'bingo') {
                    // Find user's most recent card
                    const db = getDB();
                    const card = db.prepare(`
                        SELECT bc.* FROM bingo_cards bc
                        JOIN bingo_games bg ON bc.game_id = bg.id
                        WHERE bc.user_id = ? AND bg.guild_id = ? AND bg.status = 'active'
                        ORDER BY bc.created_at DESC
                        LIMIT 1
                    `).get(interaction.user.id, guildId) as any;
                    
                    if (!card) {
                        await safeReply(interaction, { content: '❌ You haven\'t joined any active bingo games!', flags: 64 });
                        return true;
                    }
                    
                    const marked = JSON.parse(card.marked || '[]');
                    const cardData = JSON.parse(card.card_data);
                    const hasWon = checkBingoWin(cardData, marked);
                    
                    if (!hasWon) {
                        await safeReply(interaction, { content: '❌ You don\'t have a bingo yet! Keep playing!', flags: 64 });
                        return true;
                    }
                    
                    const game = await getBingoGame(card.game_id);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle('🎉 BINGO! 🎉')
                        .setDescription(`<@${interaction.user.id}> has won the bingo game: **${game?.theme}**!`)
                        .setTimestamp();
                    
                    await safeReply(interaction, { embeds: [embed] });
                    
                    // End the game
                    db.prepare('UPDATE bingo_games SET status = ? WHERE id = ?').run('completed', card.game_id);
                    return true;
                }
                return false;
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