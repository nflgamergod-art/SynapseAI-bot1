import { getDB } from './db';

export interface StatsChannelConfig {
  guild_id: string;
  channel_type: 'member_count' | 'online_count' | 'bot_count' | 'role_count' | 'channel_count';
  channel_id: string;
  format: string; // e.g., "Members: {count}"
  enabled: boolean;
}

// Initialize stats channels table
export function initStatsChannelsSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS stats_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_type TEXT CHECK(channel_type IN ('member_count', 'online_count', 'bot_count', 'role_count', 'channel_count')) NOT NULL,
      channel_id TEXT NOT NULL UNIQUE,
      format TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_updated TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stats_guild ON stats_channels(guild_id);
  `);
}

// Add or update stats channel
export function setStatsChannel(config: StatsChannelConfig): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO stats_channels (guild_id, channel_type, channel_id, format, enabled)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET
      channel_type = excluded.channel_type,
      format = excluded.format,
      enabled = excluded.enabled
  `).run(
    config.guild_id,
    config.channel_type,
    config.channel_id,
    config.format,
    config.enabled ? 1 : 0
  );
}

// Get all stats channels for a guild
export function getStatsChannels(guildId: string): StatsChannelConfig[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT guild_id, channel_type, channel_id, format, enabled
    FROM stats_channels
    WHERE guild_id = ?
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    guild_id: row.guild_id,
    channel_type: row.channel_type,
    channel_id: row.channel_id,
    format: row.format,
    enabled: row.enabled === 1
  }));
}

// Remove stats channel
export function removeStatsChannel(channelId: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    DELETE FROM stats_channels WHERE channel_id = ?
  `).run(channelId);
  
  return result.changes > 0;
}

// Update last updated timestamp
export function updateStatsChannelTimestamp(channelId: string): void {
  const db = getDB();
  db.prepare(`
    UPDATE stats_channels
    SET last_updated = ?
    WHERE channel_id = ?
  `).run(new Date().toISOString(), channelId);
}

// Get all enabled stats channels across all guilds
export function getAllEnabledStatsChannels(): StatsChannelConfig[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT guild_id, channel_type, channel_id, format, enabled
    FROM stats_channels
    WHERE enabled = 1
  `).all() as any[];
  
  return rows.map(row => ({
    guild_id: row.guild_id,
    channel_type: row.channel_type,
    channel_id: row.channel_id,
    format: row.format,
    enabled: row.enabled === 1
  }));
}

// Initialize schema on import
initStatsChannelsSchema();
