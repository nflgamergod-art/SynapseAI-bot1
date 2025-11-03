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

export function getBlacklist(): BlacklistEntry[] {
  return loadBlacklist();
}

export function isBlacklisted(id: string, type: 'user' | 'role'): boolean {
  // Check JSON file (old system)
  const jsonBlacklisted = loadBlacklist().some(entry => entry.id === id && entry.type === type);
  if (jsonBlacklisted) return true;
  
  // Check database (new system - only for users)
  if (type === 'user') {
    try {
      const db = getDB();
      const result = db.prepare('SELECT * FROM blacklist WHERE user_id = ? LIMIT 1').get(id);
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

export function removeBlacklistEntry(id: string, type: 'user' | 'role') {
  const entries = loadBlacklist().filter(e => !(e.id === id && e.type === type));
  saveBlacklist(entries);
}
