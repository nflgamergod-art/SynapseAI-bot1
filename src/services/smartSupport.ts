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
    (user_id, support_member_id, guild_id, channel_id, question_category, question, started_at, was_resolved, escalated)
    VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, FALSE)
  `).run(userId, supportMemberId, guildId, channelId, category, questionText, now);
  
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

// Allow adding a co-support helper to an interaction
export function addSupportHelper(interactionId: number, helperUserId: string): string[] {
  const db = getDB();
  const row = db.prepare(`SELECT helpers FROM support_interactions WHERE id = ?`).get(interactionId) as { helpers?: string | null } | undefined;
  const current: string[] = row?.helpers ? (JSON.parse(row.helpers) as string[]).filter(Boolean) : [];
  if (!current.includes(helperUserId)) current.push(helperUserId);
  db.prepare(`UPDATE support_interactions SET helpers = ? WHERE id = ?`).run(JSON.stringify(current), interactionId);
  return current;
}

// Let the requester (helped user) rate the interaction after it ends (or anytime)
export function rateSupportInteraction(opts: {
  interactionId: number;
  byUserId: string;
  rating: number;
  feedbackText?: string;
}): { ok: boolean; reason?: string } {
  const { interactionId, byUserId, rating, feedbackText } = opts;
  if (rating < 1 || rating > 5) return { ok: false, reason: 'Rating must be 1-5' };
  const db = getDB();
  const row = db.prepare(`SELECT user_id FROM support_interactions WHERE id = ?`).get(interactionId) as { user_id: string } | undefined;
  if (!row) return { ok: false, reason: 'Interaction not found' };
  if (row.user_id !== byUserId) return { ok: false, reason: 'Only the requester can rate this ticket' };
  db.prepare(`UPDATE support_interactions SET satisfaction_rating = ?, feedback_text = COALESCE(?, feedback_text) WHERE id = ?`).run(rating, feedbackText ?? null, interactionId);
  return { ok: true };
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
  
  // Weighted overall stats including helpers (70/30 split)
  const rows = db.prepare(`
    SELECT * FROM support_interactions WHERE guild_id = ?
  `).all(guildId) as SupportInteraction[];

  const agg = { total: 0, resolved: 0, fast: 0, timeSum: 0, timeDen: 0, ratingSum: 0, ratingDen: 0 };
  for (const r of rows) {
    const helpers: string[] = (() => { try { return r.helpers ? JSON.parse(r.helpers as any) : []; } catch { return []; } })();
    const hasHelpers = helpers.length > 0;
    const weights: Array<{ id: string; w: number }> = [];
    if (hasHelpers) {
      const hw = 0.3 / helpers.length;
      weights.push({ id: r.support_member_id, w: 0.7 });
      for (const h of helpers) weights.push({ id: h, w: hw });
    } else {
      weights.push({ id: r.support_member_id, w: 1.0 });
    }
    const mine = weights.find(x => x.id === supportMemberId);
    if (!mine) continue;
    const w = mine.w;
    agg.total += w;
    if (r.was_resolved) {
      agg.resolved += w;
      if ((r.resolution_time_seconds || 0) > 0) {
        agg.timeSum += w * (r.resolution_time_seconds || 0);
        agg.timeDen += w;
        if ((r.resolution_time_seconds || 0) < 300) agg.fast += w;
      }
    }
    if (typeof r.satisfaction_rating === 'number') { agg.ratingSum += w * (r.satisfaction_rating as any); agg.ratingDen += w; }
  }
  
  // Category breakdown (kept from expertise table; still primary-based)
  const categories = db.prepare(`
    SELECT * FROM support_expertise
    WHERE support_member_id = ? AND guild_id = ?
    ORDER BY success_count DESC
  `).all(supportMemberId, guildId) as any[];
  
  // Recent interactions (primary only)
  const recent = db.prepare(`
    SELECT * FROM support_interactions
    WHERE support_member_id = ? AND guild_id = ?
    ORDER BY started_at DESC
    LIMIT 10
  `).all(supportMemberId, guildId) as SupportInteraction[];
  
  // Calculate streak (consecutive days with resolved interactions)
  const streak = calculateResolveStreakWeighted(supportMemberId, guildId);
  
  return {
    totalInteractions: agg.total,
    resolvedCount: agg.resolved,
    resolutionRate: agg.total > 0 ? (agg.resolved / agg.total) * 100 : 0,
    avgResponseTime: agg.timeDen > 0 ? Math.round(agg.timeSum / agg.timeDen) : 0,
    avgRating: agg.ratingDen > 0 ? agg.ratingSum / agg.ratingDen : 0,
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

// Calculate consecutive days with successful resolutions (weighted presence)
function calculateResolveStreakWeighted(supportMemberId: string, guildId: string): number {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM support_interactions
    WHERE guild_id = ? AND was_resolved = TRUE
  `).all(guildId) as SupportInteraction[];

  // Build a set of days where the user contributed any share
  const days = new Set<string>();
  for (const r of rows) {
    const helpers: string[] = (() => { try { return r.helpers ? JSON.parse(r.helpers as any) : []; } catch { return []; } })();
    const involved = r.support_member_id === supportMemberId || helpers.includes(supportMemberId);
    if (!involved) continue;
    const d = new Date(r.started_at);
    const day = d.toISOString().split('T')[0];
    days.add(day);
  }
  if (days.size === 0) return 0;
  
  let streak = 0;
  let expectedDate = new Date();
  expectedDate.setHours(0, 0, 0, 0);
  
  // Count backwards day by day while present
  for (;;) {
    const dateStr = expectedDate.toISOString().split('T')[0];
    if (days.has(dateStr)) {
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
  const rows = db.prepare(`SELECT * FROM support_interactions WHERE guild_id = ?`).all(guildId) as SupportInteraction[];
  type Agg = { total: number; resolved: number; timeSum: number; timeDen: number; ratingSum: number; ratingDen: number };
  const map = new Map<string, Agg>();

  for (const r of rows) {
    const helpers: string[] = (() => { try { return r.helpers ? JSON.parse(r.helpers as any) : []; } catch { return []; } })();
    const hasHelpers = helpers.length > 0;
    const weights: Array<{ id: string; w: number }> = [];
    if (hasHelpers) {
      const hw = 0.3 / helpers.length;
      weights.push({ id: r.support_member_id, w: 0.7 });
      for (const h of helpers) weights.push({ id: h, w: hw });
    } else {
      weights.push({ id: r.support_member_id, w: 1.0 });
    }
    for (const { id, w } of weights) {
      const a = map.get(id) || { total: 0, resolved: 0, timeSum: 0, timeDen: 0, ratingSum: 0, ratingDen: 0 };
      a.total += w;
      if (r.was_resolved) {
        a.resolved += w;
        if ((r.resolution_time_seconds || 0) > 0) {
          a.timeSum += w * (r.resolution_time_seconds || 0);
          a.timeDen += w;
        }
      }
      if (typeof r.satisfaction_rating === 'number') { a.ratingSum += w * (r.satisfaction_rating as any); a.ratingDen += w; }
      map.set(id, a);
    }
  }

  const entries = Array.from(map.entries()).map(([id, a]) => {
    const resolutionScore = a.total > 0 ? (a.resolved / a.total) * 100 : 0;
    const speedScore = a.timeDen > 0 ? (a.timeSum / a.timeDen) : Number.MAX_SAFE_INTEGER;
    const ratingScore = a.ratingDen > 0 ? (a.ratingSum / a.ratingDen) : 0;
    const volumeScore = a.total;
    return { support_member_id: id, resolution: resolutionScore, speed: speedScore, rating: ratingScore, volume: volumeScore, total: a.total, resolved: a.resolved };
  });

  switch (metric) {
    case 'resolution':
      return entries.filter(e => e.total >= 5).sort((a,b) => b.resolution - a.resolution).slice(0, 10)
        .map(e => ({ support_member_id: e.support_member_id, score: e.resolution, total: e.total, resolved: e.resolved }));
    case 'speed':
      return entries.filter(e => e.resolved >= 5).sort((a,b) => a.speed - b.speed).slice(0, 10)
        .map(e => ({ support_member_id: e.support_member_id, score: e.speed }));
    case 'rating':
      return entries.filter(e => e.total >= 3 && e.rating > 0).sort((a,b) => b.rating - a.rating).slice(0, 10)
        .map(e => ({ support_member_id: e.support_member_id, score: e.rating }));
    case 'volume':
      return entries.sort((a,b) => b.volume - a.volume).slice(0, 10)
        .map(e => ({ support_member_id: e.support_member_id, score: e.volume }));
  }
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
