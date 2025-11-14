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

/**
 * Analyze feedback sentiment using keyword matching
 * Returns: 'positive', 'neutral', or 'negative'
 */
export function analyzeFeedbackSentiment(feedback: string): 'positive' | 'neutral' | 'negative' {
  if (!feedback || feedback.trim().length === 0) return 'neutral';
  
  const text = feedback.toLowerCase();
  
  // Positive keywords
  const positiveWords = [
    'great', 'excellent', 'amazing', 'awesome', 'fantastic', 'wonderful', 
    'helpful', 'quick', 'fast', 'thank', 'thanks', 'appreciate', 'perfect',
    'good', 'nice', 'kind', 'friendly', 'patient', 'professional', 'best',
    'love', 'impressed', 'satisfied', 'happy', 'pleased', 'outstanding'
  ];
  
  // Negative keywords
  const negativeWords = [
    'bad', 'terrible', 'awful', 'horrible', 'poor', 'worst', 'useless',
    'slow', 'rude', 'unhelpful', 'waste', 'disappointed', 'frustrated',
    'angry', 'annoyed', 'incompetent', 'lazy', 'ignore', 'ignored', 'sucks'
  ];
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  for (const word of positiveWords) {
    if (text.includes(word)) positiveCount++;
  }
  
  for (const word of negativeWords) {
    if (text.includes(word)) negativeCount++;
  }
  
  if (positiveCount > negativeCount && positiveCount > 0) return 'positive';
  if (negativeCount > positiveCount && negativeCount > 0) return 'negative';
  return 'neutral';
}

/**
 * Calculate points for ticket resolution based on multiple factors
 */
export function calculateTicketPoints(params: {
  wasClaimed: boolean;
  wasResolved: boolean;
  rating?: number; // 1-10 scale
  feedback?: string;
  claimerId?: string;
  helpers?: string[];
}): {
  totalPoints: number;
  breakdown: { reason: string; points: number }[];
  primaryRecipient: string | null;
  helperPoints: Map<string, number>;
} {
  const breakdown: { reason: string; points: number }[] = [];
  let totalPoints = 0;
  
  // Base points for claiming
  if (params.wasClaimed && params.claimerId) {
    const claimPoints = 5;
    breakdown.push({ reason: 'Claimed ticket', points: claimPoints });
    totalPoints += claimPoints;
  }
  
  // Points for resolving
  if (params.wasResolved) {
    const resolvePoints = 10;
    breakdown.push({ reason: 'Resolved ticket', points: resolvePoints });
    totalPoints += resolvePoints;
  }
  
  // Rating-based points (1-10 scale)
  if (params.rating !== undefined && params.rating !== null) {
    let ratingPoints = 0;
    if (params.rating >= 9) {
      ratingPoints = 20; // Excellent
      breakdown.push({ reason: 'Excellent rating (9-10)', points: ratingPoints });
    } else if (params.rating >= 7) {
      ratingPoints = 15; // Good
      breakdown.push({ reason: 'Good rating (7-8)', points: ratingPoints });
    } else if (params.rating >= 5) {
      ratingPoints = 10; // Average
      breakdown.push({ reason: 'Average rating (5-6)', points: ratingPoints });
    } else if (params.rating >= 3) {
      ratingPoints = 5; // Below average
      breakdown.push({ reason: 'Below average rating (3-4)', points: ratingPoints });
    } else {
      ratingPoints = 2; // Poor
      breakdown.push({ reason: 'Poor rating (1-2)', points: ratingPoints });
    }
    totalPoints += ratingPoints;
  }
  
  // Feedback quality bonus
  if (params.feedback && params.feedback.trim().length > 0) {
    const sentiment = analyzeFeedbackSentiment(params.feedback);
    const feedbackLength = params.feedback.trim().length;
    
    let feedbackPoints = 0;
    if (sentiment === 'positive') {
      if (feedbackLength > 100) {
        feedbackPoints = 15; // Detailed positive feedback
        breakdown.push({ reason: 'Detailed positive feedback', points: feedbackPoints });
      } else {
        feedbackPoints = 10; // Positive feedback
        breakdown.push({ reason: 'Positive feedback', points: feedbackPoints });
      }
    } else if (sentiment === 'neutral') {
      if (feedbackLength > 100) {
        feedbackPoints = 8; // Detailed neutral feedback
        breakdown.push({ reason: 'Detailed neutral feedback', points: feedbackPoints });
      } else {
        feedbackPoints = 5; // Neutral feedback
        breakdown.push({ reason: 'Neutral feedback', points: feedbackPoints });
      }
    } else if (sentiment === 'negative') {
      // Negative feedback still gets some points for completion but less
      feedbackPoints = 3;
      breakdown.push({ reason: 'Feedback provided (negative)', points: feedbackPoints });
    }
    totalPoints += feedbackPoints;
  }
  
  // Calculate helper distribution (helpers get 50% of main points)
  const helperPoints = new Map<string, number>();
  if (params.helpers && params.helpers.length > 0) {
    const helperShare = Math.floor(totalPoints * 0.5 / params.helpers.length);
    for (const helperId of params.helpers) {
      helperPoints.set(helperId, helperShare);
    }
  }
  
  return {
    totalPoints,
    breakdown,
    primaryRecipient: params.claimerId || null,
    helperPoints
  };
}

/**
 * Award points directly to a user (creates a custom achievement entry)
 */
export function awardDirectPoints(
  userId: string,
  guildId: string | null,
  points: number,
  reason: string,
  category: AchievementCategory = 'support'
): void {
  if (points === 0) return; // Allow negative points for taking away
  
  const db = getDB();
  const now = nowISO();
  const achievementId = `direct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  db.prepare(`
    INSERT INTO achievements
    (user_id, guild_id, achievement_id, achievement_name, category, points, context, awarded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, guildId, achievementId, reason, category, points, reason, now);
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

/**
 * Track user message activity and award points for milestones
 * Awards points every 100 messages
 */
export function trackMessageActivity(userId: string, guildId: string | null): {
  messagesCount: number;
  pointsAwarded: number;
  milestone?: number;
} {
  const db = getDB();
  
  // Initialize or get current message count
  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_activity (
      user_id TEXT NOT NULL,
      guild_id TEXT,
      message_count INTEGER DEFAULT 0,
      last_message_at TEXT,
      PRIMARY KEY (user_id, guild_id)
    )
  `).run();
  
  const now = nowISO();
  
  // Get current count
  const existing = db.prepare(`
    SELECT message_count FROM message_activity
    WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId) as { message_count: number } | undefined;
  
  const currentCount = existing?.message_count || 0;
  const newCount = currentCount + 1;
  
  // Update message count
  db.prepare(`
    INSERT INTO message_activity (user_id, guild_id, message_count, last_message_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      message_count = message_count + 1,
      last_message_at = ?
  `).run(userId, guildId, now, now);
  
  // Check if we hit a milestone (every 100 messages)
  let pointsAwarded = 0;
  let milestone: number | undefined = undefined;
  
  if (newCount % 100 === 0) {
    // Award 10 points for every 100 messages
    pointsAwarded = 10;
    milestone = newCount;
    
    awardDirectPoints(
      userId,
      guildId,
      pointsAwarded,
      `Reached ${newCount} messages milestone`,
      'social'
    );
  }
  
  return {
    messagesCount: newCount,
    pointsAwarded,
    milestone
  };
}

/**
 * Get user's message statistics
 */
export function getUserMessageStats(userId: string, guildId: string | null): {
  messageCount: number;
  nextMilestone: number;
  messagesToNextMilestone: number;
  lastMessageAt: string | null;
} {
  const db = getDB();
  
  // Ensure table exists
  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_activity (
      user_id TEXT NOT NULL,
      guild_id TEXT,
      message_count INTEGER DEFAULT 0,
      last_message_at TEXT,
      PRIMARY KEY (user_id, guild_id)
    )
  `).run();
  
  const result = db.prepare(`
    SELECT message_count, last_message_at FROM message_activity
    WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId) as { message_count: number; last_message_at: string } | undefined;
  
  const messageCount = result?.message_count || 0;
  const nextMilestone = Math.ceil(messageCount / 100) * 100;
  const messagesToNextMilestone = nextMilestone - messageCount;
  
  return {
    messageCount,
    nextMilestone: nextMilestone || 100,
    messagesToNextMilestone: messagesToNextMilestone || 100,
    lastMessageAt: result?.last_message_at || null
  };
}

/**
 * Initialize user stats tracking table
 */
function initUserStatsTable() {
  const db = getDB();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id TEXT NOT NULL,
      guild_id TEXT,
      
      -- Support stats
      total_assists INTEGER DEFAULT 0,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_assist_date TEXT,
      fast_resolutions INTEGER DEFAULT 0,
      total_cases INTEGER DEFAULT 0,
      resolved_cases INTEGER DEFAULT 0,
      
      -- Community stats
      welcomed_users INTEGER DEFAULT 0,
      conversations_started INTEGER DEFAULT 0,
      
      -- Knowledge stats
      knowledge_entries INTEGER DEFAULT 0,
      qa_pairs INTEGER DEFAULT 0,
      
      -- Social stats
      unique_interactions INTEGER DEFAULT 0,
      
      -- Timestamps
      last_updated TEXT,
      
      PRIMARY KEY (user_id, guild_id)
    )
  `).run();
}

/**
 * Track when a user welcomes a new member
 */
export function trackWelcome(userId: string, guildId: string, newMemberId: string): void {
  const db = getDB();
  initUserStatsTable();
  
  const now = nowISO();
  
  db.prepare(`
    INSERT INTO user_stats (user_id, guild_id, welcomed_users, last_updated)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      welcomed_users = welcomed_users + 1,
      last_updated = ?
  `).run(userId, guildId, now, now);
  
  // Check for welcome achievements
  const stats = getUserStats(userId, guildId);
  checkAndAwardAchievements(userId, guildId, stats);
}

/**
 * Track when a user starts a conversation
 */
export function trackConversationStart(userId: string, guildId: string): void {
  const db = getDB();
  initUserStatsTable();
  
  const now = nowISO();
  
  db.prepare(`
    INSERT INTO user_stats (user_id, guild_id, conversations_started, last_updated)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      conversations_started = conversations_started + 1,
      last_updated = ?
  `).run(userId, guildId, now, now);
  
  // Check for achievements
  const stats = getUserStats(userId, guildId);
  checkAndAwardAchievements(userId, guildId, stats);
}

/**
 * Track support case statistics
 */
export function trackSupportStats(userId: string, guildId: string, stats: {
  wasResolved?: boolean;
  wasFast?: boolean; // Under 5 minutes
  isNewAssist?: boolean;
}): void {
  const db = getDB();
  initUserStatsTable();
  
  const now = nowISO();
  const today = now.split('T')[0];
  
  // Get current stats
  const current = db.prepare(`
    SELECT total_assists, current_streak, longest_streak, last_assist_date, 
           fast_resolutions, total_cases, resolved_cases
    FROM user_stats
    WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId) as any;
  
  let totalAssists = current?.total_assists || 0;
  let currentStreak = current?.current_streak || 0;
  let longestStreak = current?.longest_streak || 0;
  let lastAssistDate = current?.last_assist_date;
  let fastResolutions = current?.fast_resolutions || 0;
  let totalCases = current?.total_cases || 0;
  let resolvedCases = current?.resolved_cases || 0;
  
  // Update case counts
  if (stats.isNewAssist) {
    totalAssists++;
    totalCases++;
    
    // Update streak
    if (lastAssistDate) {
      const lastDate = lastAssistDate.split('T')[0];
      const daysDiff = Math.floor((new Date(today).getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 1) {
        // Consecutive day
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else if (daysDiff > 1) {
        // Streak broken
        currentStreak = 1;
      }
      // If same day, streak stays the same
    } else {
      // First assist
      currentStreak = 1;
      longestStreak = 1;
    }
    lastAssistDate = now;
  }
  
  if (stats.wasResolved) {
    resolvedCases++;
  }
  
  if (stats.wasFast) {
    fastResolutions++;
  }
  
  // Update database
  db.prepare(`
    INSERT INTO user_stats (
      user_id, guild_id, total_assists, current_streak, longest_streak,
      last_assist_date, fast_resolutions, total_cases, resolved_cases, last_updated
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      total_assists = ?,
      current_streak = ?,
      longest_streak = ?,
      last_assist_date = ?,
      fast_resolutions = ?,
      total_cases = ?,
      resolved_cases = ?,
      last_updated = ?
  `).run(
    userId, guildId, totalAssists, currentStreak, longestStreak,
    lastAssistDate, fastResolutions, totalCases, resolvedCases, now,
    totalAssists, currentStreak, longestStreak, lastAssistDate,
    fastResolutions, totalCases, resolvedCases, now
  );
  
  // Check for achievements
  const resolutionRate = totalCases > 0 ? resolvedCases / totalCases : 0;
  checkAndAwardAchievements(userId, guildId, {
    totalAssists,
    currentStreak,
    fastResolutions,
    resolutionRate,
    totalCases
  });
}

/**
 * Get all user statistics
 */
export function getUserStats(userId: string, guildId: string | null): {
  totalAssists: number;
  currentStreak: number;
  longestStreak: number;
  lastAssistDate: string | null;
  fastResolutions: number;
  totalCases: number;
  resolvedCases: number;
  resolutionRate: number;
  welcomedUsers: number;
  conversationsStarted: number;
  knowledgeEntries: number;
  qaPairs: number;
  uniqueInteractions: number;
  totalMessages: number;
} {
  const db = getDB();
  initUserStatsTable();
  
  const stats = db.prepare(`
    SELECT * FROM user_stats
    WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId) as any;
  
  const messageStats = getUserMessageStats(userId, guildId);
  
  return {
    totalAssists: stats?.total_assists || 0,
    currentStreak: stats?.current_streak || 0,
    longestStreak: stats?.longest_streak || 0,
    lastAssistDate: stats?.last_assist_date || null,
    fastResolutions: stats?.fast_resolutions || 0,
    totalCases: stats?.total_cases || 0,
    resolvedCases: stats?.resolved_cases || 0,
    resolutionRate: stats?.total_cases > 0 ? (stats?.resolved_cases || 0) / stats.total_cases : 0,
    welcomedUsers: stats?.welcomed_users || 0,
    conversationsStarted: stats?.conversations_started || 0,
    knowledgeEntries: stats?.knowledge_entries || 0,
    qaPairs: stats?.qa_pairs || 0,
    uniqueInteractions: stats?.unique_interactions || 0,
    totalMessages: messageStats.messageCount
  };
}
