import { getDB } from './db';
import { findRelevantMemories } from './memory';
import type { UserPattern, UserRelationship } from './enhancedDB';

/**
 * Enhanced Context-Aware Memory System
 * Features:
 * - Auto-learns user preferences from conversations
 * - Tracks relationships between users
 * - Detects behavioral patterns (timezone, active hours, topics)
 * - Provides cross-conversation context
 */

function nowISO() {
  return new Date().toISOString();
}

// Track user interactions to build relationship maps
export function trackUserInteraction(userAId: string, userBId: string, guildId: string | null) {
  const db = getDB();
  const now = nowISO();
  
  // Ensure userA < userB alphabetically for consistency
  const [a, b] = [userAId, userBId].sort();
  
  const existing = db.prepare(`
    SELECT * FROM user_relationships 
    WHERE user_a_id = ? AND user_b_id = ? AND (guild_id IS NULL OR guild_id = ?)
  `).get(a, b, guildId) as UserRelationship | undefined;
  
  if (existing) {
    // Update interaction count and timestamp
    const newCount = (existing.interaction_count || 0) + 1;
    let relType = existing.relationship_type;
    
    // Evolve relationship based on interaction frequency
    if (newCount > 50) relType = 'friend';
    if (newCount > 100) relType = 'teammate';
    
    db.prepare(`
      UPDATE user_relationships 
      SET interaction_count = ?, last_interaction_at = ?, relationship_type = ?
      WHERE id = ?
    `).run(newCount, now, relType, existing.id);
  } else {
    // Create new relationship
    db.prepare(`
      INSERT INTO user_relationships 
      (user_a_id, user_b_id, guild_id, interaction_count, last_interaction_at, relationship_type, created_at)
      VALUES (?, ?, ?, 1, ?, 'acquaintance', ?)
    `).run(a, b, guildId, now, now);
  }
}

// Get user's social context
export function getUserRelationships(userId: string, guildId?: string | null, limit = 10) {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM user_relationships 
    WHERE (user_a_id = ? OR user_b_id = ?) 
      AND (guild_id IS NULL OR guild_id = ?)
    ORDER BY interaction_count DESC, last_interaction_at DESC
    LIMIT ?
  `).all(userId, userId, guildId, limit) as UserRelationship[];
  
  return rows.map(r => ({
    ...r,
    otherUserId: r.user_a_id === userId ? r.user_b_id : r.user_a_id
  }));
}

// Detect and save user behavioral patterns
export function updateUserPattern(
  userId: string,
  guildId: string | null,
  patternType: 'timezone' | 'active_hours' | 'question_topics' | 'mood_trend' | 'communication_style',
  patternData: any,
  confidence = 0.7
) {
  const db = getDB();
  const now = nowISO();
  const dataJson = JSON.stringify(patternData);
  
  const existing = db.prepare(`
    SELECT * FROM user_patterns 
    WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?) AND pattern_type = ?
  `).get(userId, guildId, patternType) as UserPattern | undefined;
  
  if (existing) {
    db.prepare(`
      UPDATE user_patterns 
      SET pattern_data = ?, confidence = ?, last_updated_at = ?
      WHERE id = ?
    `).run(dataJson, confidence, now, existing.id);
  } else {
    db.prepare(`
      INSERT INTO user_patterns 
      (user_id, guild_id, pattern_type, pattern_data, confidence, last_updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, guildId, patternType, dataJson, confidence, now);
  }
}

// Get user patterns
export function getUserPatterns(userId: string, guildId?: string | null) {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM user_patterns 
    WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?)
  `).all(userId, guildId) as UserPattern[];
  
  const patterns: Record<string, any> = {};
  for (const row of rows) {
    try {
      patterns[row.pattern_type] = {
        data: JSON.parse(row.pattern_data),
        confidence: row.confidence,
        lastUpdated: row.last_updated_at
      };
    } catch (e) {
      // Invalid JSON, skip
    }
  }
  
  return patterns;
}

// Auto-detect timezone from message patterns
export function detectTimezone(userId: string, guildId: string | null, messageTimestamp: Date) {
  const hour = messageTimestamp.getHours();
  
  // Simple heuristic: track when user is most active
  const patterns = getUserPatterns(userId, guildId);
  const currentData = patterns.timezone?.data || { hourDistribution: new Array(24).fill(0), totalMessages: 0 };
  
  currentData.hourDistribution[hour] = (currentData.hourDistribution[hour] || 0) + 1;
  currentData.totalMessages = (currentData.totalMessages || 0) + 1;
  
  // Find peak activity hour (likely their evening/afternoon)
  const peakHour = currentData.hourDistribution.indexOf(Math.max(...currentData.hourDistribution));
  
  // Estimate timezone offset (this is a rough heuristic)
  // Assuming peak activity is around 18:00-22:00 local time
  const estimatedLocalPeakHour = 20;
  const utcHour = new Date().getUTCHours();
  const estimatedOffset = (peakHour - estimatedLocalPeakHour) - (hour - utcHour);
  
  updateUserPattern(userId, guildId, 'timezone', {
    hourDistribution: currentData.hourDistribution,
    totalMessages: currentData.totalMessages,
    estimatedOffset,
    peakHour,
    confidence: Math.min(0.9, currentData.totalMessages / 100)
  }, Math.min(0.9, currentData.totalMessages / 100));
}

// Get enriched context for a user (combines memory + patterns + relationships)
export function getEnrichedUserContext(userId: string, guildId?: string | null, query?: string) {
  const memories = query 
    ? findRelevantMemories(query, userId, guildId)
    : [];
  
  const patterns = getUserPatterns(userId, guildId);
  const relationships = getUserRelationships(userId, guildId, 5);
  
  return {
    memories,
    patterns,
    relationships,
    summary: buildContextSummary(memories, patterns, relationships)
  };
}

function buildContextSummary(memories: any[], patterns: any, relationships: any[]) {
  const parts: string[] = [];
  
  // Add key memories
  const keyMemories = memories.filter(m => ['name', 'timezone', 'favorite_team'].includes(m.key));
  if (keyMemories.length > 0) {
    parts.push(`User info: ${keyMemories.map(m => `${m.key}=${m.value}`).join(', ')}`);
  }
  
  // Add timezone awareness
  if (patterns.timezone?.data?.estimatedOffset !== undefined) {
    const offset = patterns.timezone.data.estimatedOffset;
    const sign = offset >= 0 ? '+' : '';
    parts.push(`Timezone: UTC${sign}${offset}`);
  }
  
  // Add relationship context
  if (relationships.length > 0) {
    const friends = relationships.filter(r => r.relationship_type === 'friend' || r.relationship_type === 'teammate');
    if (friends.length > 0) {
      parts.push(`Often interacts with: ${friends.map(r => `<@${r.otherUserId}>`).slice(0, 3).join(', ')}`);
    }
  }
  
  // Add communication style
  if (patterns.communication_style) {
    parts.push(`Style: ${patterns.communication_style.data.style || 'casual'}`);
  }
  
  return parts.join(' | ');
}

// Auto-learn from conversation
export async function autoLearnFromMessage(opts: {
  userId: string;
  guildId: string | null;
  messageContent: string;
  messageTimestamp: Date;
  mentionedUsers?: string[];
}) {
  const { userId, guildId, messageContent, messageTimestamp, mentionedUsers } = opts;
  
  // 1. Detect timezone pattern
  detectTimezone(userId, guildId, messageTimestamp);
  
  // 2. Track relationships (who they talk to)
  if (mentionedUsers && mentionedUsers.length > 0) {
    for (const otherId of mentionedUsers) {
      if (otherId !== userId) {
        trackUserInteraction(userId, otherId, guildId);
      }
    }
  }
  
  // 3. Detect communication style (simple heuristic)
  const hasEmojis = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]/u.test(messageContent);
  const hasCaps = /[A-Z]{3,}/.test(messageContent);
  const isShort = messageContent.length < 50;
  
  const styleData = {
    style: isShort ? (hasEmojis ? 'casual-friendly' : 'brief') : (hasCaps ? 'expressive' : 'detailed'),
    avgLength: messageContent.length,
    usesEmojis: hasEmojis,
    timestamp: messageTimestamp.toISOString()
  };
  
  updateUserPattern(userId, guildId, 'communication_style', styleData, 0.6);
}
