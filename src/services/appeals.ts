import { getDB } from './db';

export interface Appeal {
  id: number;
  guild_id: string;
  user_id: string;
  appeal_type: 'ban' | 'mute' | 'blacklist';
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by?: string;
  review_note?: string;
  created_at: string;
  reviewed_at?: string;
}

// Initialize appeals table
export function initAppealsSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS appeals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      appeal_type TEXT CHECK(appeal_type IN ('ban', 'mute', 'blacklist')) NOT NULL,
      reason TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending', 'approved', 'denied')) NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      review_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_appeals_guild ON appeals(guild_id);
    CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id);
    CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(guild_id, status);
  `);
}

// Create a new appeal
export function createAppeal(
  guildId: string,
  userId: string,
  appealType: Appeal['appeal_type'],
  reason: string
): number {
  const db = getDB();
  const now = new Date().toISOString();
  
  // Check if user already has a pending appeal
  const existing = db.prepare(`
    SELECT id FROM appeals
    WHERE guild_id = ? AND user_id = ? AND appeal_type = ? AND status = 'pending'
  `).get(guildId, userId, appealType);
  
  if (existing) {
    throw new Error('You already have a pending appeal of this type.');
  }
  
  const result = db.prepare(`
    INSERT INTO appeals (guild_id, user_id, appeal_type, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, userId, appealType, reason, now);
  
  return result.lastInsertRowid as number;
}

// Get appeal by ID
export function getAppeal(appealId: number): Appeal | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT id, guild_id, user_id, appeal_type, reason, status, reviewed_by, review_note, created_at, reviewed_at
    FROM appeals
    WHERE id = ?
  `).get(appealId) as any;
  
  if (!row) return null;
  
  return {
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    appeal_type: row.appeal_type,
    reason: row.reason,
    status: row.status,
    reviewed_by: row.reviewed_by,
    review_note: row.review_note,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at
  };
}

// Get all pending appeals for a guild
export function getPendingAppeals(guildId: string): Appeal[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, user_id, appeal_type, reason, status, reviewed_by, review_note, created_at, reviewed_at
    FROM appeals
    WHERE guild_id = ? AND status = 'pending'
    ORDER BY created_at ASC
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    appeal_type: row.appeal_type,
    reason: row.reason,
    status: row.status,
    reviewed_by: row.reviewed_by,
    review_note: row.review_note,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at
  }));
}

// Get user's appeal history
export function getUserAppeals(guildId: string, userId: string): Appeal[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, user_id, appeal_type, reason, status, reviewed_by, review_note, created_at, reviewed_at
    FROM appeals
    WHERE guild_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `).all(guildId, userId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    appeal_type: row.appeal_type,
    reason: row.reason,
    status: row.status,
    reviewed_by: row.reviewed_by,
    review_note: row.review_note,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at
  }));
}

// Review an appeal
export function reviewAppeal(
  appealId: number,
  reviewerId: string,
  status: 'approved' | 'denied',
  reviewNote?: string
): boolean {
  const db = getDB();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    UPDATE appeals
    SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = ?
    WHERE id = ? AND status = 'pending'
  `).run(status, reviewerId, reviewNote || null, now, appealId);
  
  return result.changes > 0;
}

// Initialize schema on import
initAppealsSchema();
