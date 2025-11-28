import { Client } from 'discord.js';
import { checkMissedShiftsForToday } from './attendanceTracking';

let client: Client | null = null;
let dailyCheckInterval: NodeJS.Timeout | null = null;

export function initAttendanceCron(discordClient: Client) {
  client = discordClient;
  
  // Schedule daily check at 11:59 PM
  scheduleDailyMissedShiftCheck();
  
  console.log('✅ Attendance cron jobs initialized');
}

function scheduleDailyMissedShiftCheck() {
  // Calculate time until next 11:59 PM
  const now = new Date();
  const next1159PM = new Date(now);
  next1159PM.setHours(23, 59, 0, 0);
  
  if (next1159PM <= now) {
    // If 11:59 PM has passed today, schedule for tomorrow
    next1159PM.setDate(next1159PM.getDate() + 1);
  }
  
  const msUntil1159PM = next1159PM.getTime() - now.getTime();
  
  // Initial timeout
  setTimeout(() => {
    runDailyMissedShiftCheck();
    
    // Then repeat every 24 hours
    dailyCheckInterval = setInterval(() => {
      runDailyMissedShiftCheck();
    }, 24 * 60 * 60 * 1000);
  }, msUntil1159PM);
  
  console.log(`📅 Daily missed shift check scheduled for ${next1159PM.toLocaleString()}`);
}

async function runDailyMissedShiftCheck() {
  if (!client) return;
  
  console.log('🔍 Running daily missed shift check...');
  
  const { getDB } = await import('./db');
  const db = getDB();
  
  // Get all guilds with payroll enabled
  const guilds = db.prepare(`
    SELECT DISTINCT guild_id FROM payroll_config WHERE is_enabled = 1
  `).all() as any[];
  
  for (const { guild_id } of guilds) {
    try {
      await checkMissedShiftsForToday(guild_id, client);
      console.log(`✅ Checked missed shifts for guild ${guild_id}`);
    } catch (error) {
      console.error(`❌ Failed to check missed shifts for guild ${guild_id}:`, error);
    }
  }
}

export function stopAttendanceCron() {
  if (dailyCheckInterval) {
    clearInterval(dailyCheckInterval);
    dailyCheckInterval = null;
  }
}
