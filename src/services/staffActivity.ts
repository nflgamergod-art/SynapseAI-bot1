/**
 * Staff Activity Tracking and Auto-Demotion System
 * Tracks staff activity and automatically demotes inactive staff
 * Demotion hierarchy: Head Support -> Support -> Trial Support -> Removed
 */

import { getDB } from './db';

export interface StaffActivityConfig {
  guild_id: string;
  head_support_role_id?: string;
  support_role_id?: string;
  trial_support_role_id?: string;
  inactivity_days: number; // Default: 2 days
  enabled: boolean;
}

export interface StaffActivity {
  id?: number;
  guild_id: string;
  user_id: string;
  last_activity_at: string;
  current_role: string; // 'head_support' | 'support' | 'trial_support'
  exempted: boolean; // If true, won't be auto-demoted
  exemption_reason?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DemotionLog {
  id?: number;
  guild_id: string;
  user_id: string;
  from_role: string;
  to_role: string;
  reason: string;
  demoted_at?: string;
}

// Initialize tables
export function initStaffActivityDB() {
  const db = getDB();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_activity_config (
      guild_id TEXT PRIMARY KEY,
      head_support_role_id TEXT,
      support_role_id TEXT,
      trial_support_role_id TEXT,
      inactivity_days INTEGER DEFAULT 2,
      enabled INTEGER DEFAULT 1
    );
    
    CREATE TABLE IF NOT EXISTS staff_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_activity_at TEXT NOT NULL,
      current_role TEXT NOT NULL,
      exempted INTEGER DEFAULT 0,
      exemption_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, user_id)
    );
    
    CREATE TABLE IF NOT EXISTS staff_demotion_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      from_role TEXT NOT NULL,
      to_role TEXT NOT NULL,
      reason TEXT NOT NULL,
      demoted_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_staff_activity_guild_user 
      ON staff_activity(guild_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_staff_activity_last_activity 
      ON staff_activity(last_activity_at);
    CREATE INDEX IF NOT EXISTS idx_demotion_log_guild 
      ON staff_demotion_log(guild_id);
  `);
}

// Configuration functions
export function setStaffActivityConfig(config: StaffActivityConfig): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO staff_activity_config 
      (guild_id, head_support_role_id, support_role_id, trial_support_role_id, inactivity_days, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      head_support_role_id = excluded.head_support_role_id,
      support_role_id = excluded.support_role_id,
      trial_support_role_id = excluded.trial_support_role_id,
      inactivity_days = excluded.inactivity_days,
      enabled = excluded.enabled
  `).run(
    config.guild_id,
    config.head_support_role_id || null,
    config.support_role_id || null,
    config.trial_support_role_id || null,
    config.inactivity_days,
    config.enabled ? 1 : 0
  );
}

export function getStaffActivityConfig(guildId: string): StaffActivityConfig | null {
  const db = getDB();
  
  const row = db.prepare(`
    SELECT * FROM staff_activity_config WHERE guild_id = ?
  `).get(guildId) as any;
  
  if (!row) return null;
  
  return {
    guild_id: row.guild_id,
    head_support_role_id: row.head_support_role_id,
    support_role_id: row.support_role_id,
    trial_support_role_id: row.trial_support_role_id,
    inactivity_days: row.inactivity_days,
    enabled: row.enabled === 1
  };
}

// Activity tracking functions
export function updateStaffActivity(guildId: string, userId: string, role: string): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO staff_activity (guild_id, user_id, last_activity_at, current_role, updated_at)
    VALUES (?, ?, datetime('now'), ?, datetime('now'))
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      last_activity_at = datetime('now'),
      current_role = excluded.current_role,
      updated_at = datetime('now')
  `).run(guildId, userId, role);
}

export function getStaffActivity(guildId: string, userId: string): StaffActivity | null {
  const db = getDB();
  
  const row = db.prepare(`
    SELECT * FROM staff_activity WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId) as any;
  
  if (!row) return null;
  
  return {
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    last_activity_at: row.last_activity_at,
    current_role: row.current_role,
    exempted: row.exempted === 1,
    exemption_reason: row.exemption_reason,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function getAllStaffActivity(guildId: string): StaffActivity[] {
  const db = getDB();
  
  const rows = db.prepare(`
    SELECT * FROM staff_activity WHERE guild_id = ?
    ORDER BY last_activity_at DESC
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    last_activity_at: row.last_activity_at,
    current_role: row.current_role,
    exempted: row.exempted === 1,
    exemption_reason: row.exemption_reason,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

// Get inactive staff (not active for X days)
export function getInactiveStaff(guildId: string, inactivityDays: number = 2): StaffActivity[] {
  const db = getDB();
  
  const rows = db.prepare(`
    SELECT * FROM staff_activity 
    WHERE guild_id = ? 
      AND exempted = 0
      AND datetime(last_activity_at, '+' || ? || ' days') < datetime('now')
    ORDER BY last_activity_at ASC
  `).all(guildId, inactivityDays) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    last_activity_at: row.last_activity_at,
    current_role: row.current_role,
    exempted: row.exempted === 1,
    exemption_reason: row.exemption_reason,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

// Exemption functions
export function exemptStaffFromDemotion(guildId: string, userId: string, reason: string): void {
  const db = getDB();
  
  db.prepare(`
    UPDATE staff_activity 
    SET exempted = 1, exemption_reason = ?, updated_at = datetime('now')
    WHERE guild_id = ? AND user_id = ?
  `).run(reason, guildId, userId);
}

export function removeStaffExemption(guildId: string, userId: string): void {
  const db = getDB();
  
  db.prepare(`
    UPDATE staff_activity 
    SET exempted = 0, exemption_reason = NULL, updated_at = datetime('now')
    WHERE guild_id = ? AND user_id = ?
  `).run(guildId, userId);
}

// Demotion logging
export function logDemotion(guildId: string, userId: string, fromRole: string, toRole: string, reason: string): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO staff_demotion_log (guild_id, user_id, from_role, to_role, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, userId, fromRole, toRole, reason);
}

export function getDemotionHistory(guildId: string, userId?: string): DemotionLog[] {
  const db = getDB();
  
  let query = `SELECT * FROM staff_demotion_log WHERE guild_id = ?`;
  let params: any[] = [guildId];
  
  if (userId) {
    query += ` AND user_id = ?`;
    params.push(userId);
  }
  
  query += ` ORDER BY demoted_at DESC LIMIT 50`;
  
  const rows = db.prepare(query).all(...params) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    from_role: row.from_role,
    to_role: row.to_role,
    reason: row.reason,
    demoted_at: row.demoted_at
  }));
}

// Remove staff from tracking (when they leave staff completely)
export function removeStaffTracking(guildId: string, userId: string): void {
  const db = getDB();
  
  db.prepare(`
    DELETE FROM staff_activity WHERE guild_id = ? AND user_id = ?
  `).run(guildId, userId);
}

// Get next demotion role in hierarchy
export function getNextDemotionRole(currentRole: string): string | null {
  const hierarchy: { [key: string]: string | null } = {
    'head_support': 'support',
    'support': 'trial_support',
    'trial_support': null // null means remove from staff
  };
  
  return hierarchy[currentRole] ?? null;
}

// Initialize on module load
try {
  initStaffActivityDB();
} catch (err) {
  console.error('Failed to initialize staff activity DB:', err);
}
