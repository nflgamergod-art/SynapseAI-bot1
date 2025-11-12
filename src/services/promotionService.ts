import { Client, GuildMember, TextChannel, EmbedBuilder } from 'discord.js';
import { getDB } from './db';
import { PROMOTION_CONFIG } from '../config/promotionConfig';
import { getPromotionStats } from './promotionStats';

// Database schema for promotion system
export function initPromotionSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS promotion_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      from_role TEXT NOT NULL,
      to_role TEXT NOT NULL,
      tickets_resolved INTEGER NOT NULL,
      messages_sent INTEGER NOT NULL,
      hours_clocked INTEGER NOT NULL,
      queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT CHECK(status IN ('pending', 'approved', 'denied')) NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TEXT,
      UNIQUE(guild_id, user_id, to_role, status)
    );
    
    CREATE TABLE IF NOT EXISTS promotion_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      from_role TEXT NOT NULL,
      to_role TEXT NOT NULL,
      promoted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      auto BOOLEAN NOT NULL DEFAULT 0
    );
    
    CREATE INDEX IF NOT EXISTS idx_promotion_queue_guild_status ON promotion_queue(guild_id, status);
    CREATE INDEX IF NOT EXISTS idx_promotion_log_guild_user ON promotion_log(guild_id, user_id);
  `);
}

// Check a single user for promotion eligibility
export async function checkUserPromotion(
  client: Client,
  guildId: string,
  member: GuildMember
): Promise<void> {
  const stats = getPromotionStats(guildId, member.id);
  const roles = member.roles.cache;
  
  // Check Trial Support → Support (automatic)
  if (roles.has(PROMOTION_CONFIG.roles.trialSupport) && !roles.has(PROMOTION_CONFIG.roles.support)) {
    const threshold = PROMOTION_CONFIG.thresholds.trialToSupport;
    if (
      stats.ticketsResolved >= threshold.tickets &&
      stats.supportMessages >= threshold.messages &&
      stats.hoursClockedIn >= threshold.hours
    ) {
      await promoteUser(client, guildId, member, 'trialSupport', 'support', stats, true);
    }
  }
  
  // Check Support → Head Support (requires approval)
  if (roles.has(PROMOTION_CONFIG.roles.support) && !roles.has(PROMOTION_CONFIG.roles.headSupport)) {
    const threshold = PROMOTION_CONFIG.thresholds.supportToHead;
    if (
      stats.ticketsResolved >= threshold.tickets &&
      stats.supportMessages >= threshold.messages &&
      stats.hoursClockedIn >= threshold.hours
    ) {
      await queueForPromotion(client, guildId, member, 'support', 'headSupport', stats);
    }
  }
}

// Automatically promote a user (for Trial Support → Support)
async function promoteUser(
  client: Client,
  guildId: string,
  member: GuildMember,
  fromRole: string,
  toRole: string,
  stats: any,
  auto: boolean
): Promise<void> {
  try {
    const guild = await client.guilds.fetch(guildId);
    const toRoleId = PROMOTION_CONFIG.roles[toRole as keyof typeof PROMOTION_CONFIG.roles];
    const fromRoleId = PROMOTION_CONFIG.roles[fromRole as keyof typeof PROMOTION_CONFIG.roles];
    
    // Add new role, remove old role
    await member.roles.add(toRoleId);
    await member.roles.remove(fromRoleId);
    
    // Log promotion
    const db = getDB();
    db.prepare(`
      INSERT INTO promotion_log (guild_id, user_id, from_role, to_role, auto)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, member.id, fromRole, toRole, auto ? 1 : 0);
    
    // Notify user via DM
    try {
      const embed = new EmbedBuilder()
        .setTitle('🎉 Congratulations! You\'ve been promoted!')
        .setDescription(`You have been promoted from **${fromRole}** to **${toRole}**!`)
        .setColor(0x00AE86)
        .addFields(
          { name: 'Tickets Resolved', value: stats.ticketsResolved.toString(), inline: true },
          { name: 'Messages Sent', value: stats.supportMessages.toString(), inline: true },
          { name: 'Hours Clocked In', value: stats.hoursClockedIn.toString(), inline: true }
        )
        .setTimestamp();
      await member.send({ embeds: [embed] });
    } catch (err) {
      console.log(`Could not DM ${member.user.tag} about promotion:`, err);
    }
    
    console.log(`[Promotion] ${member.user.tag} promoted from ${fromRole} to ${toRole} (auto: ${auto})`);
  } catch (error) {
    console.error(`[Promotion] Error promoting ${member.user.tag}:`, error);
  }
}

// Queue a user for manual promotion approval (for Support → Head Support)
async function queueForPromotion(
  client: Client,
  guildId: string,
  member: GuildMember,
  fromRole: string,
  toRole: string,
  stats: any
): Promise<void> {
  const db = getDB();
  
  // Check if already queued
  const existing = db.prepare(`
    SELECT * FROM promotion_queue 
    WHERE guild_id = ? AND user_id = ? AND to_role = ? AND status = 'pending'
  `).get(guildId, member.id, toRole);
  
  if (existing) {
    return; // Already queued
  }
  
  // Add to queue
  db.prepare(`
    INSERT INTO promotion_queue (guild_id, user_id, from_role, to_role, tickets_resolved, messages_sent, hours_clocked)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, member.id, fromRole, toRole, stats.ticketsResolved, stats.supportMessages, stats.hoursClockedIn);
  
  console.log(`[Promotion] ${member.user.tag} queued for ${fromRole} → ${toRole} approval`);
  
  // Notify admin/owner (you can configure this to your admin channel or DM)
  // TODO: Add notification to admin channel or DM
}

// Run promotion check for all support members in a guild
export async function runPromotionCheck(client: Client, guildId: string): Promise<void> {
  try {
    const guild = await client.guilds.fetch(guildId);
    
    // Get all members with support roles
    const trialSupportRole = guild.roles.cache.get(PROMOTION_CONFIG.roles.trialSupport);
    const supportRole = guild.roles.cache.get(PROMOTION_CONFIG.roles.support);
    
    if (!trialSupportRole && !supportRole) {
      console.log('[Promotion] No support roles found, skipping promotion check');
      return;
    }
    
    // Fetch all members (in case they're not cached)
    await guild.members.fetch();
    
    // Check all trial support members
    if (trialSupportRole) {
      for (const [, member] of trialSupportRole.members) {
        await checkUserPromotion(client, guildId, member);
      }
    }
    
    // Check all support members
    if (supportRole) {
      for (const [, member] of supportRole.members) {
        await checkUserPromotion(client, guildId, member);
      }
    }
    
    console.log('[Promotion] Promotion check completed for guild', guildId);
  } catch (error) {
    console.error('[Promotion] Error running promotion check:', error);
  }
}

// Get pending promotions for approval
export function getPendingPromotions(guildId: string): any[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM promotion_queue
    WHERE guild_id = ? AND status = 'pending'
    ORDER BY queued_at ASC
  `).all(guildId) as any[];
  return rows;
}

// Approve a promotion
export async function approvePromotion(
  client: Client,
  guildId: string,
  promotionId: number,
  reviewerId: string
): Promise<{ success: boolean; message: string }> {
  const db = getDB();
  
  const promotion = db.prepare(`
    SELECT * FROM promotion_queue WHERE id = ?
  `).get(promotionId) as any;
  
  if (!promotion) {
    return { success: false, message: 'Promotion not found' };
  }
  
  if (promotion.status !== 'pending') {
    return { success: false, message: 'Promotion already reviewed' };
  }
  
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(promotion.user_id);
    
    // Promote the user
    const stats = {
      ticketsResolved: promotion.tickets_resolved,
      supportMessages: promotion.messages_sent,
      hoursClockedIn: promotion.hours_clocked
    };
    await promoteUser(client, guildId, member, promotion.from_role, promotion.to_role, stats, false);
    
    // Update queue status
    db.prepare(`
      UPDATE promotion_queue 
      SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now')
      WHERE id = ?
    `).run(reviewerId, promotionId);
    
    return { success: true, message: `${member.user.tag} promoted to ${promotion.to_role}` };
  } catch (error) {
    console.error('[Promotion] Error approving promotion:', error);
    return { success: false, message: `Error: ${error}` };
  }
}

// Deny a promotion
export function denyPromotion(
  promotionId: number,
  reviewerId: string
): { success: boolean; message: string } {
  const db = getDB();
  
  const promotion = db.prepare(`
    SELECT * FROM promotion_queue WHERE id = ?
  `).get(promotionId) as any;
  
  if (!promotion) {
    return { success: false, message: 'Promotion not found' };
  }
  
  if (promotion.status !== 'pending') {
    return { success: false, message: 'Promotion already reviewed' };
  }
  
  db.prepare(`
    UPDATE promotion_queue 
    SET status = 'denied', reviewed_by = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).run(reviewerId, promotionId);
  
  return { success: true, message: `Promotion denied for user ${promotion.user_id}` };
}

// Initialize schema on import
initPromotionSchema();
