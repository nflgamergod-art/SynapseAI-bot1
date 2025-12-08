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
  // Phase 1 additions
  first_response_at?: string; // When staff first responded
  tags?: string; // JSON array of tags
  sla_breach?: number; // 1 if SLA was breached, 0 otherwise
}

export interface TicketConfig {
  guild_id: string;
  category_id: string;
  log_channel_id?: string;
  support_role_ids?: string; // JSON array of role IDs
  vouch_channel_id?: string;
  enabled: boolean;
  // Phase 1: SLA settings
  sla_response_time?: number; // Minutes for first response
  sla_resolution_time?: number; // Minutes for ticket resolution
  sla_priority_response_time?: number; // Minutes for priority tickets
}

export interface TicketNote {
  id: number;
  ticket_id: number;
  user_id: string;
  note: string;
  created_at: string;
}

export interface TicketTag {
  name: string;
  color: string;
  description?: string;
}

export interface TicketAnalytics {
  total_tickets: number;
  open_tickets: number;
  closed_tickets: number;
  avg_response_time: number; // Minutes
  avg_resolution_time: number; // Minutes
  sla_compliance_rate: number; // Percentage
  tickets_by_category: { [category: string]: number };
  tickets_by_tag: { [tag: string]: number };
  top_staff: { user_id: string; ticket_count: number; avg_rating: number }[];
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
      enabled INTEGER NOT NULL DEFAULT 1,
      sla_response_time INTEGER DEFAULT 30,
      sla_resolution_time INTEGER DEFAULT 180,
      sla_priority_response_time INTEGER DEFAULT 5
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
      last_user_message_at TEXT,
      first_response_at TEXT,
      tags TEXT,
      sla_breach INTEGER DEFAULT 0
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
    
    CREATE TABLE IF NOT EXISTS ticket_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket ON ticket_notes(ticket_id);
    
    CREATE TABLE IF NOT EXISTS ticket_tags_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      description TEXT,
      UNIQUE(guild_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_tags_guild ON ticket_tags_config(guild_id);
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
    
    // Check for Phase 1 columns (first_response_at, tags, sla_breach)
    const hasFirstResponseAt = ticketsResult.some(col => col.name === 'first_response_at');
    const hasTags = ticketsResult.some(col => col.name === 'tags');
    const hasSLABreach = ticketsResult.some(col => col.name === 'sla_breach');
    
    if (!hasFirstResponseAt) {
      console.log('Adding first_response_at column to tickets table...');
      db.exec('ALTER TABLE tickets ADD COLUMN first_response_at TEXT');
      console.log('✅ Added first_response_at column.');
    }
    
    if (!hasTags) {
      console.log('Adding tags column to tickets table...');
      db.exec('ALTER TABLE tickets ADD COLUMN tags TEXT');
      console.log('✅ Added tags column.');
    }
    
    if (!hasSLABreach) {
      console.log('Adding sla_breach column to tickets table...');
      db.exec('ALTER TABLE tickets ADD COLUMN sla_breach INTEGER DEFAULT 0');
      console.log('✅ Added sla_breach column.');
    }
    
    // Check for Phase 1 SLA columns in ticket_configs
    const configColumns = db.prepare("PRAGMA table_info(ticket_configs)").all() as any[];
    const hasSLAResponseTime = configColumns.some(col => col.name === 'sla_response_time');
    const hasSLAResolutionTime = configColumns.some(col => col.name === 'sla_resolution_time');
    const hasSLAPriorityTime = configColumns.some(col => col.name === 'sla_priority_response_time');
    
    if (!hasSLAResponseTime) {
      console.log('Adding SLA columns to ticket_configs...');
      db.exec('ALTER TABLE ticket_configs ADD COLUMN sla_response_time INTEGER DEFAULT 30');
      console.log('✅ Added sla_response_time column.');
    }
    
    if (!hasSLAResolutionTime) {
      db.exec('ALTER TABLE ticket_configs ADD COLUMN sla_resolution_time INTEGER DEFAULT 180');
      console.log('✅ Added sla_resolution_time column.');
    }
    
    if (!hasSLAPriorityTime) {
      db.exec('ALTER TABLE ticket_configs ADD COLUMN sla_priority_response_time INTEGER DEFAULT 5');
      console.log('✅ Added sla_priority_response_time column.');
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
    SELECT id, guild_id, channel_id, user_id, claimed_by, status, category, created_at, closed_at, transcript, support_interaction_id, helpers, first_response_at, tags, sla_breach
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
    helpers: row.helpers,
    first_response_at: row.first_response_at,
    tags: row.tags,
    sla_breach: row.sla_breach
  };
}

// Get ticket by ID
export function getTicketById(ticketId: number): Ticket | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT id, guild_id, channel_id, user_id, claimed_by, status, category, created_at, closed_at, transcript, support_interaction_id, helpers, first_response_at, tags, sla_breach
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
    helpers: row.helpers,
    first_response_at: row.first_response_at,
    tags: row.tags,
    sla_breach: row.sla_breach
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

// Get all tickets for guild
export function getGuildTickets(guildId: string): Ticket[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, channel_id, user_id, claimed_by, status, category, created_at, closed_at, transcript, support_interaction_id, helpers, priority, priority_set_at, first_response_at, tags, sla_breach
    FROM tickets
    WHERE guild_id = ?
    ORDER BY created_at DESC
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
    priority_set_at: row.priority_set_at,
    first_response_at: row.first_response_at,
    tags: row.tags,
    sla_breach: row.sla_breach
  }));
}

// Get user's tickets
export function getUserTickets(guildId: string, userId: string): Ticket[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, channel_id, user_id, claimed_by, status, category, created_at, closed_at, transcript, support_interaction_id, helpers, priority, priority_set_at, first_response_at, tags, sla_breach
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
    priority_set_at: row.priority_set_at,
    first_response_at: row.first_response_at,
    tags: row.tags,
    sla_breach: row.sla_breach
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

// ============================================
// PHASE 1: ADVANCED TICKET FEATURES
// ============================================

// -------------------- SLA FUNCTIONS --------------------

// Set SLA times for guild
export function setSLATimes(guildId: string, responseTime: number, resolutionTime: number, priorityResponseTime: number): boolean {
  const db = getDB();
  const result = db.prepare(`
    UPDATE ticket_configs
    SET sla_response_time = ?, sla_resolution_time = ?, sla_priority_response_time = ?
    WHERE guild_id = ?
  `).run(responseTime, resolutionTime, priorityResponseTime, guildId);
  
  return result.changes > 0;
}

// Get SLA times
export function getSLATimes(guildId: string): { response: number; resolution: number; priorityResponse: number } {
  const db = getDB();
  const config = db.prepare(`
    SELECT sla_response_time, sla_resolution_time, sla_priority_response_time
    FROM ticket_configs
    WHERE guild_id = ?
  `).get(guildId) as any;
  
  if (!config) return { response: 30, resolution: 180, priorityResponse: 5 };
  
  return {
    response: config.sla_response_time || 30,
    resolution: config.sla_resolution_time || 180,
    priorityResponse: config.sla_priority_response_time || 5
  };
}

// Check if ticket breached SLA
export function checkSLABreach(ticket: Ticket, guildId: string): { breached: boolean; type: 'response' | 'resolution' | null; minutesOver: number } {
  const sla = getSLATimes(guildId);
  const now = new Date();
  const createdAt = new Date(ticket.created_at);
  
  // Check response time SLA
  if (!ticket.first_response_at && ticket.status !== 'closed') {
    const minutesSinceCreated = (now.getTime() - createdAt.getTime()) / 60000;
    const slaTime = ticket.priority ? sla.priorityResponse : sla.response;
    
    if (minutesSinceCreated > slaTime) {
      return { breached: true, type: 'response', minutesOver: Math.floor(minutesSinceCreated - slaTime) };
    }
  }
  
  // Check resolution time SLA
  if (ticket.status !== 'closed') {
    const minutesSinceCreated = (now.getTime() - createdAt.getTime()) / 60000;
    
    if (minutesSinceCreated > sla.resolution) {
      return { breached: true, type: 'resolution', minutesOver: Math.floor(minutesSinceCreated - sla.resolution) };
    }
  }
  
  return { breached: false, type: null, minutesOver: 0 };
}

// Mark ticket SLA as breached
export function markSLABreached(ticketId: number): boolean {
  const db = getDB();
  const result = db.prepare(`
    UPDATE tickets
    SET sla_breach = 1
    WHERE id = ?
  `).run(ticketId);
  
  return result.changes > 0;
}

// Record first response time
export function recordFirstResponse(channelId: string): boolean {
  const db = getDB();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    UPDATE tickets
    SET first_response_at = ?
    WHERE channel_id = ? AND first_response_at IS NULL
  `).run(now, channelId);
  
  return result.changes > 0;
}

// Get tickets breaching SLA
export function getTicketsBreachingSLA(guildId: string): Ticket[] {
  const tickets = getGuildTickets(guildId).filter(t => t.status !== 'closed');
  const breaching: Ticket[] = [];
  
  for (const ticket of tickets) {
    const breach = checkSLABreach(ticket, guildId);
    if (breach.breached) {
      breaching.push(ticket);
    }
  }
  
  return breaching;
}

// -------------------- TAG FUNCTIONS --------------------

// Create or update tag
export function createTicketTag(guildId: string, name: string, color: string, description?: string): boolean {
  const db = getDB();
  
  try {
    db.prepare(`
      INSERT INTO ticket_tags_config (guild_id, name, color, description)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id, name) DO UPDATE SET
        color = excluded.color,
        description = excluded.description
    `).run(guildId, name, color, description || null);
    return true;
  } catch (e) {
    console.error('Failed to create ticket tag:', e);
    return false;
  }
}

// Delete tag
export function deleteTicketTag(guildId: string, name: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    DELETE FROM ticket_tags_config
    WHERE guild_id = ? AND name = ?
  `).run(guildId, name);
  
  return result.changes > 0;
}

// Get all tags for guild
export function getTicketTags(guildId: string): TicketTag[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT name, color, description
    FROM ticket_tags_config
    WHERE guild_id = ?
    ORDER BY name ASC
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    name: row.name,
    color: row.color,
    description: row.description
  }));
}

// Add tag to ticket
export function addTagToTicket(ticketId: number, tag: string): boolean {
  const db = getDB();
  const ticket = getTicketById(ticketId);
  if (!ticket) return false;
  
  const tags: string[] = ticket.tags ? JSON.parse(ticket.tags) : [];
  if (tags.includes(tag)) return false; // Already has tag
  
  tags.push(tag);
  
  const result = db.prepare(`
    UPDATE tickets
    SET tags = ?
    WHERE id = ?
  `).run(JSON.stringify(tags), ticketId);
  
  return result.changes > 0;
}

// Remove tag from ticket
export function removeTagFromTicket(ticketId: number, tag: string): boolean {
  const db = getDB();
  const ticket = getTicketById(ticketId);
  if (!ticket) return false;
  
  const tags: string[] = ticket.tags ? JSON.parse(ticket.tags) : [];
  const index = tags.indexOf(tag);
  if (index === -1) return false; // Tag not found
  
  tags.splice(index, 1);
  
  const result = db.prepare(`
    UPDATE tickets
    SET tags = ?
    WHERE id = ?
  `).run(JSON.stringify(tags), ticketId);
  
  return result.changes > 0;
}

// Get tickets by tag
export function getTicketsByTag(guildId: string, tag: string): Ticket[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM tickets
    WHERE guild_id = ? AND tags LIKE ?
  `).all(guildId, `%"${tag}"%`) as any[];
  
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
    first_response_at: row.first_response_at,
    tags: row.tags,
    sla_breach: row.sla_breach
  }));
}

// -------------------- NOTES FUNCTIONS --------------------

// Add private note to ticket
export function addTicketNote(ticketId: number, userId: string, note: string): number {
  const db = getDB();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    INSERT INTO ticket_notes (ticket_id, user_id, note, created_at)
    VALUES (?, ?, ?, ?)
  `).run(ticketId, userId, note, now);
  
  return result.lastInsertRowid as number;
}

// Get all notes for ticket
export function getTicketNotes(ticketId: number): TicketNote[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, ticket_id, user_id, note, created_at
    FROM ticket_notes
    WHERE ticket_id = ?
    ORDER BY created_at ASC
  `).all(ticketId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    ticket_id: row.ticket_id,
    user_id: row.user_id,
    note: row.note,
    created_at: row.created_at
  }));
}

// Delete note
export function deleteTicketNote(noteId: number): boolean {
  const db = getDB();
  const result = db.prepare(`
    DELETE FROM ticket_notes
    WHERE id = ?
  `).run(noteId);
  
  return result.changes > 0;
}

// -------------------- ANALYTICS FUNCTIONS --------------------

// Get comprehensive ticket analytics
export function getTicketAnalytics(guildId: string, days: number = 30): TicketAnalytics {
  const db = getDB();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffISO = cutoffDate.toISOString();
  
  // Total and status counts
  const totalTickets = db.prepare(`
    SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND created_at >= ?
  `).get(guildId, cutoffISO) as any;
  
  const openTickets = db.prepare(`
    SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND status != 'closed'
  `).get(guildId) as any;
  
  const closedTickets = db.prepare(`
    SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND status = 'closed' AND created_at >= ?
  `).get(guildId, cutoffISO) as any;
  
  // Average response time (minutes)
  const avgResponseTime = db.prepare(`
    SELECT AVG((julianday(first_response_at) - julianday(created_at)) * 24 * 60) as avg
    FROM tickets
    WHERE guild_id = ? AND first_response_at IS NOT NULL AND created_at >= ?
  `).get(guildId, cutoffISO) as any;
  
  // Average resolution time (minutes)
  const avgResolutionTime = db.prepare(`
    SELECT AVG((julianday(closed_at) - julianday(created_at)) * 24 * 60) as avg
    FROM tickets
    WHERE guild_id = ? AND closed_at IS NOT NULL AND created_at >= ?
  `).get(guildId, cutoffISO) as any;
  
  // SLA compliance rate
  const slaBreached = db.prepare(`
    SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND sla_breach = 1 AND created_at >= ?
  `).get(guildId, cutoffISO) as any;
  
  const slaCompliance = totalTickets.count > 0 
    ? ((totalTickets.count - slaBreached.count) / totalTickets.count) * 100 
    : 100;
  
  // Tickets by category
  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM tickets
    WHERE guild_id = ? AND created_at >= ?
    GROUP BY category
  `).all(guildId, cutoffISO) as any[];
  
  const ticketsByCategory: { [key: string]: number } = {};
  byCategory.forEach(row => {
    ticketsByCategory[row.category] = row.count;
  });
  
  // Tickets by tag
  const allTickets = db.prepare(`
    SELECT tags FROM tickets WHERE guild_id = ? AND tags IS NOT NULL AND created_at >= ?
  `).all(guildId, cutoffISO) as any[];
  
  const ticketsByTag: { [key: string]: number } = {};
  allTickets.forEach(row => {
    if (row.tags) {
      const tags = JSON.parse(row.tags) as string[];
      tags.forEach(tag => {
        ticketsByTag[tag] = (ticketsByTag[tag] || 0) + 1;
      });
    }
  });
  
  // Top staff by tickets handled
  const topStaffRaw = db.prepare(`
    SELECT claimed_by as user_id, COUNT(*) as ticket_count
    FROM tickets
    WHERE guild_id = ? AND claimed_by IS NOT NULL AND created_at >= ?
    GROUP BY claimed_by
    ORDER BY ticket_count DESC
    LIMIT 10
  `).all(guildId, cutoffISO) as any[];
  
  // Get ratings for top staff (requires support_interactions table)
  const topStaff = topStaffRaw.map(staff => {
    const avgRating = db.prepare(`
      SELECT AVG(rating) as avg
      FROM support_interactions
      WHERE staff_user_id = ? AND created_at >= ?
    `).get(staff.user_id, cutoffISO) as any;
    
    return {
      user_id: staff.user_id,
      ticket_count: staff.ticket_count,
      avg_rating: avgRating?.avg || 0
    };
  });
  
  return {
    total_tickets: totalTickets.count,
    open_tickets: openTickets.count,
    closed_tickets: closedTickets.count,
    avg_response_time: Math.round(avgResponseTime?.avg || 0),
    avg_resolution_time: Math.round(avgResolutionTime?.avg || 0),
    sla_compliance_rate: Math.round(slaCompliance * 10) / 10,
    tickets_by_category: ticketsByCategory,
    tickets_by_tag: ticketsByTag,
    top_staff: topStaff
  };
}

// Get ticket wait time in minutes
export function getTicketWaitTime(ticket: Ticket): number {
  const now = new Date();
  const createdAt = new Date(ticket.created_at);
  return Math.floor((now.getTime() - createdAt.getTime()) / 60000);
}

// Get estimated resolution time based on category averages
export function getEstimatedResolutionTime(guildId: string, category: string): number {
  const db = getDB();
  const result = db.prepare(`
    SELECT AVG((julianday(closed_at) - julianday(created_at)) * 24 * 60) as avg
    FROM tickets
    WHERE guild_id = ? AND category = ? AND closed_at IS NOT NULL
    LIMIT 100
  `).get(guildId, category) as any;
  
  return Math.round(result?.avg || 60); // Default 60 minutes if no data
}

// Initialize schema on import
initTicketsSchema();
