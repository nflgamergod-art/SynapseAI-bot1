// src/services/whitelistService.ts
import fs from 'fs';
import path from 'path';

export type WhitelistEntry = {
  id: string; // user or role ID
  type: 'user' | 'role';
  expiresAt?: number; // timestamp for timed access, undefined for lifetime
  autoRoleId?: string; // role to assign on whitelist
};

const DATA_PATH = path.join(__dirname, '../../data/whitelist.json');

function loadWhitelist(): WhitelistEntry[] {
  if (!fs.existsSync(DATA_PATH)) return [];
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveWhitelist(entries: WhitelistEntry[]) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(entries, null, 2));
}

export function getWhitelist(): WhitelistEntry[] {
  return loadWhitelist();
}

export function isWhitelisted(id: string, type: 'user' | 'role'): boolean {
  const now = Date.now();
  const result = loadWhitelist().some(entry =>
    entry.id === id && entry.type === type && (!entry.expiresAt || entry.expiresAt > now)
  );
  console.log(`[isWhitelisted] id=${id}, type=${type}, result=${result}`);
  return result;
}

export function addWhitelistEntry(entry: WhitelistEntry) {
  const entries = loadWhitelist();
  const idx = entries.findIndex(e => e.id === entry.id && e.type === entry.type);
  if (idx !== -1) entries[idx] = entry;
  else entries.push(entry);
  saveWhitelist(entries);
}

export function removeWhitelistEntry(id: string, type: 'user' | 'role') {
  const entries = loadWhitelist().filter(e => !(e.id === id && e.type === type));
  saveWhitelist(entries);
}

export function getAutoRole(id: string, type: 'user' | 'role'): string | undefined {
  const entry = loadWhitelist().find(e => e.id === id && e.type === type);
  return entry?.autoRoleId;
}
