import { getDB } from './db';

export interface Ticket {
  id: number;
  guild_id: string;
  channel_id: string;
  user_id: string;
  claimed_by?: string;
  status: 'open' | 'claimed' | 'closed';
  category: string;
  created_at: string;
  closed_at?: string;
  transcript?: string;
  support_interaction_id?: number;
  helpers?: string; // JSON array of user IDs who helped
  last_user_message_at?: string; // Timestamp of last message from ticket owner
  priority?: number; // 1 if priority ticket, 0 otherwise
  priority_set_at?: string; // Timestamp when priority was set
}

export interface TicketConfig {
  guild_id: string;
  category_id: string;
  log_channel_id?: string;
  support_role_ids?: string; // JSON array of role IDs
  vouch_channel_id?: string;
  enabled: boolean;
}

// Initialize tickets tables
export function initTicketsSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_configs (
      guild_id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      log_channel_id TEXT,
      support_role_ids TEXT,
      vouch_channel_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      claimed_by TEXT,
      status TEXT CHECK(status IN ('open', 'claimed', 'closed')) NOT NULL DEFAULT 'open',
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      transcript TEXT,
      support_interaction_id INTEGER,
      helpers TEXT,
      last_user_message_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(guild_id, status);
    
    CREATE TABLE IF NOT EXISTS ticket_blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      blacklisted_by TEXT NOT NULL,
      blacklisted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER NOT NULL DEFAULT 1,
      removed_by TEXT,
      removed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_blacklist_guild_user ON ticket_blacklist(guild_id, user_id, is_active);
  `);
  
  // Migrate existing database if needed
  migrateTicketsSchema();
}

// Migrate existing database to new schema
function migrateTicketsSchema() {
  const db = getDB();
  
  try {
    // Check if old column exists and new column doesn't (ticket_configs migration)
    const configResult = db.prepare("PRAGMA table_info(ticket_configs)").all() as any[];
    const hasOldColumn = configResult.some(col => col.name === 'support_role_id');
    const hasNewColumn = configResult.some(col => col.name === 'support_role_ids');
    
    if (hasOldColumn && !hasNewColumn) {
      console.log('Migrating ticket_configs table to support multiple roles...');
      
      // Add the new column
      db.exec('ALTER TABLE ticket_configs ADD COLUMN support_role_ids TEXT');
      
      // Migrate existing data
      const configs = db.prepare('SELECT * FROM ticket_configs WHERE support_role_id IS NOT NULL').all() as any[];
      
      for (const config of configs) {
        const roleIds = JSON.stringify([config.support_role_id]);
        db.prepare('UPDATE ticket_configs SET support_role_ids = ? WHERE guild_id = ?')
          .run(roleIds, config.guild_id);
      }
      
      console.log(`Migrated ${configs.length} ticket configurations to new schema.`);
    }
    
    // Check if last_user_message_at column exists in tickets table
    const ticketsResult = db.prepare("PRAGMA table_info(tickets)").all() as any[];
    const hasLastMessageColumn = ticketsResult.some(col => col.name === 'last_user_message_at');
    
    if (!hasLastMessageColumn) {
      console.log('Migrating tickets table to add last_user_message_at column...');
      db.exec('ALTER TABLE tickets ADD COLUMN last_user_message_at TEXT');
      console.log('✅ Added last_user_message_at column to tickets table.');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// Set ticket config
export function setTicketConfig(config: TicketConfig): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO ticket_configs (guild_id, category_id, log_channel_id, support_role_ids, vouch_channel_id, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      category_id = excluded.category_id,
      log_channel_id = excluded.log_channel_id,
      support_role_ids = excluded.support_role_ids,
      vouch_channel_id = excluded.vouch_channel_id,
      enabled = excluded.enabled
  `).run(
    config.guild_id,
    config.category_id,
    config.log_channel_id || null,
    config.support_role_ids || null,
    config.vouch_channel_id || null,
    config.enabled ? 1 : 0
  );
}

// Get ticket config
export function getTicketConfig(guildId: string): TicketConfig | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT guild_id, category_id, log_channel_id, support_role_ids, vouch_channel_id, enabled
    FROM ticket_configs
    WHERE guild_id = ?
  `).get(guildId) as any;
  
  if (!row) return null;
  
  return {
    guild_id: row.guild_id,
    category_id: row.category_id,
    log_channel_id: row.log_channel_id,
    support_role_ids: row.support_role_ids,
    vouch_channel_id: row.vouch_channel_id,
    enabled: row.enabled === 1
  };
}

// Create ticket
export function createTicket(
  guildId: string,
  channelId: string,
  userId: string,
  category: string
): number {
  const db = getDB();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    INSERT INTO tickets (guild_id, channel_id, user_id, category, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, channelId, userId, category, now);
  
  return result.lastInsertRowid as number;
}

// Get ticket by channel ID
export function getTicket(channelId: string): Ticket | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT id, guild_id, channel_id, user_id, claimed_by, status, category, created_at, closed_at, transcript, support_interaction_id, helpers
    FROM tickets
    WHERE channel_id = ?
  `).get(channelId) as any;
  
  if (!row) return null;
  
  return {
    id: row.id,
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    user_id: row.user_id,
    claimed_by: row.claimed_by,
    status: row.status,
    category: row.category,
    created_at: row.created_at,
    closed_at: row.closed_at,
    transcript: row.transcript,
    support_interaction_id: row.support_interaction_id,
    helpers: row.helpers
  };
}

// Get ticket by ID
export function getTicketById(ticketId: number): Ticket | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT id, guild_id, channel_id, user_id, claimed_by, status, category, created_at, closed_at, transcript, support_interaction_id, helpers
    FROM tickets
    WHERE id = ?
  `).get(ticketId) as any;
  
  if (!row) return null;
  
  return {
    id: row.id,
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    user_id: row.user_id,
    claimed_by: row.claimed_by,
    status: row.status,
    category: row.category,
    created_at: row.created_at,
    closed_at: row.closed_at,
    transcript: row.transcript,
    support_interaction_id: row.support_interaction_id,
    helpers: row.helpers
  };
}

// Claim ticket
export function claimTicket(channelId: string, claimerId: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    UPDATE tickets
    SET claimed_by = ?, status = 'claimed'
    WHERE channel_id = ? AND status = 'open'
  `).run(claimerId, channelId);
  
  return result.changes > 0;
}

// Unclaim ticket
export function unclaimTicket(channelId: string, claimerId: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    UPDATE tickets
    SET claimed_by = NULL, status = 'open', support_interaction_id = NULL
    WHERE channel_id = ? AND claimed_by = ? AND status = 'claimed'
  `).run(channelId, claimerId);
  
  return result.changes > 0;
}

// Close ticket
export function closeTicket(channelId: string, transcript?: string): boolean {
  const db = getDB();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    UPDATE tickets
    SET status = 'closed', closed_at = ?, transcript = ?
    WHERE channel_id = ? AND status != 'closed'
  `).run(now, transcript || null, channelId);
  
  return result.changes > 0;
}

// Link ticket to support interaction
export function linkTicketToSupport(channelId: string, supportInteractionId: number): boolean {
  const db = getDB();
  const result = db.prepare(`
    UPDATE tickets
    SET support_interaction_id = ?
    WHERE channel_id = ?
  `).run(supportInteractionId, channelId);
  
  return result.changes > 0;
}

// Add helper to ticket
export function addTicketHelper(channelId: string, userId: string): boolean {
  const db = getDB();
  const ticket = getTicket(channelId);
  if (!ticket) return false;
  
  const helpers: string[] = ticket.helpers ? JSON.parse(ticket.helpers) : [];
  if (helpers.includes(userId)) return false; // Already added
  
  helpers.push(userId);
  
  const result = db.prepare(`
    UPDATE tickets
    SET helpers = ?
    WHERE channel_id = ?
  `).run(JSON.stringify(helpers), channelId);
  
  return result.changes > 0;
}

// Get ticket helpers
export function getTicketHelpers(channelId: string): string[] {
  const ticket = getTicket(channelId);
  if (!ticket || !ticket.helpers) return [];
  
  try {
    return JSON.parse(ticket.helpers);
  } catch {
    return [];
  }
}

// Get open tickets for a guild
export function getOpenTickets(guildId: string): Ticket[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, channel_id, user_id, claimed_by, status, category, created_at, closed_at, transcript, support_interaction_id, helpers, priority, priority_set_at
    FROM tickets
    WHERE guild_id = ? AND status IN ('open', 'claimed')
    ORDER BY priority DESC, priority_set_at ASC, created_at ASC
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    user_id: row.user_id,
    claimed_by: row.claimed_by,
    status: row.status,
    category: row.category,
    created_at: row.created_at,
    closed_at: row.closed_at,
    transcript: row.transcript,
    support_interaction_id: row.support_interaction_id,
    helpers: row.helpers,
    priority: row.priority,
    priority_set_at: row.priority_set_at
  }));
}

// Get user's tickets
export function getUserTickets(guildId: string, userId: string): Ticket[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, channel_id, user_id, claimed_by, status, category, created_at, closed_at, transcript, support_interaction_id, helpers, priority, priority_set_at
    FROM tickets
    WHERE guild_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `).all(guildId, userId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    user_id: row.user_id,
    claimed_by: row.claimed_by,
    status: row.status,
    category: row.category,
    created_at: row.created_at,
    closed_at: row.closed_at,
    transcript: row.transcript,
    support_interaction_id: row.support_interaction_id,
    helpers: row.helpers,
    priority: row.priority,
    priority_set_at: row.priority_set_at
  }));
}

// Get support role IDs as array
export function getSupportRoleIds(guildId: string): string[] {
  const config = getTicketConfig(guildId);
  if (!config || !config.support_role_ids) return [];
  
  try {
    return JSON.parse(config.support_role_ids);
  } catch {
    return [];
  }
}

// Set support role IDs from array
export function setSupportRoleIds(guildId: string, roleIds: string[]): void {
  const config = getTicketConfig(guildId);
  if (!config) return;
  
  config.support_role_ids = JSON.stringify(roleIds);
  setTicketConfig(config);
}

// Add support role ID
export function addSupportRole(guildId: string, roleId: string): boolean {
  const roleIds = getSupportRoleIds(guildId);
  if (roleIds.includes(roleId)) return false; // Already exists
  
  roleIds.push(roleId);
  setSupportRoleIds(guildId, roleIds);
  return true;
}

// Update last user message timestamp
export function updateTicketLastMessage(channelId: string): boolean {
  const db = getDB();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    UPDATE tickets
    SET last_user_message_at = ?
    WHERE channel_id = ? AND status != 'closed'
  `).run(now, channelId);
  
  return result.changes > 0;
}

// Check if user is blacklisted from tickets
export function isTicketBlacklisted(userId: string, guildId: string): boolean {
  const db = getDB();
  const row = db.prepare(`
    SELECT id FROM ticket_blacklist
    WHERE guild_id = ? AND user_id = ? AND is_active = 1
    LIMIT 1
  `).get(guildId, userId);
  
  return !!row;
}

// Blacklist user from tickets
export function blacklistFromTickets(
  userId: string,
  guildId: string,
  reason: string,
  blacklistedBy: string
): number {
  const db = getDB();
  
  // Check if already blacklisted
  if (isTicketBlacklisted(userId, guildId)) {
    throw new Error('User is already blacklisted from tickets.');
  }
  
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO ticket_blacklist (guild_id, user_id, reason, blacklisted_by, blacklisted_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, userId, reason, blacklistedBy, now);
  
  return result.lastInsertRowid as number;
}

// Remove ticket blacklist
export function unblacklistFromTickets(
  userId: string,
  guildId: string,
  removedBy: string
): boolean {
  const db = getDB();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    UPDATE ticket_blacklist
    SET is_active = 0, removed_by = ?, removed_at = ?
    WHERE guild_id = ? AND user_id = ? AND is_active = 1
  `).run(removedBy, now, guildId, userId);
  
  return result.changes > 0;
}

// Get blacklist entry
export function getTicketBlacklist(userId: string, guildId: string): any | null {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM ticket_blacklist
    WHERE guild_id = ? AND user_id = ? AND is_active = 1
    LIMIT 1
  `).get(guildId, userId);
}

// Get all active ticket blacklists for a guild
export function getAllTicketBlacklists(guildId: string): any[] {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM ticket_blacklist
    WHERE guild_id = ? AND is_active = 1
    ORDER BY blacklisted_at DESC
  `).all(guildId) as any[];
}

// Get inactive tickets (no user response in 24 hours)
export function getInactiveTickets(guildId: string, hoursInactive: number = 24): Ticket[] {
  const db = getDB();
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - hoursInactive);
  const cutoffISO = cutoffTime.toISOString();
  
  const rows = db.prepare(`
    SELECT * FROM tickets
    WHERE guild_id = ? 
      AND status != 'closed'
      AND (last_user_message_at IS NULL OR last_user_message_at < ?)
      AND created_at < ?
    ORDER BY created_at ASC
  `).all(guildId, cutoffISO, cutoffISO) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    user_id: row.user_id,
    claimed_by: row.claimed_by,
    status: row.status,
    category: row.category,
    created_at: row.created_at,
    closed_at: row.closed_at,
    transcript: row.transcript,
    support_interaction_id: row.support_interaction_id,
    helpers: row.helpers
  }));
}

// Remove support role ID
export function removeSupportRole(guildId: string, roleId: string): boolean {
  const roleIds = getSupportRoleIds(guildId);
  const index = roleIds.indexOf(roleId);
  if (index === -1) return false; // Not found
  
  roleIds.splice(index, 1);
  setSupportRoleIds(guildId, roleIds);
  return true;
}

// Initialize schema on import
initTicketsSchema();
