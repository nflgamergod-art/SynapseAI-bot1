import { getDB } from './db';
import { getUserPatterns } from './enhancedMemory';

/**
 * Temporal Intelligence
 * Features:
 * - Activity pattern predictions
 * - Proactive check-ins
 * - Timezone awareness
 * - Optimal scheduling
 * - Temporal context
 */

function nowISO() {
  return new Date().toISOString();
}

// Predict when a user is likely to be active
export function predictUserActivity(userId: string, guildId: string | null): {
  likelyActiveHours: number[]; // 0-23
  timezone: string | null;
  peakActivityHour: number | null;
  nextLikelyActiveTime: Date | null;
} {
  const patterns = getUserPatterns(userId, guildId);
  
  if (!patterns) {
    return {
      likelyActiveHours: [],
      timezone: null,
      peakActivityHour: null,
      nextLikelyActiveTime: null
    };
  }
  
  const timezone = patterns.timezone || null;
  
  // Parse active hours (e.g., "14-18,20-22")
  const likelyActiveHours: number[] = [];
  if (patterns.active_hours) {
    const ranges = patterns.active_hours.split(',');
    for (const range of ranges) {
      const [start, end] = range.split('-').map(Number);
      for (let h = start; h <= end; h++) {
        likelyActiveHours.push(h);
      }
    }
  }
  
  const peakActivityHour = likelyActiveHours.length > 0 
    ? likelyActiveHours[Math.floor(likelyActiveHours.length / 2)]
    : null;
  
  // Calculate next likely active time
  let nextLikelyActiveTime: Date | null = null;
  if (likelyActiveHours.length > 0) {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Find next active hour today
    const nextHourToday = likelyActiveHours.find(h => h > currentHour);
    
    if (nextHourToday !== undefined) {
      nextLikelyActiveTime = new Date(now);
      nextLikelyActiveTime.setHours(nextHourToday, 0, 0, 0);
    } else {
      // Next active hour is tomorrow
      const firstHourTomorrow = Math.min(...likelyActiveHours);
      nextLikelyActiveTime = new Date(now);
      nextLikelyActiveTime.setDate(now.getDate() + 1);
      nextLikelyActiveTime.setHours(firstHourTomorrow, 0, 0, 0);
    }
  }
  
  return {
    likelyActiveHours,
    timezone,
    peakActivityHour,
    nextLikelyActiveTime
  };
}

// Check if user should receive a proactive check-in
export function shouldCheckIn(userId: string, guildId: string | null): {
  shouldCheckIn: boolean;
  reason?: string;
  suggestedMessage?: string;
} {
  const db = getDB();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  
  // Check last check-in
  const lastCheckIn = db.prepare(`
    SELECT * FROM scheduled_checkins
    WHERE user_id = ? AND guild_id = ? AND status = 'completed'
    ORDER BY checked_in_at DESC
    LIMIT 1
  `).get(userId, guildId) as any;
  
  // Don't check in if we checked in within last 24 hours
  if (lastCheckIn && lastCheckIn.checked_in_at > oneDayAgo) {
    return { shouldCheckIn: false };
  }
  
  // Check for recent negative sentiment
  const recentNegativeSentiment = db.prepare(`
    SELECT COUNT(*) as count
    FROM sentiment_history
    WHERE user_id = ? AND guild_id = ? AND created_at > ? AND sentiment IN ('negative', 'very_negative')
  `).get(userId, guildId, threeDaysAgo) as { count: number };
  
  if (recentNegativeSentiment.count >= 3) {
    return {
      shouldCheckIn: true,
      reason: 'recent_frustration',
      suggestedMessage: "Hey! I noticed you might have been running into some challenges recently. Is there anything I can help with?"
    };
  }
  
  // Check for unresolved support interactions
  const unresolvedCases = db.prepare(`
    SELECT COUNT(*) as count
    FROM support_interactions
    WHERE requester_id = ? AND guild_id = ? AND status IN ('open', 'escalated')
  `).get(userId, guildId) as { count: number };
  
  if (unresolvedCases.count > 0) {
    return {
      shouldCheckIn: true,
      reason: 'unresolved_cases',
      suggestedMessage: "Hi! I see you have an open support case. Just wanted to check if you're still experiencing issues or if there's anything else I can help with?"
    };
  }
  
  // Check for absence (no messages in 3+ days but was previously active)
  const recentMessages = db.prepare(`
    SELECT COUNT(*) as count
    FROM recent_messages
    WHERE user_id = ? AND guild_id = ? AND timestamp > ?
  `).get(userId, guildId, threeDaysAgo) as { count: number };
  
  const olderMessages = db.prepare(`
    SELECT COUNT(*) as count
    FROM recent_messages
    WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId) as { count: number };
  
  if (recentMessages.count === 0 && olderMessages.count > 10) {
    return {
      shouldCheckIn: true,
      reason: 'user_absence',
      suggestedMessage: "Hey! Haven't seen you around lately. Hope everything's going well! Let me know if you need anything."
    };
  }
  
  return { shouldCheckIn: false };
}

// Schedule a check-in
export function scheduleCheckIn(opts: {
  userId: string;
  guildId: string | null;
  reason: string;
  scheduledFor?: Date;
  message?: string;
}): number {
  const { userId, guildId, reason, scheduledFor, message } = opts;
  const db = getDB();
  const now = nowISO();
  
  // Default to next active time if not specified
  let scheduledTime = scheduledFor?.toISOString() || now;
  if (!scheduledFor) {
    const prediction = predictUserActivity(userId, guildId);
    if (prediction.nextLikelyActiveTime) {
      scheduledTime = prediction.nextLikelyActiveTime.toISOString();
    }
  }
  
  const result = db.prepare(`
    INSERT INTO scheduled_checkins
    (user_id, guild_id, reason, scheduled_for, message, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(userId, guildId, reason, scheduledTime, message || null, now);
  
  return result.lastInsertRowid as number;
}

// Get pending check-ins that are due
export function getPendingCheckIns(guildId: string | null): any[] {
  const db = getDB();
  const now = nowISO();
  
  return db.prepare(`
    SELECT * FROM scheduled_checkins
    WHERE guild_id = ? AND status = 'pending' AND scheduled_for <= ?
    ORDER BY scheduled_for ASC
  `).all(guildId, now) as any[];
}

// Mark check-in as completed
export function completeCheckIn(checkInId: number, response?: string) {
  const db = getDB();
  const now = nowISO();
  
  db.prepare(`
    UPDATE scheduled_checkins
    SET status = 'completed', checked_in_at = ?, response = ?
    WHERE id = ?
  `).run(now, response || null, checkInId);
}

// Get optimal time to send a message to a user
export function getOptimalMessageTime(userId: string, guildId: string | null): {
  suggestedTime: Date;
  reason: string;
  confidence: number;
} {
  const prediction = predictUserActivity(userId, guildId);
  
  if (prediction.nextLikelyActiveTime) {
    return {
      suggestedTime: prediction.nextLikelyActiveTime,
      reason: `User is typically active around ${prediction.peakActivityHour}:00${prediction.timezone ? ` (${prediction.timezone})` : ''}`,
      confidence: 0.8
    };
  }
  
  // Default to current time + 1 hour
  const defaultTime = new Date();
  defaultTime.setHours(defaultTime.getHours() + 1);
  
  return {
    suggestedTime: defaultTime,
    reason: 'No activity pattern available - suggesting near-term follow-up',
    confidence: 0.3
  };
}

// Analyze temporal patterns across the server
export function analyzeServerTemporalPatterns(guildId: string | null): {
  peakActivityHours: number[];
  quietHours: number[];
  averageTimezone: string | null;
  supportBusiestHours: number[];
} {
  const db = getDB();
  
  // Get all user patterns for this guild (generic row-based storage)
  const patternRows = db.prepare(`
    SELECT pattern_type, pattern_data
    FROM user_patterns
    WHERE guild_id = ? OR guild_id IS NULL
  `).all(guildId) as { pattern_type: string; pattern_data: string }[];

  // Aggregate hourly activity
  const hourlyCounts: number[] = new Array(24).fill(0);
  const timezones: Record<string, number> = {};

  for (const row of patternRows) {
    try {
      const data = JSON.parse(row.pattern_data || '{}');
      if (row.pattern_type === 'active_hours') {
        // Supports either ranges string "HH-HH,HH-HH" or explicit hours array
        const rangesStr: string | undefined = data.ranges || data.active_hours;
        const hoursArr: number[] | undefined = data.hours;
        if (rangesStr) {
          const ranges = String(rangesStr).split(',');
          for (const range of ranges) {
            const [start, end] = range.split('-').map((n: string) => parseInt(n, 10));
            if (!isNaN(start) && !isNaN(end)) {
              for (let h = start; h <= end; h++) {
                hourlyCounts[(h + 24) % 24]++;
              }
            }
          }
        } else if (Array.isArray(hoursArr)) {
          for (const h of hoursArr) {
            if (typeof h === 'number' && h >= 0 && h < 24) hourlyCounts[h]++;
          }
        }
      }
      if (row.pattern_type === 'timezone') {
        // Derive timezone label if available
        // Prefer explicit tz string; fallback to estimatedOffset
        const tz: string | undefined = data.timezone || data.tz;
        const estimatedOffset: number | undefined = data.estimatedOffset;
        if (tz) {
          timezones[tz] = (timezones[tz] || 0) + 1;
        } else if (typeof estimatedOffset === 'number') {
          const label = estimatedOffset >= 0 ? `UTC+${estimatedOffset}` : `UTC${estimatedOffset}`;
          timezones[label] = (timezones[label] || 0) + 1;
        }
        // Also aggregate hourDistribution if present
        const dist: number[] | undefined = data.hourDistribution;
        if (Array.isArray(dist) && dist.length === 24) {
          for (let h = 0; h < 24; h++) {
            const inc = typeof dist[h] === 'number' ? dist[h] : 0;
            hourlyCounts[h] += inc;
          }
        }
      }
    } catch {
      // ignore malformed
    }
  }
  
  // Find peak and quiet hours
  const maxCount = Math.max(...hourlyCounts);
  const minCount = Math.min(...hourlyCounts.filter(c => c > 0));
  
  const peakActivityHours = hourlyCounts
    .map((count, hour) => ({ hour, count }))
    .filter(h => h.count >= maxCount * 0.7)
    .map(h => h.hour);
  
  const quietHours = hourlyCounts
    .map((count, hour) => ({ hour, count }))
    .filter(h => h.count <= minCount * 1.3 || h.count === 0)
    .map(h => h.hour);
  
  const averageTimezone = Object.entries(timezones).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  
  // Get support busiest hours (from support_interactions table)
  const supportHours = db.prepare(`
    SELECT strftime('%H', started_at) as hour, COUNT(*) as count
    FROM support_interactions
    WHERE guild_id = ?
    GROUP BY hour
    ORDER BY count DESC
    LIMIT 5
  `).all(guildId) as { hour: string; count: number }[];
  
  const supportBusiestHours = supportHours.map(h => parseInt(h.hour));
  
  return {
    peakActivityHours,
    quietHours,
    averageTimezone,
    supportBusiestHours
  };
}

// Suggest best time for server-wide announcements
export function suggestAnnouncementTime(guildId: string | null): {
  suggestedTime: Date;
  reason: string;
  expectedReach: number;
} {
  const patterns = analyzeServerTemporalPatterns(guildId);
  
  if (patterns.peakActivityHours.length > 0) {
    const bestHour = patterns.peakActivityHours[0];
    const suggestedTime = new Date();
    suggestedTime.setHours(bestHour, 0, 0, 0);
    
    // If the hour has passed today, schedule for tomorrow
    if (suggestedTime < new Date()) {
      suggestedTime.setDate(suggestedTime.getDate() + 1);
    }
    
    return {
      suggestedTime,
      reason: `Peak server activity is around ${bestHour}:00`,
      expectedReach: 0.8
    };
  }
  
  // Default to 6 PM if no data
  const defaultTime = new Date();
  defaultTime.setHours(18, 0, 0, 0);
  if (defaultTime < new Date()) {
    defaultTime.setDate(defaultTime.getDate() + 1);
  }
  
  return {
    suggestedTime: defaultTime,
    reason: 'No activity data available - suggesting early evening',
    expectedReach: 0.5
  };
}
