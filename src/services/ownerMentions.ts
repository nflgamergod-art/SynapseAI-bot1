import * as fs from 'fs';
import * as path from 'path';

const MENTION_CONFIG_FILE = path.join(__dirname, '../../data/ownerMentions.json');

interface MentionConfig {
  pobkc: boolean;
  joycemember: boolean;
}

let config: MentionConfig = { pobkc: true, joycemember: true };

function ensureDataDir() {
  const dir = path.dirname(MENTION_CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(MENTION_CONFIG_FILE)) {
      const data = fs.readFileSync(MENTION_CONFIG_FILE, 'utf8');
      config = JSON.parse(data);
    }
  } catch (err) {
    console.warn('Failed to load owner mention config; using defaults:', err);
  }
}

function saveConfig() {
  try {
    ensureDataDir();
    fs.writeFileSync(MENTION_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save owner mention config:', err);
  }
}

// Initialize on import
loadConfig();

export function isMentionEnabled(owner: 'pobkc' | 'joycemember'): boolean {
  return config[owner] ?? true;
}

export function setMentionEnabled(owner: 'pobkc' | 'joycemember', enabled: boolean) {
  config[owner] = enabled;
  saveConfig();
}

export function getMentionConfig(): MentionConfig {
  return { ...config };
}

export function formatOwnerReference(owner: 'pobkc' | 'joycemember'): string {
  const ids = { pobkc: '1272923881052704820', joycemember: '840586296044421160' };
  const names = { pobkc: 'PobKC', joycemember: 'Joycemember' };
  if (isMentionEnabled(owner)) {
    return `<@${ids[owner]}>`;
  }
  return names[owner];
}
