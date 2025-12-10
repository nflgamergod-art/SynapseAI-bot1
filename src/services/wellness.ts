/**
 * Break Reminders & Wellness
 * Mandatory break reminders, hydration alerts, burnout prevention
 */

import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { getDB } from './db';

export interface WellnessConfig {
  guild_id: string;
  break_reminder_hours: number;
  hydration_reminder_minutes: number;
  overtime_warning_hours: number;
  burnout_threshold_hours_weekly: number;
  enabled: number;
}

export interface WellnessReminder {
  id: number;
  user_id: string;
  guild_id: string;
  reminder_type: 'break' | 'hydration' | 'stretch' | 'overtime' | 'burnout';
  sent_at: string;
  acknowledged: number;
}

// Initialize wellness schema
export function initWellnessSchema() {
  const db = getDB();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS wellness_config (
      guild_id TEXT PRIMARY KEY,
      break_reminder_hours REAL DEFAULT 2.0,
      hydration_reminder_minutes INTEGER DEFAULT 30,
      overtime_warning_hours REAL DEFAULT 6.0,
      burnout_threshold_hours_weekly REAL DEFAULT 40.0,
      enabled INTEGER DEFAULT 1
    );
    
    CREATE TABLE IF NOT EXISTS wellness_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      reminder_type TEXT NOT NULL,
      sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
      acknowledged INTEGER DEFAULT 0
    );
    
    CREATE INDEX IF NOT EXISTS idx_wellness_reminders_user ON wellness_reminders(user_id, guild_id);
  `);
  
  console.log('✅ Wellness system schema initialized');
}

// Set wellness configuration
export function setWellnessConfig(config: Partial<WellnessConfig> & { guild_id: string }): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO wellness_config (
      guild_id, break_reminder_hours, hydration_reminder_minutes, 
      overtime_warning_hours, burnout_threshold_hours_weekly, enabled
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      break_reminder_hours = COALESCE(excluded.break_reminder_hours, wellness_config.break_reminder_hours),
      hydration_reminder_minutes = COALESCE(excluded.hydration_reminder_minutes, wellness_config.hydration_reminder_minutes),
      overtime_warning_hours = COALESCE(excluded.overtime_warning_hours, wellness_config.overtime_warning_hours),
      burnout_threshold_hours_weekly = COALESCE(excluded.burnout_threshold_hours_weekly, wellness_config.burnout_threshold_hours_weekly),
      enabled = COALESCE(excluded.enabled, wellness_config.enabled)
  `).run(
    config.guild_id,
    config.break_reminder_hours ?? null,
    config.hydration_reminder_minutes ?? null,
    config.overtime_warning_hours ?? null,
    config.burnout_threshold_hours_weekly ?? null,
    config.enabled !== undefined ? (config.enabled ? 1 : 0) : null
  );
  
  console.log(`💚 Wellness config updated for guild ${config.guild_id}`);
}

// Get wellness configuration
export function getWellnessConfig(guildId: string): WellnessConfig | null {
  const db = getDB();
  
  let config = db.prepare(`
    SELECT * FROM wellness_config WHERE guild_id = ?
  `).get(guildId) as WellnessConfig | undefined;
  
  if (!config) {
    // Create default config
    db.prepare(`
      INSERT INTO wellness_config (guild_id) VALUES (?)
    `).run(guildId);
    
    config = db.prepare(`
      SELECT * FROM wellness_config WHERE guild_id = ?
    `).get(guildId) as WellnessConfig;
  }
  
  return config;
}

// Log wellness reminder
export function logWellnessReminder(
  userId: string,
  guildId: string,
  type: 'break' | 'hydration' | 'stretch' | 'overtime' | 'burnout'
): number {
  const db = getDB();
  
  const result = db.prepare(`
    INSERT INTO wellness_reminders (user_id, guild_id, reminder_type)
    VALUES (?, ?, ?)
  `).run(userId, guildId, type);
  
  return result.lastInsertRowid as number;
}

// Acknowledge wellness reminder
export function acknowledgeReminder(reminderId: number): void {
  const db = getDB();
  
  db.prepare(`
    UPDATE wellness_reminders 
    SET acknowledged = 1 
    WHERE id = ?
  `).run(reminderId);
}

// Check if user needs break reminder
export function needsBreakReminder(userId: string, guildId: string): boolean {
  const config = getWellnessConfig(guildId);
  if (!config || !config.enabled) return false;
  
  const { getActiveShift } = require('./shifts');
  const shift = getActiveShift(guildId, userId);
  
  if (!shift) return false;
  
  const clockInTime = new Date(shift.clock_in).getTime();
  const now = Date.now();
  const hoursWorked = (now - clockInTime) / (1000 * 60 * 60);
  
  // Check if user worked more than threshold hours
  if (hoursWorked >= config.break_reminder_hours) {
    // Check if we already sent a reminder recently (within last 30 mins)
    const db = getDB();
    const recentReminder = db.prepare(`
      SELECT * FROM wellness_reminders 
      WHERE user_id = ? AND guild_id = ? AND reminder_type = 'break'
      AND datetime(sent_at) > datetime('now', '-30 minutes')
      ORDER BY sent_at DESC LIMIT 1
    `).get(userId, guildId);
    
    return !recentReminder;
  }
  
  return false;
}

// Check if user is working overtime
export function isWorkingOvertime(userId: string, guildId: string): boolean {
  const config = getWellnessConfig(guildId);
  if (!config || !config.enabled) return false;
  
  const { getActiveShift } = require('./shifts');
  const shift = getActiveShift(guildId, userId);
  
  if (!shift) return false;
  
  const clockInTime = new Date(shift.clock_in).getTime();
  const now = Date.now();
  const hoursWorked = (now - clockInTime) / (1000 * 60 * 60);
  
  return hoursWorked >= config.overtime_warning_hours;
}

// Check if user is at risk of burnout
export function checkBurnoutRisk(userId: string, guildId: string): { 
  atRisk: boolean; 
  hoursThisWeek: number; 
  threshold: number 
} {
  const config = getWellnessConfig(guildId);
  if (!config || !config.enabled) {
    return { atRisk: false, hoursThisWeek: 0, threshold: 40 };
  }
  
  const db = getDB();
  
  // Get hours worked in last 7 days
  const stats = db.prepare(`
    SELECT 
      COALESCE(SUM(
        CAST((julianday(COALESCE(clock_out, datetime('now'))) - julianday(clock_in)) * 24 * 60 AS INTEGER)
      ), 0) as total_minutes
    FROM shifts
    WHERE guild_id = ? AND user_id = ?
    AND datetime(clock_in) >= datetime('now', '-7 days')
  `).get(guildId, userId) as any;
  
  const hoursThisWeek = (stats?.total_minutes || 0) / 60;
  const atRisk = hoursThisWeek >= config.burnout_threshold_hours_weekly;
  
  return {
    atRisk,
    hoursThisWeek: Math.round(hoursThisWeek * 10) / 10,
    threshold: config.burnout_threshold_hours_weekly
  };
}

// Send break reminder DM
export async function sendBreakReminder(client: Client, userId: string, guildId: string): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId);
    const reminderId = logWellnessReminder(userId, guildId, 'break');
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('☕ Time for a Break!')
      .setDescription('You\'ve been working for a while. Taking regular breaks helps maintain focus and prevents burnout.')
      .addFields(
        { name: '🧘 Suggestions', value: '• Stand up and stretch\n• Get some water\n• Take a short walk\n• Rest your eyes', inline: false },
        { name: '⏰ Recommended', value: '5-10 minute break', inline: true }
      )
      .setFooter({ text: 'Your wellness matters! 💚' })
      .setTimestamp();
    
    await user.send({ embeds: [embed] });
    console.log(`☕ Break reminder sent to ${userId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send break reminder to ${userId}:`, error);
    return false;
  }
}

// Send hydration reminder
export async function sendHydrationReminder(client: Client, userId: string, guildId: string): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId);
    logWellnessReminder(userId, guildId, 'hydration');
    
    const embed = new EmbedBuilder()
      .setColor(0x00BFFF)
      .setTitle('💧 Hydration Reminder')
      .setDescription('Stay hydrated! Drinking water regularly helps you stay alert and focused.')
      .addFields(
        { name: '💡 Tip', value: 'Keep a water bottle at your desk and take regular sips throughout your shift.', inline: false }
      )
      .setFooter({ text: 'Your health is important! 💙' })
      .setTimestamp();
    
    await user.send({ embeds: [embed] });
    console.log(`💧 Hydration reminder sent to ${userId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send hydration reminder to ${userId}:`, error);
    return false;
  }
}

// Send overtime warning
export async function sendOvertimeWarning(client: Client, userId: string, guildId: string): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId);
    logWellnessReminder(userId, guildId, 'overtime');
    
    const { getActiveShift } = require('./shifts');
    const shift = getActiveShift(guildId, userId);
    const hoursWorked = shift ? Math.round((Date.now() - new Date(shift.clock_in).getTime()) / (1000 * 60 * 60) * 10) / 10 : 0;
    
    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('⚠️ Overtime Alert')
      .setDescription(`You've been working for **${hoursWorked} hours** today. Consider taking a break or clocking out soon.`)
      .addFields(
        { name: '🚨 Warning', value: 'Extended work hours can lead to fatigue and decreased performance.', inline: false },
        { name: '💡 Suggestion', value: 'If possible, consider clocking out and resuming tomorrow when you\'re refreshed.', inline: false }
      )
      .setFooter({ text: 'Your wellbeing comes first! 🧡' })
      .setTimestamp();
    
    await user.send({ embeds: [embed] });
    console.log(`⚠️ Overtime warning sent to ${userId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send overtime warning to ${userId}:`, error);
    return false;
  }
}

// Send burnout risk alert
export async function sendBurnoutAlert(client: Client, userId: string, guildId: string): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId);
    const burnout = checkBurnoutRisk(userId, guildId);
    logWellnessReminder(userId, guildId, 'burnout');
    
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🚨 Burnout Risk Alert')
      .setDescription(`You've worked **${burnout.hoursThisWeek} hours** this week (threshold: ${burnout.threshold} hours).`)
      .addFields(
        { name: '⚠️ Warning', value: 'You may be at risk of burnout. Please prioritize rest and recovery.', inline: false },
        { name: '💡 Recommendations', value: '• Take the rest of the week off if possible\n• Talk to management about workload\n• Practice self-care activities\n• Get adequate sleep', inline: false }
      )
      .setFooter({ text: 'Your mental health matters! ❤️' })
      .setTimestamp();
    
    await user.send({ embeds: [embed] });
    console.log(`🚨 Burnout alert sent to ${userId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send burnout alert to ${userId}:`, error);
    return false;
  }
}

// Start wellness monitoring (call this in a setInterval)
export async function monitorWellness(client: Client): Promise<void> {
  const db = getDB();
  const guilds = db.prepare(`
    SELECT DISTINCT guild_id FROM wellness_config WHERE enabled = 1
  `).all() as { guild_id: string }[];
  
  for (const { guild_id } of guilds) {
    const { getActiveStaff } = require('./shifts');
    const activeStaff = getActiveStaff(guild_id);
    
    for (const shift of activeStaff) {
      // Check break reminder
      if (needsBreakReminder(shift.user_id, guild_id)) {
        await sendBreakReminder(client, shift.user_id, guild_id);
      }
      
      // Check overtime
      if (isWorkingOvertime(shift.user_id, guild_id)) {
        // Only send if not sent in last 2 hours
        const recentWarning = db.prepare(`
          SELECT * FROM wellness_reminders 
          WHERE user_id = ? AND guild_id = ? AND reminder_type = 'overtime'
          AND datetime(sent_at) > datetime('now', '-2 hours')
          LIMIT 1
        `).get(shift.user_id, guild_id);
        
        if (!recentWarning) {
          await sendOvertimeWarning(client, shift.user_id, guild_id);
        }
      }
      
      // Check burnout risk (daily check)
      const burnout = checkBurnoutRisk(shift.user_id, guild_id);
      if (burnout.atRisk) {
        const recentAlert = db.prepare(`
          SELECT * FROM wellness_reminders 
          WHERE user_id = ? AND guild_id = ? AND reminder_type = 'burnout'
          AND datetime(sent_at) > datetime('now', '-24 hours')
          LIMIT 1
        `).get(shift.user_id, guild_id);
        
        if (!recentAlert) {
          await sendBurnoutAlert(client, shift.user_id, guild_id);
        }
      }
    }
  }
}
