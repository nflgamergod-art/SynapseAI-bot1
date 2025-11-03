import { getDB } from './db';

export interface TempChannelConfig {
  guild_id: string;
  trigger_channel_id: string;
  channel_type: 'voice' | 'text';
  name_template: string; // e.g., "{user}'s Channel"
  category_id?: string;
  user_limit?: number;
  enabled: boolean;
}

export interface TempChannel {
  id: number;
  guild_id: string;
  channel_id: string;
  owner_id: string;
  created_at: string;
}

// Initialize temp channels tables
export function initTempChannelsSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS temp_channel_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      trigger_channel_id TEXT NOT NULL UNIQUE,
      channel_type TEXT CHECK(channel_type IN ('voice', 'text')) NOT NULL,
      name_template TEXT NOT NULL,
      category_id TEXT,
      user_limit INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_tempconfig_guild ON temp_channel_configs(guild_id);
    
    CREATE TABLE IF NOT EXISTS temp_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tempchannels_guild ON temp_channels(guild_id);
  `);
}

// Add temp channel config
export function setTempChannelConfig(config: TempChannelConfig): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO temp_channel_configs (guild_id, trigger_channel_id, channel_type, name_template, category_id, user_limit, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trigger_channel_id) DO UPDATE SET
      channel_type = excluded.channel_type,
      name_template = excluded.name_template,
      category_id = excluded.category_id,
      user_limit = excluded.user_limit,
      enabled = excluded.enabled
  `).run(
    config.guild_id,
    config.trigger_channel_id,
    config.channel_type,
    config.name_template,
    config.category_id || null,
    config.user_limit || null,
    config.enabled ? 1 : 0
  );
}

// Get temp channel config by trigger
export function getTempChannelConfig(triggerChannelId: string): TempChannelConfig | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT guild_id, trigger_channel_id, channel_type, name_template, category_id, user_limit, enabled
    FROM temp_channel_configs
    WHERE trigger_channel_id = ? AND enabled = 1
  `).get(triggerChannelId) as any;
  
  if (!row) return null;
  
  return {
    guild_id: row.guild_id,
    trigger_channel_id: row.trigger_channel_id,
    channel_type: row.channel_type,
    name_template: row.name_template,
    category_id: row.category_id,
    user_limit: row.user_limit,
    enabled: row.enabled === 1
  };
}

// Get all configs for a guild
export function getGuildTempChannelConfigs(guildId: string): TempChannelConfig[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT guild_id, trigger_channel_id, channel_type, name_template, category_id, user_limit, enabled
    FROM temp_channel_configs
    WHERE guild_id = ?
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    guild_id: row.guild_id,
    trigger_channel_id: row.trigger_channel_id,
    channel_type: row.channel_type,
    name_template: row.name_template,
    category_id: row.category_id,
    user_limit: row.user_limit,
    enabled: row.enabled === 1
  }));
}

// Register a temp channel
export function registerTempChannel(guildId: string, channelId: string, ownerId: string): void {
  const db = getDB();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO temp_channels (guild_id, channel_id, owner_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, channelId, ownerId, now);
}

// Get temp channel info
export function getTempChannel(channelId: string): TempChannel | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT id, guild_id, channel_id, owner_id, created_at
    FROM temp_channels
    WHERE channel_id = ?
  `).get(channelId) as any;
  
  if (!row) return null;
  
  return {
    id: row.id,
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    owner_id: row.owner_id,
    created_at: row.created_at
  };
}

// Remove temp channel from tracking
export function removeTempChannel(channelId: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    DELETE FROM temp_channels WHERE channel_id = ?
  `).run(channelId);
  
  return result.changes > 0;
}

// Get all temp channels for a guild
export function getGuildTempChannels(guildId: string): TempChannel[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, guild_id, channel_id, owner_id, created_at
    FROM temp_channels
    WHERE guild_id = ?
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    owner_id: row.owner_id,
    created_at: row.created_at
  }));
}

// Remove temp channel config
export function removeTempChannelConfig(triggerChannelId: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    DELETE FROM temp_channel_configs WHERE trigger_channel_id = ?
  `).run(triggerChannelId);
  
  return result.changes > 0;
}

// Initialize schema on import
initTempChannelsSchema();
