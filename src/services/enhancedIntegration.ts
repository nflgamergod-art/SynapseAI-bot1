/**
 * Enhanced Features Integration
 * 
 * This module integrates all 10 unique advanced features into the bot's core functionality.
 * Import and use these functions in the main bot (index.ts) to enable all features.
 */

import { Message } from 'discord.js';
import { 
  trackUserInteraction, 
  autoLearnFromMessage, 
  getEnrichedUserContext,
  getUserPatterns 
} from './enhancedMemory';
import { 
  categorizeQuestion, 
  suggestBestSupport,
  startSupportInteraction,
  checkEscalation 
} from './smartSupport';
import { 
  analyzeSentiment, 
  trackSentiment, 
  suggestToneAdjustment,
  detectCelebration,
  getSentimentTrend 
} from './emotionalIntel';
import { 
  checkAndAwardAchievements,
  getUserPoints,
  getRecentAchievements 
} from './rewards';
import { 
  shouldCheckIn,
  predictUserActivity,
  analyzeServerTemporalPatterns 
} from './temporalIntel';
import { 
  autoSuggestResponse,
  findSimilarQuestions,
  detectCommonPatterns 
} from './preventiveSupport';
import { 
  analyzeImage,
  detectErrors,
  extractCode 
} from './multiModal';

/**
 * Main message processing function
 * Call this on every message to enable all enhanced features
 */
export async function processMessageWithEnhancedFeatures(message: Message): Promise<{
  sentiment: any;
  suggestedTone: any;
  autoResponse: any;
  shouldEscalate: boolean;
  achievements: string[];
  celebration: any;
  imageAnalysis?: any;
}> {
  const userId = message.author.id;
  const guildId = message.guild?.id || null;
  const channelId = message.channel.id;
  const messageId = message.id;
  const content = message.content;
  
  // 1. Enhanced Memory: Track interaction and auto-learn patterns
  if (guildId) {
    trackUserInteraction(userId, guildId, 'message_sent');
    await autoLearnFromMessage({
      userId,
      guildId,
      messageContent: content,
      messageTimestamp: message.createdAt,
      mentionedUsers: message.mentions.users.map(u => u.id)
    });
  }
  
  // 2. Emotional Intelligence: Analyze sentiment
  const sentiment = analyzeSentiment(content);
  trackSentiment({
    userId,
    guildId,
    channelId,
    messageId,
    sentiment: sentiment.sentiment,
    confidence: sentiment.confidence,
    emotionalMarkers: sentiment.emotionalMarkers,
    context: 'message'
  });
  
  // 3. Emotional Intelligence: Get tone adjustment suggestions
  const suggestedTone = suggestToneAdjustment(userId, guildId);
  
  // 4. Emotional Intelligence: Detect celebrations
  const celebration = detectCelebration(content);
  
  // 5. Preventive Support: Auto-suggest response if question detected
  let autoResponse = null;
  if (content.includes('?') || content.toLowerCase().startsWith('how')) {
    autoResponse = autoSuggestResponse(guildId, content);
  }
  
  // 6. Multi-Modal: Analyze images if present
  let imageAnalysis = undefined;
  if (message.attachments.size > 0) {
    const imageAttachment = message.attachments.find(att => 
      att.contentType?.startsWith('image/')
    );
    if (imageAttachment) {
      imageAnalysis = await analyzeImage({
        messageId,
        channelId,
        guildId,
        userId,
        imageUrl: imageAttachment.url
      });
    }
  }
  
  // 7. Rewards: Check for achievements with comprehensive stats
  const userPatterns = getUserPatterns(userId, guildId);
  const db = await import('./db').then(m => m.getDB());
  
  // Gather all stats for achievement checks
  const stats: any = {
    totalMessages: userPatterns?.message_count || 0
  };
  
  // Get support stats if available
  try {
    const supportStats = db.prepare(`
      SELECT 
        COUNT(*) as totalAssists,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolvedCount,
        SUM(CASE WHEN response_time_minutes < 5 AND status = 'resolved' THEN 1 ELSE 0 END) as fastResolutions
      FROM support_interactions
      WHERE supporter_id = ? AND guild_id = ?
    `).get(userId, guildId) as any;
    
    if (supportStats) {
      stats.totalAssists = supportStats.totalAssists || 0;
      stats.totalCases = supportStats.totalAssists || 0;
      stats.fastResolutions = supportStats.fastResolutions || 0;
      
      if (stats.totalCases > 0) {
        stats.resolutionRate = (supportStats.resolvedCount || 0) / stats.totalCases;
      }
    }
  } catch (e) { /* table may not exist yet */ }
  
  // Calculate streak
  try {
    const recentDays = db.prepare(`
      SELECT DISTINCT DATE(created_at) as day
      FROM support_interactions
      WHERE supporter_id = ? AND guild_id = ?
      ORDER BY day DESC
      LIMIT 30
    `).all(userId, guildId) as { day: string }[];
    
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let checkDate = new Date();
    
    for (let i = 0; i < 30; i++) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (recentDays.some(d => d.day.startsWith(dateStr))) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (dateStr !== today) {
        // Streak broken (allow today to not have activity yet)
        break;
      } else {
        // Today hasn't had activity, keep checking yesterday
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }
    stats.currentStreak = streak;
  } catch (e) { /* ignore */ }
  
  // Count knowledge contributions
  try {
    const kbCount = db.prepare(`
      SELECT COUNT(*) as count FROM knowledge_base
      WHERE added_by = ? AND guild_id = ?
    `).get(userId, guildId) as { count: number };
    stats.knowledgeEntries = kbCount?.count || 0;
    stats.qaPairs = kbCount?.count || 0; // Same for now
  } catch (e) { /* ignore */ }
  
  // Count unique interactions
  try {
    const uniqueCount = db.prepare(`
      SELECT COUNT(DISTINCT channel_id) as count
      FROM sentiment_history
      WHERE user_id = ? AND guild_id = ?
    `).get(userId, guildId) as { count: number };
    stats.uniqueInteractions = uniqueCount?.count || 0;
  } catch (e) { /* ignore */ }
  
  // Check for member welcome and conversation patterns
  if (content.toLowerCase().includes('welcome')) {
    try {
      const welcomeCount = db.prepare(`
        SELECT COUNT(*) as count FROM user_interactions
        WHERE user_id = ? AND guild_id = ? AND interaction_type = 'welcomed_user'
      `).get(userId, guildId) as { count: number };
      stats.welcomedUsers = welcomeCount?.count || 0;
    } catch (e) { /* ignore */ }
  }
  
  // Track conversation starters (messages that got replies)
  try {
    const convCount = db.prepare(`
      SELECT COUNT(*) as count FROM user_interactions
      WHERE user_id = ? AND guild_id = ? AND interaction_type = 'conversation_started'
    `).get(userId, guildId) as { count: number };
    stats.conversationsStarted = convCount?.count || 0;
  } catch (e) { /* ignore */ }
  
  const achievements = checkAndAwardAchievements(userId, guildId, stats);
  
  // 8. Support Routing: Check if support escalation needed
  const shouldEscalate = suggestedTone.shouldEscalate;
  
  return {
    sentiment,
    suggestedTone,
    autoResponse,
    shouldEscalate,
    achievements,
    celebration,
    imageAnalysis
  };
}

/**
 * Handle support request with enhanced features
 */
export async function handleEnhancedSupportRequest(
  requesterId: string,
  guildId: string | null,
  channelId: string,
  question: string
): Promise<{
  category: string;
  suggestedSupport: any;
  autoResponse: any;
  similarQuestions: any[];
  interactionId: number;
}> {
  // 1. Categorize the question
  const category = categorizeQuestion(question);
  
  // 2. Suggest best support member (with empty available list for now - would need to query for actual support members)
  const suggestedSupport = suggestBestSupport({ 
    questionText: question,
    guildId: guildId || '', 
    availableSupportIds: [] 
  });
  
  // 3. Check for auto-response from knowledge base
  const autoResponse = autoSuggestResponse(guildId, question);
  
  // 4. Find similar previous questions
  const similarQuestions = findSimilarQuestions(guildId, question);
  
  // 5. Start tracking this support interaction
  const interactionId = startSupportInteraction({
    userId: requesterId,
    supportMemberId: suggestedSupport?.suggestedId || '',
    guildId: guildId || '',
    channelId,
    questionText: question
  });
  
  return {
    category,
    suggestedSupport,
    autoResponse,
    similarQuestions,
    interactionId
  };
}

/**
 * Daily maintenance tasks
 * Run this once per day (e.g., via a cron job or scheduled task)
 */
export async function runDailyMaintenance(guildId: string | null): Promise<{
  checkIns: number;
  commonPatterns: any[];
  temporalInsights: any;
  recentAchievements: any[];
}> {
  // 1. Temporal Intelligence: Get users who should receive check-ins
  const db = await import('./db').then(m => m.getDB());
  const users = db.prepare(`
    SELECT DISTINCT user_id FROM user_patterns WHERE guild_id = ?
  `).all(guildId) as { user_id: string }[];
  
  let checkInsScheduled = 0;
  for (const { user_id } of users) {
    const checkInResult = shouldCheckIn(user_id, guildId);
    if (checkInResult.shouldCheckIn) {
      // Schedule check-in (you'll send this via Discord)
      checkInsScheduled++;
    }
  }
  
  // 2. Preventive Support: Detect common patterns
  const commonPatterns = detectCommonPatterns(guildId, 24);
  
  // 3. Temporal Intelligence: Analyze server patterns
  const temporalInsights = analyzeServerTemporalPatterns(guildId);
  
  // 4. Rewards: Get recent achievements for celebration
  const recentAchievements = getRecentAchievements(guildId, 24);
  
  return {
    checkIns: checkInsScheduled,
    commonPatterns,
    temporalInsights,
    recentAchievements
  };
}

/**
 * Get comprehensive user context for AI responses
 * Use this to enrich AI responses with full context
 */
export function getFullUserContext(userId: string, guildId: string | null): {
  enrichedContext: any;
  sentimentTrend: any;
  activityPrediction: any;
  totalPoints: number;
} {
  const enrichedContext = getEnrichedUserContext(userId, guildId);
  const sentimentTrend = getSentimentTrend(userId, guildId);
  const activityPrediction = predictUserActivity(userId, guildId);
  const totalPoints = getUserPoints(userId, guildId);
  
  return {
    enrichedContext,
    sentimentTrend,
    activityPrediction,
    totalPoints
  };
}

/**
 * Initialize all enhanced features
 * Call this once when the bot starts
 */
export async function initializeEnhancedFeatures() {
  const { initEnhancedSchema } = await import('./enhancedDB');
  // Schema is auto-initialized when enhancedDB is imported
  console.log('✅ Enhanced features initialized');
}
