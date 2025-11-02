import * as fs from 'fs';
import * as path from 'path';
import type { Guild, GuildMember } from 'discord.js';

const FILE = path.join(__dirname, '../../data/supportRoles.json');

export interface SupportRolesConfig {
  head?: string | null;
  support?: string | null;
  trial?: string | null;
}

let cfg: SupportRolesConfig = { head: null, support: null, trial: null };

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
    console.warn('Failed to load support roles config; using defaults', e);
  }
}

function save() {
  try {
    ensureDir();
    fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save support roles config', e);
  }
}

load();

export function getSupportRoles(): SupportRolesConfig {
  return { ...cfg };
}

export function setSupportRole(kind: 'head'|'support'|'trial', roleId: string | null) {
  (cfg as any)[kind] = roleId;
  save();
}

export async function listSupportMembers(guild: Guild): Promise<{ head: GuildMember[]; support: GuildMember[]; trial: GuildMember[]; }>{
  const ids = getSupportRoles();

  // Helper: get members from role cache without requiring privileged fetch
  const fromRoleCache = (roleId?: string | null): GuildMember[] => {
    if (!roleId) return [];
    const role = guild.roles.cache.get(roleId);
    if (!role) return [];
    // role.members is a Collection<string, GuildMember>
    return Array.from((role.members as any).values()) as GuildMember[];
  };

  let head = fromRoleCache(ids.head);
  let support = fromRoleCache(ids.support);
  let trial = fromRoleCache(ids.trial);

  // If cache is likely incomplete, try to fetch all members. If it fails (missing intent), keep partials.
  try {
    // Only fetch if any configured role returned zero; avoid heavy fetch when cache suffices
    const needFetch = (!!ids.head && head.length === 0) || (!!ids.support && support.length === 0) || (!!ids.trial && trial.length === 0);
    if (needFetch) {
      await guild.members.fetch();
      // Recompute using full member cache after fetch
      head = fromRoleCache(ids.head);
      support = fromRoleCache(ids.support);
      trial = fromRoleCache(ids.trial);
    }
  } catch (e) {
    // Missing GUILD_MEMBERS intent or insufficient permissions — fall back to whatever is cached
    // Intentionally ignore error and return partial results.
  }

  return { head, support, trial };
}
