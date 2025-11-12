import { getDB } from './db';
import { PROMOTION_CONFIG } from '../config/promotionConfig';

// Get the number of tickets resolved by a user
// Count tickets resolved by user with a good rating (rating >= 6 on 1-10 scale)
// Tickets are linked to support_interactions via support_interaction_id
export function getTicketsResolved(guildId: string, userId: string): number {
  const db = getDB();
  // Join with support_interactions to get rating
  // Only count tickets with rating >= 6 (good/resolved on 1-10 scale)
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM tickets t
    LEFT JOIN support_interactions si ON t.support_interaction_id = si.id
    WHERE t.guild_id = ? 
      AND t.claimed_by = ? 
      AND t.status = 'closed'
      AND (si.satisfaction_rating IS NULL OR si.satisfaction_rating >= 6)
  `).get(guildId, userId) as any;
  return row?.count || 0;
}

// Get the number of messages sent by a user in support/buyer chat
export function getSupportMessages(guildId: string, userId: string): number {
  const db = getDB();
  // Assumes a messages table exists with channel_id, user_id, guild_id
  // and that messages are logged for these channels
  const supportChannels = [
    PROMOTION_CONFIG.channels.supportChat,
    PROMOTION_CONFIG.channels.buyerChat,
  ];
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM messages
    WHERE guild_id = ? AND user_id = ? AND channel_id IN (${supportChannels.map(() => '?').join(',')})
  `).get(guildId, userId, ...supportChannels) as any;
  return row?.count || 0;
}

// Get the total hours clocked in by a user
export function getClockedInHours(guildId: string, userId: string): number {
  const db = getDB();
  // Sum the duration (in hours) of all shifts for this user
  const rows = db.prepare(`
    SELECT clock_in, clock_out FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_out IS NOT NULL
  `).all(guildId, userId) as any[];
  let totalMs = 0;
  for (const row of rows) {
    const inTime = new Date(row.clock_in);
    const outTime = new Date(row.clock_out);
    if (!isNaN(inTime.getTime()) && !isNaN(outTime.getTime())) {
      totalMs += outTime.getTime() - inTime.getTime();
    }
  }
  return Math.floor(totalMs / (1000 * 60 * 60)); // return hours
}

// Aggregate all stats for a user
export function getPromotionStats(guildId: string, userId: string) {
  return {
    ticketsResolved: getTicketsResolved(guildId, userId),
    supportMessages: getSupportMessages(guildId, userId),
    hoursClockedIn: getClockedInHours(guildId, userId),
  };
}