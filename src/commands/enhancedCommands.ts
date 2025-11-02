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

import { ChatInputCommandInteraction, EmbedBuilder, PermissionsBitField, Guild } from 'discord.js';
import { getPerkRolePreference, isPerkEnabled, getEmojiApprovalConfig, getColorRoleConfig } from '../config/perksConfig';
import { getDB } from '../services/db';
import { getSupportMemberStats, getSupportLeaderboard } from '../services/smartSupport';
import { searchKnowledge, addKnowledgeEntry, getTrendingKnowledge, suggestMissingKnowledge, getKnowledgeStats, buildFAQ } from '../services/preventiveSupport';
import { getUserAchievements, getUnlockedPerks, getAchievementLeaderboard, getUserPoints } from '../services/rewards';
import { analyzeServerTemporalPatterns, getPendingCheckIns } from '../services/temporalIntel';
import { getConversationEmotionalInsights } from '../services/emotionalIntel';
import { detectCommonPatterns } from '../services/preventiveSupport';
import { isOwnerId } from '../utils/owner';

export async function handleEnhancedCommands(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const name = interaction.commandName;
  const guildId = interaction.guild?.id || null;

  // Helper: ensure a role exists (creates if missing)
  const ensureRole = async (guild: Guild, roleName: string, opts?: { color?: number; permissions?: bigint }): Promise<string> => {
    // Try to find existing role by name
    const existing = guild.roles.cache.find(r => r.name === roleName);
    if (existing) return existing.id;
    // Create role
    const created = await guild.roles.create({
      name: roleName,
      color: opts?.color,
      permissions: opts?.permissions ? new PermissionsBitField(opts.permissions) : undefined,
      mentionable: false,
      reason: `Auto-created by perks claim`
    });
    return created.id;
  };

  // /supportstats [member]
  if (name === "supportstats") {
    const targetUser = interaction.options.getUser('member') || interaction.user;
    try {
      const stats = getSupportMemberStats(targetUser.id, guildId || '');
      
      if (!stats) {
        return await interaction.reply({ content: `No support stats found for <@${targetUser.id}>.`, ephemeral: true }) as any;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📊 Support Stats: ${targetUser.tag}`)
        .setColor(0x3498db)
        .addFields(
          { name: 'Resolution Rate', value: `${(stats.resolutionRate * 100).toFixed(1)}%`, inline: true },
          { name: 'Avg Response Time', value: `${stats.avgResponseTime?.toFixed(1) || 0} min`, inline: true },
          { name: 'Rating', value: `${stats.avgRating?.toFixed(1) || 0}/5.0⭐`, inline: true },
          { name: 'Total Cases', value: stats.totalInteractions.toString(), inline: true },
          { name: 'Current Streak', value: `${stats.currentStreak} days 🔥`, inline: true },
          { name: 'Resolved', value: stats.resolvedCount.toString(), inline: true }
        );

      if (stats.expertise && stats.expertise.length > 0) {
        const expertiseText = stats.expertise
          .slice(0, 5)
          .map((e: any) => `${e.category}: ${(e.successRate * 100).toFixed(0)}%`)
          .join('\n');
        embed.addFields({ name: 'Expertise', value: expertiseText, inline: false });
      }

      await interaction.reply({ embeds: [embed], ephemeral: false });
      return true;
    } catch (err: any) {
      console.error('supportstats failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /leaderboard <type> [category]
  if (name === "leaderboard") {
    const type = interaction.options.getString('type', true);
    const category = interaction.options.getString('category');

    try {
      let embed: EmbedBuilder;

      if (type === 'points') {
        const leaderboard = getAchievementLeaderboard(guildId, 10);
        if (leaderboard.length === 0) {
          return await interaction.reply({ content: 'No achievement data yet.', ephemeral: true }) as any;
        }
        embed = new EmbedBuilder()
          .setTitle('🏆 Achievement Leaderboard')
          .setColor(0xf1c40f)
          .setDescription(
            leaderboard.map((entry, i) => 
              `**${i + 1}.** <@${entry.user_id}> - ${entry.total_points} pts (${entry.achievement_count} achievements)`
            ).join('\n')
          );
      } else if (type === 'support_category' && category) {
        // For now, just show achievement leaderboard (category-specific support leaderboards not yet implemented)
        const leaderboard = getAchievementLeaderboard(guildId, 10);
        if (leaderboard.length === 0) {
          return await interaction.reply({ content: `No data yet.`, ephemeral: true }) as any;
        }
        embed = new EmbedBuilder()
          .setTitle(`🎯 Leaderboard`)
          .setColor(0x9b59b6)
          .setDescription(
            leaderboard.map((entry: any, i: any) => 
              `**${i + 1}.** <@${entry.user_id}> - ${entry.total_points} pts`
            ).join('\n')
          );
      } else {
        // Support leaderboards: resolution, speed, rating, volume
        const leaderboard = getSupportLeaderboard(guildId || '');
        if (leaderboard.length === 0) {
          return await interaction.reply({ content: `No support data yet.`, ephemeral: true }) as any;
        }
        
        embed = new EmbedBuilder()
          .setTitle(`📊 Support Leaderboard`)
          .setColor(0x3498db)
          .setDescription(
            leaderboard.map((entry: any, i: any) => 
              `**${i + 1}.** <@${entry.supporterId}> - ${entry.totalInteractions} cases`
            ).join('\n')
          );
      }

      await interaction.reply({ embeds: [embed], ephemeral: false });
      return true;
    } catch (err: any) {
      console.error('leaderboard failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /kb <subcommand> - Knowledge Base System
  // This is an AI-powered FAQ system that learns from support interactions
  // 
  // Subcommands:
  // • /kb search <query> - Search for answers in the knowledge base
  //   Example: /kb search how to reset password
  //   Use this when users have questions - it searches all FAQ entries
  //
  // • /kb add <category> <question> <answer> [tags] - Add a new FAQ entry (Admin)
  //   Example: /kb add setup "How do I join?" "Click the invite link in #welcome"
  //   Use this to manually add common questions and answers
  //   Categories: setup, billing, features, technical, etc.
  //   Tags help with search accuracy (comma-separated)
  //
  // • /kb trending [days] - See most-viewed knowledge entries
  //   Example: /kb trending 30
  //   Shows which FAQs are being accessed most often
  //   Helps identify what users care about
  //
  // • /kb suggest [days] - AI suggests missing FAQ entries (Admin)
  //   Example: /kb suggest 7
  //   Analyzes recent support questions to find gaps
  //   Shows what FAQs you should add based on user questions
  //
  // • /kb stats - View knowledge base analytics (Admin)
  //   Shows total entries, categories, helpfulness ratings
  //   Helps track how well your knowledge base is serving users
  //
  if (name === "kb") {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'search') {
        const query = interaction.options.getString('query', true);
        const results = searchKnowledge(guildId, query, 5);
        
        if (results.length === 0) {
          return await interaction.reply({ content: `No knowledge base entries found for "${query}".`, ephemeral: true }) as any;
        }

        const embed = new EmbedBuilder()
          .setTitle(`📚 Knowledge Base Search: "${query}"`)
          .setColor(0x2ecc71)
          .setDescription(
            results.map((r, i) => 
              `**${i + 1}. ${r.question}**\n${r.answer.slice(0, 200)}${r.answer.length > 200 ? '...' : ''}\n*Helped ${r.times_helpful} times*`
            ).join('\n\n')
          );

        await interaction.reply({ embeds: [embed], ephemeral: false });
        return true;
      }

      if (subcommand === 'add') {
        const category = interaction.options.getString('category', true);
        const question = interaction.options.getString('question', true);
        const answer = interaction.options.getString('answer', true);
        const tagsRaw = interaction.options.getString('tags');
        const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()) : undefined;

        addKnowledgeEntry({
          guildId,
          category,
          question,
          answer,
          tags,
          addedBy: interaction.user.id
        });

        await interaction.reply({ content: `✅ Added knowledge entry to category "${category}".`, ephemeral: true });
        return true;
      }

      if (subcommand === 'trending') {
        const days = interaction.options.getInteger('days') || 7;
        const trending = getTrendingKnowledge(guildId, 10, days);

        if (trending.length === 0) {
          return await interaction.reply({ content: `No trending knowledge in the last ${days} days.`, ephemeral: true }) as any;
        }

        const embed = new EmbedBuilder()
          .setTitle(`🔥 Trending Knowledge (Last ${days} Days)`)
          .setColor(0xe74c3c)
          .setDescription(
            trending.map((t, i) => 
              `**${i + 1}. ${t.question}** (${t.times_helpful} times)`
            ).join('\n')
          );

        await interaction.reply({ embeds: [embed], ephemeral: false });
        return true;
      }

      if (subcommand === 'suggest') {
        const days = interaction.options.getInteger('days') || 7;
        const suggestions = suggestMissingKnowledge(guildId, days);

        if (suggestions.length === 0) {
          return await interaction.reply({ content: `No knowledge gaps detected in the last ${days} days.`, ephemeral: true }) as any;
        }

        const embed = new EmbedBuilder()
          .setTitle(`💡 Suggested Knowledge Entries (Last ${days} Days)`)
          .setColor(0xf39c12)
          .setDescription(
            suggestions.slice(0, 10).map((s, i) => 
              `**${i + 1}.** ${s.suggestedQuestion}\n*${s.reason}*`
            ).join('\n\n')
          );

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return true;
      }

      if (subcommand === 'stats') {
        const stats = getKnowledgeStats(guildId);

        const embed = new EmbedBuilder()
          .setTitle('📈 Knowledge Base Statistics')
          .setColor(0x3498db)
          .addFields(
            { name: 'Total Entries', value: stats.totalEntries.toString(), inline: true },
            { name: 'Categories', value: stats.totalCategories.toString(), inline: true },
            { name: 'Avg Helpfulness', value: stats.averageHelpfulness.toFixed(1), inline: true },
            { name: 'Recent Contributions (7d)', value: stats.recentContributions.toString(), inline: true }
          );

        if (stats.mostHelpfulEntry) {
          embed.addFields({
            name: 'Most Helpful Entry',
            value: `**${stats.mostHelpfulEntry.question}** (${stats.mostHelpfulEntry.times_helpful} times)`,
            inline: false
          });
        }

        await interaction.reply({ embeds: [embed], ephemeral: false });
        return true;
      }
    } catch (err: any) {
      console.error('kb command failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /achievements [user]
  if (name === "achievements") {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    try {
      const achievements = getUserAchievements(targetUser.id, guildId);
      const totalPoints = getUserPoints(targetUser.id, guildId);

      if (achievements.length === 0) {
        return await interaction.reply({ content: `<@${targetUser.id}> hasn't earned any achievements yet.`, ephemeral: true }) as any;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Achievements: ${targetUser.tag}`)
        .setColor(0xf1c40f)
        .setDescription(`**Total Points:** ${totalPoints}`)
        .addFields(
          achievements.slice(0, 10).map(a => ({
            name: `${a.achievement_name} (${a.points} pts)`,
            value: `${a.category} • ${new Date(a.awarded_at).toLocaleDateString()}`,
            inline: false
          }))
        );

      if (achievements.length > 10) {
        embed.setFooter({ text: `...and ${achievements.length - 10} more achievements` });
      }

      await interaction.reply({ embeds: [embed], ephemeral: false });
      return true;
    } catch (err: any) {
      console.error('achievements failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /perks
  if (name === "perks") {
    try {
      const perks = getUnlockedPerks(interaction.user.id, guildId);
      const totalPoints = getUserPoints(interaction.user.id, guildId);

      const embed = new EmbedBuilder()
        .setTitle('🎁 Your Unlockable Perks')
        .setColor(0x9b59b6)
        .setDescription(`**Your Points:** ${totalPoints}`)
        .setFooter({ text: 'Claim with /claimperk <id>. For color: /setcolor. For emoji: /requestemoji.' })
        .addFields(
          perks.map(p => ({
            name: `${p.unlocked ? '✅' : '🔒'} ${p.name}`,
            value: `${p.description}\n*${p.unlocked ? 'Unlocked!' : `Requires ${(p as any).requiredPoints} points`}*`,
            inline: false
          }))
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return true;
    } catch (err: any) {
      console.error('perks failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /claimperk perk:<id>
  if (name === "claimperk") {
    try {
      if (!interaction.guild) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return true;
      }
      const perkIdRaw = (interaction.options.getString('perk', true) || '').toLowerCase().trim();
      const validPerks = ['custom_color','priority_support','custom_emoji','channel_suggest','voice_priority','exclusive_role'];
      if (!validPerks.includes(perkIdRaw)) {
        await interaction.reply({ content: `Unknown perk. Choose one of: ${validPerks.join(', ')}`, ephemeral: true });
        return true;
      }

      // Check config enabled
      if (!isPerkEnabled(perkIdRaw as any)) {
        await interaction.reply({ content: 'This perk is disabled by server configuration.', ephemeral: true });
        return true;
      }

      const perks = getUnlockedPerks(interaction.user.id, guildId);
      const target = perks.find((p: any) => p.id === perkIdRaw);
      if (!target) {
        await interaction.reply({ content: `That perk is not recognized.`, ephemeral: true });
        return true;
      }
      if (!target.unlocked) {
        const req = (target as any).requiredPoints;
        await interaction.reply({ content: `You haven't unlocked this perk yet. Requires ${req} points. Use /achievements to see your total.`, ephemeral: true });
        return true;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);
      const guild = interaction.guild;

      if (perkIdRaw === 'custom_color') {
        // Guide user to set a color using /setcolor
        await interaction.reply({ content: `✅ Perk available! Use /setcolor hex:#RRGGBB to choose your role color.`, ephemeral: true });
        return true;
      }

      if (perkIdRaw === 'priority_support') {
        const pref = getPerkRolePreference('priority_support');
        const roleId = pref.roleId || await ensureRole(guild, pref.roleName || 'Priority Support');
        await member.roles.add(roleId).catch(() => {});
        await interaction.reply({ content: `✅ Priority Support role granted. Your questions may be handled first.`, ephemeral: true });
        return true;
      }

      if (perkIdRaw === 'custom_emoji') {
        await interaction.reply({ content: `✅ Perk available! Use /requestemoji name:<short_name> image:<attachment> to create your emoji.`, ephemeral: true });
        return true;
      }

      if (perkIdRaw === 'channel_suggest') {
        const pref = getPerkRolePreference('channel_suggest');
        const roleId = pref.roleId || await ensureRole(guild, pref.roleName || 'Channel Suggest');
        await member.roles.add(roleId).catch(() => {});
        await interaction.reply({ content: `✅ You can propose new channels. Share your idea with the admins!`, ephemeral: true });
        return true;
      }

      if (perkIdRaw === 'voice_priority') {
        const perms = PermissionsBitField.Flags.PrioritySpeaker;
        const pref = getPerkRolePreference('voice_priority');
        const roleId = pref.roleId || await ensureRole(guild, pref.roleName || 'Voice Priority', { permissions: BigInt(perms) });
        await member.roles.add(roleId).catch(() => {});
        await interaction.reply({ content: `✅ Voice Priority granted. You have priority speaker in supported voice channels.`, ephemeral: true });
        return true;
      }

      if (perkIdRaw === 'exclusive_role') {
        const pref = getPerkRolePreference('exclusive_role');
        const roleId = pref.roleId || await ensureRole(guild, pref.roleName || 'Exclusive VIP');
        await member.roles.add(roleId).catch(() => {});
        await interaction.reply({ content: `✅ Exclusive VIP role granted. Welcome to the club.`, ephemeral: true });
        return true;
      }

      return true;
    } catch (err: any) {
      console.error('claimperk failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /setcolor hex:#RRGGBB - requires custom_color perk
  if (name === "setcolor") {
    try {
      if (!interaction.guild) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return true;
      }
      const colorCfg = getColorRoleConfig();
      if (!colorCfg.allowUserSet) {
        await interaction.reply({ content: 'Setting custom color is disabled by server configuration.', ephemeral: true });
        return true;
      }
      const hex = (interaction.options.getString('hex', true) || '').trim();
      const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
      if (!m) {
        await interaction.reply({ content: 'Please provide a valid hex color like #FF8800.', ephemeral: true });
        return true;
      }
      const color = parseInt(m[1], 16);
      const perks = getUnlockedPerks(interaction.user.id, guildId);
      const cc = perks.find((p: any) => p.id === 'custom_color');
      if (!cc || !cc.unlocked) {
        await interaction.reply({ content: 'You have not unlocked Custom Role Color yet. Use /perks to see requirements.', ephemeral: true });
        return true;
      }
      const guild = interaction.guild;
      const member = await guild.members.fetch(interaction.user.id);
      const roleName = (colorCfg.namePattern || 'cc-{userId}').replace('{userId}', interaction.user.id);
      const existing = guild.roles.cache.find(r => r.name === roleName);
      if (existing) {
        await existing.setColor(color).catch(() => {});
        await member.roles.add(existing).catch(() => {});
      } else {
        const created = await guild.roles.create({ name: roleName, color, reason: 'Custom color perk role', mentionable: false });
        await member.roles.add(created).catch(() => {});
      }
      await interaction.reply({ content: `✅ Color updated to #${m[1].toUpperCase()}. If you don’t see it, drag your custom color role above your other roles.`, ephemeral: true });
      return true;
    } catch (err: any) {
      console.error('setcolor failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /requestemoji name:<string> image:<attachment> - requires custom_emoji perk
  if (name === "requestemoji") {
    try {
      if (!interaction.guild) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return true;
      }
      const perks = getUnlockedPerks(interaction.user.id, guildId);
      const ce = perks.find((p: any) => p.id === 'custom_emoji');
      if (!ce || !ce.unlocked) {
        await interaction.reply({ content: 'You have not unlocked Custom Emoji yet. Use /perks to see requirements.', ephemeral: true });
        return true;
      }
      const name = (interaction.options.getString('name', true) || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32);
      const attach = interaction.options.getAttachment('image', true)!;

      const approval = getEmojiApprovalConfig();
      if (approval.requireApproval) {
        // Queue request in DB
        const db = getDB();
        const now = new Date().toISOString();
        const res = db.prepare(`
          INSERT INTO emoji_requests (guild_id, user_id, name, attachment_url, status, created_at)
          VALUES (?, ?, ?, ?, 'pending', ?)
        `).run(interaction.guild.id, interaction.user.id, name, attach.url, now);
        const reqId = res.lastInsertRowid as number;

        // Post approval message if channel configured
        if (approval.approvalChannelId) {
          try {
            const ch = await interaction.client.channels.fetch(approval.approvalChannelId);
            if (ch && 'send' in ch) {
              const row = new (await import('discord.js')).ActionRowBuilder((await import('discord.js')).ButtonBuilder as any)
                .addComponents(
                  new (await import('discord.js')).ButtonBuilder().setCustomId(`perk-emoji-approve:${reqId}`).setLabel('Approve').setStyle((await import('discord.js')).ButtonStyle.Success),
                  new (await import('discord.js')).ButtonBuilder().setCustomId(`perk-emoji-reject:${reqId}`).setLabel('Reject').setStyle((await import('discord.js')).ButtonStyle.Danger)
                );
              // @ts-ignore types
              await (ch as any).send({ content: `Emoji request #${reqId} by <@${interaction.user.id}>: ${name}\n${attach.url}`, components: [row] });
            }
          } catch (e) {
            console.warn('Failed to post approval message:', (e as any)?.message ?? e);
          }
        }

        await interaction.reply({ content: `✅ Your emoji request has been queued for approval (ID: ${reqId}).`, ephemeral: true });
        return true;
      }

      // Direct-create path (no approval)
      // Permission check
      const me = await interaction.guild.members.fetchMe();
      if (!me.permissions.has(PermissionsBitField.Flags.ManageEmojisAndStickers)) {
        await interaction.reply({ content: 'I need the Manage Emojis and Stickers permission to create emojis.', ephemeral: true });
        return true;
      }

      await interaction.deferReply({ ephemeral: true });
      let buffer: Buffer | null = null;
      try {
        const res = await fetch(attach.url);
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      } catch {
        buffer = null;
      }
      if (!buffer) {
        await interaction.editReply('Could not download the attachment. Please try again.');
        return true;
      }
      try {
        const emoji = await interaction.guild.emojis.create({ attachment: buffer, name });
        await interaction.editReply(`✅ Emoji created: <:${emoji.name}:${emoji.id}>`);
      } catch (e: any) {
        console.error('emoji create failed', e);
        await interaction.editReply(`Failed to create emoji: ${e?.message ?? e}`);
      }
      return true;
    } catch (err: any) {
      console.error('requestemoji failed:', err);
      if (interaction.deferred) await interaction.editReply(`Failed: ${err?.message ?? err}`);
      else await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /patterns (Admin only)
  if (name === "patterns") {
    if (!isOwnerId(interaction.user.id)) {
      return await interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true }) as any;
    }

    try {
      const patterns = analyzeServerTemporalPatterns(guildId);

      const embed = new EmbedBuilder()
        .setTitle('⏰ Server Activity Patterns')
        .setColor(0x3498db)
        .addFields(
          { name: 'Peak Activity Hours', value: patterns.peakActivityHours.map(h => `${h}:00`).join(', ') || 'N/A', inline: false },
          { name: 'Quiet Hours', value: patterns.quietHours.map(h => `${h}:00`).join(', ') || 'N/A', inline: false },
          { name: 'Average Timezone', value: patterns.averageTimezone || 'Unknown', inline: false },
          { name: 'Busiest Support Hours', value: patterns.supportBusiestHours.map(h => `${h}:00`).join(', ') || 'N/A', inline: false }
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return true;
    } catch (err: any) {
      console.error('patterns failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /insights (Admin only)
  if (name === "insights") {
    if (!isOwnerId(interaction.user.id)) {
      return await interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true }) as any;
    }

    try {
      const patterns = analyzeServerTemporalPatterns(guildId);
      
      const embed = new EmbedBuilder()
        .setTitle('🔮 Temporal Intelligence Insights')
        .setColor(0x9b59b6)
        .setDescription('Server activity predictions and recommendations')
        .addFields(
          { name: 'Recommended Announcement Time', value: patterns.peakActivityHours.length > 0 ? `${patterns.peakActivityHours[0]}:00 (peak activity)` : 'N/A', inline: false },
          { name: 'Best Support Coverage Hours', value: patterns.supportBusiestHours.slice(0, 3).map(h => `${h}:00`).join(', ') || 'N/A', inline: false },
          { name: 'Server Timezone', value: patterns.averageTimezone || 'Mixed timezones', inline: false }
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return true;
    } catch (err: any) {
      console.error('insights failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /checkins (Admin only)
  if (name === "checkins") {
    if (!isOwnerId(interaction.user.id)) {
      return await interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true }) as any;
    }

    try {
      const pending = getPendingCheckIns(guildId);

      if (pending.length === 0) {
        return await interaction.reply({ content: 'No pending check-ins at this time.', ephemeral: true }) as any;
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Pending Proactive Check-ins')
        .setColor(0xe74c3c)
        .setDescription(
          pending.slice(0, 10).map(c => 
            `<@${c.user_id}> • ${c.reason}\n*Scheduled: ${new Date(c.scheduled_for).toLocaleString()}*`
          ).join('\n\n')
        );

      if (pending.length > 10) {
        embed.setFooter({ text: `...and ${pending.length - 10} more pending check-ins` });
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return true;
    } catch (err: any) {
      console.error('checkins failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /sentiment [channel] (Admin only)
  if (name === "sentiment") {
    if (!isOwnerId(interaction.user.id)) {
      return await interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true }) as any;
    }

    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    if (!targetChannel) {
      return await interaction.reply({ content: 'Could not determine channel.', ephemeral: true }) as any;
    }

    try {
      const insights = getConversationEmotionalInsights(targetChannel.id, 1);

      const moodEmoji: Record<string, string> = {
        very_negative: '😡',
        negative: '😟',
        neutral: '😐',
        positive: '😊',
        very_positive: '🤩'
      };

      const embed = new EmbedBuilder()
        .setTitle(`💭 Emotional Insights: #${(targetChannel as any).name || 'Unknown'}`)
        .setColor(0xe67e22)
        .addFields(
          { name: 'Overall Mood', value: `${moodEmoji[insights.overallMood]} ${insights.overallMood.replace('_', ' ')}`, inline: true },
          { name: 'Needs Attention', value: insights.needsAttention ? '⚠️ Yes' : '✅ No', inline: true },
          { name: 'Celebration Opportunities', value: insights.celebrationOpportunities.toString(), inline: true },
          { name: 'Frustration Spikes', value: insights.frustrationSpikes.toString(), inline: true }
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return true;
    } catch (err: any) {
      console.error('sentiment failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /commonissues [hours] (Admin only)
  if (name === "commonissues") {
    if (!isOwnerId(interaction.user.id)) {
      return await interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true }) as any;
    }

    const hours = interaction.options.getInteger('hours') || 24;

    try {
      const patterns = detectCommonPatterns(guildId, hours);

      if (patterns.length === 0) {
        return await interaction.reply({ content: `No recurring patterns detected in the last ${hours} hours.`, ephemeral: true }) as any;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Common Issues (Last ${hours}h)`)
        .setColor(0xe74c3c)
        .setDescription(
          patterns.slice(0, 10).map(p => 
            `**${p.pattern}** - ${p.occurrences} times\n*${p.suggestedKnowledgeEntry}*`
          ).join('\n\n')
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return true;
    } catch (err: any) {
      console.error('commonissues failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  // /faq [category]
  if (name === "faq") {
    const category = interaction.options.getString('category');

    try {
      const faq = buildFAQ(guildId, category || undefined, 20);

      if (faq.length === 0) {
        return await interaction.reply({ content: category ? `No FAQ entries for category "${category}".` : 'No FAQ entries yet.', ephemeral: true }) as any;
      }

      const embed = new EmbedBuilder()
        .setTitle(category ? `❓ FAQ: ${category}` : '❓ Frequently Asked Questions')
        .setColor(0x2ecc71);

      for (const cat of faq.slice(0, 3)) {
        const entries = cat.entries.slice(0, 5);
        const text = entries.map(e => `**Q:** ${e.question}\n**A:** ${e.answer.slice(0, 100)}...`).join('\n\n');
        embed.addFields({ name: cat.category, value: text.slice(0, 1024), inline: false });
      }

      await interaction.reply({ embeds: [embed], ephemeral: false });
      return true;
    } catch (err: any) {
      console.error('faq failed:', err);
      await interaction.reply({ content: `Failed: ${err?.message ?? err}`, ephemeral: true });
      return true;
    }
  }

  return false; // Command not handled
}
