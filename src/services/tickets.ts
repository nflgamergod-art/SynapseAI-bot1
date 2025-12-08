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

export interface TicketFeedback {
  id: number;
  ticket_id: number;
  guild_id: string;
  user_id: string;
  staff_id?: string;
  rating: number; // 1-5
  feedback_text?: string;
  helpful_tags?: string; // JSON array
  improvement_tags?: string; // JSON array
  created_at: string;
  reward_given: number;
}

export interface TicketAutoResponse {
  id: number;
  guild_id: string;
  trigger_keywords: string; // JSON array
  response_message: string;
  category?: string;
  enabled: number;
  use_count: number;
  created_at: string;
}

export interface TicketAISuggestion {
  id: number;
  ticket_id: number;
  suggestion_text: string;
  confidence: number;
  helpful: number;
  not_helpful: number;
  created_at: string;
}

export interface StaffExpertise {
  guild_id: string;
  user_id: string;
  expertise_tags: string; // JSON array
  specialization?: string;
  auto_assign: number;
}

export interface TicketRoutingConfig {
  guild_id: string;
  routing_mode: 'round-robin' | 'load-balance' | 'expertise' | 'shift-based' | 'manual';
  auto_assign_enabled: number;
  require_on_duty: number;
  max_tickets_per_staff: number;
  last_assigned_staff_id?: string;
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
    
    CREATE TABLE IF NOT EXISTS ticket_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT,
      description TEXT,
      color TEXT DEFAULT '#5865F2',
      custom_fields TEXT,
      auto_tags TEXT,
      priority INTEGER DEFAULT 0,
      UNIQUE(guild_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_categories_guild ON ticket_categories(guild_id);
    
    CREATE TABLE IF NOT EXISTS ticket_custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      field_value TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_custom_fields_ticket ON ticket_custom_fields(ticket_id);
    
    CREATE TABLE IF NOT EXISTS ticket_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      staff_id TEXT,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      feedback_text TEXT,
      helpful_tags TEXT,
      improvement_tags TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reward_given INTEGER DEFAULT 0,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_feedback_ticket ON ticket_feedback(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_feedback_staff ON ticket_feedback(staff_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_feedback_guild ON ticket_feedback(guild_id);
    
    CREATE TABLE IF NOT EXISTS ticket_auto_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      trigger_keywords TEXT NOT NULL,
      response_message TEXT NOT NULL,
      category TEXT,
      enabled INTEGER DEFAULT 1,
      use_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_auto_responses_guild ON ticket_auto_responses(guild_id);
    
    CREATE TABLE IF NOT EXISTS ticket_ai_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      suggestion_text TEXT NOT NULL,
      confidence REAL NOT NULL,
      helpful INTEGER DEFAULT 0,
      not_helpful INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_ai_suggestions_ticket ON ticket_ai_suggestions(ticket_id);
    
    CREATE TABLE IF NOT EXISTS staff_expertise (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      expertise_tags TEXT NOT NULL,
      specialization TEXT,
      auto_assign INTEGER DEFAULT 1,
      UNIQUE(guild_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_staff_expertise_guild ON staff_expertise(guild_id);
    
    CREATE TABLE IF NOT EXISTS ticket_routing_config (
      guild_id TEXT PRIMARY KEY,
      routing_mode TEXT DEFAULT 'round-robin' CHECK(routing_mode IN ('round-robin', 'load-balance', 'expertise', 'shift-based', 'manual')),
      auto_assign_enabled INTEGER DEFAULT 1,
      require_on_duty INTEGER DEFAULT 1,
      max_tickets_per_staff INTEGER DEFAULT 5,
      last_assigned_staff_id TEXT
    );
    
    CREATE TABLE IF NOT EXISTS ticket_assignment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      staff_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      assigned_by TEXT,
      assignment_reason TEXT,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_assignment_history_ticket ON ticket_assignment_history(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_assignment_history_staff ON ticket_assignment_history(staff_id);
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
      SELECT AVG(satisfaction_rating) as avg
      FROM support_interactions
      WHERE support_member_id = ? AND started_at >= ?
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

// -------------------- TICKET CATEGORIES --------------------

export interface TicketCategory {
  id?: number;
  guild_id: string;
  name: string;
  emoji?: string;
  description?: string;
  color?: string;
  custom_fields?: CustomFieldDefinition[];
  auto_tags?: string[];
  priority?: number;
}

export interface CustomFieldDefinition {
  name: string;
  type: 'text' | 'number' | 'select' | 'multiline';
  label: string;
  required: boolean;
  options?: string[]; // For select type
  placeholder?: string;
}

export interface TicketCustomField {
  id?: number;
  ticket_id: number;
  field_name: string;
  field_value: string;
}

// Create ticket category
export function createTicketCategory(category: TicketCategory): boolean {
  const db = getDB();
  try {
    db.prepare(`
      INSERT INTO ticket_categories (guild_id, name, emoji, description, color, custom_fields, auto_tags, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      category.guild_id,
      category.name,
      category.emoji || null,
      category.description || null,
      category.color || '#5865F2',
      category.custom_fields ? JSON.stringify(category.custom_fields) : null,
      category.auto_tags ? JSON.stringify(category.auto_tags) : null,
      category.priority || 0
    );
    return true;
  } catch (e) {
    console.error('Failed to create ticket category:', e);
    return false;
  }
}

// Update ticket category
export function updateTicketCategory(guildId: string, name: string, updates: Partial<TicketCategory>): boolean {
  const db = getDB();
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.emoji !== undefined) {
    fields.push('emoji = ?');
    values.push(updates.emoji);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.color !== undefined) {
    fields.push('color = ?');
    values.push(updates.color);
  }
  if (updates.custom_fields !== undefined) {
    fields.push('custom_fields = ?');
    values.push(JSON.stringify(updates.custom_fields));
  }
  if (updates.auto_tags !== undefined) {
    fields.push('auto_tags = ?');
    values.push(JSON.stringify(updates.auto_tags));
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  
  if (fields.length === 0) return false;
  
  values.push(guildId, name);
  
  const result = db.prepare(`
    UPDATE ticket_categories
    SET ${fields.join(', ')}
    WHERE guild_id = ? AND name = ?
  `).run(...values);
  
  return result.changes > 0;
}

// Delete ticket category
export function deleteTicketCategory(guildId: string, name: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    DELETE FROM ticket_categories
    WHERE guild_id = ? AND name = ?
  `).run(guildId, name);
  
  return result.changes > 0;
}

// Get ticket categories
export function getTicketCategories(guildId: string): TicketCategory[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM ticket_categories
    WHERE guild_id = ?
    ORDER BY priority DESC, name ASC
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    color: row.color,
    custom_fields: row.custom_fields ? JSON.parse(row.custom_fields) : [],
    auto_tags: row.auto_tags ? JSON.parse(row.auto_tags) : [],
    priority: row.priority
  }));
}

// Get single ticket category
export function getTicketCategory(guildId: string, name: string): TicketCategory | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT * FROM ticket_categories
    WHERE guild_id = ? AND name = ?
  `).get(guildId, name) as any;
  
  if (!row) return null;
  
  return {
    id: row.id,
    guild_id: row.guild_id,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    color: row.color,
    custom_fields: row.custom_fields ? JSON.parse(row.custom_fields) : [],
    auto_tags: row.auto_tags ? JSON.parse(row.auto_tags) : [],
    priority: row.priority
  };
}

// Set custom field values for a ticket
export function setTicketCustomField(ticketId: number, fieldName: string, fieldValue: string): boolean {
  const db = getDB();
  try {
    // Check if field exists, update or insert
    const existing = db.prepare(`
      SELECT id FROM ticket_custom_fields
      WHERE ticket_id = ? AND field_name = ?
    `).get(ticketId, fieldName) as any;
    
    if (existing) {
      db.prepare(`
        UPDATE ticket_custom_fields
        SET field_value = ?
        WHERE id = ?
      `).run(fieldValue, existing.id);
    } else {
      db.prepare(`
        INSERT INTO ticket_custom_fields (ticket_id, field_name, field_value)
        VALUES (?, ?, ?)
      `).run(ticketId, fieldName, fieldValue);
    }
    return true;
  } catch (e) {
    console.error('Failed to set custom field:', e);
    return false;
  }
}

// Get custom fields for a ticket
export function getTicketCustomFields(ticketId: number): { [key: string]: string } {
  const db = getDB();
  const rows = db.prepare(`
    SELECT field_name, field_value
    FROM ticket_custom_fields
    WHERE ticket_id = ?
  `).all(ticketId) as any[];
  
  const fields: { [key: string]: string } = {};
  rows.forEach(row => {
    fields[row.field_name] = row.field_value;
  });
  
  return fields;
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

// ==================== FEEDBACK SYSTEM ====================

// Submit feedback for a ticket
export function submitTicketFeedback(
  ticketId: number,
  guildId: string,
  userId: string,
  staffId: string | undefined,
  rating: number,
  feedbackText?: string,
  helpfulTags?: string[],
  improvementTags?: string[]
): number {
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO ticket_feedback (
      ticket_id, guild_id, user_id, staff_id, rating, feedback_text, 
      helpful_tags, improvement_tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ticketId, guildId, userId, staffId || null, rating, feedbackText || null,
    helpfulTags ? JSON.stringify(helpfulTags) : null,
    improvementTags ? JSON.stringify(improvementTags) : null
  );
  
  return result.lastInsertRowid as number;
}

// Get feedback for a ticket
export function getTicketFeedback(ticketId: number): TicketFeedback | null {
  const db = getDB();
  return db.prepare('SELECT * FROM ticket_feedback WHERE ticket_id = ?').get(ticketId) as TicketFeedback | null;
}

// Get staff performance metrics
export function getStaffPerformanceMetrics(guildId: string, staffId: string): {
  total_tickets: number;
  avg_rating: number;
  rating_count: number;
  rating_breakdown: { [rating: number]: number };
  avg_response_time: number;
  avg_resolution_time: number;
  positive_feedback_count: number;
} {
  const db = getDB();
  
  const feedbackStats = db.prepare(`
    SELECT 
      COUNT(*) as rating_count,
      AVG(rating) as avg_rating,
      SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive_count
    FROM ticket_feedback
    WHERE guild_id = ? AND staff_id = ?
  `).get(guildId, staffId) as any;
  
  const ratingBreakdown = db.prepare(`
    SELECT rating, COUNT(*) as count
    FROM ticket_feedback
    WHERE guild_id = ? AND staff_id = ?
    GROUP BY rating
  `).all(guildId, staffId) as any[];
  
  const breakdown: { [rating: number]: number } = {};
  ratingBreakdown.forEach(row => breakdown[row.rating] = row.count);
  
  const ticketStats = db.prepare(`
    SELECT 
      COUNT(*) as total_tickets,
      AVG((julianday(first_response_at) - julianday(created_at)) * 24 * 60) as avg_response_time,
      AVG((julianday(closed_at) - julianday(created_at)) * 24 * 60) as avg_resolution_time
    FROM tickets
    WHERE guild_id = ? AND claimed_by = ? AND closed_at IS NOT NULL
  `).get(guildId, staffId) as any;
  
  return {
    total_tickets: ticketStats?.total_tickets || 0,
    avg_rating: feedbackStats?.avg_rating || 0,
    rating_count: feedbackStats?.rating_count || 0,
    rating_breakdown: breakdown,
    avg_response_time: Math.round(ticketStats?.avg_response_time || 0),
    avg_resolution_time: Math.round(ticketStats?.avg_resolution_time || 0),
    positive_feedback_count: feedbackStats?.positive_count || 0
  };
}

// Mark reward as given for feedback
export function markFeedbackRewardGiven(feedbackId: number): void {
  const db = getDB();
  db.prepare('UPDATE ticket_feedback SET reward_given = 1 WHERE id = ?').run(feedbackId);
}

// ==================== AUTO-RESPONSES ====================

// Create auto-response
export function createAutoResponse(
  guildId: string,
  triggerKeywords: string[],
  responseMessage: string,
  category?: string
): number {
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO ticket_auto_responses (guild_id, trigger_keywords, response_message, category)
    VALUES (?, ?, ?, ?)
  `).run(guildId, JSON.stringify(triggerKeywords), responseMessage, category || null);
  
  return result.lastInsertRowid as number;
}

// Get all auto-responses for guild
export function getAutoResponses(guildId: string): TicketAutoResponse[] {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM ticket_auto_responses 
    WHERE guild_id = ? AND enabled = 1
    ORDER BY use_count DESC
  `).all(guildId) as TicketAutoResponse[];
}

// Find matching auto-response
export function findMatchingAutoResponse(guildId: string, message: string, category?: string): TicketAutoResponse | null {
  const responses = getAutoResponses(guildId);
  const messageLower = message.toLowerCase();
  
  for (const response of responses) {
    if (category && response.category && response.category !== category) continue;
    
    const keywords = JSON.parse(response.trigger_keywords) as string[];
    const matches = keywords.some(keyword => messageLower.includes(keyword.toLowerCase()));
    
    if (matches) {
      // Increment use count
      const db = getDB();
      db.prepare('UPDATE ticket_auto_responses SET use_count = use_count + 1 WHERE id = ?').run(response.id);
      return response;
    }
  }
  
  return null;
}

// Delete auto-response
export function deleteAutoResponse(guildId: string, id: number): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM ticket_auto_responses WHERE guild_id = ? AND id = ?').run(guildId, id);
  return result.changes > 0;
}

// Toggle auto-response
export function toggleAutoResponse(guildId: string, id: number, enabled: boolean): boolean {
  const db = getDB();
  const result = db.prepare('UPDATE ticket_auto_responses SET enabled = ? WHERE guild_id = ? AND id = ?')
    .run(enabled ? 1 : 0, guildId, id);
  return result.changes > 0;
}

// ==================== AI SUGGESTIONS ====================

// Create AI suggestion
export function createAISuggestion(ticketId: number, suggestionText: string, confidence: number): number {
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO ticket_ai_suggestions (ticket_id, suggestion_text, confidence)
    VALUES (?, ?, ?)
  `).run(ticketId, suggestionText, confidence);
  
  return result.lastInsertRowid as number;
}

// Get AI suggestions for ticket
export function getAISuggestions(ticketId: number): TicketAISuggestion[] {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM ticket_ai_suggestions 
    WHERE ticket_id = ? 
    ORDER BY confidence DESC
  `).all(ticketId) as TicketAISuggestion[];
}

// Rate AI suggestion
export function rateAISuggestion(suggestionId: number, helpful: boolean): void {
  const db = getDB();
  const field = helpful ? 'helpful' : 'not_helpful';
  db.prepare(`UPDATE ticket_ai_suggestions SET ${field} = ${field} + 1 WHERE id = ?`).run(suggestionId);
}

// ==================== STAFF EXPERTISE ====================

// Set staff expertise
export function setStaffExpertise(
  guildId: string,
  userId: string,
  expertiseTags: string[],
  specialization?: string,
  autoAssign: boolean = true
): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO staff_expertise (guild_id, user_id, expertise_tags, specialization, auto_assign)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      expertise_tags = excluded.expertise_tags,
      specialization = excluded.specialization,
      auto_assign = excluded.auto_assign
  `).run(guildId, userId, JSON.stringify(expertiseTags), specialization || null, autoAssign ? 1 : 0);
}

// Get staff expertise
export function getStaffExpertise(guildId: string, userId: string): StaffExpertise | null {
  const db = getDB();
  return db.prepare('SELECT * FROM staff_expertise WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as StaffExpertise | null;
}

// Get all staff with expertise
export function getAllStaffExpertise(guildId: string): StaffExpertise[] {
  const db = getDB();
  return db.prepare('SELECT * FROM staff_expertise WHERE guild_id = ? AND auto_assign = 1')
    .all(guildId) as StaffExpertise[];
}

// ==================== TICKET ROUTING ====================

// Get or create routing config
export function getRoutingConfig(guildId: string): TicketRoutingConfig {
  const db = getDB();
  let config = db.prepare('SELECT * FROM ticket_routing_config WHERE guild_id = ?')
    .get(guildId) as TicketRoutingConfig | null;
  
  if (!config) {
    db.prepare(`
      INSERT INTO ticket_routing_config (guild_id)
      VALUES (?)
    `).run(guildId);
    config = db.prepare('SELECT * FROM ticket_routing_config WHERE guild_id = ?')
      .get(guildId) as TicketRoutingConfig;
  }
  
  return config;
}

// Update routing config
export function updateRoutingConfig(
  guildId: string,
  updates: Partial<Omit<TicketRoutingConfig, 'guild_id'>>
): void {
  const db = getDB();
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.routing_mode !== undefined) {
    fields.push('routing_mode = ?');
    values.push(updates.routing_mode);
  }
  if (updates.auto_assign_enabled !== undefined) {
    fields.push('auto_assign_enabled = ?');
    values.push(updates.auto_assign_enabled);
  }
  if (updates.require_on_duty !== undefined) {
    fields.push('require_on_duty = ?');
    values.push(updates.require_on_duty);
  }
  if (updates.max_tickets_per_staff !== undefined) {
    fields.push('max_tickets_per_staff = ?');
    values.push(updates.max_tickets_per_staff);
  }
  if (updates.last_assigned_staff_id !== undefined) {
    fields.push('last_assigned_staff_id = ?');
    values.push(updates.last_assigned_staff_id);
  }
  
  if (fields.length === 0) return;
  
  values.push(guildId);
  db.prepare(`UPDATE ticket_routing_config SET ${fields.join(', ')} WHERE guild_id = ?`).run(...values);
}

// Get staff workload (open tickets count)
export function getStaffWorkload(guildId: string, staffId: string): number {
  const db = getDB();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM tickets
    WHERE guild_id = ? AND claimed_by = ? AND status != 'closed'
  `).get(guildId, staffId) as any;
  
  return result?.count || 0;
}

// Get all staff workloads
export function getAllStaffWorkloads(guildId: string): { staff_id: string; workload: number }[] {
  const db = getDB();
  return db.prepare(`
    SELECT claimed_by as staff_id, COUNT(*) as workload
    FROM tickets
    WHERE guild_id = ? AND status != 'closed' AND claimed_by IS NOT NULL
    GROUP BY claimed_by
  `).all(guildId) as any[];
}

// Auto-assign ticket based on routing config
export async function autoAssignTicket(
  guildId: string,
  ticketId: number,
  category: string,
  tags: string[]
): Promise<string | null> {
  const config = getRoutingConfig(guildId);
  
  if (!config.auto_assign_enabled) return null;
  
  const db = getDB();
  let selectedStaffId: string | null = null;
  
  // Get available staff
  const { getPayrollConfig } = await import('./payroll');
  const { getActiveStaff } = await import('./shifts');
  const payrollConfig = getPayrollConfig(guildId);
  
  if (!payrollConfig) return null;
  
  // Get all staff with expertise (if using expertise routing)
  const staffExpertise = getAllStaffExpertise(guildId);
  
  // Filter staff based on requirements
  let availableStaff: string[] = [];
  
  if (config.require_on_duty) {
    const clockedIn = getActiveStaff(guildId);
    availableStaff = clockedIn.map((s: any) => s.user_id);
  } else {
    // Get all support staff from ticket config
    const ticketConfig = getTicketConfig(guildId);
    if (ticketConfig?.support_role_ids) {
      availableStaff = JSON.parse(ticketConfig.support_role_ids);
    }
  }
  
  // Filter by max workload
  availableStaff = availableStaff.filter(staffId => {
    const workload = getStaffWorkload(guildId, staffId);
    return workload < config.max_tickets_per_staff;
  });
  
  if (availableStaff.length === 0) return null;
  
  // Apply routing logic
  switch (config.routing_mode) {
    case 'load-balance':
      // Assign to staff with least tickets
      const workloads = availableStaff.map(staffId => ({
        staffId,
        workload: getStaffWorkload(guildId, staffId)
      }));
      workloads.sort((a, b) => a.workload - b.workload);
      selectedStaffId = workloads[0].staffId;
      break;
      
    case 'expertise':
      // Match ticket tags with staff expertise
      const matchingStaff = staffExpertise.filter(expert => {
        const expertTags = JSON.parse(expert.expertise_tags) as string[];
        return tags.some(tag => expertTags.includes(tag));
      });
      
      if (matchingStaff.length > 0) {
        // Among matching staff, pick least busy
        const expertWorkloads = matchingStaff.map(expert => ({
          staffId: expert.user_id,
          workload: getStaffWorkload(guildId, expert.user_id)
        }));
        expertWorkloads.sort((a, b) => a.workload - b.workload);
        selectedStaffId = expertWorkloads[0].staffId;
      } else {
        // Fallback to load balance
        const fallbackWorkloads = availableStaff.map(staffId => ({
          staffId,
          workload: getStaffWorkload(guildId, staffId)
        }));
        fallbackWorkloads.sort((a, b) => a.workload - b.workload);
        selectedStaffId = fallbackWorkloads[0].staffId;
      }
      break;
      
    case 'round-robin':
      // Rotate through staff
      const lastAssigned = config.last_assigned_staff_id;
      if (lastAssigned && availableStaff.includes(lastAssigned)) {
        const currentIndex = availableStaff.indexOf(lastAssigned);
        const nextIndex = (currentIndex + 1) % availableStaff.length;
        selectedStaffId = availableStaff[nextIndex];
      } else {
        selectedStaffId = availableStaff[0];
      }
      updateRoutingConfig(guildId, { last_assigned_staff_id: selectedStaffId });
      break;
      
    case 'shift-based':
      // Only assign to on-duty staff (same as require_on_duty filter)
      const shiftWorkloads = availableStaff.map(staffId => ({
        staffId,
        workload: getStaffWorkload(guildId, staffId)
      }));
      shiftWorkloads.sort((a, b) => a.workload - b.workload);
      selectedStaffId = shiftWorkloads[0]?.staffId || null;
      break;
      
    default:
      return null;
  }
  
  if (selectedStaffId) {
    // Record assignment
    db.prepare(`
      INSERT INTO ticket_assignment_history (ticket_id, staff_id, assigned_by, assignment_reason)
      VALUES (?, ?, ?, ?)
    `).run(ticketId, selectedStaffId, 'auto-assign', config.routing_mode);
  }
  
  return selectedStaffId;
}

// Get assignment history for ticket
export function getTicketAssignmentHistory(ticketId: number): any[] {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM ticket_assignment_history 
    WHERE ticket_id = ? 
    ORDER BY assigned_at DESC
  `).all(ticketId);
}

// Initialize schema on import
initTicketsSchema();
