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
  await guild.members.fetch();
  const ids = getSupportRoles();
  const head: GuildMember[] = [];
  const support: GuildMember[] = [];
  const trial: GuildMember[] = [];
  guild.members.cache.forEach(m => {
    const r = (m.roles as any).cache;
    if (ids.head && r.has(ids.head)) head.push(m);
    if (ids.support && r.has(ids.support)) support.push(m);
    if (ids.trial && r.has(ids.trial)) trial.push(m);
  });
  return { head, support, trial };
}
