/**
 * Customer History View
 * View user's past tickets and interactions
 */

import { getDB } from './db';
import { EmbedBuilder } from 'discord.js';

export interface CustomerProfile {
  user_id: string;
  guild_id: string;
  total_tickets: number;
  open_tickets: number;
  closed_tickets: number;
  average_rating: number;
  total_messages: number;
  first_ticket: string;
  last_ticket: string;
  is_vip: number;
  is_flagged: number;
  flag_reason: string | null;
  notes: string | null;
}

export interface CustomerNote {
  id: number;
  user_id: string;
  guild_id: string;
  staff_id: string;
  note: string;
  is_warning: number;
  created_at: string;
}

// Initialize customer history schema
export function initCustomerHistorySchema() {
  const db = getDB();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_profiles (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      is_vip INTEGER DEFAULT 0,
      is_flagged INTEGER DEFAULT 0,
      flag_reason TEXT,
      notes TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, guild_id)
    );
    
    CREATE TABLE IF NOT EXISTS customer_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      note TEXT NOT NULL,
      is_warning INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_customer_notes_user ON customer_notes(user_id, guild_id);
  `);
  
  console.log('✅ Customer History schema initialized');
}

// Get comprehensive customer profile
export function getCustomerProfile(userId: string, guildId: string): CustomerProfile | null {
  const db = getDB();
  
  // Get or create base profile
  let profile = db.prepare(`
    SELECT * FROM customer_profiles 
    WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId) as CustomerProfile | undefined;
  
  if (!profile) {
    db.prepare(`
      INSERT INTO customer_profiles (user_id, guild_id)
      VALUES (?, ?)
    `).run(userId, guildId);
    
    profile = db.prepare(`
      SELECT * FROM customer_profiles 
      WHERE user_id = ? AND guild_id = ?
    `).get(userId, guildId) as CustomerProfile;
  }
  
  // Get ticket statistics
  const ticketStats = db.prepare(`
    SELECT 
      COUNT(*) as total_tickets,
      SUM(CASE WHEN status = 'open' OR status = 'claimed' THEN 1 ELSE 0 END) as open_tickets,
      SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_tickets,
      MIN(created_at) as first_ticket,
      MAX(created_at) as last_ticket
    FROM tickets
    WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId) as any;
  
  return {
    ...profile,
    total_tickets: ticketStats?.total_tickets || 0,
    open_tickets: ticketStats?.open_tickets || 0,
    closed_tickets: ticketStats?.closed_tickets || 0,
    average_rating: 0, // Rating system not implemented yet
    total_messages: 0, // Message tracking not implemented yet
    first_ticket: ticketStats?.first_ticket || null,
    last_ticket: ticketStats?.last_ticket || null
  };
}

// Get customer's ticket history
export function getCustomerTicketHistory(
  userId: string,
  guildId: string,
  limit: number = 10
): any[] {
  const db = getDB();
  
  return db.prepare(`
    SELECT 
      id,
      channel_id,
      category,
      status,
      claimed_by,
      rating,
      created_at,
      closed_at,
      CASE 
        WHEN closed_at IS NOT NULL THEN
          CAST((julianday(closed_at) - julianday(created_at)) * 24 * 60 AS INTEGER)
        ELSE NULL
      END as resolution_time_minutes
    FROM tickets
    WHERE user_id = ? AND guild_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, guildId, limit);
}

// Add note about customer
export function addCustomerNote(
  userId: string,
  guildId: string,
  staffId: string,
  note: string,
  isWarning: boolean = false
): number {
  const db = getDB();
  
  const result = db.prepare(`
    INSERT INTO customer_notes (user_id, guild_id, staff_id, note, is_warning)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, guildId, staffId, note, isWarning ? 1 : 0);
  
  console.log(`📝 Customer note added for ${userId} by ${staffId}`);
  
  return result.lastInsertRowid as number;
}

// Get customer notes
export function getCustomerNotes(userId: string, guildId: string): CustomerNote[] {
  const db = getDB();
  
  return db.prepare(`
    SELECT * FROM customer_notes
    WHERE user_id = ? AND guild_id = ?
    ORDER BY created_at DESC
  `).all(userId, guildId) as CustomerNote[];
}

// Mark customer as VIP
export function setCustomerVIP(userId: string, guildId: string, isVip: boolean): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO customer_profiles (user_id, guild_id, is_vip, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      is_vip = excluded.is_vip,
      updated_at = datetime('now')
  `).run(userId, guildId, isVip ? 1 : 0);
  
  console.log(`⭐ Customer ${userId} VIP status: ${isVip}`);
}

// Flag customer with reason
export function flagCustomer(
  userId: string,
  guildId: string,
  isFlagged: boolean,
  reason?: string
): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO customer_profiles (user_id, guild_id, is_flagged, flag_reason, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      is_flagged = excluded.is_flagged,
      flag_reason = excluded.flag_reason,
      updated_at = datetime('now')
  `).run(userId, guildId, isFlagged ? 1 : 0, reason || null);
  
  console.log(`🚩 Customer ${userId} flagged: ${isFlagged} (${reason || 'no reason'})`);
}

// Build customer history embed
export function buildCustomerHistoryEmbed(userId: string, guildId: string, username: string): EmbedBuilder {
  const profile = getCustomerProfile(userId, guildId);
  const recentTickets = getCustomerTicketHistory(userId, guildId, 5);
  const notes = getCustomerNotes(userId, guildId).slice(0, 3);
  
  const embed = new EmbedBuilder()
    .setTitle(`📊 Customer History: ${username}`)
    .setColor(profile?.is_vip ? 0xFFD700 : profile?.is_flagged ? 0xFF0000 : 0x0099FF)
    .setTimestamp();
  
  if (profile) {
    // Status badges
    let badges = '';
    if (profile.is_vip) badges += '⭐ VIP ';
    if (profile.is_flagged) badges += '🚩 FLAGGED ';
    if (badges) embed.setDescription(badges.trim());
    
    // Statistics
    embed.addFields({
      name: '📈 Statistics',
      value: [
        `**Total Tickets:** ${profile.total_tickets}`,
        `**Open:** ${profile.open_tickets} | **Closed:** ${profile.closed_tickets}`,
        `**Avg Rating:** ${profile.average_rating > 0 ? profile.average_rating.toFixed(1) + ' ⭐' : 'N/A'}`,
        `**Total Messages:** ${profile.total_messages}`
      ].join('\n'),
      inline: false
    });
    
    // Recent tickets
    if (recentTickets.length > 0) {
      const ticketList = recentTickets.map(t => {
        const status = t.status === 'closed' ? '✅' : '🔴';
        const rating = t.rating ? ` (${t.rating}⭐)` : '';
        return `${status} Ticket #${t.id} - ${t.category}${rating}`;
      }).join('\n');
      
      embed.addFields({
        name: '🎫 Recent Tickets',
        value: ticketList,
        inline: false
      });
    }
    
    // Notes
    if (notes.length > 0) {
      const noteList = notes.map(n => {
        const icon = n.is_warning ? '⚠️' : '📝';
        const date = new Date(n.created_at).toLocaleDateString();
        return `${icon} ${date}: ${n.note.substring(0, 100)}`;
      }).join('\n');
      
      embed.addFields({
        name: '📝 Staff Notes',
        value: noteList,
        inline: false
      });
    }
    
    if (profile.is_flagged && profile.flag_reason) {
      embed.addFields({
        name: '🚩 Flag Reason',
        value: profile.flag_reason,
        inline: false
      });
    }
  }
  
  return embed;
}
