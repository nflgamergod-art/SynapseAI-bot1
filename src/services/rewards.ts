import { getDB } from './db';

/**
 * Contextual Micro-Rewards System
 * Features:
 * - Achievement tracking
 * - Support assist streaks
 * - Unlockable perks
 * - Community milestones
 * - Recognition badges
 */

function nowISO() {
  return new Date().toISOString();
}

export type AchievementCategory = 'support' | 'community' | 'knowledge' | 'social' | 'milestone';

// Define achievement types
export const ACHIEVEMENTS = {
  // Support achievements
  first_assist: { id: 'first_assist', name: 'First Assist', description: 'Helped your first user', category: 'support' as AchievementCategory, points: 10 },
  streak_3: { id: 'streak_3', name: '3-Day Streak', description: 'Helped users for 3 days in a row', category: 'support' as AchievementCategory, points: 25 },
  streak_7: { id: 'streak_7', name: 'Week Warrior', description: 'Helped users for 7 days in a row', category: 'support' as AchievementCategory, points: 50 },
  speed_demon: { id: 'speed_demon', name: 'Speed Demon', description: 'Resolved 5 issues in under 5 minutes each', category: 'support' as AchievementCategory, points: 30 },
  expert_helper: { id: 'expert_helper', name: 'Expert Helper', description: 'Maintained 95%+ resolution rate over 20 cases', category: 'support' as AchievementCategory, points: 75 },
  
  // Community achievements
  welcomed_10: { id: 'welcomed_10', name: 'Welcome Wagon', description: 'Welcomed 10 new members', category: 'community' as AchievementCategory, points: 20 },
  conversation_starter: { id: 'conversation_starter', name: 'Conversation Starter', description: 'Started 50 conversations', category: 'community' as AchievementCategory, points: 30 },
  
  // Knowledge achievements
  knowledge_contributor: { id: 'knowledge_contributor', name: 'Knowledge Contributor', description: 'Added 10 entries to knowledge base', category: 'knowledge' as AchievementCategory, points: 40 },
  qa_master: { id: 'qa_master', name: 'Q&A Master', description: 'Created 25 Q&A pairs', category: 'knowledge' as AchievementCategory, points: 35 },
  
  // Social achievements
  well_connected: { id: 'well_connected', name: 'Well Connected', description: 'Interacted with 50+ unique users', category: 'social' as AchievementCategory, points: 45 },
  
  // Milestone achievements
  hundred_helps: { id: 'hundred_helps', name: 'Century Club', description: 'Helped 100 users', category: 'milestone' as AchievementCategory, points: 100 },
  thousand_messages: { id: 'thousand_messages', name: 'Chatterbox Champion', description: 'Sent 1000 helpful messages', category: 'milestone' as AchievementCategory, points: 150 }
};

// Award achievement to user
export function awardAchievement(userId: string, guildId: string | null, achievementId: string, context?: string): boolean {
  const db = getDB();
  const now = nowISO();
  
  const achievement = Object.values(ACHIEVEMENTS).find(a => a.id === achievementId);
  if (!achievement) return false;
  
  // Check if already awarded
  const existing = db.prepare(`
    SELECT id FROM achievements
    WHERE user_id = ? AND guild_id = ? AND achievement_id = ?
  `).get(userId, guildId, achievementId);
  
  if (existing) return false; // Already has this achievement
  
  // Award it
  db.prepare(`
    INSERT INTO achievements
    (user_id, guild_id, achievement_id, achievement_name, category, points, context, awarded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, guildId, achievementId, achievement.name, achievement.category, achievement.points, context || null, now);
  
  return true;
}

// Get user's achievements
export function getUserAchievements(userId: string, guildId: string | null) {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM achievements
    WHERE user_id = ? AND guild_id = ?
    ORDER BY awarded_at DESC
  `).all(userId, guildId) as any[];
}

// Get user's total points
export function getUserPoints(userId: string, guildId: string | null): number {
  const db = getDB();
  const result = db.prepare(`
    SELECT SUM(points) as total
    FROM achievements
    WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId) as { total: number | null };
  
  return result?.total || 0;
}

// Check and award achievements based on stats
export function checkAndAwardAchievements(userId: string, guildId: string | null, stats: {
  totalAssists?: number;
  currentStreak?: number;
  fastResolutions?: number;
  resolutionRate?: number;
  totalCases?: number;
  welcomedUsers?: number;
  conversationsStarted?: number;
  knowledgeEntries?: number;
  qaPairs?: number;
  uniqueInteractions?: number;
  totalMessages?: number;
}): string[] {
  const awarded: string[] = [];
  
  // Support achievements
  if (stats.totalAssists && stats.totalAssists >= 1) {
    if (awardAchievement(userId, guildId, 'first_assist')) awarded.push('first_assist');
  }
  if (stats.totalAssists && stats.totalAssists >= 100) {
    if (awardAchievement(userId, guildId, 'hundred_helps')) awarded.push('hundred_helps');
  }
  if (stats.currentStreak && stats.currentStreak >= 3) {
    if (awardAchievement(userId, guildId, 'streak_3')) awarded.push('streak_3');
  }
  if (stats.currentStreak && stats.currentStreak >= 7) {
    if (awardAchievement(userId, guildId, 'streak_7')) awarded.push('streak_7');
  }
  if (stats.fastResolutions && stats.fastResolutions >= 5) {
    if (awardAchievement(userId, guildId, 'speed_demon')) awarded.push('speed_demon');
  }
  if (stats.resolutionRate && stats.totalCases && stats.resolutionRate >= 0.95 && stats.totalCases >= 20) {
    if (awardAchievement(userId, guildId, 'expert_helper')) awarded.push('expert_helper');
  }
  
  // Community achievements
  if (stats.welcomedUsers && stats.welcomedUsers >= 10) {
    if (awardAchievement(userId, guildId, 'welcomed_10')) awarded.push('welcomed_10');
  }
  if (stats.conversationsStarted && stats.conversationsStarted >= 50) {
    if (awardAchievement(userId, guildId, 'conversation_starter')) awarded.push('conversation_starter');
  }
  
  // Knowledge achievements
  if (stats.knowledgeEntries && stats.knowledgeEntries >= 10) {
    if (awardAchievement(userId, guildId, 'knowledge_contributor')) awarded.push('knowledge_contributor');
  }
  if (stats.qaPairs && stats.qaPairs >= 25) {
    if (awardAchievement(userId, guildId, 'qa_master')) awarded.push('qa_master');
  }
  
  // Social achievements
  if (stats.uniqueInteractions && stats.uniqueInteractions >= 50) {
    if (awardAchievement(userId, guildId, 'well_connected')) awarded.push('well_connected');
  }
  
  // Milestone achievements
  if (stats.totalMessages && stats.totalMessages >= 1000) {
    if (awardAchievement(userId, guildId, 'thousand_messages')) awarded.push('thousand_messages');
  }
  
  return awarded;
}

// Get achievement leaderboard
export function getAchievementLeaderboard(guildId: string | null, limit = 10) {
  const db = getDB();
  return db.prepare(`
    SELECT user_id, SUM(points) as total_points, COUNT(*) as achievement_count
    FROM achievements
    WHERE guild_id = ?
    GROUP BY user_id
    ORDER BY total_points DESC
    LIMIT ?
  `).all(guildId, limit) as { user_id: string; total_points: number; achievement_count: number }[];
}

// Get category-specific leaderboard
export function getCategoryLeaderboard(guildId: string | null, category: AchievementCategory, limit = 10) {
  const db = getDB();
  return db.prepare(`
    SELECT user_id, SUM(points) as category_points, COUNT(*) as achievement_count
    FROM achievements
    WHERE guild_id = ? AND category = ?
    GROUP BY user_id
    ORDER BY category_points DESC
    LIMIT ?
  `).all(guildId, category, limit) as { user_id: string; category_points: number; achievement_count: number }[];
}

// Define unlockable perks based on points
export function getUnlockedPerks(userId: string, guildId: string | null): {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
}[] {
  const points = getUserPoints(userId, guildId);
  
  const perks = [
    { id: 'custom_color', name: 'Custom Role Color', description: 'Unlock custom role color', requiredPoints: 50 },
    { id: 'priority_support', name: 'Priority Support', description: 'Your questions get priority', requiredPoints: 100 },
    { id: 'custom_emoji', name: 'Custom Emoji', description: 'Request a custom server emoji', requiredPoints: 150 },
    { id: 'channel_suggest', name: 'Channel Suggestion', description: 'Suggest a new channel', requiredPoints: 200 },
    { id: 'voice_priority', name: 'Voice Priority', description: 'Speaker priority in voice channels', requiredPoints: 300 },
    { id: 'exclusive_role', name: 'Exclusive Role', description: 'Special VIP role with exclusive perks', requiredPoints: 500 }
  ];
  
  return perks.map(perk => ({
    ...perk,
    unlocked: points >= perk.requiredPoints
  }));
}

// Get recent achievements across the server (for celebration)
export function getRecentAchievements(guildId: string | null, hours = 24, limit = 10) {
  const db = getDB();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  return db.prepare(`
    SELECT * FROM achievements
    WHERE guild_id = ? AND awarded_at > ?
    ORDER BY awarded_at DESC
    LIMIT ?
  `).all(guildId, since, limit) as any[];
}
