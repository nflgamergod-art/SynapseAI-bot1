import { getDB } from './db';

export interface Appeal {
  id: number;
  guild_id: string;
  user_id: string;
  appeal_type: 'ban' | 'mute' | 'blacklist' | 'staff_suspension';
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by?: string;
  review_note?: string;
  created_at: string;
  reviewed_at?: string;
  suspension_id?: number; // For staff suspension appeals
}

// Initialize appeals table
export function initAppealsSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS appeals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      appeal_type TEXT CHECK(appeal_type IN ('ban', 'mute', 'blacklist', 'staff_suspension')) NOT NULL,
      reason TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending', 'approved', 'denied')) NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      review_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      suspension_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_appeals_guild ON appeals(guild_id);
    CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id);
    CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(guild_id, status);
  `);

  // Backfill/migrate: ensure suspension_id column exists on older databases
  try {
    const cols = db.prepare(`PRAGMA table_info(appeals)`).all() as Array<{ name: string }>;
    const hasSuspensionId = cols.some(c => c.name === 'suspension_id');
    if (!hasSuspensionId) {
      db.exec(`ALTER TABLE appeals ADD COLUMN suspension_id INTEGER`);
      console.log('[DB] Migrated appeals table: added suspension_id column');
    }
  } catch (e) {
    console.warn('[DB] Failed to verify/migrate appeals.suspension_id:', (e as any)?.message ?? e);
  }

  // Backfill/migrate: ensure CHECK constraint includes 'staff_suspension'
  try {
    const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='appeals'`).get() as { sql?: string } | undefined;
    const createSql = row?.sql || '';
    const hasStaffSuspensionInCheck = createSql.includes("appeal_type IN ('ban', 'mute', 'blacklist', 'staff_suspension')")
      || createSql.includes('staff_suspension');
    if (!hasStaffSuspensionInCheck) {
      console.log('[DB] Migrating appeals table to include staff_suspension in CHECK constraint...');
      const cols = db.prepare(`PRAGMA table_info(appeals)`).all() as Array<{ name: string }>;
      const hasSuspensionId = cols.some(c => c.name === 'suspension_id');
      db.exec('BEGIN');
      // Create new table with correct schema
      db.exec(`
        CREATE TABLE appeals_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          appeal_type TEXT CHECK(appeal_type IN ('ban', 'mute', 'blacklist', 'staff_suspension')) NOT NULL,
          reason TEXT NOT NULL,
          status TEXT CHECK(status IN ('pending', 'approved', 'denied')) NOT NULL DEFAULT 'pending',
          reviewed_by TEXT,
          review_note TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          reviewed_at TEXT,
          suspension_id INTEGER
        );
      `);
      // Copy data (handle missing suspension_id by inserting NULL)
      if (hasSuspensionId) {
        db.exec(`
          INSERT INTO appeals_new (id, guild_id, user_id, appeal_type, reason, status, reviewed_by, review_note, created_at, reviewed_at, suspension_id)
          SELECT id, guild_id, user_id, appeal_type, reason, status, reviewed_by, review_note, created_at, reviewed_at, suspension_id FROM appeals;
        `);
      } else {
        db.exec(`
          INSERT INTO appeals_new (id, guild_id, user_id, appeal_type, reason, status, reviewed_by, review_note, created_at, reviewed_at, suspension_id)
          SELECT id, guild_id, user_id, appeal_type, reason, status, reviewed_by, review_note, created_at, reviewed_at, NULL as suspension_id FROM appeals;
        `);
      }
      // Replace old table
      db.exec('DROP TABLE appeals');
      db.exec('ALTER TABLE appeals_new RENAME TO appeals');
      // Recreate indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_appeals_guild ON appeals(guild_id);
        CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id);
        CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(guild_id, status);
      `);
      db.exec('COMMIT');
      console.log('[DB] Migration complete: appeals table now supports staff_suspension.');
    }
  } catch (e) {
    console.warn('[DB] Failed to verify/migrate appeals CHECK constraint:', (e as any)?.message ?? e);
    try { db.exec('ROLLBACK'); } catch {}
  }
}

// Create a new appeal
export function createAppeal(
  guildId: string,
  userId: string,
  appealType: Appeal['appeal_type'],
  reason: string,
  suspensionId?: number
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
    INSERT INTO appeals (guild_id, user_id, appeal_type, reason, created_at, suspension_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, userId, appealType, reason, now, suspensionId || null);
  
  return result.lastInsertRowid as number;
}

// Get appeal by ID
export function getAppeal(appealId: number): Appeal | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT id, guild_id, user_id, appeal_type, reason, status, reviewed_by, review_note, created_at, reviewed_at, suspension_id
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
    reviewed_at: row.reviewed_at,
    suspension_id: row.suspension_id
  };
}

// Get all pending appeals for a guild
export function getPendingAppeals(guildId: string): Appeal[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, user_id, appeal_type, reason, status, reviewed_by, review_note, created_at, reviewed_at, suspension_id
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
    reviewed_at: row.reviewed_at,
    suspension_id: row.suspension_id
  }));
}

// Get user's appeal history
export function getUserAppeals(guildId: string, userId: string): Appeal[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, user_id, appeal_type, reason, status, reviewed_by, review_note, created_at, reviewed_at, suspension_id
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
    reviewed_at: row.reviewed_at,
    suspension_id: row.suspension_id
  }));
}

// Get the most recent appeal of a given type for a user
export function getLatestAppealOfType(guildId: string, userId: string, appealType: Appeal['appeal_type']): Appeal | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT id, guild_id, user_id, appeal_type, reason, status, reviewed_by, review_note, created_at, reviewed_at, suspension_id
    FROM appeals
    WHERE guild_id = ? AND user_id = ? AND appeal_type = ?
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `).get(guildId, userId, appealType) as any;
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
    reviewed_at: row.reviewed_at,
    suspension_id: row.suspension_id
  };
}

// Can the user submit an appeal of this type now? Enforce cooldownSeconds window between submissions
export function canSubmitAppeal(guildId: string, userId: string, appealType: Appeal['appeal_type'], cooldownSeconds: number): { allowed: boolean; retryAfterSeconds?: number } {
  const last = getLatestAppealOfType(guildId, userId, appealType);
  if (!last) return { allowed: true };
  const lastTime = Date.parse(last.created_at);
  if (!Number.isFinite(lastTime)) return { allowed: true };
  const elapsed = Math.floor((Date.now() - lastTime) / 1000);
  if (elapsed >= cooldownSeconds) return { allowed: true };
  return { allowed: false, retryAfterSeconds: cooldownSeconds - elapsed };
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
