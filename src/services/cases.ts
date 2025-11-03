import { getDB } from './db';

export interface ModCase {
  case_number: number;
  guild_id: string;
  user_id: string;
  moderator_id: string;
  action_type: 'ban' | 'kick' | 'mute' | 'warn' | 'unmute' | 'unban';
  reason: string;
  duration?: number; // For mutes, in minutes
  created_at: string;
}

// Initialize cases table
export function initCasesSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS mod_cases (
      case_number INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      action_type TEXT CHECK(action_type IN ('ban', 'kick', 'mute', 'warn', 'unmute', 'unban')) NOT NULL,
      reason TEXT NOT NULL,
      duration INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cases_guild ON mod_cases(guild_id);
    CREATE INDEX IF NOT EXISTS idx_cases_user ON mod_cases(user_id);
    CREATE INDEX IF NOT EXISTS idx_cases_guild_user ON mod_cases(guild_id, user_id);
  `);
}

// Create a new case
export function createCase(
  guildId: string,
  userId: string,
  moderatorId: string,
  actionType: ModCase['action_type'],
  reason: string,
  duration?: number
): number {
  const db = getDB();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    INSERT INTO mod_cases (guild_id, user_id, moderator_id, action_type, reason, duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, userId, moderatorId, actionType, reason, duration || null, now);
  
  return result.lastInsertRowid as number;
}

// Get case by number
export function getCase(caseNumber: number): ModCase | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT case_number, guild_id, user_id, moderator_id, action_type, reason, duration, created_at
    FROM mod_cases
    WHERE case_number = ?
  `).get(caseNumber) as any;
  
  if (!row) return null;
  
  return {
    case_number: row.case_number,
    guild_id: row.guild_id,
    user_id: row.user_id,
    moderator_id: row.moderator_id,
    action_type: row.action_type,
    reason: row.reason,
    duration: row.duration,
    created_at: row.created_at
  };
}

// Get all cases for a user in a guild
export function getUserCases(guildId: string, userId: string): ModCase[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT case_number, guild_id, user_id, moderator_id, action_type, reason, duration, created_at
    FROM mod_cases
    WHERE guild_id = ? AND user_id = ?
    ORDER BY case_number DESC
  `).all(guildId, userId) as any[];
  
  return rows.map(row => ({
    case_number: row.case_number,
    guild_id: row.guild_id,
    user_id: row.user_id,
    moderator_id: row.moderator_id,
    action_type: row.action_type,
    reason: row.reason,
    duration: row.duration,
    created_at: row.created_at
  }));
}

// Get recent cases for a guild
export function getRecentCases(guildId: string, limit: number = 10): ModCase[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT case_number, guild_id, user_id, moderator_id, action_type, reason, duration, created_at
    FROM mod_cases
    WHERE guild_id = ?
    ORDER BY case_number DESC
    LIMIT ?
  `).all(guildId, limit) as any[];
  
  return rows.map(row => ({
    case_number: row.case_number,
    guild_id: row.guild_id,
    user_id: row.user_id,
    moderator_id: row.moderator_id,
    action_type: row.action_type,
    reason: row.reason,
    duration: row.duration,
    created_at: row.created_at
  }));
}

// Update case reason
export function updateCaseReason(caseNumber: number, newReason: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    UPDATE mod_cases
    SET reason = ?
    WHERE case_number = ?
  `).run(newReason, caseNumber);
  
  return result.changes > 0;
}

// Initialize schema on import
initCasesSchema();
