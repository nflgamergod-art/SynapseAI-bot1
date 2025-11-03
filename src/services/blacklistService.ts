// src/services/blacklistService.ts
import fs from 'fs';
import path from 'path';
import { getDB } from './db';

export type BlacklistEntry = {
  id: string; // user or role ID
  type: 'user' | 'role';
  reason?: string;
  addedAt: number;
};

const DATA_PATH = path.join(__dirname, '../../data/blacklist.json');

function loadBlacklist(): BlacklistEntry[] {
  if (!fs.existsSync(DATA_PATH)) return [];
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveBlacklist(entries: BlacklistEntry[]) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(entries, null, 2));
}

// Legacy JSON-based blacklist (global)
export function getBlacklist(): BlacklistEntry[] {
  return loadBlacklist();
}

// Guild-aware blacklist including DB-backed auto-blacklist entries
export function getGuildBlacklist(guildId: string): BlacklistEntry[] {
  const entries: BlacklistEntry[] = loadBlacklist();
  try {
    const db = getDB();
    const rows = db.prepare('SELECT user_id, reason, created_at FROM blacklist WHERE guild_id = ?').all(guildId) as Array<{ user_id: string; reason?: string; created_at?: string }>;
    for (const r of rows) {
      // Avoid duplicates if same user is also in JSON list
      if (!entries.some(e => e.id === r.user_id && e.type === 'user')) {
        entries.push({ id: r.user_id, type: 'user', reason: r.reason, addedAt: r.created_at ? Date.parse(r.created_at) : Date.now() });
      }
    }
  } catch (err) {
    // If table missing or error, just return JSON entries
  }
  return entries;
}

export function isBlacklisted(id: string, type: 'user' | 'role', guildId?: string): boolean {
  // Check JSON file (old system)
  const jsonBlacklisted = loadBlacklist().some(entry => entry.id === id && entry.type === type);
  if (jsonBlacklisted) return true;
  
  // Check database (new system - only for users)
  if (type === 'user') {
    try {
      const db = getDB();
      // If guildId is provided, check guild-specific blacklist, otherwise check any guild
      const query = guildId 
        ? 'SELECT * FROM blacklist WHERE user_id = ? AND guild_id = ? LIMIT 1'
        : 'SELECT * FROM blacklist WHERE user_id = ? LIMIT 1';
      const result = guildId 
        ? db.prepare(query).get(id, guildId)
        : db.prepare(query).get(id);
      return !!result;
    } catch (err) {
      // If table doesn't exist or other DB error, fall back to JSON only
      return false;
    }
  }
  
  return false;
}

export function addBlacklistEntry(entry: BlacklistEntry) {
  const entries = loadBlacklist();
  const idx = entries.findIndex(e => e.id === entry.id && e.type === entry.type);
  if (idx !== -1) entries[idx] = entry;
  else entries.push(entry);
  saveBlacklist(entries);
}

export function removeBlacklistEntry(id: string, type: 'user' | 'role', guildId?: string) {
  // Remove from JSON store
  const entries = loadBlacklist().filter(e => !(e.id === id && e.type === type));
  saveBlacklist(entries);
  
  // Also remove from DB-backed blacklist when applicable
  if (type === 'user' && guildId) {
    try {
      const db = getDB();
      db.prepare('DELETE FROM blacklist WHERE user_id = ? AND guild_id = ?').run(id, guildId);
    } catch (err) {
      // Ignore DB errors to maintain backward compatibility
    }
  }
}
