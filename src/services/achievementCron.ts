/**
 * Achievement Cron Jobs
 * Run these tasks periodically to check time-based achievements
 */

import { getDB } from './db';
import { checkAndAwardAchievements } from './rewards';

/**
 * Check and award streak-based achievements for all users
 * Run this daily (e.g., at midnight)
 */
export function checkStreakAchievements() {
  const db = getDB();
  
  // Build participant list (primary + helpers)
  const interactions = db.prepare(`SELECT * FROM support_interactions`).all() as any[];
  const userGuildPairs = new Set<string>();
  for (const r of interactions) {
    userGuildPairs.add(`${r.support_member_id}::${r.guild_id}`);
    if (r.helpers) {
      try {
        const helpers = JSON.parse(r.helpers) as string[];
        for (const h of helpers) userGuildPairs.add(`${h}::${r.guild_id}`);
      } catch {}
    }
  }
  const users = Array.from(userGuildPairs).map(k => ({ user_id: k.split('::')[0], guild_id: k.split('::')[1] }));
  
  let awardsGiven = 0;
  
  for (const { user_id, guild_id } of users) {
    try {
      // Calculate current streak
      const rows = db.prepare(`
        SELECT started_at, support_member_id, helpers, was_resolved FROM support_interactions
        WHERE guild_id = ? AND was_resolved = TRUE
      `).all(guild_id) as any[];
      const days = new Set<string>();
      for (const r of rows) {
        const involved = r.support_member_id === user_id || (r.helpers && (()=>{ try { return (JSON.parse(r.helpers) as string[]).includes(user_id); } catch { return false; } })());
        if (!involved) continue;
        const day = new Date(r.started_at).toISOString().split('T')[0];
        days.add(day);
      }
      
      let streak = 0;
      const today = new Date().toISOString().split('T')[0];
      let checkDate = new Date();
      
      for (let i = 0; i < 30; i++) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (days.has(dateStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (dateStr !== today) {
          break;
        } else {
          checkDate.setDate(checkDate.getDate() - 1);
        }
      }
      
      // Check for streak achievements
      const awarded = checkAndAwardAchievements(user_id, guild_id, { currentStreak: streak });
      awardsGiven += awarded.length;
    } catch (e) {
      console.error(`Failed to check streak for user ${user_id}:`, e);
    }
  }
  
  console.log(`✅ Checked streaks for ${users.length} users, awarded ${awardsGiven} achievements`);
  return awardsGiven;
}

/**
 * Check and update all user stats for achievements
 * Run this periodically (e.g., hourly or daily)
 */
export function checkAllAchievements() {
  const db = getDB();
  
  // Build participants from interactions (ensures we cover support contributors)
  const interactions = db.prepare(`SELECT * FROM support_interactions`).all() as any[];
  const userGuildPairs = new Set<string>();
  for (const r of interactions) {
    userGuildPairs.add(`${r.support_member_id}::${r.guild_id}`);
    if (r.helpers) {
      try { for (const h of JSON.parse(r.helpers) as string[]) userGuildPairs.add(`${h}::${r.guild_id}`); } catch {}
    }
  }
  const users = Array.from(userGuildPairs).map(k => ({ user_id: k.split('::')[0], guild_id: k.split('::')[1] as string }));
  
  let totalAwarded = 0;
  
  for (const { user_id, guild_id } of users) {
    try {
      // Gather comprehensive stats
      const stats: any = {};
      
      // Support stats (weighted 70/30)
      try {
        const rows = db.prepare(`SELECT * FROM support_interactions WHERE guild_id = ?`).all(guild_id) as any[];
        let total = 0, resolved = 0, fast = 0;
        for (const r of rows) {
          const helpers: string[] = (()=>{ try { return r.helpers ? JSON.parse(r.helpers) : []; } catch { return []; } })();
          const hasHelpers = helpers.length > 0;
          let w = 0;
          if (r.support_member_id === user_id) w = hasHelpers ? 0.7 : 1.0;
          if (helpers.includes(user_id)) w = 0.3 / helpers.length;
          if (w <= 0) continue;
          total += w;
          if (r.was_resolved) {
            resolved += w;
            if ((r.resolution_time_seconds || 0) < 300) fast += w;
          }
        }
        stats.totalAssists = total;
        stats.totalCases = total;
        stats.fastResolutions = fast;
        stats.resolutionRate = total > 0 ? (resolved / total) : 0;
      } catch (e) { /* ignore */ }
      
      // Knowledge contributions
      try {
        const kbCount = db.prepare(`
          SELECT COUNT(*) as count FROM knowledge_base
          WHERE added_by = ? AND guild_id = ?
        `).get(user_id, guild_id) as { count: number };
        stats.knowledgeEntries = kbCount?.count || 0;
        stats.qaPairs = kbCount?.count || 0;
      } catch (e) { /* ignore */ }
      
      // Message count
      try {
        const patterns = db.prepare(`
          SELECT message_count FROM user_patterns
          WHERE user_id = ? AND guild_id = ?
        `).get(user_id, guild_id) as { message_count: number };
        stats.totalMessages = patterns?.message_count || 0;
      } catch (e) { /* ignore */ }
      
      // Welcome count
      try {
        const welcomeCount = db.prepare(`
          SELECT COUNT(*) as count FROM user_interactions
          WHERE user_id = ? AND guild_id = ? AND interaction_type = 'welcomed_user'
        `).get(user_id, guild_id) as { count: number };
        stats.welcomedUsers = welcomeCount?.count || 0;
      } catch (e) { /* ignore */ }
      
      // Unique interactions
      try {
        const uniqueCount = db.prepare(`
          SELECT COUNT(DISTINCT channel_id) as count
          FROM sentiment_history
          WHERE user_id = ? AND guild_id = ?
        `).get(user_id, guild_id) as { count: number };
        stats.uniqueInteractions = uniqueCount?.count || 0;
      } catch (e) { /* ignore */ }
      
      const awarded = checkAndAwardAchievements(user_id, guild_id, stats);
      totalAwarded += awarded.length;
      
    } catch (e) {
      console.error(`Failed to check achievements for user ${user_id}:`, e);
    }
  }
  
  console.log(`✅ Checked achievements for ${users.length} users, awarded ${totalAwarded} total`);
  return totalAwarded;
}

/**
 * Check and process expired staff suspensions
 * Run this hourly to restore roles with demotion
 */
export async function checkExpiredSuspensions(client: any) {
  const { getActiveSuspensions, processExpiredSuspensions } = await import('./staffSuspension');
  const { getModLogChannelId } = await import('../config');
  
  const suspensions = getActiveSuspensions();
  const now = new Date();
  let processedCount = 0;
  
  for (const suspension of suspensions) {
    const endDate = new Date(suspension.end_date);
    if (now >= endDate) {
      try {
        const guild = await client.guilds.fetch(suspension.guild_id);
        if (!guild) continue;
        
        const modLogChannelId = getModLogChannelId();
        const modLogChannel = modLogChannelId ? await guild.channels.fetch(modLogChannelId).catch(() => null) : null;
        
        await processExpiredSuspensions(guild, modLogChannel || undefined);
        processedCount++;
      } catch (err) {
        console.error(`Failed to process expired suspension for user ${suspension.user_id}:`, err);
      }
    }
  }
  
  if (processedCount > 0) {
    console.log(`✅ Processed ${processedCount} expired suspension(s)`);
  }
  
  return processedCount;
}

/**
 * Start the achievement cron jobs
 * This sets up periodic checks
 */
export function startAchievementCron(client?: any) {
  // Check streaks daily at midnight
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();
  
  setTimeout(() => {
    checkStreakAchievements();
    // Then every 24 hours
    setInterval(checkStreakAchievements, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
  
  // Check all achievements every 6 hours
  setInterval(checkAllAchievements, 6 * 60 * 60 * 1000);
  
  // Run an initial check on startup (after a short delay)
  setTimeout(checkAllAchievements, 60 * 1000); // 1 minute after startup
  
  // Check expired suspensions every hour if client is provided
  if (client) {
    setInterval(() => checkExpiredSuspensions(client), 60 * 60 * 1000); // Every hour
    // Initial check after 2 minutes
    setTimeout(() => checkExpiredSuspensions(client), 2 * 60 * 1000);
    console.log('📅 Achievement and suspension cron jobs started');
  } else {
    console.log('📅 Achievement cron jobs started');
  }
}
