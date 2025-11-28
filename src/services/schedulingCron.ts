import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import {
  getAllStaffAvailability,
  generateWeeklySchedule,
  saveWeeklySchedule,
  getNextWeekStart,
  getAllSchedulesForWeek
} from './scheduling';

let client: Client | null = null;
let scheduleGenerationInterval: NodeJS.Timeout | null = null;

export function initSchedulingCron(discordClient: Client) {
  client = discordClient;
  
  // Generate schedules every Sunday at 6 PM for the following week
  scheduleWeeklyGeneration();
  
  console.log('✅ Scheduling cron jobs initialized');
}

function scheduleWeeklyGeneration() {
  // Calculate time until next Sunday 6 PM
  const now = new Date();
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + (7 - now.getDay()));
  nextSunday.setHours(18, 0, 0, 0);
  
  if (nextSunday <= now) {
    nextSunday.setDate(nextSunday.getDate() + 7);
  }
  
  const msUntilSunday = nextSunday.getTime() - now.getTime();
  
  // Initial timeout
  setTimeout(() => {
    generateAndPostSchedules();
    
    // Then repeat every 7 days
    scheduleGenerationInterval = setInterval(() => {
      generateAndPostSchedules();
    }, 7 * 24 * 60 * 60 * 1000);
  }, msUntilSunday);
  
  console.log(`📅 Schedule generation scheduled for ${nextSunday.toLocaleString()}`);
}

async function generateAndPostSchedules() {
  if (!client) return;
  
  console.log('📋 Generating weekly schedules...');
  
  const { getDB } = await import('./db');
  const db = getDB();
  
  // Get all guilds with payroll enabled
  const guilds = db.prepare(`
    SELECT DISTINCT guild_id FROM payroll_config WHERE is_enabled = 1
  `).all() as any[];
  
  for (const { guild_id } of guilds) {
    try {
      // Check if staff have set availability
      const staffList = getAllStaffAvailability(guild_id);
      
      if (staffList.length === 0) {
        console.log(`⚠️ No staff availability set for guild ${guild_id}, skipping schedule generation`);
        continue;
      }
      
      // Generate next week's schedule
      const nextWeekStart = getNextWeekStart();
      const schedule = generateWeeklySchedule(guild_id, nextWeekStart);
      
      // Save to database
      saveWeeklySchedule(guild_id, nextWeekStart, schedule);
      
      // Post to staff logs channel
      const staffLogsChannelId = process.env.STAFF_LOGS_CHANNEL_ID || process.env.STAFF_CHANNEL_ID;
      
      if (staffLogsChannelId) {
        try {
          const guild = await client.guilds.fetch(guild_id);
          const channel = guild.channels.cache.get(staffLogsChannelId) as TextChannel;
          
          if (channel) {
            const embed = await createScheduleEmbed(guild_id, nextWeekStart, schedule);
            await channel.send({ embeds: [embed] });
            console.log(`✅ Posted schedule for guild ${guild.name}`);
          }
        } catch (err) {
          console.error(`Failed to post schedule to channel for guild ${guild_id}:`, err);
        }
      }
      
      // Send DMs to each staff member
      for (const [userId, days] of schedule.entries()) {
        try {
          const user = await client.users.fetch(userId);
          const embed = await createPersonalScheduleEmbed(days, nextWeekStart);
          await user.send({ embeds: [embed] });
          console.log(`✅ Sent schedule DM to ${user.tag}`);
        } catch (err) {
          console.error(`Failed to send schedule DM to user ${userId}:`, err);
        }
      }
    } catch (error) {
      console.error(`Failed to generate schedule for guild ${guild_id}:`, error);
    }
  }
}

async function createScheduleEmbed(
  guildId: string,
  weekStart: string,
  schedule: Map<string, string[]>
): Promise<EmbedBuilder> {
  const weekStartDate = new Date(weekStart);
  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📅 Weekly Staff Schedule')
    .setDescription(
      `**Week of ${weekStartDate.toLocaleDateString()} - ${weekEndDate.toLocaleDateString()}**\n\n` +
      `Below are the scheduled work days for each staff member this week.`
    )
    .setTimestamp();
  
  // Organize by day
  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const daySchedules = new Map<string, string[]>();
  
  daysOfWeek.forEach(day => daySchedules.set(day, []));
  
  for (const [userId, days] of schedule.entries()) {
    days.forEach(day => {
      const staffList = daySchedules.get(day) || [];
      staffList.push(userId);
      daySchedules.set(day, staffList);
    });
  }
  
  // Add fields for each day
  for (const day of daysOfWeek) {
    const staffIds = daySchedules.get(day) || [];
    const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
    const emoji = getDayEmoji(day);
    
    if (staffIds.length > 0) {
      const staffList = staffIds.map(id => `<@${id}>`).join(', ');
      embed.addFields({
        name: `${emoji} ${dayLabel}`,
        value: staffList,
        inline: false
      });
    } else {
      embed.addFields({
        name: `${emoji} ${dayLabel}`,
        value: '_No staff scheduled_',
        inline: false
      });
    }
  }
  
  embed.setFooter({ text: 'Use /schedule commands to swap shifts or check your schedule' });
  
  return embed;
}

async function createPersonalScheduleEmbed(days: string[], weekStart: string): Promise<EmbedBuilder> {
  const weekStartDate = new Date(weekStart);
  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  
  const embed = new EmbedBuilder()
    .setColor('#57F287')
    .setTitle('📅 Your Work Schedule')
    .setDescription(
      `**Week of ${weekStartDate.toLocaleDateString()} - ${weekEndDate.toLocaleDateString()}**\n\n` +
      `You are scheduled to work **${days.length} day(s)** this week:`
    )
    .setTimestamp();
  
  // List scheduled days with emojis
  const daysList = days.map(day => {
    const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
    const emoji = getDayEmoji(day);
    return `${emoji} **${dayLabel}**`;
  }).join('\n');
  
  embed.addFields({
    name: '🗓️ Your Days',
    value: daysList,
    inline: false
  });
  
  embed.addFields({
    name: '💡 Need to Make Changes?',
    value: 
      '• `/schedule swap` - Request to swap a shift with another staff member\n' +
      '• `/schedule drop` - Drop a shift for others to pick up\n' +
      '• `/schedule view` - View the full weekly schedule',
    inline: false
  });
  
  embed.setFooter({ text: 'You can only clock in on your scheduled days' });
  
  return embed;
}

function getDayEmoji(day: string): string {
  const emojis: { [key: string]: string } = {
    'monday': '📘',
    'tuesday': '📗',
    'wednesday': '📙',
    'thursday': '📕',
    'friday': '📔',
    'saturday': '📓',
    'sunday': '📒'
  };
  
  return emojis[day.toLowerCase()] || '📅';
}

export function stopSchedulingCron() {
  if (scheduleGenerationInterval) {
    clearInterval(scheduleGenerationInterval);
    scheduleGenerationInterval = null;
  }
  
  console.log('⏹️ Scheduling cron jobs stopped');
}
