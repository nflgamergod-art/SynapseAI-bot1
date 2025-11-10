/**
 * Anti-Nuke Protection System
 * Protects against mass channel/role deletion, mass bans, and permission abuse
 */

import { getDB } from './db';

export interface AntiNukeConfig {
  guild_id: string;
  enabled: boolean;
  max_channel_deletes: number; // Max channels deleted in time window
  max_role_deletes: number; // Max roles deleted in time window
  max_bans: number; // Max bans in time window
  time_window_seconds: number; // Time window for rate limiting (default 60s)
  whitelist_role_ids: string[]; // Roles exempt from anti-nuke
  whitelist_user_ids: string[]; // Users exempt from anti-nuke
  lockdown_on_trigger: boolean; // Auto-lockdown server on trigger
}

export interface AntiNukeAction {
  id?: number;
  guild_id: string;
  user_id: string;
  action_type: string; // 'channel_delete' | 'role_delete' | 'ban' | 'permission_abuse'
  timestamp: string;
}

export interface AntiNukeTrigger {
  id?: number;
  guild_id: string;
  user_id: string;
  trigger_type: string;
  actions_count: number;
  triggered_at?: string;
  action_taken: string; // 'kicked' | 'banned' | 'roles_removed' | 'lockdown'
}

// Initialize tables
export function initAntiNukeDB() {
  const db = getDB();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS antinuke_config (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      max_channel_deletes INTEGER DEFAULT 3,
      max_role_deletes INTEGER DEFAULT 3,
      max_bans INTEGER DEFAULT 5,
      time_window_seconds INTEGER DEFAULT 60,
      whitelist_role_ids TEXT,
      whitelist_user_ids TEXT,
      lockdown_on_trigger INTEGER DEFAULT 1
    );
    
    CREATE TABLE IF NOT EXISTS antinuke_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS antinuke_triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      actions_count INTEGER NOT NULL,
      triggered_at TEXT DEFAULT CURRENT_TIMESTAMP,
      action_taken TEXT NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_antinuke_actions_guild_user 
      ON antinuke_actions(guild_id, user_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_antinuke_triggers_guild 
      ON antinuke_triggers(guild_id, triggered_at);
  `);
}

// Configuration functions
export function setAntiNukeConfig(config: AntiNukeConfig): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO antinuke_config 
      (guild_id, enabled, max_channel_deletes, max_role_deletes, max_bans, 
       time_window_seconds, whitelist_role_ids, whitelist_user_ids, lockdown_on_trigger)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      enabled = excluded.enabled,
      max_channel_deletes = excluded.max_channel_deletes,
      max_role_deletes = excluded.max_role_deletes,
      max_bans = excluded.max_bans,
      time_window_seconds = excluded.time_window_seconds,
      whitelist_role_ids = excluded.whitelist_role_ids,
      whitelist_user_ids = excluded.whitelist_user_ids,
      lockdown_on_trigger = excluded.lockdown_on_trigger
  `).run(
    config.guild_id,
    config.enabled ? 1 : 0,
    config.max_channel_deletes,
    config.max_role_deletes,
    config.max_bans,
    config.time_window_seconds,
    JSON.stringify(config.whitelist_role_ids),
    JSON.stringify(config.whitelist_user_ids),
    config.lockdown_on_trigger ? 1 : 0
  );
}

export function getAntiNukeConfig(guildId: string): AntiNukeConfig | null {
  const db = getDB();
  
  const row = db.prepare(`
    SELECT * FROM antinuke_config WHERE guild_id = ?
  `).get(guildId) as any;
  
  if (!row) {
    // Return default config
    return {
      guild_id: guildId,
      enabled: true,
      max_channel_deletes: 3,
      max_role_deletes: 3,
      max_bans: 5,
      time_window_seconds: 60,
      whitelist_role_ids: [],
      whitelist_user_ids: [],
      lockdown_on_trigger: true
    };
  }
  
  return {
    guild_id: row.guild_id,
    enabled: row.enabled === 1,
    max_channel_deletes: row.max_channel_deletes,
    max_role_deletes: row.max_role_deletes,
    max_bans: row.max_bans,
    time_window_seconds: row.time_window_seconds,
    whitelist_role_ids: row.whitelist_role_ids ? JSON.parse(row.whitelist_role_ids) : [],
    whitelist_user_ids: row.whitelist_user_ids ? JSON.parse(row.whitelist_user_ids) : [],
    lockdown_on_trigger: row.lockdown_on_trigger === 1
  };
}

// Track an action
export function trackAntiNukeAction(guildId: string, userId: string, actionType: string): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO antinuke_actions (guild_id, user_id, action_type, timestamp)
    VALUES (?, ?, ?, datetime('now'))
  `).run(guildId, userId, actionType);
}

// Get recent actions by user
export function getRecentActions(guildId: string, userId: string, actionType: string, timeWindowSeconds: number): number {
  const db = getDB();
  
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM antinuke_actions
    WHERE guild_id = ? 
      AND user_id = ? 
      AND action_type = ?
      AND datetime(timestamp, '+' || ? || ' seconds') > datetime('now')
  `).get(guildId, userId, actionType, timeWindowSeconds) as any;
  
  return result?.count || 0;
}

// Check if user is whitelisted
export function isWhitelisted(config: AntiNukeConfig, userId: string, userRoles: string[]): boolean {
  // Check if user is in whitelist
  if (config.whitelist_user_ids.includes(userId)) {
    return true;
  }
  
  // Check if user has a whitelisted role
  for (const roleId of userRoles) {
    if (config.whitelist_role_ids.includes(roleId)) {
      return true;
    }
  }
  
  return false;
}

// Log a trigger event
export function logAntiNukeTrigger(
  guildId: string, 
  userId: string, 
  triggerType: string, 
  actionsCount: number, 
  actionTaken: string
): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO antinuke_triggers (guild_id, user_id, trigger_type, actions_count, action_taken)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, userId, triggerType, actionsCount, actionTaken);
}

// Get trigger history
export function getAntiNukeTriggers(guildId: string, limit: number = 20): AntiNukeTrigger[] {
  const db = getDB();
  
  const rows = db.prepare(`
    SELECT * FROM antinuke_triggers
    WHERE guild_id = ?
    ORDER BY triggered_at DESC
    LIMIT ?
  `).all(guildId, limit) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    trigger_type: row.trigger_type,
    actions_count: row.actions_count,
    triggered_at: row.triggered_at,
    action_taken: row.action_taken
  }));
}

// Clean up old actions (older than 24 hours)
export function cleanupOldActions(): void {
  const db = getDB();
  
  db.prepare(`
    DELETE FROM antinuke_actions
    WHERE datetime(timestamp, '+24 hours') < datetime('now')
  `).run();
}

// Add user to whitelist
export function addToWhitelist(guildId: string, userId: string): void {
  const config = getAntiNukeConfig(guildId);
  if (!config) return;
  
  if (!config.whitelist_user_ids.includes(userId)) {
    config.whitelist_user_ids.push(userId);
    setAntiNukeConfig(config);
  }
}

// Remove user from whitelist
export function removeFromWhitelist(guildId: string, userId: string): void {
  const config = getAntiNukeConfig(guildId);
  if (!config) return;
  
  config.whitelist_user_ids = config.whitelist_user_ids.filter(id => id !== userId);
  setAntiNukeConfig(config);
}

// Add role to whitelist
export function addRoleToWhitelist(guildId: string, roleId: string): void {
  const config = getAntiNukeConfig(guildId);
  if (!config) return;
  
  if (!config.whitelist_role_ids.includes(roleId)) {
    config.whitelist_role_ids.push(roleId);
    setAntiNukeConfig(config);
  }
}

// Remove role from whitelist
export function removeRoleFromWhitelist(guildId: string, roleId: string): void {
  const config = getAntiNukeConfig(guildId);
  if (!config) return;
  
  config.whitelist_role_ids = config.whitelist_role_ids.filter(id => id !== roleId);
  setAntiNukeConfig(config);
}

// Initialize on module load
try {
  initAntiNukeDB();
} catch (err) {
  console.error('Failed to initialize anti-nuke DB:', err);
}
