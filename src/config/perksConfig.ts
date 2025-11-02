import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'perks-config.json');

export type PerkId = 'custom_color' | 'priority_support' | 'custom_emoji' | 'channel_suggest' | 'voice_priority' | 'exclusive_role';

export interface PerksConfig {
  enabled: Partial<Record<PerkId, boolean>>;
  roleIds: Partial<Record<PerkId, string>>;       // use an existing role id if provided
  roleNames: Partial<Record<PerkId, string>>;     // otherwise, create/find by this name
  colorRole: { namePattern: string; allowUserSet: boolean };
  emoji: { requireApproval: boolean; approvalChannelId?: string };
}

export function getDefaultPerksConfig(): PerksConfig {
  return {
    enabled: {
      custom_color: true,
      priority_support: true,
      custom_emoji: true,
      channel_suggest: true,
      voice_priority: true,
      exclusive_role: true,
    },
    roleIds: {},
    roleNames: {
      priority_support: 'Priority Support',
      channel_suggest: 'Channel Suggest',
      voice_priority: 'Voice Priority',
      exclusive_role: 'Exclusive VIP'
    },
    colorRole: {
      namePattern: 'cc-{userId}',
      allowUserSet: true
    },
    emoji: {
      requireApproval: false
    }
  };
}

export function readPerksConfig(): PerksConfig {
  try {
    if (!fs.existsSync(FILE)) return getDefaultPerksConfig();
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...getDefaultPerksConfig(), ...parsed } as PerksConfig;
  } catch (e) {
    console.warn('Failed to read perks-config.json, using defaults:', (e as any)?.message ?? e);
    return getDefaultPerksConfig();
  }
}

export function writePerksConfig(cfg: PerksConfig) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write perks-config.json:', e);
  }
}

export function setPerkRoleId(perk: PerkId, roleId: string) {
  const cfg = readPerksConfig();
  cfg.roleIds[perk] = roleId;
  writePerksConfig(cfg);
}

export function getPerkRolePreference(perk: PerkId): { roleId?: string; roleName?: string } {
  const cfg = readPerksConfig();
  return { roleId: cfg.roleIds[perk], roleName: cfg.roleNames[perk] };
}

export function isPerkEnabled(perk: PerkId): boolean {
  const cfg = readPerksConfig();
  const v = cfg.enabled[perk];
  return v === undefined ? true : !!v;
}

export function getEmojiApprovalConfig() {
  const cfg = readPerksConfig();
  return cfg.emoji;
}

export function getColorRoleConfig() {
  const cfg = readPerksConfig();
  return cfg.colorRole;
}
