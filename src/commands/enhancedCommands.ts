/**
 * Enhanced Features Command Handlers
 * Handles all slash commands for the 10 new advanced features
 */

import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
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

  // /kb <subcommand>
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
