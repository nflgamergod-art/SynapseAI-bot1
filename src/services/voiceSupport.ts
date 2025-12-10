/**
 * Voice Support Integration
 * Creates temporary voice channels for complex ticket support
 * Auto-transcripts and tracks voice support time
 */

import { Client, VoiceChannel, ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getDB } from './db';

export interface VoiceSession {
  id: number;
  guild_id: string;
  ticket_id: number;
  channel_id: string;
  staff_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  transcript: string | null;
}

// Initialize voice support schema
export function initVoiceSupportSchema() {
  const db = getDB();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      ticket_id INTEGER NOT NULL,
      channel_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_minutes INTEGER,
      transcript TEXT,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_voice_sessions_ticket ON voice_sessions(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_voice_sessions_staff ON voice_sessions(staff_id);
  `);
  
  console.log('✅ Voice Support schema initialized');
}

// Create a voice channel for ticket support
export async function createVoiceSupport(
  client: Client,
  guildId: string,
  ticketId: number,
  staffId: string,
  userId: string,
  channelName?: string
): Promise<{ success: boolean; channel?: VoiceChannel; error?: string }> {
  try {
    const guild = await client.guilds.fetch(guildId);
    const { getTicket } = await import('./tickets');
    const ticket = getTicket(ticketId.toString());
    
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }
    
    // Create voice channel
    const voiceChannel = await guild.channels.create({
      name: channelName || `🎙️ Ticket #${ticketId} Voice`,
      type: ChannelType.GuildVoice,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: staffId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        },
        {
          id: userId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        }
      ]
    });
    
    // Save session to database
    const db = getDB();
    const result = db.prepare(`
      INSERT INTO voice_sessions (guild_id, ticket_id, channel_id, staff_id, user_id, started_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(guildId, ticketId, voiceChannel.id, staffId, userId);
    
    console.log(`🎙️ Voice support channel created for ticket #${ticketId} (Session ID: ${result.lastInsertRowid})`);
    
    return { success: true, channel: voiceChannel as VoiceChannel };
  } catch (error) {
    console.error('Failed to create voice support channel:', error);
    return { success: false, error: String(error) };
  }
}

// End voice session and cleanup
export async function endVoiceSession(
  client: Client,
  sessionId: number,
  transcript?: string
): Promise<{ success: boolean; duration?: number }> {
  try {
    const db = getDB();
    const session = db.prepare('SELECT * FROM voice_sessions WHERE id = ?').get(sessionId) as VoiceSession | undefined;
    
    if (!session) {
      return { success: false };
    }
    
    // Calculate duration
    const startTime = new Date(session.started_at).getTime();
    const endTime = Date.now();
    const durationMinutes = Math.floor((endTime - startTime) / 60000);
    
    // Update session
    db.prepare(`
      UPDATE voice_sessions 
      SET ended_at = datetime('now'), duration_minutes = ?, transcript = ?
      WHERE id = ?
    `).run(durationMinutes, transcript || null, sessionId);
    
    // Delete voice channel
    try {
      const guild = await client.guilds.fetch(session.guild_id);
      const channel = await guild.channels.fetch(session.channel_id);
      if (channel) await channel.delete();
    } catch (err) {
      console.error('Failed to delete voice channel:', err);
    }
    
    console.log(`🎙️ Voice session ${sessionId} ended (${durationMinutes} minutes)`);
    
    return { success: true, duration: durationMinutes };
  } catch (error) {
    console.error('Failed to end voice session:', error);
    return { success: false };
  }
}

// Get active voice sessions for a ticket
export function getActiveVoiceSession(ticketId: number): VoiceSession | null {
  const db = getDB();
  const session = db.prepare(`
    SELECT * FROM voice_sessions 
    WHERE ticket_id = ? AND ended_at IS NULL
    ORDER BY started_at DESC LIMIT 1
  `).get(ticketId) as VoiceSession | undefined;
  
  return session || null;
}

// Get voice session history for a ticket
export function getVoiceSessionHistory(ticketId: number): VoiceSession[] {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM voice_sessions 
    WHERE ticket_id = ? 
    ORDER BY started_at DESC
  `).all(ticketId) as VoiceSession[];
}

// Get staff voice support stats
export function getStaffVoiceStats(guildId: string, staffId: string): {
  total_sessions: number;
  total_minutes: number;
  avg_duration: number;
} {
  const db = getDB();
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_sessions,
      COALESCE(SUM(duration_minutes), 0) as total_minutes,
      COALESCE(AVG(duration_minutes), 0) as avg_duration
    FROM voice_sessions
    WHERE guild_id = ? AND staff_id = ? AND ended_at IS NOT NULL
  `).get(guildId, staffId) as any;
  
  return {
    total_sessions: stats.total_sessions || 0,
    total_minutes: stats.total_minutes || 0,
    avg_duration: Math.round(stats.avg_duration || 0)
  };
}
