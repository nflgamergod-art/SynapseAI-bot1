import { getDB } from './db';

export interface Reminder {
  id: number;
  user_id: string;
  guild_id?: string;
  channel_id?: string;
  message: string;
  remind_at: string;
  created_at: string;
  completed: boolean;
}

// Initialize reminders table
export function initRemindersSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT,
      channel_id TEXT,
      message TEXT NOT NULL,
      remind_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at, completed);
  `);
}

// Parse time string to minutes (e.g., "2h", "30m", "1d")
export function parseTimeString(timeStr: string): number | null {
  const match = timeStr.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value / 60; // seconds to minutes
    case 'm': return value;
    case 'h': return value * 60;
    case 'd': return value * 60 * 24;
    default: return null;
  }
}

// Create a reminder
export function createReminder(
  userId: string,
  message: string,
  minutes: number,
  guildId?: string,
  channelId?: string
): number {
  const db = getDB();
  const now = new Date();
  const remindAt = new Date(now.getTime() + minutes * 60000);
  
  const result = db.prepare(`
    INSERT INTO reminders (user_id, guild_id, channel_id, message, remind_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, guildId || null, channelId || null, message, remindAt.toISOString(), now.toISOString());
  
  return result.lastInsertRowid as number;
}

// Get due reminders
export function getDueReminders(): Reminder[] {
  const db = getDB();
  const now = new Date().toISOString();
  
  const rows = db.prepare(`
    SELECT id, user_id, guild_id, channel_id, message, remind_at, created_at, completed
    FROM reminders
    WHERE remind_at <= ? AND completed = 0
    ORDER BY remind_at ASC
  `).all(now) as any[];
  
  return rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    message: row.message,
    remind_at: row.remind_at,
    created_at: row.created_at,
    completed: row.completed === 1
  }));
}

// Mark reminder as completed
export function completeReminder(reminderId: number): boolean {
  const db = getDB();
  const result = db.prepare(`
    UPDATE reminders
    SET completed = 1
    WHERE id = ?
  `).run(reminderId);
  
  return result.changes > 0;
}

// Get user's active reminders
export function getUserReminders(userId: string): Reminder[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, user_id, guild_id, channel_id, message, remind_at, created_at, completed
    FROM reminders
    WHERE user_id = ? AND completed = 0
    ORDER BY remind_at ASC
  `).all(userId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    message: row.message,
    remind_at: row.remind_at,
    created_at: row.created_at,
    completed: row.completed === 1
  }));
}

// Cancel a reminder
export function cancelReminder(reminderId: number, userId: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    DELETE FROM reminders
    WHERE id = ? AND user_id = ?
  `).run(reminderId, userId);
  
  return result.changes > 0;
}

// Initialize schema on import
initRemindersSchema();
