/**
 * Ticket Collaboration
 * Tag staff, internal notes, transfer with context
 */

import { getDB } from './db';
import { EmbedBuilder, User } from 'discord.js';

export interface TicketNote {
  id: number;
  ticket_id: number;
  staff_id: string;
  note: string;
  is_internal: number;
  created_at: string;
}

export interface TicketMention {
  id: number;
  ticket_id: number;
  mentioned_by: string;
  mentioned_user: string;
  message: string;
  resolved: number;
  created_at: string;
}

export interface TicketTransfer {
  id: number;
  ticket_id: number;
  from_staff: string;
  to_staff: string;
  reason: string;
  context_notes: string | null;
  created_at: string;
}

// Initialize ticket collaboration schema
export function initTicketCollaborationSchema() {
  const db = getDB();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      staff_id TEXT NOT NULL,
      note TEXT NOT NULL,
      is_internal INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    
    CREATE TABLE IF NOT EXISTS ticket_mentions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      mentioned_by TEXT NOT NULL,
      mentioned_user TEXT NOT NULL,
      message TEXT,
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    
    CREATE TABLE IF NOT EXISTS ticket_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      from_staff TEXT NOT NULL,
      to_staff TEXT NOT NULL,
      reason TEXT NOT NULL,
      context_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket ON ticket_notes(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_mentions_ticket ON ticket_mentions(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_mentions_user ON ticket_mentions(mentioned_user);
    CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket ON ticket_transfers(ticket_id);
  `);
  
  console.log('✅ Ticket Collaboration schema initialized');
}

// Add internal note to ticket
export function addTicketNote(
  ticketId: number,
  staffId: string,
  note: string,
  isInternal: boolean = true
): number {
  const db = getDB();
  
  const result = db.prepare(`
    INSERT INTO ticket_notes (ticket_id, staff_id, note, is_internal)
    VALUES (?, ?, ?, ?)
  `).run(ticketId, staffId, note, isInternal ? 1 : 0);
  
  console.log(`📝 ${isInternal ? 'Internal' : 'Public'} note added to ticket #${ticketId} by ${staffId}`);
  
  return result.lastInsertRowid as number;
}

// Get ticket notes
export function getTicketNotes(ticketId: number, includeInternal: boolean = true): TicketNote[] {
  const db = getDB();
  
  const query = includeInternal
    ? 'SELECT * FROM ticket_notes WHERE ticket_id = ? ORDER BY created_at DESC'
    : 'SELECT * FROM ticket_notes WHERE ticket_id = ? AND is_internal = 0 ORDER BY created_at DESC';
  
  return db.prepare(query).all(ticketId) as TicketNote[];
}

// Mention/tag a staff member in a ticket
export function mentionStaffInTicket(
  ticketId: number,
  mentionedBy: string,
  mentionedUser: string,
  message?: string
): number {
  const db = getDB();
  
  const result = db.prepare(`
    INSERT INTO ticket_mentions (ticket_id, mentioned_by, mentioned_user, message)
    VALUES (?, ?, ?, ?)
  `).run(ticketId, mentionedBy, mentionedUser, message || null);
  
  console.log(`🏷️ Staff ${mentionedUser} mentioned in ticket #${ticketId} by ${mentionedBy}`);
  
  return result.lastInsertRowid as number;
}

// Get pending mentions for a staff member
export function getPendingMentions(userId: string, guildId: string): TicketMention[] {
  const db = getDB();
  
  return db.prepare(`
    SELECT tm.* FROM ticket_mentions tm
    JOIN tickets t ON tm.ticket_id = t.id
    WHERE tm.mentioned_user = ? AND t.guild_id = ? AND tm.resolved = 0
    ORDER BY tm.created_at DESC
  `).all(userId, guildId) as TicketMention[];
}

// Mark mention as resolved
export function resolveMention(mentionId: number): void {
  const db = getDB();
  
  db.prepare(`
    UPDATE ticket_mentions 
    SET resolved = 1 
    WHERE id = ?
  `).run(mentionId);
  
  console.log(`✅ Mention #${mentionId} resolved`);
}

// Transfer ticket to another staff member
export function transferTicket(
  ticketId: number,
  fromStaff: string,
  toStaff: string,
  reason: string,
  contextNotes?: string
): number {
  const db = getDB();
  
  // Record transfer
  const result = db.prepare(`
    INSERT INTO ticket_transfers (ticket_id, from_staff, to_staff, reason, context_notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(ticketId, fromStaff, toStaff, reason, contextNotes || null);
  
  // Update ticket claimed_by
  db.prepare(`
    UPDATE tickets 
    SET claimed_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(toStaff, ticketId);
  
  console.log(`🔄 Ticket #${ticketId} transferred from ${fromStaff} to ${toStaff}`);
  
  return result.lastInsertRowid as number;
}

// Get ticket transfer history
export function getTicketTransfers(ticketId: number): TicketTransfer[] {
  const db = getDB();
  
  return db.prepare(`
    SELECT * FROM ticket_transfers 
    WHERE ticket_id = ? 
    ORDER BY created_at DESC
  `).all(ticketId) as TicketTransfer[];
}

// Build collaboration summary embed
export function buildCollaborationSummary(ticketId: number): EmbedBuilder {
  const notes = getTicketNotes(ticketId, true);
  const transfers = getTicketTransfers(ticketId);
  const db = getDB();
  
  const mentions = db.prepare(`
    SELECT * FROM ticket_mentions 
    WHERE ticket_id = ? 
    ORDER BY created_at DESC
  `).all(ticketId) as TicketMention[];
  
  const embed = new EmbedBuilder()
    .setTitle(`🤝 Ticket #${ticketId} Collaboration Summary`)
    .setColor(0x00AE86)
    .setTimestamp();
  
  // Internal notes
  if (notes.length > 0) {
    const internalNotes = notes.filter(n => n.is_internal);
    if (internalNotes.length > 0) {
      const notesList = internalNotes.slice(0, 3).map(n => {
        const date = new Date(n.created_at).toLocaleString();
        return `📝 <@${n.staff_id}> (${date}):\n${n.note.substring(0, 100)}`;
      }).join('\n\n');
      
      embed.addFields({
        name: `🔒 Internal Notes (${internalNotes.length})`,
        value: notesList || 'None',
        inline: false
      });
    }
  }
  
  // Staff mentions
  if (mentions.length > 0) {
    const mentionsList = mentions.slice(0, 3).map(m => {
      const status = m.resolved ? '✅' : '🔔';
      return `${status} <@${m.mentioned_by}> → <@${m.mentioned_user}>`;
    }).join('\n');
    
    embed.addFields({
      name: `🏷️ Staff Tagged (${mentions.length})`,
      value: mentionsList,
      inline: false
    });
  }
  
  // Transfers
  if (transfers.length > 0) {
    const transfersList = transfers.slice(0, 3).map(t => {
      const date = new Date(t.created_at).toLocaleString();
      return `🔄 <@${t.from_staff}> → <@${t.to_staff}>\n*${t.reason}* (${date})`;
    }).join('\n\n');
    
    embed.addFields({
      name: `🔄 Transfers (${transfers.length})`,
      value: transfersList,
      inline: false
    });
  }
  
  return embed;
}

// Get staff member's active collaborations
export function getStaffCollaborations(userId: string, guildId: string): {
  mentions: number;
  notes_written: number;
  transfers_received: number;
} {
  const db = getDB();
  
  const stats = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM ticket_mentions tm 
       JOIN tickets t ON tm.ticket_id = t.id 
       WHERE tm.mentioned_user = ? AND t.guild_id = ? AND tm.resolved = 0) as mentions,
      (SELECT COUNT(*) FROM ticket_notes tn 
       JOIN tickets t ON tn.ticket_id = t.id 
       WHERE tn.staff_id = ? AND t.guild_id = ?) as notes_written,
      (SELECT COUNT(*) FROM ticket_transfers tt 
       JOIN tickets t ON tt.ticket_id = t.id 
       WHERE tt.to_staff = ? AND t.guild_id = ?) as transfers_received
  `).get(userId, guildId, userId, guildId, userId, guildId) as any;
  
  return {
    mentions: stats?.mentions || 0,
    notes_written: stats?.notes_written || 0,
    transfers_received: stats?.transfers_received || 0
  };
}
