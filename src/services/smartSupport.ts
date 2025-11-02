import { getDB } from './db';
import type { SupportInteraction } from './enhancedDB';

/**
 * Predictive Support Routing & Performance Analytics
 * Features:
 * - Categorizes questions automatically
 * - Suggests best support member based on expertise
 * - Tracks response times and success rates
 * - Auto-escalation system
 * - Performance leaderboards
 */

function nowISO() {
  return new Date().toISOString();
}

// Categorize question using keywords
export function categorizeQuestion(question: string): string {
  const lower = question.toLowerCase();
  
  if (/\b(error|crash|bug|not work|broken|fix)\b/i.test(lower)) return 'technical';
  if (/\b(account|login|password|banned|whitelist)\b/i.test(lower)) return 'account';
  if (/\b(how to|tutorial|guide|setup|install)\b/i.test(lower)) return 'tutorial';
  if (/\b(feature|request|suggest|add|implement)\b/i.test(lower)) return 'feature';
  if (/\b(price|cost|buy|purchase|payment)\b/i.test(lower)) return 'sales';
  
  return 'general';
}

// Start tracking a support interaction
export function startSupportInteraction(opts: {
  userId: string;
  supportMemberId: string;
  guildId: string;
  channelId: string;
  questionText: string;
}): number {
  const { userId, supportMemberId, guildId, channelId, questionText } = opts;
  const db = getDB();
  const now = nowISO();
  const category = categorizeQuestion(questionText);
  
  const result = db.prepare(`
    INSERT INTO support_interactions 
    (user_id, support_member_id, guild_id, channel_id, question_category, started_at, was_resolved, escalated)
    VALUES (?, ?, ?, ?, ?, ?, FALSE, FALSE)
  `).run(userId, supportMemberId, guildId, channelId, category, now);
  
  return Number(result.lastInsertRowid);
}

// End support interaction with resolution info
export function endSupportInteraction(opts: {
  interactionId: number;
  wasResolved: boolean;
  satisfactionRating?: number;
  feedbackText?: string;
}) {
  const { interactionId, wasResolved, satisfactionRating, feedbackText } = opts;
  const db = getDB();
  const now = nowISO();
  
  // Get start time to calculate duration
  const interaction = db.prepare(`
    SELECT started_at FROM support_interactions WHERE id = ?
  `).get(interactionId) as { started_at: string } | undefined;
  
  if (!interaction) return;
  
  const startTime = new Date(interaction.started_at).getTime();
  const endTime = Date.now();
  const durationSeconds = Math.floor((endTime - startTime) / 1000);
  
  db.prepare(`
    UPDATE support_interactions 
    SET ended_at = ?, resolution_time_seconds = ?, was_resolved = ?,
        satisfaction_rating = ?, feedback_text = ?
    WHERE id = ?
  `).run(now, durationSeconds, wasResolved, satisfactionRating, feedbackText, interactionId);
  
  // Update expertise stats
  const full = db.prepare(`SELECT * FROM support_interactions WHERE id = ?`).get(interactionId) as SupportInteraction;
  if (full) {
    updateExpertise(full.support_member_id, full.guild_id, full.question_category || 'general', wasResolved, durationSeconds);
  }
}

// Update support member expertise
function updateExpertise(
  supportMemberId: string,
  guildId: string,
  category: string,
  wasSuccessful: boolean,
  durationSeconds: number
) {
  const db = getDB();
  const now = nowISO();
  
  const existing = db.prepare(`
    SELECT * FROM support_expertise 
    WHERE support_member_id = ? AND guild_id = ? AND category = ?
  `).get(supportMemberId, guildId, category) as any;
  
  if (existing) {
    const newTotal = existing.total_attempts + 1;
    const newSuccess = existing.success_count + (wasSuccessful ? 1 : 0);
    const newAvgTime = Math.floor(
      ((existing.avg_resolution_time_seconds || 0) * existing.total_attempts + durationSeconds) / newTotal
    );
    
    db.prepare(`
      UPDATE support_expertise 
      SET success_count = ?, total_attempts = ?, avg_resolution_time_seconds = ?, last_updated_at = ?
      WHERE id = ?
    `).run(newSuccess, newTotal, newAvgTime, now, existing.id);
  } else {
    db.prepare(`
      INSERT INTO support_expertise 
      (support_member_id, guild_id, category, success_count, total_attempts, avg_resolution_time_seconds, last_updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(supportMemberId, guildId, category, wasSuccessful ? 1 : 0, durationSeconds, now);
  }
}

// Get best support member for a question
export function suggestBestSupport(opts: {
  questionText: string;
  guildId: string;
  availableSupportIds: string[];
}): { suggestedId: string; reason: string; confidence: number } | null {
  const { questionText, guildId, availableSupportIds } = opts;
  const db = getDB();
  const category = categorizeQuestion(questionText);
  
  if (availableSupportIds.length === 0) return null;
  
  // Get expertise data for all available support members
  const expertise = availableSupportIds.map(id => {
    const row = db.prepare(`
      SELECT * FROM support_expertise 
      WHERE support_member_id = ? AND guild_id = ? AND category = ?
    `).get(id, guildId, category) as any;
    
    if (!row) return { id, score: 0, successRate: 0, avgTime: 999999 };
    
    const successRate = row.total_attempts > 0 ? row.success_count / row.total_attempts : 0;
    const avgTime = row.avg_resolution_time_seconds || 999999;
    
    // Score: prioritize success rate, then speed
    const score = successRate * 100 - (avgTime / 60); // success% - minutes
    
    return { id, score, successRate, avgTime, attempts: row.total_attempts };
  }).sort((a, b) => b.score - a.score);
  
  const best = expertise[0];
  
  if (best.score <= 0) {
    // No one has experience with this category, pick randomly
    return {
      suggestedId: availableSupportIds[Math.floor(Math.random() * availableSupportIds.length)],
      reason: `Fresh perspective needed for ${category} questions`,
      confidence: 0.3
    };
  }
  
  return {
    suggestedId: best.id,
    reason: `${(best.successRate * 100).toFixed(0)}% success rate in ${category} (${best.attempts} cases, avg ${Math.floor(best.avgTime / 60)}min)`,
    confidence: Math.min(0.95, best.attempts / 20) // More attempts = higher confidence
  };
}

// Get support member stats
export function getSupportMemberStats(supportMemberId: string, guildId: string) {
  const db = getDB();
  
  // Overall stats
  const overall = db.prepare(`
    SELECT 
      COUNT(*) as total_interactions,
      SUM(CASE WHEN was_resolved THEN 1 ELSE 0 END) as resolved_count,
      AVG(resolution_time_seconds) as avg_time,
      AVG(satisfaction_rating) as avg_rating
    FROM support_interactions
    WHERE support_member_id = ? AND guild_id = ?
  `).get(supportMemberId, guildId) as any;
  
  // Category breakdown
  const categories = db.prepare(`
    SELECT * FROM support_expertise
    WHERE support_member_id = ? AND guild_id = ?
    ORDER BY success_count DESC
  `).all(supportMemberId, guildId) as any[];
  
  // Recent interactions
  const recent = db.prepare(`
    SELECT * FROM support_interactions
    WHERE support_member_id = ? AND guild_id = ?
    ORDER BY started_at DESC
    LIMIT 10
  `).all(supportMemberId, guildId) as SupportInteraction[];
  
  // Calculate streak (consecutive days with resolved interactions)
  const streak = calculateResolveStreak(supportMemberId, guildId);
  
  return {
    totalInteractions: overall.total_interactions || 0,
    resolvedCount: overall.resolved_count || 0,
    resolutionRate: overall.total_interactions > 0 
      ? (overall.resolved_count / overall.total_interactions) * 100 
      : 0,
    avgResponseTime: overall.avg_time || 0,
    avgRating: overall.avg_rating || 0,
    currentStreak: streak,
    expertise: categories.map(c => ({
      category: c.category,
      successRate: c.total_attempts > 0 ? (c.success_count / c.total_attempts) * 100 : 0,
      totalCases: c.total_attempts,
      avgTime: c.avg_resolution_time_seconds
    })),
    recentCases: recent
  };
}

// Calculate consecutive days with successful resolutions
function calculateResolveStreak(supportMemberId: string, guildId: string): number {
  const db = getDB();
  const rows = db.prepare(`
    SELECT DATE(started_at) as day, COUNT(*) as count
    FROM support_interactions
    WHERE support_member_id = ? AND guild_id = ? AND was_resolved = TRUE
    GROUP BY DATE(started_at)
    ORDER BY day DESC
  `).all(supportMemberId, guildId) as any[];
  
  if (rows.length === 0) return 0;
  
  let streak = 0;
  let expectedDate = new Date();
  expectedDate.setHours(0, 0, 0, 0);
  
  for (const row of rows) {
    const rowDate = new Date(row.day);
    rowDate.setHours(0, 0, 0, 0);
    
    if (rowDate.getTime() === expectedDate.getTime()) {
      streak++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

// Get leaderboard
export function getSupportLeaderboard(guildId: string, metric: 'resolution' | 'speed' | 'rating' | 'volume' = 'resolution') {
  const db = getDB();
  
  let query = '';
  switch (metric) {
    case 'resolution':
      query = `
        SELECT 
          support_member_id,
          COUNT(*) as total,
          SUM(CASE WHEN was_resolved THEN 1 ELSE 0 END) as resolved,
          CAST(SUM(CASE WHEN was_resolved THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100 as score
        FROM support_interactions
        WHERE guild_id = ?
        GROUP BY support_member_id
        HAVING total >= 5
        ORDER BY score DESC
        LIMIT 10
      `;
      break;
    case 'speed':
      query = `
        SELECT 
          support_member_id,
          AVG(resolution_time_seconds) as score
        FROM support_interactions
        WHERE guild_id = ? AND was_resolved = TRUE
        GROUP BY support_member_id
        HAVING COUNT(*) >= 5
        ORDER BY score ASC
        LIMIT 10
      `;
      break;
    case 'rating':
      query = `
        SELECT 
          support_member_id,
          AVG(satisfaction_rating) as score,
          COUNT(*) as total
        FROM support_interactions
        WHERE guild_id = ? AND satisfaction_rating IS NOT NULL
        GROUP BY support_member_id
        HAVING total >= 3
        ORDER BY score DESC
        LIMIT 10
      `;
      break;
    case 'volume':
      query = `
        SELECT 
          support_member_id,
          COUNT(*) as score
        FROM support_interactions
        WHERE guild_id = ?
        GROUP BY support_member_id
        ORDER BY score DESC
        LIMIT 10
      `;
      break;
  }
  
  return db.prepare(query).all(guildId) as any[];
}

// Auto-escalate if needed
export function checkEscalation(interactionId: number): { shouldEscalate: boolean; reason: string } | null {
  const db = getDB();
  const interaction = db.prepare(`
    SELECT * FROM support_interactions WHERE id = ?
  `).get(interactionId) as SupportInteraction | undefined;
  
  if (!interaction || interaction.ended_at) return null;
  
  const now = Date.now();
  const startTime = new Date(interaction.started_at).getTime();
  const elapsedMinutes = (now - startTime) / 1000 / 60;
  
  // Escalate if taking too long (>30 min for technical, >15 min for others)
  const threshold = interaction.question_category === 'technical' ? 30 : 15;
  
  if (elapsedMinutes > threshold) {
    return {
      shouldEscalate: true,
      reason: `Support case has been open for ${Math.floor(elapsedMinutes)} minutes without resolution`
    };
  }
  
  return { shouldEscalate: false, reason: 'Within acceptable timeframe' };
}

// Mark interaction as escalated
export function escalateInteraction(interactionId: number, escalatedTo: string) {
  const db = getDB();
  db.prepare(`
    UPDATE support_interactions 
    SET escalated = TRUE, escalated_to = ?
    WHERE id = ?
  `).run(escalatedTo, interactionId);
}
