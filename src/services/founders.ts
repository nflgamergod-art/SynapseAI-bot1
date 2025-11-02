import * as fs from 'fs';
import * as path from 'path';
import type { Guild, GuildMember, RoleResolvable } from 'discord.js';

const FILE = path.join(__dirname, '../../data/founders.json');

export const DEFAULT_FOUNDER_USER_IDS = new Set<string>([
  '1272923881052704820', // PobKC
  '840586296044421160',  // Joycemember
]);

export type FoundersGuildConfig = {
  roleId?: string | null;
  userIds: string[]; // additional founder user IDs besides defaults
};

export type FoundersConfig = Record<string, FoundersGuildConfig>; // key: guildId

let cfg: FoundersConfig = {};

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const text = fs.readFileSync(FILE, 'utf8');
      cfg = JSON.parse(text);
    }
  } catch (e) {
    console.warn('Failed to load founders config; using defaults', e);
    cfg = {};
  }
}

function save() {
  try {
    ensureDir();
    fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save founders config', e);
  }
}

load();

export function getFounders(guildId: string | null | undefined): FoundersGuildConfig {
  if (!guildId) return { roleId: null, userIds: [] };
  return cfg[guildId] || { roleId: null, userIds: [] };
}

export function setFounderRole(guildId: string, roleId: string | null) {
  const cur = getFounders(guildId);
  cfg[guildId] = { ...cur, roleId };
  save();
}

export function addFounderUser(guildId: string, userId: string) {
  const cur = getFounders(guildId);
  const set = new Set(cur.userIds || []);
  set.add(userId);
  cfg[guildId] = { ...cur, userIds: Array.from(set) };
  save();
}

export function removeFounderUser(guildId: string, userId: string) {
  const cur = getFounders(guildId);
  const set = new Set(cur.userIds || []);
  set.delete(userId);
  cfg[guildId] = { ...cur, userIds: Array.from(set) };
  save();
}

export function listFounderUsers(guildId: string): string[] {
  return getFounders(guildId).userIds || [];
}

// Core checker: determines if a user is a founder by (in order): configured userIds, configured role, default IDs, guild owner
export function isFounderUser(guild: Guild | null | undefined, userId: string, member?: GuildMember | null): boolean {
  const guildId = guild?.id ?? null;
  const f = getFounders(guildId);
  // Configured explicit users
  if ((f.userIds || []).includes(userId)) return true;
  // Configured founder role
  if (f.roleId && member && member.roles?.cache?.has?.(f.roleId)) return true;
  // Best-effort fallback when no founder role configured: detect by role name pattern
  if (!f.roleId && member && member.roles?.cache) {
    try {
      const hasFounderNamedRole = Array.from(member.roles.cache.values()).some((r: any) => {
        const n = String(r?.name || '').toLowerCase();
        return n.includes('founder');
      });
      if (hasFounderNamedRole) return true;
    } catch {}
  }
  // Default owner IDs fallback
  if (DEFAULT_FOUNDER_USER_IDS.has(userId)) return true;
  // Guild owner heuristic
  if (guild && (guild as any).ownerId && (guild as any).ownerId === userId) return true;
  return false;
}

export function isFounderMember(member: GuildMember | null | undefined): boolean {
  if (!member) return false;
  return isFounderUser(member.guild, member.id, member);
}
