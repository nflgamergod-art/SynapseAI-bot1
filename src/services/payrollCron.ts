import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { getDB } from './db';
import {
  getAllUnpaidBalances,
  getTotalUnpaidBalance,
  getUnpaidPayPeriods,
  checkDailyLimitReached,
  set24HourCooldown,
  getTodayNetWorkingMinutes,
  getPayrollConfig
} from './payroll';
import { getActiveShift, clockOut } from './shifts';
import { endAutoBreak } from './payroll';

let client: Client | null = null;
let weeklyNotificationInterval: NodeJS.Timeout | null = null;
let dailyOwnerReportInterval: NodeJS.Timeout | null = null;
let limitCheckInterval: NodeJS.Timeout | null = null;

export function initPayrollCron(discordClient: Client) {
  client = discordClient;
  
  // Weekly unpaid balance notifications (every Sunday at 10 AM)
  scheduleWeeklyNotifications();
  
  // Daily owner pay summary (every day at 9 AM)
  scheduleDailyOwnerReport();
  
  // Check time limits every 5 minutes
  scheduleLimitChecks();
  
  console.log('✅ Payroll cron jobs initialized');
}

function scheduleWeeklyNotifications() {
  // Calculate time until next Sunday 10 AM
  const now = new Date();
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + (7 - now.getDay()));
  nextSunday.setHours(10, 0, 0, 0);
  
  if (nextSunday <= now) {
    nextSunday.setDate(nextSunday.getDate() + 7);
  }
  
  const msUntilSunday = nextSunday.getTime() - now.getTime();
  
  // Initial timeout
  setTimeout(() => {
    sendWeeklyUnpaidNotifications();
    
    // Then repeat every 7 days
    weeklyNotificationInterval = setInterval(() => {
      sendWeeklyUnpaidNotifications();
    }, 7 * 24 * 60 * 60 * 1000);
  }, msUntilSunday);
  
  console.log(`📅 Weekly notifications scheduled for ${nextSunday.toLocaleString()}`);
}

function scheduleDailyOwnerReport() {
  // Calculate time until next 9 AM
  const now = new Date();
  const next9AM = new Date(now);
  next9AM.setHours(9, 0, 0, 0);
  
  if (next9AM <= now) {
    next9AM.setDate(next9AM.getDate() + 1);
  }
  
  const msUntil9AM = next9AM.getTime() - now.getTime();
  
  // Initial timeout
  setTimeout(() => {
    sendDailyOwnerReport();
    
    // Then repeat every 24 hours
    dailyOwnerReportInterval = setInterval(() => {
      sendDailyOwnerReport();
    }, 24 * 60 * 60 * 1000);
  }, msUntil9AM);
  
  console.log(`📊 Daily owner reports scheduled for ${next9AM.toLocaleString()}`);
}

function scheduleLimitChecks() {
  // Check every 5 minutes
  limitCheckInterval = setInterval(() => {
    checkAndEnforceLimits();
  }, 5 * 60 * 1000);
  
  // Also run immediately
  checkAndEnforceLimits();
  
  console.log('⏰ Time limit checks scheduled every 5 minutes');
}

async function sendWeeklyUnpaidNotifications() {
  if (!client) return;
  
  console.log('📤 Sending weekly unpaid balance notifications...');
  
  const db = getDB();
  const guilds = db.prepare(`
    SELECT DISTINCT guild_id FROM payroll_config WHERE is_enabled = 1
  `).all() as any[];
  
  for (const { guild_id } of guilds) {
    const unpaidUsers = getAllUnpaidBalances(guild_id);
    
    for (const userData of unpaidUsers) {
      if (userData.totalPay === 0) continue;
      
      try {
        const user = await client.users.fetch(userData.userId);
        const periods = getUnpaidPayPeriods(guild_id, userData.userId);
        
        const embed = new EmbedBuilder()
          .setColor('#FF6B35')
          .setTitle('💰 Weekly Unpaid Balance Reminder')
          .setDescription(`You have **$${userData.totalPay.toFixed(2)}** in unpaid earnings.`)
          .addFields(
            { name: '⏱️ Total Hours', value: `${userData.totalHours.toFixed(2)} hours`, inline: true },
            { name: '📋 Pay Periods', value: `${userData.periods} period(s)`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true }
          )
          .setFooter({ text: 'This reminder will be sent weekly until you are paid.' })
          .setTimestamp();
        
        // Add breakdown of pay periods
        if (periods.length > 0) {
          const breakdown = periods.slice(0, 5).map((period, idx) => {
            const startDate = new Date(period.start_date).toLocaleDateString();
            const endDate = new Date(period.end_date).toLocaleDateString();
            return `${idx + 1}. ${startDate} - ${endDate}: **$${period.total_pay.toFixed(2)}** (${period.total_hours.toFixed(2)}h)`;
          }).join('\n');
          
          embed.addFields({
            name: '📊 Recent Pay Periods',
            value: breakdown + (periods.length > 5 ? `\n_...and ${periods.length - 5} more_` : '')
          });
        }
        
        await user.send({ embeds: [embed] });
        console.log(`✅ Sent weekly notification to ${user.tag}`);
      } catch (error) {
        console.error(`Failed to send weekly notification to user ${userData.userId}:`, error);
      }
    }
  }
}

async function sendDailyOwnerReport() {
  if (!client) return;
  
  console.log('📊 Sending daily owner pay report...');
  
  const db = getDB();
  
  // Get owner ID from environment or config
  const ownerIds = process.env.OWNER_IDS?.split(',') || [];
  if (ownerIds.length === 0) {
    console.warn('⚠️ No OWNER_IDS configured for daily reports');
    return;
  }
  
  const guilds = db.prepare(`
    SELECT DISTINCT guild_id FROM payroll_config WHERE is_enabled = 1
  `).all() as any[];
  
  for (const { guild_id } of guilds) {
    const unpaidUsers = getAllUnpaidBalances(guild_id);
    
    if (unpaidUsers.length === 0) continue;
    
    const totalOwed = unpaidUsers.reduce((sum, u) => sum + u.totalPay, 0);
    const totalHours = unpaidUsers.reduce((sum, u) => sum + u.totalHours, 0);
    
    const embed = new EmbedBuilder()
      .setColor('#FF6B35')
      .setTitle('📊 Daily Payroll Summary')
      .setDescription(`**Total Unpaid:** $${totalOwed.toFixed(2)} across ${unpaidUsers.length} staff members`)
      .addFields(
        { name: '⏱️ Total Unpaid Hours', value: `${totalHours.toFixed(2)} hours`, inline: true },
        { name: '👥 Staff Count', value: `${unpaidUsers.length}`, inline: true },
        { name: '\u200b', value: '\u200b', inline: true }
      )
      .setTimestamp();
    
    // Add top 10 staff by unpaid balance
    const topStaff = unpaidUsers.slice(0, 10).map((u, idx) => {
      return `${idx + 1}. <@${u.userId}>: **$${u.totalPay.toFixed(2)}** (${u.totalHours.toFixed(2)}h, ${u.periods} period(s))`;
    }).join('\n');
    
    if (topStaff) {
      embed.addFields({
        name: '💸 Top Unpaid Staff',
        value: topStaff + (unpaidUsers.length > 10 ? `\n_...and ${unpaidUsers.length - 10} more_` : '')
      });
    }
    
    // Send to all owner IDs
    for (const ownerId of ownerIds) {
      try {
        const owner = await client.users.fetch(ownerId.trim());
        await owner.send({ embeds: [embed] });
        console.log(`✅ Sent daily report to owner ${owner.tag}`);
      } catch (error) {
        console.error(`Failed to send daily report to owner ${ownerId}:`, error);
      }
    }
  }
}

async function checkAndEnforceLimits() {
  if (!client) return;
  
  const db = getDB();
  
  // Get all active shifts
  const activeShifts = db.prepare(`
    SELECT s.id, s.guild_id, s.user_id, s.clock_in
    FROM shifts s
    WHERE s.clock_out IS NULL
  `).all() as any[];
  
  for (const shift of activeShifts) {
    const config = getPayrollConfig(shift.guild_id);
    if (!config.is_enabled) continue;
    
    // Check if user has reached daily limit
    const totalMinutesToday = getTodayNetWorkingMinutes(shift.guild_id, shift.user_id, true);
    const totalHoursToday = totalMinutesToday / 60;
    
    if (totalHoursToday >= config.max_hours_per_day) {
      try {
        // End any active break first
        endAutoBreak(shift.id);
        
        // Clock out the user
        const result = clockOut(shift.guild_id, shift.user_id);
        
        if (result.success) {
          // Set 24-hour cooldown
          set24HourCooldown(shift.guild_id, shift.user_id);
          
          // Notify user
          const user = await client.users.fetch(shift.user_id);
          const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⏰ Auto Clock-Out: Time Limit Reached')
            .setDescription(`You've been automatically clocked out after reaching the **${config.max_hours_per_day} hour daily limit**.`)
            .addFields(
              { name: '📊 Today\'s Total', value: `${totalHoursToday.toFixed(2)} hours`, inline: true },
              { name: '⏳ Cooldown', value: '24 hours', inline: true },
              { name: '\u200b', value: '\u200b', inline: true }
            )
            .setFooter({ text: 'Break time counts toward your daily limit. You can clock in again in 24 hours.' })
            .setTimestamp();
          
          await user.send({ embeds: [embed] });
          console.log(`✅ Auto-clocked out ${user.tag} for reaching daily limit`);
          
          // Also notify in a staff channel if configured
          try {
            const guild = await client.guilds.fetch(shift.guild_id);
            const staffChannelId = process.env.STAFF_CHANNEL_ID;
            if (staffChannelId) {
              const staffChannel = guild.channels.cache.get(staffChannelId) as TextChannel;
              if (staffChannel) {
                await staffChannel.send({
                  content: `⏰ <@${shift.user_id}> has been auto-clocked out for reaching the daily ${config.max_hours_per_day}h limit. 24h cooldown applied.`
                });
              }
            }
          } catch (err) {
            console.error('Failed to notify staff channel:', err);
          }
        }
      } catch (error) {
        console.error(`Failed to auto clock-out user ${shift.user_id}:`, error);
      }
    }
  }
}

export function stopPayrollCron() {
  if (weeklyNotificationInterval) {
    clearInterval(weeklyNotificationInterval);
    weeklyNotificationInterval = null;
  }
  
  if (dailyOwnerReportInterval) {
    clearInterval(dailyOwnerReportInterval);
    dailyOwnerReportInterval = null;
  }
  
  if (limitCheckInterval) {
    clearInterval(limitCheckInterval);
    limitCheckInterval = null;
  }
  
  console.log('⏹️ Payroll cron jobs stopped');
}
