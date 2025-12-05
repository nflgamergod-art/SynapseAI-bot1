import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import {
  getUPTBalance,
  deductUPT,
  accrueUPT,
  recordMissedShift,
  getMissedScheduledShiftCount,
  clearMissedShifts,
  issueWriteup,
  getWriteupCount,
  clearWriteups,
  getCurrentWeekStart,
  getDayName,
  isScheduledToday
} from './scheduling';

// Handle successful clock-in - accrue UPT
export function handleClockIn(guildId: string, userId: string): void {
  // Award 15 minutes of UPT for showing up
  accrueUPT(guildId, userId, 15);
  console.log(`✅ [UPT] ${userId} earned 15 minutes of UPT for clocking in`);
}

// Handle late clock-in - deduct UPT if available
export async function handleLateClockIn(
  guildId: string,
  userId: string,
  minutesLate: number,
  client: Client
): Promise<{ uptUsed: boolean; message: string }> {
  const uptBalance = getUPTBalance(guildId, userId);
  const today = new Date().toISOString().split('T')[0];
  
  if (uptBalance >= minutesLate) {
    // Deduct UPT to cover lateness
    deductUPT(guildId, userId, minutesLate, 'late', today);
    console.log(`⚠️ [UPT] ${userId} used ${minutesLate} minutes of UPT for being late (${uptBalance - minutesLate} minutes remaining)`);
    
    return {
      uptUsed: true,
      message: `⚠️ You were ${minutesLate} minutes late. ${minutesLate} minutes of UPT was automatically deducted.\n💳 Remaining UPT: ${uptBalance - minutesLate} minutes`
    };
  } else {
    // Not enough UPT - issue warning/write-up
    console.log(`❌ [UPT] ${userId} was late but insufficient UPT (has ${uptBalance}, needs ${minutesLate})`);
    
    // Issue write-up for unexcused lateness
    issueWriteup(
      guildId,
      userId,
      `Late clock-in by ${minutesLate} minutes with insufficient UPT`,
      client.user!.id,
      'standard',
      `Required ${minutesLate} minutes of UPT but only had ${uptBalance} minutes available`
    );
    
    const writeupCount = getWriteupCount(guildId, userId);
    
    if (writeupCount >= 3) {
      await handleAutoDemotion(guildId, userId, 'Three write-ups accumulated', client);
      return {
        uptUsed: false,
        message: `❌ You were ${minutesLate} minutes late without sufficient UPT (${uptBalance} minutes available).\n⚠️ Write-up issued (${writeupCount} total).\n📉 **You have been demoted due to 3 write-ups.**`
      };
    }
    
    return {
      uptUsed: false,
      message: `❌ You were ${minutesLate} minutes late without sufficient UPT (${uptBalance} minutes available).\n⚠️ Write-up issued (${writeupCount}/3). **3 write-ups = automatic demotion.**`
    };
  }
}

// Handle missed SCHEDULED shift
export async function handleMissedScheduledShift(
  guildId: string,
  userId: string,
  client: Client
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const dayOfWeek = getDayName(new Date()).toLowerCase();
  const weekStart = getCurrentWeekStart();
  const uptBalance = getUPTBalance(guildId, userId);
  
  // Full shift absence = 300 minutes (5 hours)
  const FULL_SHIFT_MINUTES = 300;
  
  if (uptBalance >= FULL_SHIFT_MINUTES) {
    // UPT covers the absence
    deductUPT(guildId, userId, FULL_SHIFT_MINUTES, 'absence', today);
    recordMissedShift(guildId, userId, today, weekStart, dayOfWeek, true);
    
    console.log(`⚠️ [Missed Shift] ${userId} missed scheduled shift but covered by UPT (${uptBalance - FULL_SHIFT_MINUTES} minutes remaining)`);
    
    // Notify user via DM
    try {
      const user = await client.users.fetch(userId);
      await user.send({
        embeds: [new EmbedBuilder()
          .setTitle('⚠️ Missed Scheduled Shift')
          .setDescription(`You missed your scheduled shift today (${dayOfWeek}).`)
          .addFields(
            { name: 'UPT Used', value: `${FULL_SHIFT_MINUTES} minutes (5 hours)` },
            { name: 'Remaining UPT', value: `${uptBalance - FULL_SHIFT_MINUTES} minutes` }
          )
          .setColor(0xFFA500)
          .setTimestamp()
        ]
      });
    } catch (error) {
      console.error(`Failed to DM user ${userId} about missed shift:`, error);
    }
  } else {
    // Not enough UPT - counts as missed shift
    recordMissedShift(guildId, userId, today, weekStart, dayOfWeek, false);
    
    const missedCount = getMissedScheduledShiftCount(guildId, userId);
    console.log(`❌ [Missed Shift] ${userId} missed scheduled shift without UPT coverage (${missedCount} total)`);
    
    // Issue write-up
    issueWriteup(
      guildId,
      userId,
      `No-call no-show for scheduled shift`,
      client.user!.id,
      'severe',
      `Missed ${dayOfWeek} shift with insufficient UPT (${uptBalance} minutes available, needed ${FULL_SHIFT_MINUTES})`
    );
    
    const writeupCount = getWriteupCount(guildId, userId);
    
    if (missedCount >= 2 || writeupCount >= 3) {
      // Demote for either 2 missed scheduled shifts OR 3 write-ups
      const reason = missedCount >= 2 
        ? `Missed ${missedCount} scheduled shifts` 
        : `Accumulated ${writeupCount} write-ups`;
      await handleAutoDemotion(guildId, userId, reason, client);
    } else {
      // Notify user via DM
      try {
        const user = await client.users.fetch(userId);
        await user.send({
          embeds: [new EmbedBuilder()
            .setTitle('❌ Missed Scheduled Shift')
            .setDescription(`You missed your scheduled shift today (${dayOfWeek}) without sufficient UPT.`)
            .addFields(
              { name: 'UPT Available', value: `${uptBalance} minutes (needed ${FULL_SHIFT_MINUTES})` },
              { name: 'Missed Shifts', value: `${missedCount}/2 ⚠️` },
              { name: 'Write-ups', value: `${writeupCount}/3 ⚠️` },
              { name: '⚠️ Warning', value: '**2 missed scheduled shifts = demotion**\n**3 write-ups = demotion**' }
            )
            .setColor(0xFF0000)
            .setTimestamp()
          ]
        });
      } catch (error) {
        console.error(`Failed to DM user ${userId} about missed shift:`, error);
      }
    }
  }
}

// Handle automatic demotion
export async function handleAutoDemotion(
  guildId: string,
  userId: string,
  reason: string,
  client: Client
): Promise<void> {
  console.log(`📉 [Auto-Demotion] ${userId} - Reason: ${reason}`);
  
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    
    const { PROMOTION_CONFIG } = await import('../config/promotionConfig');
    
    // Determine current role and demote
    let demoted = false;
    if (member.roles.cache.has(PROMOTION_CONFIG.roles.headSupport)) {
      // Head Support → Support
      await member.roles.remove(PROMOTION_CONFIG.roles.headSupport);
      await member.roles.add(PROMOTION_CONFIG.roles.support);
      demoted = true;
    } else if (member.roles.cache.has(PROMOTION_CONFIG.roles.support)) {
      // Support → Trial Support
      await member.roles.remove(PROMOTION_CONFIG.roles.support);
      await member.roles.add(PROMOTION_CONFIG.roles.trialSupport);
      demoted = true;
    } else if (member.roles.cache.has(PROMOTION_CONFIG.roles.trialSupport)) {
      // Trial Support → Remove (back to member)
      await member.roles.remove(PROMOTION_CONFIG.roles.trialSupport);
      demoted = true;
    }
    
    if (!demoted) {
      console.log(`⚠️ [Auto-Demotion] ${userId} has no staff role to demote from`);
      return;
    }
    
    // Clear missed shifts and write-ups after demotion
    clearMissedShifts(guildId, userId);
    clearWriteups(guildId, userId);
    
    // Notify user
    try {
      await member.send({
        embeds: [new EmbedBuilder()
          .setTitle('📉 Automatic Demotion')
          .setDescription(`You have been automatically demoted.`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Next Steps', value: 'Focus on attendance and performance to earn a promotion back.' }
          )
          .setColor(0xFF0000)
          .setTimestamp()
        ]
      });
    } catch (error) {
      console.error(`Failed to DM user ${userId} about demotion:`, error);
    }
    
    // Log to staff channel
    const staffChannelId = process.env.STAFF_LOGS_CHANNEL_ID || process.env.STAFF_CHANNEL_ID;
    if (staffChannelId) {
      const staffChannel = await client.channels.fetch(staffChannelId) as TextChannel;
      await staffChannel.send({
        embeds: [new EmbedBuilder()
          .setTitle('📉 Automatic Demotion')
          .setDescription(`<@${userId}> has been automatically demoted.`)
          .addFields({ name: 'Reason', value: reason })
          .setColor(0xFF0000)
          .setTimestamp()
        ]
      });
    }
  } catch (error) {
    console.error(`Failed to process auto-demotion for ${userId}:`, error);
  }
}

// Check if user was scheduled today and didn't clock in (call this at end of day)
export async function checkMissedShiftsForToday(guildId: string, client: Client): Promise<void> {
  const { getDB } = await import('./db');
  const db = getDB();
  const today = new Date().toISOString().split('T')[0];
  const dayOfWeek = getDayName(new Date()).toLowerCase();
  const weekStart = getCurrentWeekStart();
  
  // Get all staff scheduled today
  const scheduledStaff = db.prepare(`
    SELECT user_id, assigned_days FROM staff_schedules
    WHERE guild_id = ? AND week_start = ?
  `).all(guildId, weekStart) as any[];
  
  for (const staff of scheduledStaff) {
    const assignedDays = JSON.parse(staff.assigned_days);
    
    if (assignedDays.includes(dayOfWeek)) {
      // Check if they clocked in today
      const clockedIn = db.prepare(`
        SELECT id FROM shifts
        WHERE guild_id = ? AND user_id = ? AND date = ?
      `).get(guildId, staff.user_id, today);
      
      if (!clockedIn) {
        // They were scheduled but didn't clock in
        await handleMissedScheduledShift(guildId, staff.user_id, client);
      }
    }
  }
}
