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
  if (points <= 0) return;
  
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
