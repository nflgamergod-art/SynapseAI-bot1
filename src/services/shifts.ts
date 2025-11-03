import { getDB } from './db';

export interface Shift {
  id: number;
  guild_id: string;
  user_id: string;
  clock_in: string;
  clock_out?: string;
  duration_minutes?: number;
}

// Initialize shifts table
export function initShiftsSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      clock_in TEXT NOT NULL,
      clock_out TEXT,
      duration_minutes INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_shifts_guild_user ON shifts(guild_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_shifts_active ON shifts(guild_id, user_id, clock_out);
  `);
}

// Clock in
export function clockIn(guildId: string, userId: string): { success: boolean; message: string } {
  const db = getDB();
  
  // Check if already clocked in
  const active = db.prepare(`
    SELECT id FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_out IS NULL
  `).get(guildId, userId);
  
  if (active) {
    return { success: false, message: 'You are already clocked in!' };
  }
  
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO shifts (guild_id, user_id, clock_in)
    VALUES (?, ?, ?)
  `).run(guildId, userId, now);
  
  return { success: true, message: 'Clocked in successfully!' };
}

// Clock out
export function clockOut(guildId: string, userId: string): { success: boolean; message: string; duration?: number } {
  const db = getDB();
  
  const active = db.prepare(`
    SELECT id, clock_in FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_out IS NULL
  `).get(guildId, userId) as any;
  
  if (!active) {
    return { success: false, message: 'You are not clocked in!' };
  }
  
  const now = new Date();
  const clockIn = new Date(active.clock_in);
  const durationMs = now.getTime() - clockIn.getTime();
  const durationMinutes = Math.floor(durationMs / 60000);
  
  db.prepare(`
    UPDATE shifts
    SET clock_out = ?, duration_minutes = ?
    WHERE id = ?
  `).run(now.toISOString(), durationMinutes, active.id);
  
  return { success: true, message: 'Clocked out successfully!', duration: durationMinutes };
}

// Get current active shift
export function getActiveShift(guildId: string, userId: string): Shift | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT id, guild_id, user_id, clock_in, clock_out, duration_minutes
    FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_out IS NULL
  `).get(guildId, userId) as any;
  
  if (!row) return null;
  
  return {
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    clock_in: row.clock_in,
    clock_out: row.clock_out,
    duration_minutes: row.duration_minutes
  };
}

// Get user's shift history
export function getUserShifts(guildId: string, userId: string, limit: number = 10): Shift[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, user_id, clock_in, clock_out, duration_minutes
    FROM shifts
    WHERE guild_id = ? AND user_id = ?
    ORDER BY clock_in DESC
    LIMIT ?
  `).all(guildId, userId, limit) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    clock_in: row.clock_in,
    clock_out: row.clock_out,
    duration_minutes: row.duration_minutes
  }));
}

// Get shift statistics
export function getShiftStats(guildId: string, userId: string, days: number = 30): {
  totalShifts: number;
  totalMinutes: number;
  averageMinutes: number;
} {
  const db = getDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_shifts,
      COALESCE(SUM(duration_minutes), 0) as total_minutes,
      COALESCE(AVG(duration_minutes), 0) as avg_minutes
    FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_in >= ? AND clock_out IS NOT NULL
  `).get(guildId, userId, cutoff.toISOString()) as any;
  
  return {
    totalShifts: stats.total_shifts,
    totalMinutes: stats.total_minutes,
    averageMinutes: Math.round(stats.avg_minutes)
  };
}

// Get all currently clocked in staff
export function getActiveStaff(guildId: string): Shift[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, user_id, clock_in, clock_out, duration_minutes
    FROM shifts
    WHERE guild_id = ? AND clock_out IS NULL
    ORDER BY clock_in ASC
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    clock_in: row.clock_in,
    clock_out: row.clock_out,
    duration_minutes: row.duration_minutes
  }));
}

// Initialize schema on import
initShiftsSchema();
