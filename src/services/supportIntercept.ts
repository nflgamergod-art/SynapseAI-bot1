import * as fs from 'fs';
import * as path from 'path';

// Persist per-guild toggle for global support interception
const FILE = path.join(__dirname, '../../data/supportIntercept.json');

type Config = Record<string, boolean>; // guildId -> enabled

let cfg: Config = {};

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
    console.warn('Failed to load support intercept config; using defaults', e);
  }
}

function save() {
  try {
    ensureDir();
    fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save support intercept config', e);
  }
}

load();

export function isSupportInterceptEnabled(guildId: string | null | undefined): boolean {
  if (!guildId) return false;
  return !!cfg[guildId];
}

export function setSupportInterceptEnabled(guildId: string, enabled: boolean) {
  cfg[guildId] = enabled;
  save();
}

export function getSupportInterceptStatus(guildId: string | null | undefined): string {
  if (!guildId) return 'not-applicable';
  return isSupportInterceptEnabled(guildId) ? 'enabled' : 'disabled';
}
