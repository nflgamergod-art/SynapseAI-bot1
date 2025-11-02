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
  
  // Get all users who have support interactions
  const users = db.prepare(`
    SELECT DISTINCT supporter_id as user_id, guild_id
    FROM support_interactions
  `).all() as { user_id: string; guild_id: string }[];
  
  let awardsGiven = 0;
  
  for (const { user_id, guild_id } of users) {
    try {
      // Calculate current streak
      const recentDays = db.prepare(`
        SELECT DISTINCT DATE(created_at) as day
        FROM support_interactions
        WHERE supporter_id = ? AND guild_id = ?
        ORDER BY day DESC
        LIMIT 30
      `).all(user_id, guild_id) as { day: string }[];
      
      let streak = 0;
      const today = new Date().toISOString().split('T')[0];
      let checkDate = new Date();
      
      for (let i = 0; i < 30; i++) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (recentDays.some(d => d.day.startsWith(dateStr))) {
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
  
  // Get all active users
  const users = db.prepare(`
    SELECT DISTINCT user_id, guild_id
    FROM user_patterns
  `).all() as { user_id: string; guild_id: string | null }[];
  
  let totalAwarded = 0;
  
  for (const { user_id, guild_id } of users) {
    try {
      // Gather comprehensive stats
      const stats: any = {};
      
      // Support stats
      try {
        const supportStats = db.prepare(`
          SELECT 
            COUNT(*) as totalAssists,
            SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolvedCount,
            SUM(CASE WHEN response_time_minutes < 5 AND status = 'resolved' THEN 1 ELSE 0 END) as fastResolutions
          FROM support_interactions
          WHERE supporter_id = ? AND guild_id = ?
        `).get(user_id, guild_id) as any;
        
        if (supportStats) {
          stats.totalAssists = supportStats.totalAssists || 0;
          stats.totalCases = supportStats.totalAssists || 0;
          stats.fastResolutions = supportStats.fastResolutions || 0;
          
          if (stats.totalCases > 0) {
            stats.resolutionRate = (supportStats.resolvedCount || 0) / stats.totalCases;
          }
        }
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
 * Start the achievement cron jobs
 * This sets up periodic checks
 */
export function startAchievementCron() {
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
  
  console.log('📅 Achievement cron jobs started');
}
