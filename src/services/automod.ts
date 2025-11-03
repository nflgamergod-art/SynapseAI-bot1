import { getDB } from './db';
import { Message } from 'discord.js';

export interface AutoModRule {
  guild_id: string;
  rule_type: 'spam_links' | 'mass_mentions' | 'caps_spam' | 'invite_links';
  enabled: boolean;
  threshold?: number; // For mentions, caps percentage
  action: 'delete' | 'warn' | 'mute' | 'kick';
  mute_duration?: number; // In minutes
}

// Initialize automod tables
export function initAutoModSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS automod_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      rule_type TEXT CHECK(rule_type IN ('spam_links', 'mass_mentions', 'caps_spam', 'invite_links')) NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      threshold INTEGER,
      action TEXT CHECK(action IN ('delete', 'warn', 'mute', 'kick')) NOT NULL DEFAULT 'delete',
      mute_duration INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_automod_guild_type ON automod_rules(guild_id, rule_type);
  `);
}

// Get all rules for a guild
export function getAutoModRules(guildId: string): AutoModRule[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT guild_id, rule_type, enabled, threshold, action, mute_duration
    FROM automod_rules
    WHERE guild_id = ?
  `).all(guildId) as any[];

  return rows.map(row => ({
    guild_id: row.guild_id,
    rule_type: row.rule_type,
    enabled: row.enabled === 1,
    threshold: row.threshold,
    action: row.action,
    mute_duration: row.mute_duration
  }));
}

// Get specific rule
export function getAutoModRule(guildId: string, ruleType: AutoModRule['rule_type']): AutoModRule | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT guild_id, rule_type, enabled, threshold, action, mute_duration
    FROM automod_rules
    WHERE guild_id = ? AND rule_type = ?
  `).get(guildId, ruleType) as any;

  if (!row) return null;

  return {
    guild_id: row.guild_id,
    rule_type: row.rule_type,
    enabled: row.enabled === 1,
    threshold: row.threshold,
    action: row.action,
    mute_duration: row.mute_duration
  };
}

// Set or update a rule
export function setAutoModRule(rule: AutoModRule) {
  const db = getDB();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO automod_rules (guild_id, rule_type, enabled, threshold, action, mute_duration, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, rule_type) DO UPDATE SET
      enabled = excluded.enabled,
      threshold = excluded.threshold,
      action = excluded.action,
      mute_duration = excluded.mute_duration,
      updated_at = excluded.updated_at
  `).run(
    rule.guild_id,
    rule.rule_type,
    rule.enabled ? 1 : 0,
    rule.threshold || null,
    rule.action,
    rule.mute_duration || null,
    now,
    now
  );
}

// Delete a rule
export function deleteAutoModRule(guildId: string, ruleType: AutoModRule['rule_type']) {
  const db = getDB();
  db.prepare(`DELETE FROM automod_rules WHERE guild_id = ? AND rule_type = ?`).run(guildId, ruleType);
}

// Check message against automod rules
export async function checkAutoMod(message: Message): Promise<{ violated: boolean; rule?: AutoModRule; reason?: string }> {
  if (!message.guild) return { violated: false };
  
  const rules = getAutoModRules(message.guild.id);
  const enabledRules = rules.filter(r => r.enabled);

  for (const rule of enabledRules) {
    switch (rule.rule_type) {
      case 'spam_links': {
        const linkRegex = /(https?:\/\/[^\s]+)/gi;
        const links = message.content.match(linkRegex);
        if (links && links.length >= (rule.threshold || 3)) {
          return { violated: true, rule, reason: `Spam links detected (${links.length} links)` };
        }
        break;
      }

      case 'mass_mentions': {
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;
        if (mentionCount >= (rule.threshold || 5)) {
          return { violated: true, rule, reason: `Mass mentions detected (${mentionCount} mentions)` };
        }
        break;
      }

      case 'caps_spam': {
        const content = message.content.replace(/\s/g, '');
        if (content.length < 10) break; // Skip short messages
        const capsCount = (content.match(/[A-Z]/g) || []).length;
        const capsPercentage = (capsCount / content.length) * 100;
        if (capsPercentage >= (rule.threshold || 70)) {
          return { violated: true, rule, reason: `Caps spam detected (${Math.round(capsPercentage)}% caps)` };
        }
        break;
      }

      case 'invite_links': {
        const inviteRegex = /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)[a-zA-Z0-9]+/gi;
        if (inviteRegex.test(message.content)) {
          return { violated: true, rule, reason: 'Discord invite link detected' };
        }
        break;
      }
    }
  }

  return { violated: false };
}

// Initialize schema on import
initAutoModSchema();
