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
      helpers TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(guild_id, status);
  `);
  
  // Migrate existing database if needed
  migrateTicketsSchema();
}

// Migrate existing database to new schema
function migrateTicketsSchema() {
  const db = getDB();
  
  try {
    // Check if old column exists and new column doesn't
    const result = db.prepare("PRAGMA table_info(ticket_configs)").all() as any[];
    const hasOldColumn = result.some(col => col.name === 'support_role_id');
    const hasNewColumn = result.some(col => col.name === 'support_role_ids');
    
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
    SELECT id, guild_id, channel_id, user_id, claimed_by, status, category, created_at, closed_at, transcript, support_interaction_id, helpers
    FROM tickets
    WHERE guild_id = ? AND status IN ('open', 'claimed')
    ORDER BY created_at ASC
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
    helpers: row.helpers
  }));
}

// Get user's tickets
export function getUserTickets(guildId: string, userId: string): Ticket[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, channel_id, user_id, claimed_by, status, category, created_at, closed_at, transcript, support_interaction_id, helpers
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
    helpers: row.helpers
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
