// Add logs at the start of the bot's execution
console.log('--- Bot Initialization ---');

import * as dotenv from "dotenv";
import * as path from "path";
// Ensure .env loads reliably in production: dist/ -> project root
const envPath = path.join(__dirname, "../.env");
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  console.warn(`[Env] Failed to load .env at ${envPath}:`, dotenvResult.error.message);
} else {
  console.log(`[Env] Loaded .env from ${envPath}. Keys: ${Object.keys(dotenvResult.parsed || {}).join(', ')}`);
}
import { Client, GatewayIntentBits, Partials, Message, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ChannelType, ColorResolvable, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from "discord.js";
import { isWakeWord, handleConversationalReply } from "./utils/responder";

import { isOwnerId } from "./utils/owner";
import { helpCommand } from "./commands/help";
import { kickCommand, banCommand, muteCommand, addRoleCommand, removeRoleCommand } from "./commands/moderation";
import { getRandomJoke } from "./services/learningService";
import { responseTracker } from "./services/responseTracker";
import { responseRules } from "./services/responseRules";
import { bypass } from "./services/bypass";
// Ensure consistent use of `whitelistService` for all whitelist checks
import { isWhitelisted, getWhitelist, addWhitelistEntry, removeWhitelistEntry } from "./services/whitelistService";
import { isBlacklisted, getBlacklist, addBlacklistEntry, removeBlacklistEntry } from "./services/blacklistService";
import { createGiveaway, getActiveGiveaways, getGiveawayById, endGiveaway, pickWinners, setGiveawayMessageId, addEntry as addGiveawayEntry } from "./services/giveawayService";
import { warnings } from "./services/warnings";
import { LanguageHandler } from "./services/languageHandler";
import { buildModerationEmbed, sendToModLog } from "./utils/moderationEmbed";
import { setModLogChannelId, getModLogChannelId, clearModLogChannelId } from "./config";
import { handleEnhancedCommands } from "./commands/enhancedCommands";
import { initializeEnhancedFeatures, processMessageWithEnhancedFeatures } from "./services/enhancedIntegration";
// Replace interaction.reply and interaction.followUp with safeReply
import { safeReply, safeDeferReply, safeFollowUp } from "./utils/safeReply";
// Ensure appeals schema is initialized on startup
import './services/appeals';

// Removed duplicate import of globalCommands
// Ensure only one import exists
import { globalCommands } from './commands/enhancedCommands';
import { handleReply } from './services/localResponder';

const token = (process.env.DISCORD_TOKEN || '').trim();
const prefix = process.env.PREFIX ?? "!";
const wakeWord = process.env.WAKE_WORD ?? "SynapseAI";

// Add debug logs to verify environment variables and commands array
console.log('Environment Variables:', {
  DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
  DISCORD_TOKEN: process.env.DISCORD_TOKEN ? 'Set' : 'Not Set',
  GUILD_ID: process.env.GUILD_ID
});

// Note: Commands will be logged after they are processed below

// The command registration will be handled properly in the client ready event below
// where the full commands array is available

(async () => {
  // Initialize the database early
  const { getDB } = await import('./services/db');
  getDB(); // This will initialize the database
})().catch(console.error);

// Temporary bypass flag for whitelist
let whitelistBypassEnabled = false;

// Helper function to parse duration strings
function parseDuration(durationStr: string): number {
  const match = durationStr.match(/^(\d+)([smhd])$/);
  if (!match) {
    // Try parsing as raw number (seconds)
    const num = parseInt(durationStr);
    return isNaN(num) ? 600000 : num * 1000; // Default 10min
  }
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 600000; // Default 10min
  }
}

// Helper to update all shift panels in a guild
async function updateShiftPanels(client: Client, guildId: string) {
  try {
    const { getShiftPanels } = await import('./services/shifts');
    const panels = getShiftPanels(guildId);
    const embed = await buildShiftPanelEmbed(guildId, client);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('shifts-refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
    );

    const guild = await client.guilds.fetch(guildId);
    for (const panel of panels) {
      try {
        const channel = await guild.channels.fetch(panel.channel_id);
        if (channel?.isTextBased()) {
          const message = await (channel as any).messages.fetch(panel.message_id);
          await message.edit({ embeds: [embed], components: [row] });
        }
      } catch (e) {
        // Panel message may have been deleted
      }
    }
  } catch (err) {
    console.error('Failed to update shift panels:', err);
  }
}

// Helper to build shift panel embed
async function buildShiftPanelEmbed(guildId: string, client: Client): Promise<EmbedBuilder> {
  const { getActiveStaff } = await import('./services/shifts');
  const { getActiveBreak } = await import('./services/payroll');
  const activeStaff = getActiveStaff(guildId);
  
  const embed = new EmbedBuilder()
    .setTitle('🕒 Staff Clock-In Status')
    .setColor(activeStaff.length > 0 ? 0x00FF00 : 0x808080)
    .setTimestamp();
  
  if (activeStaff.length === 0) {
    embed.setDescription('No staff currently clocked in.');
  } else {
    const staffLines = activeStaff.map(shift => {
      const clockIn = new Date(shift.clock_in);
      const duration = Math.floor((Date.now() - clockIn.getTime()) / 60000);
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;
      
      // Check if on break
      const activeBreak = getActiveBreak(shift.id);
      const status = activeBreak ? '☕ On Break' : '✅ Active';
      
      return `${status} <@${shift.user_id}> — ${hours}h ${mins}m (since <t:${Math.floor(clockIn.getTime() / 1000)}:t>)`;
    });
    embed.setDescription(staffLines.join('\n'));
    
    const onBreak = activeStaff.filter(shift => getActiveBreak(shift.id)).length;
    const active = activeStaff.length - onBreak;
    embed.setFooter({ text: `${active} active, ${onBreak} on break | Total: ${activeStaff.length} staff` });
  }
  
  return embed;
}

// Handler for setcolor-menu select menu
// (Moved below client initialization to ensure client is defined)

if (!token) {
  console.error("DISCORD_TOKEN not set in .env — cannot start bot");
  process.exit(1);
}

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
  allowedMentions: {
    parse: ['users', 'roles'], // Allow user and role mentions, but not @everyone/@here
    repliedUser: true // Allow mentioning the user being replied to
  }
});

// Helper function to format ticket tags for display
function formatTicketTags(ticket: any): string {
  if (!ticket.tags) return '';
  try {
    const tags = JSON.parse(ticket.tags) as string[];
    if (tags.length === 0) return '';
    return `\n🏷️ **Tags:** ${tags.map((t: string) => `\`${t}\``).join(', ')}`;
  } catch {
    return '';
  }
}

// Move the `interactionCreate` handler to ensure it is added after the `client` initialization
client.on('interactionCreate', async (interaction) => {
  if (interaction.isStringSelectMenu() && interaction.customId === 'setcolor-menu') {
    const selectedColor = interaction.values[0];
    const guild = interaction.guild;

    if (!guild) {
      return interaction.reply({ content: 'This interaction can only be used in a server.', ephemeral: true });
    }

    // Check if user has the custom_color perk unlocked
    const { getUserPoints, getUnlockedPerks } = await import('./services/rewards');
    const guildId = guild.id;
    const userPoints = getUserPoints(interaction.user.id, guildId);
    const perks = getUnlockedPerks(interaction.user.id, guildId);
    const customColorPerk = perks.find(p => p.id === 'custom_color');

    if (!customColorPerk || !customColorPerk.unlocked) {
      const pointsNeeded = 50 - userPoints;
      return interaction.reply({ 
        content: `🔒 You need to unlock the **Custom Color** perk first!\n\n` +
                 `**Required:** 50 points\n` +
                 `**Your Points:** ${userPoints} 🪙\n` +
                 `**Points Needed:** ${pointsNeeded > 0 ? pointsNeeded : 0}\n\n` +
                 `Use \`/perks\` to see your progress and \`/claimperk custom_color\` once you have enough points!`,
        ephemeral: true 
      });
    }

    const member = await guild.members.fetch(interaction.user.id);

    if (selectedColor === 'default') {
      // Remove all color roles
      const colorRoles = member.roles.cache.filter(role => role.name.startsWith('Color:'));
      for (const role of colorRoles.values()) {
        await role.delete('User selected default color').catch(() => {});
      }
      return interaction.reply({ content: '✅ Your color has been reset to default.', ephemeral: true });
    }

    try {
      // Remove existing color roles
      const existingColorRoles = member.roles.cache.filter(role => role.name.startsWith('Color:'));
      for (const role of existingColorRoles.values()) {
        await role.delete('Replacing with new color role').catch(() => {});
      }

      // Get the bot's highest role position to ensure we don't exceed it
      const botMember = await guild.members.fetchMe();
      const botHighestRole = botMember.roles.highest;
      
      // Get user's highest role position
      const userHighestRole = member.roles.highest;
      
      // Position the new role just above the user's highest role, but below bot's highest role
      let targetPosition = Math.min(userHighestRole.position + 1, botHighestRole.position - 1);
      
      // Create the color role
      const roleName = `Color: ${interaction.user.username}`;
      const colorRole = await guild.roles.create({
        name: roleName,
        color: selectedColor as ColorResolvable,
        permissions: '0', // No permissions, purely cosmetic
        reason: 'User color customization',
      });

      // Move the role to the correct position
      await colorRole.setPosition(targetPosition, { reason: 'Position color role for visibility' }).catch(() => {
        // If positioning fails, that's okay - role still works
      });

      // Assign the new role to the user
      await member.roles.add(colorRole);
      
      await interaction.reply({ content: `✅ Your color has been set! Your new color role is now active.`, ephemeral: true });
    } catch (error) {
      console.error('Failed to create/assign color role:', error);
      return interaction.reply({ content: '❌ An error occurred while setting your color. Please try again or contact an admin.', ephemeral: true });
    }
  }
  
  // Handle ticket category selection
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket-category-select') {
    if (!interaction.guild) return;
    
    const categoryName = interaction.values[0];
    const { getTicketCategory } = await import('./services/tickets');
    const category = getTicketCategory(interaction.guild.id, categoryName);
    
    if (!category) {
      return interaction.reply({ content: '❌ Category not found.', ephemeral: true });
    }
    
    // Check if category has custom fields
    if (category.custom_fields && category.custom_fields.length > 0) {
      // Show modal with custom fields
      const modal = new ModalBuilder()
        .setCustomId(`ticket-modal:${categoryName}`)
        .setTitle(`${category.emoji || '📁'} ${categoryName}`.slice(0, 45));
      
      // Add up to 5 fields (Discord modal limit)
      const fieldsToShow = category.custom_fields.slice(0, 5);
      
      for (const field of fieldsToShow) {
        const input = new TextInputBuilder()
          .setCustomId(field.name)
          .setLabel(field.label.slice(0, 45))
          .setStyle(field.type === 'multiline' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(field.required)
          .setPlaceholder(field.placeholder?.slice(0, 100) || `Enter ${field.label.toLowerCase()}`);
        
        if (field.type === 'multiline') {
          input.setMinLength(10).setMaxLength(1000);
        } else if (field.type === 'text') {
          input.setMaxLength(200);
        } else if (field.type === 'number') {
          input.setMaxLength(20);
        }
        
        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(row);
      }
      
      await interaction.showModal(modal);
    } else {
      // No custom fields - create ticket directly
      await interaction.deferReply({ ephemeral: true });
      
      const { createTicket, getTicketConfig, getSupportRoleIds, getTicketById } = await import('./services/tickets');
      const config = getTicketConfig(interaction.guild.id);
      
      if (!config) {
        return interaction.editReply({ content: '❌ Ticket system is not configured.' });
      }
      
      const supportRoleIds = getSupportRoleIds(interaction.guild.id);
      
      // Create permission overwrites
      const permissionOverwrites: any[] = [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        { id: interaction.client.user!.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
      ];
      
      for (const roleId of supportRoleIds) {
        permissionOverwrites.push({
          id: roleId,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks]
        });
      }
      
      try {
        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`,
          type: 0,
          parent: config.category_id,
          permissionOverwrites: permissionOverwrites
        });
        
        const ticketId = createTicket(interaction.guild.id, ticketChannel.id, interaction.user.id, categoryName);
        const newTicket = getTicketById(ticketId);
        
        // Apply auto-tags if configured
        if (category.auto_tags && category.auto_tags.length > 0) {
          const { addTagToTicket } = await import('./services/tickets');
          for (const tag of category.auto_tags) {
            addTagToTicket(ticketId, tag);
          }
        }
        
        const tagsDisplay = newTicket ? formatTicketTags(newTicket) : '';
        
        const ticketEmbed = new EmbedBuilder()
          .setTitle(`${category.emoji || '📁'} Ticket #${ticketId}`)
          .setColor(parseInt(category.color?.replace('#', '') || '5865F2', 16))
          .setDescription(`**Category:** ${categoryName}\n**Opened by:** <@${interaction.user.id}>${tagsDisplay}\n\nThanks for opening a ticket. Please wait for staff assistance.`)
          .setFooter({ text: 'Use the button below or /ticket close to close this ticket' });
        
        const ticketActions = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`ticket-close:${ticketId}`).setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
        );
        
        const supportMentions = supportRoleIds.length > 0 ? supportRoleIds.map(id => `<@&${id}>`).join(' ') : 'New ticket!';
        
        await ticketChannel.send({ 
          content: `${supportMentions} - <@${interaction.user.id}>`, 
          embeds: [ticketEmbed],
          components: [ticketActions]
        });
        
        return interaction.editReply({ content: `✅ Ticket created: <#${ticketChannel.id}>` });
      } catch (e) {
        console.error('[Ticket] Failed to create ticket:', e);
        return interaction.editReply({ content: '❌ Failed to create ticket. Please try again or contact staff.' });
      }
    }
  }
});

// Patch Discord interaction methods at startup to avoid unhandled InteractionAlreadyReplied
// errors from third-party or legacy call sites. This wraps ChatInputCommandInteraction.reply
// and followUp to try safer fallbacks (followUp/editReply) instead of throwing.
(() => {
  try {
    // require is used here to avoid circular import issues with the top-level ES imports
    const dj = require('discord.js');
    const proto = dj?.ChatInputCommandInteraction?.prototype;
    if (!proto) return;

    const originalReply = proto.reply;
    if (originalReply && !originalReply.__patchedBySynapse) {
      proto.reply = async function patchedReply(...args: any[]) {
        try {
          // Attempt the original reply first
          return await originalReply.apply(this, args);
        } catch (err: any) {
          const msg = String(err?.message || err);
          // Detect already-replied error (string-match and name/code checks)
          const isAlready = msg.includes('already been sent') || msg.includes('already been replied') || err?.name === 'InteractionAlreadyReplied' || err?.code === 'InteractionAlreadyReplied';
          if (isAlready) {
            try {
              // If interaction was already acknowledged, try followUp instead
              const opts = args[0];
              if (this.replied || this.deferred) {
                try { return await this.followUp(typeof opts === 'string' ? { content: opts } : opts); } catch (e) { /* swallow */ }
              }
              // Otherwise, try editReply as a last resort
              try { return await this.editReply(typeof opts === 'string' ? { content: opts } : opts); } catch (e) { /* swallow */ }
            } catch (e) {
              // ignore
            }
            // Suppress the error to avoid process crash; log for traceability
            console.warn('[patchedReply] suppressed InteractionAlreadyReplied for', this.id || '<unknown-interaction>');
            return null;
          }
          throw err;
        }
      };
      (proto.reply as any).__patchedBySynapse = true;
    }

    const originalFollowUp = proto.followUp;
    if (originalFollowUp && !originalFollowUp.__patchedBySynapse) {
      proto.followUp = async function patchedFollowUp(...args: any[]) {
        try {
          return await originalFollowUp.apply(this, args);
        } catch (err: any) {
          const msg = String(err?.message || err);
          // If followUp fails due to not-yet-deferred, try reply
          const isNotAck = msg.includes('not been acknowledged') || err?.name === 'HTTPError';
          if (isNotAck) {
            try { return await originalReply.apply(this, args); } catch (e) { /* swallow */ }
          }
          throw err;
        }
      };
      (proto.followUp as any).__patchedBySynapse = true;
    }
    } catch (e) {
    console.warn('Failed to patch discord interaction prototypes:', String((e as Error)?.message || e));
  }
})();

// Defer application ID resolution until ready; don't hard exit if env missing.
let resolvedApplicationId: string | undefined = process.env.DISCORD_APPLICATION_ID;
if (resolvedApplicationId && isNaN(Number(resolvedApplicationId))) {
  console.warn(`Provided DISCORD_APPLICATION_ID='${resolvedApplicationId}' is not numeric; will attempt to use client identity after login.`);
  resolvedApplicationId = undefined;
}

client.once('ready', async () => {
  if (!resolvedApplicationId) {
    // Fallback to client.user.id (discord.js populates this post-login)
    resolvedApplicationId = client.user?.id;
  }
  if (!resolvedApplicationId) {
    console.error('Unable to resolve application ID even after ready; commands may not register. Set DISCORD_APPLICATION_ID in environment.');
  } else {
    console.log(`[Init] Resolved application ID: ${resolvedApplicationId}`);
  }
});

// Add logging to confirm bot is ready and connected
client.once('ready', () => {
  console.log(`[Bot Ready] Logged in as ${client.user?.tag}`);
});

// Add logging to confirm bot is connected to Discord
client.on('shardReady', (id) => {
  console.log(`[Shard Ready] Shard ID: ${id}`);
});

// Update deprecated 'ready' event to 'clientReady'
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  // Initialize enhanced features
  await initializeEnhancedFeatures(); // Removed the client argument
  
  // Start achievement cron jobs for periodic checks
  const { startAchievementCron } = await import('./services/achievementCron');
  startAchievementCron(client);
  
  // Start payroll cron jobs (weekly notifications, daily reports, time limit checks)
  const { initPayrollCron } = await import('./services/payrollCron');
  initPayrollCron(client);
  
  // Start scheduling cron jobs (weekly schedule generation)
  const { initSchedulingCron } = await import('./services/schedulingCron');
  const { initSchedulingSchema } = await import('./services/scheduling');
  initSchedulingSchema();
  initSchedulingCron(client);
  
  // Initialize tickets schema and run migrations
  const { initTicketsSchema } = await import('./services/tickets');
  initTicketsSchema();
  
  // Start attendance tracking cron jobs (daily missed shift checks)
  const { initAttendanceCron } = await import('./services/attendanceCron');
  initAttendanceCron(client);
  
  // Start payroll auto-break checker (runs every 2 minutes)
  const { checkAndAutoBreak, checkDailyLimitReached, forceClockOut, set24HourCooldown } = await import('./services/payroll');
  const { getActiveStaff } = await import('./services/shifts');
  
  setInterval(async () => {
    try {
      // Get all guilds and check for inactive clocked-in users
      for (const [guildId, guild] of client.guilds.cache) {
        // Check for auto-break (inactivity)
        const autoBrokenUsers = checkAndAutoBreak(guildId);
        
        if (autoBrokenUsers.length > 0) {
          console.log(`☕ Auto-break triggered for ${autoBrokenUsers.length} users in guild ${guild.name}`);
          
          // Notify users who were auto-broken
          for (const { userId, shiftId } of autoBrokenUsers) {
            try {
              const user = await client.users.fetch(userId);
              await user.send({
                embeds: [{
                  color: 0xFFA500,
                  title: '☕ Auto-Break Started',
                  description: `You've been inactive for 10+ minutes while clocked in. You're now on break.\n\nSend any message in the server to automatically resume your shift.`,
                  timestamp: new Date().toISOString()
                }]
              });
            } catch (err) {
              console.error(`Failed to notify user ${userId} of auto-break:`, err);
            }
          }
          
          // Update shift panels to reflect break status
          await updateShiftPanels(client, guildId);
        }
        
        // Check for users who reached daily limit (auto clock-out)
        const activeStaff = getActiveStaff(guildId);
        for (const shift of activeStaff) {
          if (checkDailyLimitReached(guildId, shift.user_id, shift.id)) {
            console.log(`⏰ Auto-clocking out ${shift.user_id} - daily limit reached`);
            
            const result = forceClockOut(guildId, shift.user_id);
            if (result.success) {
              // Set 24h cooldown
              set24HourCooldown(guildId, shift.user_id);
              
              // Notify user
              try {
                const user = await client.users.fetch(shift.user_id);
                const hours = Math.floor(result.duration! / 60);
                const mins = result.duration! % 60;
                await user.send({
                  embeds: [{
                    color: 0xFF0000,
                    title: '⏰ Auto Clock-Out: Daily Limit Reached',
                    description: `You've been automatically clocked out after reaching your daily hour limit.\n\n**Shift Duration:** ${hours}h ${mins}m\n**Cooldown:** 24 hours\n\nYou can clock in again in 24 hours.`,
                    timestamp: new Date().toISOString()
                  }]
                });
              } catch (err) {
                console.error(`Failed to notify user ${shift.user_id} of auto-clockout:`, err);
              }
              
              // Update shift panels
              await updateShiftPanels(client, guildId);
            }
          }
        }
      }
    } catch (err) {
      console.error('Payroll auto-check failed:', err);
    }
  }, 2 * 60 * 1000); // Every 2 minutes
  
  console.log('✅ Payroll auto-break system started (checks every 2 minutes)');
  
  // Check for inactive tickets every hour (24h+ no user response = auto-blacklist)
  setInterval(async () => {
    try {
      for (const [guildId, guild] of client.guilds.cache) {
        const { getInactiveTickets, blacklistFromTickets, isTicketBlacklisted, closeTicket } = await import('./services/tickets');
        const inactiveTickets = getInactiveTickets(guildId, 24); // 24 hours
        
        console.log(`[Ticket Auto-Check] Guild: ${guild.name} - Found ${inactiveTickets.length} inactive ticket(s)`);
        
        for (const ticket of inactiveTickets) {
          // Check if already blacklisted
          if (isTicketBlacklisted(ticket.user_id, guildId)) continue;
          
          try {
            // Blacklist the user
            blacklistFromTickets(
              ticket.user_id,
              guildId,
              'Auto-blacklisted: No response in ticket for 24+ hours',
              client.user!.id
            );
            
            // Close the ticket
            closeTicket(ticket.channel_id, 'Ticket closed due to inactivity (24h+ no response)');
            
            // Delete the channel
            const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
            if (channel) {
              await channel.delete('Ticket closed: User inactive for 24+ hours');
            }
            
            // Notify user
            try {
              const user = await client.users.fetch(ticket.user_id);
              await user.send({
                embeds: [{
                  color: 0xFF6B6B,
                  title: '🚫 Ticket Blacklist Notice',
                  description: `Your ticket in **${guild.name}** was closed due to inactivity, and you have been blacklisted from creating new tickets.`,
                  fields: [
                    { name: 'Reason', value: 'No response for 24+ hours after ticket creation' },
                    { name: 'Note', value: 'Please respond promptly to tickets in the future. Contact an administrator to appeal this blacklist.' }
                  ],
                  timestamp: new Date().toISOString()
                }]
              });
            } catch (err) {
              console.error(`Failed to DM user ${ticket.user_id} about auto-blacklist:`, err);
            }
            
            // Log to mod channel
            const modLogChannelId = getModLogChannelId();
            if (modLogChannelId) {
              const modLogChannel = await guild.channels.fetch(modLogChannelId).catch(() => null) as any;
              if (modLogChannel) {
                await modLogChannel.send({
                  embeds: [{
                    color: 0xFF6B6B,
                    title: '🚫 User Auto-Blacklisted from Tickets',
                    fields: [
                      { name: 'User', value: `<@${ticket.user_id}>`, inline: true },
                      { name: 'Ticket ID', value: `#${ticket.id}`, inline: true },
                      { name: 'Reason', value: 'No response for 24+ hours' }
                    ],
                    timestamp: new Date().toISOString()
                  }]
                });
              }
            }
            
            console.log(`🚫 Auto-blacklisted user ${ticket.user_id} for inactive ticket #${ticket.id} in guild ${guild.name}`);
          } catch (err) {
            console.error(`Failed to auto-blacklist user ${ticket.user_id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Ticket inactivity check failed:', err);
    }
  }, 60 * 60 * 1000); // Every hour
  
  console.log('✅ Ticket inactivity system started (checks every hour)');
  
  // Check for inactive staff every hour and auto-demote
  setInterval(async () => {
    try {
      const {
        getStaffActivityConfig,
        getInactiveStaff,
        getNextDemotionRole,
        updateStaffActivity,
        logDemotion,
        removeStaffTracking
      } = await import('./services/staffActivity');

      for (const [guildId, guild] of client.guilds.cache) {
        const config = getStaffActivityConfig(guildId);
        if (!config || !config.enabled) continue;

        const inactiveStaff = getInactiveStaff(guildId, config.inactivity_days);

        for (const staff of inactiveStaff) {
          try {
            const member = await guild.members.fetch(staff.user_id).catch(() => null);
            if (!member) {
              removeStaffTracking(guildId, staff.user_id);
              continue;
            }

            const currentRoleId = 
              staff.current_role === 'head_support' ? config.head_support_role_id :
              staff.current_role === 'support' ? config.support_role_id :
              staff.current_role === 'trial_support' ? config.trial_support_role_id : null;

            const nextRole = getNextDemotionRole(staff.current_role);

            if (!currentRoleId) continue;

            // Remove current role
            if (member.roles.cache.has(currentRoleId)) {
              await member.roles.remove(currentRoleId);
            }

            if (nextRole) {
              // Add next role in hierarchy
              const nextRoleId = 
                nextRole === 'support' ? config.support_role_id :
                nextRole === 'trial_support' ? config.trial_support_role_id : null;

              if (nextRoleId) {
                await member.roles.add(nextRoleId);
                updateStaffActivity(guildId, staff.user_id, nextRole);
              }

              logDemotion(
                guildId,
                staff.user_id,
                staff.current_role,
                nextRole,
                `Auto-demoted: Inactive for ${config.inactivity_days}+ days`
              );

              // Notify user
              try {
                await member.send({
                  embeds: [{
                    color: 0xFF6B6B,
                    title: '📉 Staff Demotion Notice',
                    description: `You have been automatically demoted in **${guild.name}** due to inactivity.`,
                    fields: [
                      { name: 'From', value: staff.current_role.replace('_', ' ').toUpperCase(), inline: true },
                      { name: 'To', value: nextRole.replace('_', ' ').toUpperCase(), inline: true },
                      { name: 'Reason', value: `Inactive for ${config.inactivity_days}+ days` }
                    ],
                    timestamp: new Date().toISOString()
                  }]
                });
              } catch (err) {
                console.error(`Failed to DM user ${staff.user_id}:`, err);
              }
            } else {
              // Remove from staff completely
              removeStaffTracking(guildId, staff.user_id);

              logDemotion(
                guildId,
                staff.user_id,
                staff.current_role,
                'removed',
                `Auto-removed: Inactive for ${config.inactivity_days}+ days`
              );

              // Notify user
              try {
                await member.send({
                  embeds: [{
                    color: 0xFF6B6B,
                    title: '❌ Removed from Staff',
                    description: `You have been removed from the staff team in **${guild.name}** due to inactivity.`,
                    fields: [
                      { name: 'Previous Role', value: staff.current_role.replace('_', ' ').toUpperCase() },
                      { name: 'Reason', value: `Inactive for ${config.inactivity_days}+ days` }
                    ],
                    timestamp: new Date().toISOString()
                  }]
                });
              } catch (err) {
                console.error(`Failed to DM user ${staff.user_id}:`, err);
              }
            }

            // Log to mod channel
            const modLogChannelId = getModLogChannelId();
            if (modLogChannelId) {
              const modLogChannel = await guild.channels.fetch(modLogChannelId).catch(() => null) as any;
              if (modLogChannel) {
                await modLogChannel.send({
                  embeds: [{
                    color: 0xFF6B6B,
                    title: '📉 Staff Auto-Demotion',
                    fields: [
                      { name: 'User', value: `<@${staff.user_id}>`, inline: true },
                      { name: 'From', value: staff.current_role.replace('_', ' '), inline: true },
                      { name: 'To', value: nextRole ? nextRole.replace('_', ' ') : 'Removed', inline: true },
                      { name: 'Reason', value: `Inactive for ${config.inactivity_days}+ days` }
                    ],
                    timestamp: new Date().toISOString()
                  }]
                });
              }
            }

            console.log(`📉 Auto-demoted ${staff.user_id} from ${staff.current_role} to ${nextRole || 'removed'} in guild ${guild.name}`);
          } catch (err) {
            console.error(`Failed to auto-demote staff ${staff.user_id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Staff activity check failed:', err);
    }
  }, 60 * 60 * 1000); // Every hour

  console.log('✅ Staff activity auto-demotion system started (checks every hour)');
  
  // Check for staff promotions daily (automatic Trial Support → Support, queued Support → Head Support)
  setInterval(async () => {
    try {
      const { runPromotionCheck } = await import('./services/promotionService');
      
      for (const [guildId] of client.guilds.cache) {
        await runPromotionCheck(client, guildId);
      }
      
      console.log('[Promotion] Daily promotion check completed');
    } catch (err) {
      console.error('[Promotion] Promotion check failed:', err);
    }
  }, 24 * 60 * 60 * 1000); // Every 24 hours
  
  console.log('✅ Staff promotion system started (checks every 24 hours)');
  
  // Register slash commands. If GUILD_ID is set, register for that guild (instant); otherwise register globally.
  const guildId = process.env.GUILD_ID;

  const commands = [
    // Diagnostics
    { name: "diagcommands", description: "Owner: list registered slash commands in this guild" },
    { name: "givepoints", description: "Owner: Manage user points", options: [
      { 
        name: "give", 
        description: "Grant points to a user", 
        type: 1, 
        options: [
          { name: "user", description: "User to grant points to", type: 6, required: true },
          { name: "points", description: "Number of points to grant", type: 4, required: true },
          { name: "reason", description: "Reason for granting points", type: 3, required: false }
        ]
      },
      { 
        name: "take", 
        description: "Remove points from a user", 
        type: 1, 
        options: [
          { name: "user", description: "User to remove points from", type: 6, required: true },
          { name: "points", description: "Number of points to remove", type: 4, required: true },
          { name: "reason", description: "Reason for removing points", type: 3, required: false }
        ]
      }
    ] },
    { name: "help", description: "Show help for bot commands" },
    { name: "ping", description: "Check bot latency" },
    { name: "joke", description: "Tell a joke", options: [
      { name: "type", description: "Type of joke (random/dad)", type: 3, required: false }
    ] },
    // Owner-only maintenance commands (no SSH required)
    { name: "version", description: "Owner: show running commit and config" },
    { name: "diagai", description: "Owner: AI health check (env + test call)" },
    { name: "setsupportroles", description: "Owner: set support role IDs (head/support/trial)", options: [
      { name: "head", description: "Head Support role", type: 8, required: false },
      { name: "support", description: "Support role", type: 8, required: false },
      { name: "trial", description: "Trial Support role", type: 8, required: false }
    ] },
    { name: "getsupportroles", description: "Owner: show configured support roles" },
    { name: "support", description: "List current support staff in this server" },
    { name: "setsupportintercept", description: "Owner: toggle global 'who are support' interception for this server", options: [
      { name: "enabled", description: "true or false", type: 5, required: true }
    ] },
    { name: "getsupportintercept", description: "Owner: show global 'who are support' interception status" },
    { name: "setfounderrole", description: "Owner: set the Founder role for this server", options: [
      { name: "role", description: "Founder role", type: 8, required: true }
    ] },
    { name: "setmention", description: "Owner: toggle @mentions for PobKC or Joycemember", options: [
      { name: "owner", description: "pobkc or joycemember", type: 3, required: true },
      { name: "enabled", description: "true or false", type: 5, required: true }
    ] },
    { name: "getmention", description: "Owner: show mention preference status for owners" },
    // Appeals (user + staff)
    { name: "appealhistory", description: "View appeal history (users: own; staff: optional target user)", options: [
      { name: "user", description: "User to view (staff only)", type: 6, required: false }
    ] },
    // Owner-only access management (consolidated)
    { name: "manage", description: "Owner: Manage whitelist, blacklist, and bypass entries", options: [
      { name: "type", description: "whitelist | blacklist | bypass", type: 3, required: true },
      { name: "action", description: "add | remove | list", type: 3, required: true },
      { name: "target_type", description: "user | role (for add/remove)", type: 3, required: false },
      { name: "id", description: "User ID or Role ID (for add/remove)", type: 3, required: false },
      { name: "duration", description: "Duration for whitelist (e.g., 7d)", type: 3, required: false },
      { name: "reason", description: "Reason for blacklist", type: 3, required: false }
    ] },
    // Giveaway commands
    { name: "giveaway", description: "Manage giveaways", options: [
      { name: "start", description: "Start a new giveaway", type: 1, options: [
        { name: "prize", description: "Prize for the giveaway", type: 3, required: true },
        { name: "duration", description: "Duration (e.g., 7d, 24h, 3600)", type: 3, required: true },
        { name: "winners", description: "Number of winners", type: 4, required: true },
        { name: "channel", description: "Channel for giveaway", type: 7, required: false },
        { name: "minmessages", description: "Minimum messages requirement", type: 4, required: false },
        { name: "mininvites", description: "Minimum invites requirement", type: 4, required: false },
        { name: "requiredroles", description: "Required role IDs (comma-separated)", type: 3, required: false }
      ] },
      { name: "end", description: "End a giveaway early", type: 1, options: [
        { name: "id", description: "Giveaway ID", type: 3, required: true }
      ] },
      { name: "reroll", description: "Reroll winners for a giveaway", type: 1, options: [
        { name: "id", description: "Giveaway ID", type: 3, required: true }
      ] },
      { name: "list", description: "List active giveaways", type: 1 }
    ] },
    // Games
    { name: "rpsai", description: "Play Rock-Paper-Scissors vs SynapseAI", options: [
      { name: "difficulty", description: "easy | normal | hard", type: 3, required: false },
      { name: "mode", description: "bo1 | bo3", type: 3, required: false }
    ] },
    { name: "blackjack", description: "Play Blackjack vs SynapseAI", options: [
      { name: "difficulty", description: "easy | normal | hard", type: 3, required: false }
    ] },
    // Memory commands (user-level)
    { name: "remember", description: "Save a personal fact or preference for better replies", options: [
      { name: "key", description: "Short label (e.g., name, timezone, favorite_team)", type: 3, required: true },
      { name: "value", description: "Value to remember", type: 3, required: true },
      { name: "type", description: "Type: fact | preference | note", type: 3, required: false }
    ] },
    { name: "forget", description: "Delete a saved memory by key", options: [
      { name: "key", description: "The memory key to delete", type: 3, required: true }
    ] },
    { name: "memories", description: "List your recent saved memories", options: [
      { name: "limit", description: "How many to show (default 10)", type: 4, required: false }
    ] },
    { name: "aliases", description: "View your name aliases (alternate spellings)" },
    { name: "history", description: "See change history for a saved fact", options: [
      { name: "key", description: "Memory key (e.g., name, timezone)", type: 3, required: true },
      { name: "limit", description: "How many changes to show (default 5)", type: 4, required: false }
    ] },
    { name: "revert", description: "Undo the last change to a memory", options: [
      { name: "key", description: "Memory key to revert (e.g., name)", type: 3, required: true }
    ] },
  { name: "setquestiontimeout", description: "Set the question repeat timeout (in seconds)", options: [{ name: "seconds", description: "Timeout in seconds (e.g., 300 for 5 minutes)", type: 4, required: true }] },
  { name: "getquestiontimeout", description: "Get the current question repeat timeout" },
  { name: "addbypass", description: "Add a bypass entry (user or role) to allow using admin commands", options: [ { name: 'type', description: 'user or role', type: 3, required: true }, { name: 'id', description: 'User ID or Role ID (or mention)', type: 3, required: true } ] },
  { name: "removebypass", description: "Remove a bypass entry", options: [ { name: 'type', description: 'user or role', type: 3, required: true }, { name: 'id', description: 'User ID or Role ID (or mention)', type: 3, required: true } ] },
  { name: "setresponserule", description: "Add a rule to customize responses (admin)", options: [ { name: 'type', description: 'Type: phrase|emoji|sticker', type: 3, required: true }, { name: 'trigger', description: 'Trigger text/emoji/sticker id', type: 3, required: true }, { name: 'response', description: 'Response text (use __IGNORE__ to ignore). Can be JSON for translations.', type: 3, required: true }, { name: 'match', description: 'Match type: contains|equals|regex (phrase only)', type: 3, required: false } ] },
  { name: "listresponserules", description: "List configured response rules (admin)" },
  { name: "delresponserule", description: "Delete a response rule by id (admin)", options: [{ name: 'id', description: 'Rule id', type: 3, required: true }] },
  { name: "setmodlog", description: "Set the moderation log channel (admin)", options: [{ name: 'channel', type: 7, description: 'Channel to receive moderation logs', required: true }] },
  { name: "getmodlog", description: "Show the current moderation log channel (admin)" },
  { name: "clearmodlog", description: "Clear the moderation log channel (admin)" },
  { name: "warn", description: "Warn a user (DM and record)", options: [{ name: 'user', type: 6, description: 'User to warn', required: true }, { name: 'reason', type: 3, description: 'Reason', required: false }] },
  { name: "warns", description: "Check user warnings", options: [{ name: 'user', type: 6, description: 'User to check', required: true }] },
    { name: "clearwarn", description: "Clear warnings for a user", options: [{ name: 'user', type: 6, description: 'User', required: true }] },
    { name: "unmute", description: "Remove timeout from a member", options: [{ name: 'user', type: 6, description: 'Member to unmute', required: true }] },
    { name: "suspendstaff", description: "Suspend a staff member (Admin)", options: [
      { name: 'user', type: 6, description: 'Staff member to suspend', required: true },
      { name: 'duration', type: 4, description: 'Duration in days (1-30)', required: true },
      { name: 'reason', type: 3, description: 'Reason for suspension', required: true }
    ] },
    { name: "cancelsuspension", description: "Cancel an active staff suspension (Admin)", options: [
      { name: 'user', type: 6, description: 'Suspended staff member', required: true }
    ] },
    { name: "suspensions", description: "View active staff suspensions (Admin)" },
  { name: "announce", description: "Send an announcement as the bot", options: [{ name: 'message', type: 3, description: 'Message content', required: true }, { name: 'channel', type: 7, description: 'Channel to announce in', required: false }] },
    { name: "membercount", description: "Show member count (optionally for a role)", options: [{ name: 'role', type: 8, description: 'Role to count', required: false }] },
    { name: "purge", description: "Delete recent messages from the channel", options: [{ name: 'count', type: 4, description: 'Number of messages to delete', required: true }] },
    { name: "kick", description: "Kick a member", options: [ { name: "user", description: "Member to kick", type: 6, required: true }, { name: "reason", description: "Reason for kick", type: 3, required: false } ] },
    { name: "ban", description: "Ban a member", options: [ { name: "user", description: "Member to ban", type: 6, required: true }, { name: "reason", description: "Reason for ban", type: 3, required: false } ] },
    { name: "mute", description: "Timeout a member", options: [ { name: "user", description: "Member to timeout", type: 6, required: true }, { name: "duration", description: "Duration (e.g., 20s, 10m, 1h, or seconds)", type: 3, required: false }, { name: "reason", description: "Reason", type: 3, required: false } ] },
    { name: "addrole", description: "Add a role to a member", options: [ { name: "user", description: "Member to modify", type: 6, required: true }, { name: "role", description: "Role to add", type: 8, required: true } ] },
    { name: "removerole", description: "Remove a role from a member", options: [ { name: "user", description: "Member to modify", type: 6, required: true }, { name: "role", description: "Role to remove", type: 8, required: true } ] },
    { name: "setdefaultmute", description: "Set default mute duration (e.g. 10m, 1h)", options: [ { name: "duration", description: "Duration (e.g. 10m or seconds)", type: 3, required: true } ] },
    { name: "getdefaultmute", description: "Show the current default mute duration" },
    // Enhanced Features Commands
    { name: "supportstats", description: "View support member performance stats", options: [ { name: "member", description: "Support member to view stats for", type: 6, required: false } ] },
    { name: "leaderboard", description: "Show support or achievement leaderboards", options: [ { name: "type", description: "resolution|speed|rating|volume|points|support_category", type: 3, required: true }, { name: "category", description: "Support category (for support_category type)", type: 3, required: false } ] },
    { name: "kb", description: "📚 Knowledge Base - AI-powered FAQ system", options: [
      { name: "search", description: "🔍 Search the knowledge base for answers", type: 1, options: [ { name: "query", description: "What you're looking for", type: 3, required: true } ] },
      { name: "add", description: "➕ Add a new FAQ entry (Admin)", type: 1, options: [ { name: "category", description: "Category (e.g., setup, billing, features)", type: 3, required: true }, { name: "question", description: "The question to add", type: 3, required: true }, { name: "answer", description: "The answer", type: 3, required: true }, { name: "tags", description: "Tags for better search (comma-separated)", type: 3, required: false } ] },
      { name: "trending", description: "🔥 See most-viewed knowledge entries", type: 1, options: [ { name: "days", description: "Days to look back (default 7)", type: 4, required: false } ] },
      { name: "suggest", description: "💡 AI suggestions for missing FAQ entries (Admin)", type: 1, options: [ { name: "days", description: "Days to analyze support questions (default 7)", type: 4, required: false } ] },
      { name: "stats", description: "📊 Knowledge base analytics (Admin)", type: 1 }
    ] },
  { name: "achievements", description: "🏆 View earned achievements and rewards", options: [ { name: "user", description: "User to view (defaults to you)", type: 6, required: false } ] },
  { name: "supportstart", description: "Start tracking a support interaction (ticket)", options: [ { name: "user", description: "User being helped", type: 6, required: true }, { name: "question", description: "What they need help with", type: 3, required: true } ] },
  { name: "supportend", description: "End a tracked support interaction (ticket)", options: [ { name: "id", description: "Interaction ID from /supportstart", type: 4, required: true }, { name: "resolved", description: "Was it resolved?", type: 5, required: true }, { name: "rating", description: "Satisfaction rating (1-5)", type: 4, required: false }, { name: "feedback", description: "Optional feedback text", type: 3, required: false } ] },
  { name: "supportrate", description: "Ticket requester: rate your support interaction", options: [ { name: "id", description: "Interaction ID", type: 4, required: true }, { name: "rating", description: "Satisfaction rating (1-5)", type: 4, required: true }, { name: "feedback", description: "Optional feedback text", type: 3, required: false } ] },
  { name: "supportaddhelper", description: "Support: add a co-helper to a ticket", options: [ { name: "id", description: "Interaction ID", type: 4, required: true }, { name: "member", description: "Helper to add", type: 6, required: true } ] },
    { name: "perks", description: "✨ View unlocked perks and special abilities", options: [ { name: "user", description: "User to view (defaults to you)", type: 6, required: false } ] },
  { name: "stats", description: "📊 View your detailed achievement statistics and progress", options: [ { name: "user", description: "User to view (defaults to you)", type: 6, required: false } ] },
  { name: "perkspanel", description: "Owner: post a perks claim panel in this channel" },
  { name: "claimperk", description: "Claim an unlocked perk", options: [ { name: "perk", description: "custom_color|priority_support|custom_emoji|channel_suggest|voice_priority|exclusive_role", type: 3, required: true } ] },
  { name: "setcolor", description: "🎨 Set your custom role color from a dropdown menu" },
  { name: "requestemoji", description: "Create a custom emoji (requires custom_emoji perk)", options: [ { name: "name", description: "Emoji name (letters, numbers, _)", type: 3, required: true }, { name: "image", description: "Emoji image (PNG/GIF)", type: 11, required: true } ] },
  { name: "prioritysupport", description: "🚨 Flag your open tickets as priority (requires perk)" },
  { name: "channelsuggestion", description: "💡 Suggest a new channel for the server (requires perk)", options: [ { name: "suggestion", description: "Your channel suggestion", type: 3, required: true } ] },
  { name: "voicepriority", description: "🔊 Get priority in voice channels (requires perk)" },
  { name: "setperkrole", description: "Owner: bind a server role to a perk so claims use it", options: [ { name: "perk", description: "Perk name (see /claimperk for options)", type: 3, required: true }, { name: "role", description: "Role to bind", type: 8, required: true } ] },
    { name: "faq", description: "❓ Quick access to frequently asked questions", options: [ { name: "category", description: "Filter by category", type: 3, required: false } ] },
    // Command Permissions Management
    { name: "cmdpermissions", description: "🔐 Owner: Manage command permissions panel", options: [
      { name: "panel", description: "Show interactive command permissions panel", type: 1 },
      { name: "add", description: "Add command permission(s) to a role", type: 1, options: [
        { name: "role", description: "Role to grant permission", type: 8, required: true },
        { name: "commands", description: "Command name(s) - comma-separated (e.g., kick,ban,mute)", type: 3, required: true }
      ] },
      { name: "remove", description: "Remove command permission(s) from a role", type: 1, options: [
        { name: "role", description: "Role to remove permission from", type: 8, required: true },
        { name: "commands", description: "Command name(s) - comma-separated", type: 3, required: true }
      ] },
      { name: "preset", description: "Apply command preset to a role", type: 1, options: [
        { name: "role", description: "Role to configure", type: 8, required: true },
        { name: "preset", description: "head_support|support|trial_support|moderator|admin", type: 3, required: true }
      ] },
      { name: "clear", description: "Clear all command permissions for a role", type: 1, options: [
        { name: "role", description: "Role to clear permissions from", type: 8, required: true }
      ] },
      { name: "list", description: "List command permissions for a role", type: 1, options: [
        { name: "role", description: "Role to view permissions for", type: 8, required: true }
      ] }
    ] },
    // Anti-Abuse Bypass Management
    { name: "abusebypass", description: "🛡️ Owner: Manage roles that bypass inappropriate content filter", options: [
      { name: "add", description: "Add a role to bypass list (e.g., staff roles)", type: 1, options: [
        { name: "role", description: "Role to bypass inappropriate content filter", type: 8, required: true }
      ] },
      { name: "remove", description: "Remove a role from bypass list", type: 1, options: [
        { name: "role", description: "Role to remove from bypass list", type: 8, required: true }
      ] },
      { name: "list", description: "List all roles that bypass the filter", type: 1 },
      { name: "clear", description: "Clear all bypass roles", type: 1 }
    ] },
    // Auto-Moderation
    { name: "automod", description: "🤖 Configure auto-moderation rules", options: [
      { name: "set", description: "Set an auto-mod rule", type: 1, options: [
        { name: "rule", description: "spam_links | mass_mentions | caps_spam | invite_links", type: 3, required: true },
        { name: "enabled", description: "Enable this rule", type: 5, required: true },
        { name: "action", description: "delete | warn | mute | kick", type: 3, required: true },
        { name: "threshold", description: "Threshold (links count, mentions count, caps %)", type: 4, required: false },
        { name: "mute_duration", description: "Mute duration in minutes (if action=mute)", type: 4, required: false }
      ] },
      { name: "list", description: "List configured auto-mod rules", type: 1 },
      { name: "delete", description: "Delete an auto-mod rule", type: 1, options: [
        { name: "rule", description: "spam_links | mass_mentions | caps_spam | invite_links", type: 3, required: true }
      ] }
    ] },
    // Mod Cases
    { name: "case", description: "📋 View a moderation case by number", options: [
      { name: "number", description: "Case number", type: 4, required: true }
    ] },
    { name: "cases", description: "📋 View all cases for a user", options: [
      { name: "user", description: "User to check cases for", type: 6, required: true }
    ] },
    { name: "updatecase", description: "📝 Update case reason", options: [
      { name: "number", description: "Case number", type: 4, required: true },
      { name: "reason", description: "New reason", type: 3, required: true }
    ] },
    // Appeals
    { name: "appeal", description: "📨 Submit an appeal (use in DMs with bot)", dm_permission: true, contexts: [0, 1, 2], integration_types: [0, 1], options: [
      { name: "type", description: "ban | mute | blacklist | staff_suspension", type: 3, required: true, choices: [
        { name: "Ban Appeal", value: "ban" },
        { name: "Mute Appeal", value: "mute" },
        { name: "Blacklist Appeal", value: "blacklist" },
        { name: "Staff Suspension/Removal Appeal", value: "staff_suspension" }
      ] },
      { name: "reason", description: "Detailed explanation of why your punishment should be revoked", type: 3, required: true }
    ] },
    { name: "appeals", description: "📨 Admin: Review pending appeals", options: [
      { name: "view", description: "View all pending appeals", type: 1 },
      { name: "approve", description: "Approve an appeal", type: 1, options: [
        { name: "id", description: "Appeal ID", type: 4, required: true },
        { name: "note", description: "Optional note", type: 3, required: false }
      ] },
      { name: "deny", description: "Deny an appeal", type: 1, options: [
        { name: "id", description: "Appeal ID", type: 4, required: true },
        { name: "note", description: "Reason for denial", type: 3, required: false }
      ] }
    ] },
    // Reminders
    { name: "remind", description: "⏰ Set a reminder", options: [
      { name: "time", description: "Time (e.g., 2h, 30m, 1d)", type: 3, required: true },
      { name: "message", description: "What to remind you about", type: 3, required: true }
    ] },
    { name: "reminders", description: "⏰ List your active reminders" },
    { name: "cancelreminder", description: "⏰ Cancel a reminder", options: [
      { name: "id", description: "Reminder ID", type: 4, required: true }
    ] },
    // Staff Shifts
    { name: "clockin", description: "🕒 Clock in for your shift" },
    { name: "clockout", description: "🕒 Clock out from your shift" },
    { name: "forceclockout", description: "👑 Owner: Force clock out a user", options: [
      { name: "user", description: "User to force clock out", type: 6, required: true }
    ] },
    { name: "shifts", description: "🕒 Shift management system", options: [
      { name: "history", description: "View shift history", type: 1, options: [
        { name: "user", description: "User to check (defaults to you)", type: 6, required: false },
        { name: "limit", description: "Number of shifts to show (default 10)", type: 4, required: false }
      ] },
      { name: "detail", description: "View detailed shift breakdown (with breaks)", type: 1, options: [
        { name: "shift_id", description: "Shift ID to view details for", type: 4, required: true }
      ] },
      { name: "panel", description: "Post a live shift tracker panel in this channel", type: 1 }
    ] },
    { name: "shiftstats", description: "📊 View shift statistics", options: [
      { name: "user", description: "User to check (defaults to you)", type: 6, required: false },
      { name: "days", description: "Days to analyze (default 30)", type: 4, required: false }
    ] },
    { name: "whosonduty", description: "👥 View currently clocked-in staff" },
    // Scheduling System
    { name: "schedule", description: "📅 Staff scheduling system", options: [
      { name: "view", description: "View the weekly schedule", type: 1, options: [
        { name: "week", description: "Which week (current/next)", type: 3, required: false, choices: [
          { name: "Current Week", value: "current" },
          { name: "Next Week", value: "next" }
        ] }
      ] },
      { name: "setavailability", description: "Set your preferred work days and times", type: 1, options: [
        { name: "days", description: "Preferred days (comma-separated: monday,tuesday,etc)", type: 3, required: true },
        { name: "start_time", description: "Preferred start time (HH:MM format, e.g., 09:00)", type: 3, required: true },
        { name: "end_time", description: "Preferred end time (HH:MM format, e.g., 17:00)", type: 3, required: true }
      ] },
      { name: "drop", description: "Drop a shift for others to pick up", type: 1, options: [
        { name: "day", description: "Day to drop", type: 3, required: true, choices: [
          { name: "Monday", value: "monday" },
          { name: "Tuesday", value: "tuesday" },
          { name: "Wednesday", value: "wednesday" },
          { name: "Thursday", value: "thursday" },
          { name: "Friday", value: "friday" },
          { name: "Saturday", value: "saturday" },
          { name: "Sunday", value: "sunday" }
        ] }
      ] },
      { name: "swap", description: "Request to swap a shift with another staff member", type: 1, options: [
        { name: "give_day", description: "Day you want to give away", type: 3, required: true, choices: [
          { name: "Monday", value: "monday" },
          { name: "Tuesday", value: "tuesday" },
          { name: "Wednesday", value: "wednesday" },
          { name: "Thursday", value: "thursday" },
          { name: "Friday", value: "friday" },
          { name: "Saturday", value: "saturday" },
          { name: "Sunday", value: "sunday" }
        ] },
        { name: "receive_day", description: "Day you want in return", type: 3, required: true, choices: [
          { name: "Monday", value: "monday" },
          { name: "Tuesday", value: "tuesday" },
          { name: "Wednesday", value: "wednesday" },
          { name: "Thursday", value: "thursday" },
          { name: "Friday", value: "friday" },
          { name: "Saturday", value: "saturday" },
          { name: "Sunday", value: "sunday" }
        ] },
        { name: "target_user", description: "Staff member to swap with", type: 6, required: true }
      ] },
      { name: "myschedule", description: "View your personal schedule", type: 1 },
      { name: "generate", description: "👑 Owner: Generate schedules for next week", type: 1 }
    ] },
    // Server Stats Channels
    { name: "statschannels", description: "📊 Configure auto-updating stats channels", options: [
      { name: "set", description: "Set a stats channel", type: 1, options: [
        { name: "type", description: "member_count | online_count | bot_count | role_count | channel_count", type: 3, required: true },
        { name: "channel", description: "Voice channel to use", type: 7, required: true },
        { name: "format", description: "Format with {count} placeholder (e.g., 'Members: {count}')", type: 3, required: true }
      ] },
      { name: "list", description: "List configured stats channels", type: 1 },
      { name: "remove", description: "Remove a stats channel", type: 1, options: [
        { name: "channel", description: "Channel to remove", type: 7, required: true }
      ] }
    ] },
    // Bulk Actions
    { name: "bulkban", description: "🔨 Ban multiple users", options: [
      { name: "users", description: "User IDs (comma or space separated)", type: 3, required: true },
      { name: "reason", description: "Ban reason", type: 3, required: false }
    ] },
    { name: "bulkkick", description: "👢 Kick multiple users", options: [
      { name: "users", description: "User IDs (comma or space separated)", type: 3, required: true },
      { name: "reason", description: "Kick reason", type: 3, required: false }
    ] },
    { name: "bulkmute", description: "🔇 Mute multiple users", options: [
      { name: "users", description: "User IDs (comma or space separated)", type: 3, required: true },
      { name: "duration", description: "Duration (e.g., 10m, 1h)", type: 3, required: false },
      { name: "reason", description: "Mute reason", type: 3, required: false }
    ] },
    // Ticket System
    { name: "ticket", description: "🎫 Ticket system commands", options: [
      { name: "setup", description: "Setup ticket system (Admin)", type: 1, options: [
        { name: "category", description: "Category for ticket channels", type: 7, required: true },
        { name: "log_channel", description: "Channel for ticket logs", type: 7, required: false },
        { name: "support_role", description: "Role to ping for new tickets", type: 8, required: false },
        { name: "vouch_channel", description: "Channel to post all ticket ratings and reviews", type: 7, required: false }
      ] },
      { name: "panel", description: "Post a ticket panel in this channel", type: 1 },
      { name: "create", description: "Create a new ticket", type: 1, options: [
        { name: "category", description: "Support category", type: 3, required: true },
        { name: "description", description: "Describe your issue", type: 3, required: false }
      ] },
      { name: "close", description: "Close a ticket", type: 1 },
      { name: "claim", description: "Claim a ticket", type: 1 },
      { name: "unclaim", description: "Unclaim a ticket you've claimed", type: 1 },
      { name: "addhelper", description: "Add a helper to current ticket", type: 1, options: [
        { name: "user", description: "User who is helping", type: 6, required: true }
      ] },
      { name: "list", description: "List open tickets", type: 1 },
      { name: "config", description: "View current ticket system configuration", type: 1 },
      { name: "addsupportrole", description: "Add a support role", type: 1, options: [
        { name: "role", description: "Role to add as support", type: 8, required: true }
      ] },
      { name: "removesupportrole", description: "Remove a support role", type: 1, options: [
        { name: "role", description: "Role to remove from support", type: 8, required: true }
      ] },
      { name: "blacklist", description: "Blacklist a user from creating tickets", type: 1, options: [
        { name: "user", description: "User to blacklist", type: 6, required: true },
        { name: "reason", description: "Reason for blacklist", type: 3, required: true }
      ] },
      { name: "unblacklist", description: "Remove user from ticket blacklist", type: 1, options: [
        { name: "user", description: "User to unblacklist", type: 6, required: true }
      ] },
      { name: "blacklists", description: "View all ticket blacklisted users", type: 1 },
      { name: "diagnoseblacklist", description: "Diagnose all blacklist sources for a user", type: 1, options: [
        { name: "user", description: "User to diagnose", type: 6, required: true }
      ] },
      { name: "unblacklistall", description: "Remove user from ALL blacklist sources", type: 1, options: [
        { name: "user", description: "User to unblacklist from everywhere", type: 6, required: true }
      ] },
      { name: "debug", description: "Debug ticket inactivity (Admin only)", type: 1, options: [
        { name: "channel", description: "Ticket channel to check", type: 7, required: false }
      ] }
    ] },
    { name: "unban", description: "Unban a user from the server", options: [
      { name: "user_id", description: "User ID to unban", type: 3, required: true },
      { name: "reason", description: "Reason for unbanning", type: 3, required: false }
    ] },
    // Staff Activity Tracking
    { name: "staffactivity", description: "⏰ Manage staff activity tracking and auto-demotion", options: [
      { name: "setup", description: "Configure staff activity system", type: 1, options: [
        { name: "head_support_role", description: "Head Support role", type: 8, required: true },
        { name: "support_role", description: "Support role", type: 8, required: true },
        { name: "trial_support_role", description: "Trial Support role", type: 8, required: true },
        { name: "inactivity_days", description: "Days before demotion (default: 2)", type: 4, required: false }
      ] },
      { name: "exempt", description: "Exempt staff from auto-demotion", type: 1, options: [
        { name: "user", description: "Staff member to exempt", type: 6, required: true },
        { name: "reason", description: "Reason for exemption", type: 3, required: true }
      ] },
      { name: "unexempt", description: "Remove staff exemption", type: 1, options: [
        { name: "user", description: "Staff member to unexempt", type: 6, required: true }
      ] },
      { name: "check", description: "Check staff activity status", type: 1, options: [
        { name: "user", description: "Staff member to check (optional)", type: 6, required: false }
      ] },
      { name: "history", description: "View demotion history", type: 1, options: [
        { name: "user", description: "Filter by user (optional)", type: 6, required: false }
      ] },
      { name: "toggle", description: "Enable/disable the system", type: 1, options: [
        { name: "enabled", description: "Enable or disable", type: 5, required: true }
      ] }
    ] },
    // Shift Management System
    { name: "clockin", description: "⏰ Clock in for your shift", options: [] },
    { name: "clockout", description: "⏰ Clock out from your shift", options: [] },
    { name: "shifts", description: "📊 View shift information", options: [
      { name: "user", description: "View shifts for a specific user", type: 6, required: false }
    ] },
    { name: "shiftstats", description: "📈 View detailed shift statistics", options: [
      { name: "user", description: "View stats for a specific user", type: 6, required: false }
    ] },
    { name: "whosonduty", description: "👥 See who's currently on duty", options: [] },
    // Payroll System
    { name: "payroll", description: "💰 Manage payroll and compensation", options: [
      { name: "viewbalance", description: "View your unpaid balance", type: 1, options: [
        { name: "user", description: "User to check (owner only)", type: 6, required: false }
      ] },
      { name: "config", description: "Configure payroll settings (owner only)", type: 1, options: [
        { name: "hourly_rate", description: "Hourly pay rate", type: 10, required: false },
        { name: "bonus_rate", description: "Bonus rate per ticket", type: 10, required: false }
      ] },
      { name: "calculate", description: "Calculate pay for a period (owner only)", type: 1, options: [
        { name: "user", description: "User to calculate pay for", type: 6, required: true },
        { name: "start_date", description: "Start date (YYYY-MM-DD)", type: 3, required: true },
        { name: "end_date", description: "End date (YYYY-MM-DD)", type: 3, required: true }
      ] },
      { name: "unpaid", description: "View unpaid pay periods (owner only)", type: 1, options: [
        { name: "user", description: "Filter by user", type: 6, required: false }
      ] },
      { name: "markpaid", description: "Mark pay period as paid (owner only)", type: 1, options: [
        { name: "period_id", description: "Pay period ID", type: 4, required: true }
      ] },
      { name: "history", description: "View payment history (owner only)", type: 1, options: [
        { name: "user", description: "User to view history for", type: 6, required: true }
      ] },
      { name: "adjust", description: "Adjust pay multiplier (owner only)", type: 1, options: [
        { name: "user", description: "User to adjust (optional)", type: 6, required: false },
        { name: "role", description: "Role to adjust (optional)", type: 8, required: false },
        { name: "multiplier", description: "Pay multiplier (e.g., 1.5 for 50% bonus)", type: 10, required: true },
        { name: "reason", description: "Reason for adjustment", type: 3, required: true }
      ] },
      { name: "removeadjustment", description: "Remove pay adjustment (owner only)", type: 1, options: [
        { name: "user", description: "User to remove adjustment from", type: 6, required: false },
        { name: "role", description: "Role to remove adjustment from", type: 8, required: false }
      ] },
      { name: "listpay", description: "List all pay adjustments (owner only)", type: 1 }
    ] },
    // Attendance & UPT System
    { name: "upt", description: "💳 Manage Unpaid Time Off (UPT)", options: [
      { name: "balance", description: "Check your UPT balance", type: 1 },
      { name: "history", description: "View your UPT usage history", type: 1 },
      { name: "leaderboard", description: "View UPT leaderboard", type: 1 },
      { name: "adjust", description: "Adjust UPT balance (owner only)", type: 1, options: [
        { name: "user", description: "User to adjust", type: 6, required: true },
        { name: "minutes", description: "Minutes to add (positive) or remove (negative)", type: 4, required: true },
        { name: "reason", description: "Reason for adjustment", type: 3, required: true }
      ] }
    ] },
    { name: "attendance", description: "📋 Attendance and write-up management", options: [
      { name: "stats", description: "View your attendance stats", type: 1 },
      { name: "writeup", description: "Issue a write-up (owner only)", type: 1, options: [
        { name: "user", description: "User to write up", type: 6, required: true },
        { name: "reason", description: "Reason for write-up", type: 3, required: true },
        { name: "severity", description: "Severity level", type: 3, required: true, choices: [
          { name: "Standard", value: "standard" },
          { name: "Severe", value: "severe" }
        ] },
        { name: "notes", description: "Additional notes", type: 3, required: false }
      ] },
      { name: "clear", description: "Clear all write-ups for a user (owner only)", type: 1, options: [
        { name: "user", description: "User to clear write-ups for", type: 6, required: true }
      ] },
      { name: "report", description: "View attendance report (owner only)", type: 1, options: [
        { name: "user", description: "User to view report for", type: 6, required: true }
      ] }
    ] },
    // Scheduling System
    { name: "schedule", description: "📅 View and manage staff schedules", options: [
      { name: "view", description: "View the current weekly schedule", type: 1 },
      { name: "generate", description: "Generate a new schedule (owner only)", type: 1 }
    ] },
    // Staff Promotion System
    { name: "promotion", description: "🎯 Manage staff promotion system", options: [
      { name: "check", description: "Run promotion check now", type: 1 },
      { name: "pending", description: "View pending promotions awaiting approval", type: 1 },
      { name: "approve", description: "Approve a pending promotion", type: 1, options: [
        { name: "promotion_id", description: "ID from pending list", type: 4, required: true }
      ] },
      { name: "deny", description: "Deny a pending promotion", type: 1, options: [
        { name: "promotion_id", description: "ID from pending list", type: 4, required: true }
      ] },
      { name: "stats", description: "View promotion stats for a support member", type: 1, options: [
        { name: "user", description: "Support member", type: 6, required: true }
      ] }
    ] },
    // Anti-Nuke System
    { name: "antinuke", description: "🛡️ Anti-nuke protection system", options: [
      { name: "setup", description: "Configure anti-nuke protection", type: 1, options: [
        { name: "max_channel_deletes", description: "Max channel deletes in time window (default: 3)", type: 4, required: false },
        { name: "max_role_deletes", description: "Max role deletes in time window (default: 3)", type: 4, required: false },
        { name: "max_bans", description: "Max bans in time window (default: 5)", type: 4, required: false },
        { name: "time_window", description: "Time window in seconds (default: 60)", type: 4, required: false }
      ] },
      { name: "whitelist", description: "Add user/role to whitelist", type: 1, options: [
        { name: "user", description: "User to whitelist", type: 6, required: false },
        { name: "role", description: "Role to whitelist", type: 8, required: false }
      ] },
      { name: "unwhitelist", description: "Remove user/role from whitelist", type: 1, options: [
        { name: "user", description: "User to remove", type: 6, required: false },
        { name: "role", description: "Role to remove", type: 8, required: false }
      ] },
      { name: "status", description: "View anti-nuke configuration", type: 1 },
      { name: "triggers", description: "View recent anti-nuke triggers", type: 1 },
      { name: "toggle", description: "Enable/disable anti-nuke", type: 1, options: [
        { name: "enabled", description: "Enable or disable", type: 5, required: true }
      ] }
    ] },
    // Temporary Channels
    { name: "tempchannels", description: "🔊 Configure temporary channels", options: [
      { name: "setup", description: "Setup a temp channel trigger", type: 1, options: [
        { name: "trigger", description: "Voice channel to trigger creation", type: 7, required: true },
        { name: "type", description: "voice | text", type: 3, required: true },
        { name: "template", description: "Name template (use {user} for username)", type: 3, required: true },
        { name: "category", description: "Category to create channels in", type: 7, required: false },
        { name: "user_limit", description: "User limit for voice channels", type: 4, required: false }
      ] },
      { name: "list", description: "List temp channel configs", type: 1 },
      { name: "remove", description: "Remove a temp channel config", type: 1, options: [
        { name: "trigger", description: "Trigger channel to remove", type: 7, required: true }
      ] }
    ] },
    
    // ==================== PHASE 1: ADVANCED TICKET FEATURES ====================
    // SLA Management
    { name: "ticketsla", description: "⏱️ Configure and monitor ticket SLA times", options: [
      { name: "set", description: "Set SLA response and resolution times", type: 1, options: [
        { name: "response_time", description: "Minutes for first response (default: 30)", type: 4, required: true, min_value: 1 },
        { name: "resolution_time", description: "Minutes for resolution (default: 180)", type: 4, required: true, min_value: 1 },
        { name: "priority_response", description: "Minutes for priority response (default: 5)", type: 4, required: true, min_value: 1 }
      ] },
      { name: "view", description: "View current SLA times", type: 1 },
      { name: "check", description: "Check tickets breaching SLA", type: 1 }
    ] },
    
    // Tag System
    { name: "tickettag", description: "🏷️ Manage ticket tags for organization", options: [
      { name: "create", description: "Create a new ticket tag", type: 1, options: [
        { name: "name", description: "Tag name (e.g., bug, feature, urgent)", type: 3, required: true },
        { name: "color", description: "Tag color", type: 3, required: true, choices: [
          { name: "🔴 Red", value: "red" },
          { name: "🔵 Blue", value: "blue" },
          { name: "🟢 Green", value: "green" },
          { name: "🟡 Yellow", value: "yellow" },
          { name: "🟣 Purple", value: "purple" },
          { name: "🟠 Orange", value: "orange" }
        ] },
        { name: "description", description: "Tag description", type: 3, required: false }
      ] },
      { name: "delete", description: "Delete a ticket tag", type: 1, options: [
        { name: "name", description: "Tag name to delete", type: 3, required: true }
      ] },
      { name: "list", description: "List all available ticket tags", type: 1 },
      { name: "add", description: "Add a tag to a ticket", type: 1, options: [
        { name: "ticket_id", description: "Ticket ID", type: 4, required: true },
        { name: "tag", description: "Tag name", type: 3, required: true }
      ] },
      { name: "remove", description: "Remove a tag from a ticket", type: 1, options: [
        { name: "ticket_id", description: "Ticket ID", type: 4, required: true },
        { name: "tag", description: "Tag name", type: 3, required: true }
      ] },
      { name: "search", description: "Find tickets with a specific tag", type: 1, options: [
        { name: "tag", description: "Tag name", type: 3, required: true }
      ] }
    ] },
    
    // Private Notes
    { name: "ticketnote", description: "📝 Manage private staff notes on tickets", options: [
      { name: "add", description: "Add a private note to a ticket", type: 1, options: [
        { name: "ticket_id", description: "Ticket ID", type: 4, required: true },
        { name: "note", description: "Private note (only visible to staff)", type: 3, required: true }
      ] },
      { name: "view", description: "View all notes for a ticket", type: 1, options: [
        { name: "ticket_id", description: "Ticket ID", type: 4, required: true }
      ] },
      { name: "delete", description: "Delete a note", type: 1, options: [
        { name: "note_id", description: "Note ID", type: 4, required: true }
      ] }
    ] },
    
    // Analytics Dashboard
    { name: "ticketanalytics", description: "📊 View comprehensive ticket analytics", options: [
      { name: "days", description: "Number of days to analyze (default: 30)", type: 4, required: false, min_value: 1, max_value: 365 }
    ] },
    
    // Ticket Categories with Custom Fields
    { name: "ticketcategory", description: "📂 Manage ticket categories with custom fields", options: [
      { name: "create", description: "Create a new ticket category", type: 1, options: [
        { name: "name", description: "Category name", type: 3, required: true },
        { name: "emoji", description: "Category emoji", type: 3, required: false },
        { name: "description", description: "Category description", type: 3, required: false },
        { name: "color", description: "Embed color hex (e.g., #FF0000)", type: 3, required: false }
      ] },
      { name: "list", description: "List all ticket categories", type: 1 },
      { name: "delete", description: "Delete a ticket category", type: 1, options: [
        { name: "name", description: "Category name to delete", type: 3, required: true }
      ] },
      { name: "addfield", description: "Add a custom field to a category", type: 1, options: [
        { name: "category", description: "Category name", type: 3, required: true },
        { name: "field_name", description: "Field identifier", type: 3, required: true },
        { name: "field_label", description: "Field label shown to users", type: 3, required: true },
        { name: "field_type", description: "Field input type", type: 3, required: true, choices: [
          { name: "Short Text", value: "text" },
          { name: "Long Text", value: "multiline" },
          { name: "Number", value: "number" },
          { name: "Selection", value: "select" }
        ] },
        { name: "required", description: "Is this field required?", type: 5, required: true }
      ] },
      { name: "view", description: "View category details and custom fields", type: 1, options: [
        { name: "name", description: "Category name", type: 3, required: true }
      ] }
    ] },
    // Advanced Ticket Feature Commands
    { name: "ticketfeedback", description: "📊 View ticket feedback and staff performance", default_member_permissions: "32", options: [
      { name: "staff-stats", description: "View staff performance metrics", type: 1, options: [
        { name: "staff", description: "Staff member to view stats for", type: 6, required: true }
      ] }
    ] },
    { name: "autoresponse", description: "🤖 Manage automatic responses for common questions", default_member_permissions: "32", options: [
      { name: "create", description: "Create an auto-response", type: 1, options: [
        { name: "keywords", description: "Trigger keywords (comma-separated)", type: 3, required: true },
        { name: "response", description: "Response message", type: 3, required: true },
        { name: "category", description: "Limit to specific category (optional)", type: 3, required: false }
      ] },
      { name: "list", description: "List all auto-responses", type: 1 },
      { name: "delete", description: "Delete an auto-response", type: 1, options: [
        { name: "id", description: "Auto-response ID", type: 4, required: true }
      ] },
      { name: "toggle", description: "Enable/disable an auto-response", type: 1, options: [
        { name: "id", description: "Auto-response ID", type: 4, required: true },
        { name: "enabled", description: "Enable or disable", type: 5, required: true }
      ] }
    ] },
    { name: "staffexpertise", description: "🎓 Manage staff expertise for smart ticket routing", default_member_permissions: "32", options: [
      { name: "set", description: "Set staff expertise tags", type: 1, options: [
        { name: "staff", description: "Staff member", type: 6, required: true },
        { name: "tags", description: "Expertise tags (comma-separated)", type: 3, required: true },
        { name: "specialization", description: "Brief specialization description", type: 3, required: false },
        { name: "auto_assign", description: "Enable auto-assignment", type: 5, required: false }
      ] },
      { name: "view", description: "View staff expertise", type: 1, options: [
        { name: "staff", description: "Staff member", type: 6, required: true }
      ] },
      { name: "list", description: "List all staff expertise", type: 1 }
    ] },
    { name: "ticketrouting", description: "🎯 Configure automatic ticket assignment", default_member_permissions: "32", options: [
      { name: "config", description: "Configure routing settings", type: 1, options: [
        { name: "mode", description: "Routing mode", type: 3, required: false, choices: [
          { name: "Round Robin - Fair rotation", value: "round-robin" },
          { name: "Load Balance - Assign to least busy", value: "load-balance" },
          { name: "Expertise - Match tags with staff skills", value: "expertise" },
          { name: "Shift Based - Only clocked-in staff", value: "shift-based" },
          { name: "Manual - Disable auto-assignment", value: "manual" }
        ] },
        { name: "auto_assign", description: "Enable automatic assignment", type: 5, required: false },
        { name: "require_on_duty", description: "Only assign to clocked-in staff", type: 5, required: false },
        { name: "max_tickets_per_staff", description: "Maximum open tickets per staff member", type: 4, required: false }
      ] },
      { name: "workload", description: "View current staff workload", type: 1 }
    ] }
  ];

  // Sanitize commands to meet Discord length limits
  const clamp = (s: any, max: number) => {
    if (typeof s !== 'string') return s;
    return s.length > max ? s.slice(0, max) : s;
  };
  const sanitizeOption = (opt: any): any => {
    if (!opt || typeof opt !== 'object') return opt;
    if (opt.name) opt.name = clamp(opt.name, 32);
    if (opt.description) opt.description = clamp(opt.description, 100);
    if (Array.isArray(opt.choices)) {
      opt.choices = opt.choices.map((ch: any) => {
        if (ch && typeof ch === 'object') {
          if (ch.name) ch.name = clamp(ch.name, 100);
          if (typeof ch.value === 'string') ch.value = clamp(ch.value, 100);
        }
        return ch;
      });
    }
    if (Array.isArray(opt.options)) {
      opt.options = opt.options.map((sub: any) => sanitizeOption(sub));
    }
    return opt;
  };
  const sanitizeCommand = (cmd: any): any => {
    if (!cmd || typeof cmd !== 'object') return cmd;
    if (cmd.name) cmd.name = clamp(cmd.name, 32);
    if (cmd.description) cmd.description = clamp(cmd.description, 100);
    if (Array.isArray(cmd.options)) {
      cmd.options = cmd.options.map((opt: any) => sanitizeOption(opt));
    }
    return cmd;
  };
  const sanitizedCommands = commands.map((c) => sanitizeCommand({ ...c }));

  // Update the PRIORITY_NAMES set to include the new commands
  const PRIORITY_NAMES = new Set<string>([
    // Core system commands
    'help', 'ping', 'redeploy', 'diagcommands', 'cmdpermissions', 'abusebypass',
    // Shift & Payroll - CRITICAL for staff operations
    'clockin', 'clockout', 'shifts', 'shiftstats', 'whosonduty', 'payroll', 'schedule',
    'upt', 'attendance',
    // Staff Management - CRITICAL
    'staffactivity', 'promotion', 'staffsuspension',
    // Ticket system commands - PRIORITY
    'ticket', 'ticketsla', 'tickettag', 'ticketnote', 'ticketanalytics', 'ticketcategory',
    'ticketfeedback', 'autoresponse', 'staffexpertise', 'ticketrouting',
    // Support & Rewards
    'supportstats', 'achievements', 'claimperks', 'perks', 'leaderboard',
    // Moderation essentials
    'warn', 'mute', 'unmute', 'kick', 'ban', 'unban', 'timeout', 'cases',
    // Configuration
    'kb', 'setcolor', 'whitelist', 'appeal', 'appealhistory'
  ]);
  
  // Adjust the buildFinalCommands function to ensure prioritized commands are included
  const buildFinalCommands = (all: any[]) => {
    const byName = new Map<string, any>();
    all.forEach(c => byName.set(c.name, c));
    const prioritized: any[] = [];
  
    // Add prioritized commands first
    all.forEach(c => {
      if (PRIORITY_NAMES.has(c.name)) prioritized.push(c);
    });
  
    console.log(`[COMMAND PRIORITY] Found ${prioritized.length} priority commands out of ${PRIORITY_NAMES.size} requested`);
    console.log(`[COMMAND PRIORITY] Priority commands found: ${prioritized.map(c => c.name).sort().join(', ')}`);
    
    // Check which priority commands are missing
    const foundPriorityNames = new Set(prioritized.map(c => c.name));
    const missingPriority = Array.from(PRIORITY_NAMES).filter(name => !foundPriorityNames.has(name));
    if (missingPriority.length > 0) {
      console.warn(`[COMMAND PRIORITY] Missing ${missingPriority.length} priority commands: ${missingPriority.join(', ')}`);
    }
  
    // Add the rest of the commands, ensuring no duplicates
    const rest = all.filter(c => !PRIORITY_NAMES.has(c.name));
    const combined: any[] = [];
    const seen = new Set<string>();
    for (const c of [...prioritized, ...rest]) {
      if (!seen.has(c.name)) {
        combined.push(c);
        seen.add(c.name);
      }
    }
  
    // Truncate to 100 commands if necessary
    if (combined.length > 100) {
      console.warn(`Command count (${combined.length}) exceeds Discord limit (100). Truncating to first 100.`);
      const truncated = combined.slice(0, 100);
      const removed = combined.slice(100).map(c => c.name);
      console.warn(`[COMMAND PRIORITY] Removed commands: ${removed.join(', ')}`);
      return truncated;
    }
  
    return combined;
  };
  const finalCommands = buildFinalCommands(sanitizedCommands);

  // Define a minimal set of global commands that should be available in DMs (outside guild scope)
  // Keep this list small to speed up global propagation and avoid clutter.
  const globalCommandNames = new Set<string>(['appeal', 'perks']);
  // Include appealhistory globally for DMs for self-view only
  globalCommandNames.add('appealhistory');
  const globalCommands = finalCommands.filter((c: any) => globalCommandNames.has(c.name));

  (async () => {
    try {
      if (!client.application) return;
      if (guildId) {
        const setRes = await client.application.commands.set(finalCommands, guildId);
        console.log(`Registered ${finalCommands.length}/${commands.length} slash commands for guild ${guildId}`);
        try {
          const names = Array.from(setRes.values()).map(c => c.name).sort();
          console.log(`Guild command names (${names.length}): ${names.join(', ')}`);
        } catch {}
        // Additionally, ensure DM-usable commands are registered globally (e.g., /appeal)
        try {
          const globalSet = await client.application.commands.set(globalCommands as any);
          const gNames = Array.from((globalSet as any).values?.() ?? []).map((c: any) => c.name).sort();
          console.log(`Registered ${gNames.length}/${globalCommands.length} global commands: ${gNames.join(', ')}`);
        } catch (e) {
          console.warn('Failed to register global DM commands:', e);
        }
      } else {
        const setRes = await client.application.commands.set(finalCommands as any);
        console.log(`Registered ${finalCommands.length}/${commands.length} global slash commands`);
        try {
          const names = Array.from((setRes as any).values?.() ?? []).map((c: any) => c.name).sort();
          if (names.length) console.log(`Global command names (${names.length}): ${names.join(', ')}`);
        } catch {}
      }
    } catch (err) {
      console.error("Failed to register slash commands:", err);
      // Validate command descriptions to find the issue
      commands.forEach((cmd: any, idx: number) => {
        if (cmd.description && cmd.description.length > 100) {
          console.error(`Command ${idx} "${cmd.name}" description too long: ${cmd.description.length} chars - "${cmd.description}"`);
        }
        if (cmd.options) {
          cmd.options.forEach((opt: any, optIdx: number) => {
            if (opt.description && opt.description.length > 100) {
              console.error(`Command ${idx} "${cmd.name}" option ${optIdx} "${opt.name}" description too long: ${opt.description.length} chars - "${opt.description}"`);
            }
            if (opt.options) {
              opt.options.forEach((subOpt: any, subIdx: number) => {
                if (subOpt.description && subOpt.description.length > 100) {
                  console.error(`Command ${idx} "${cmd.name}" option ${optIdx} "${opt.name}" sub-option ${subIdx} "${subOpt.name}" description too long: ${subOpt.description.length} chars - "${subOpt.description}"`);
                }
              });
            }
          });
        }
      });
    }
  })();
});

// Handle modal submissions for feedback and channel suggestions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  
  const customId = interaction.customId;
  
  // Channel suggestion modal
  if (customId.startsWith('cs_modal:')) {
    try {
      const { handleChannelSuggestionModal } = await import('./services/channelSuggestions');
      const handled = await handleChannelSuggestionModal(interaction as any);
      if (handled) return;
    } catch (e:any) {
      console.error('Channel suggestion modal handler failed:', e);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Something went wrong. Try again.', ephemeral: true });
        }
      } catch {}
    }
    return;
  }

  // Emoji request modal
  if (customId.startsWith('emoji_modal:')) {
    try {
      const { handleEmojiRequestModal } = await import('./services/emojiRequests');
      const handled = await handleEmojiRequestModal(interaction as any);
      if (handled) return;
    } catch (e:any) {
      console.error('Emoji request modal handler failed:', e);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Something went wrong processing the emoji request.', ephemeral: true });
        }
      } catch {}
    }
    return;
  }

  // Ticket creation modal with custom fields
  if (customId.startsWith('ticket-modal:')) {
    try {
      if (!interaction.guild) return;
      
      const categoryName = customId.split(':')[1];
      const { getTicketCategory, createTicket, getTicketConfig, getSupportRoleIds, getTicketById, setTicketCustomField, addTagToTicket } = await import('./services/tickets');
      
      const category = getTicketCategory(interaction.guild.id, categoryName);
      if (!category) {
        return interaction.reply({ content: '❌ Category not found.', ephemeral: true });
      }
      
      const config = getTicketConfig(interaction.guild.id);
      if (!config) {
        return interaction.reply({ content: '❌ Ticket system is not configured.', ephemeral: true });
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      // Collect custom field values
      const customFieldValues: { [key: string]: string } = {};
      if (category.custom_fields) {
        for (const field of category.custom_fields) {
          const value = interaction.fields.getTextInputValue(field.name);
          customFieldValues[field.name] = value;
        }
      }
      
      const supportRoleIds = getSupportRoleIds(interaction.guild.id);
      
      // Create permission overwrites
      const permissionOverwrites: any[] = [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        { id: interaction.client.user!.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
      ];
      
      for (const roleId of supportRoleIds) {
        permissionOverwrites.push({
          id: roleId,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks]
        });
      }
      
      try {
        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`,
          type: 0,
          parent: config.category_id,
          permissionOverwrites: permissionOverwrites
        });
        
        const ticketId = createTicket(interaction.guild.id, ticketChannel.id, interaction.user.id, categoryName);
        
        // Save custom field values
        for (const [fieldName, fieldValue] of Object.entries(customFieldValues)) {
          setTicketCustomField(ticketId, fieldName, fieldValue);
        }
        
        // Apply auto-tags if configured
        if (category.auto_tags && category.auto_tags.length > 0) {
          for (const tag of category.auto_tags) {
            addTagToTicket(ticketId, tag);
          }
        }
        
        const newTicket = getTicketById(ticketId);
        const tagsDisplay = newTicket ? formatTicketTags(newTicket) : '';
        
        // Build custom fields display
        let fieldsDisplay = '';
        if (category.custom_fields && category.custom_fields.length > 0) {
          fieldsDisplay = '\n\n**Ticket Information:**\n';
          for (const field of category.custom_fields) {
            const value = customFieldValues[field.name] || 'Not provided';
            fieldsDisplay += `**${field.label}:** ${value.length > 100 ? value.slice(0, 100) + '...' : value}\n`;
          }
        }
        
        const ticketEmbed = new EmbedBuilder()
          .setTitle(`${category.emoji || '📁'} Ticket #${ticketId}`)
          .setColor(parseInt(category.color?.replace('#', '') || '5865F2', 16))
          .setDescription(`**Category:** ${categoryName}\n**Opened by:** <@${interaction.user.id}>${tagsDisplay}${fieldsDisplay}\n\nThanks for opening a ticket. Please wait for staff assistance.`)
          .setFooter({ text: 'Use the button below or /ticket close to close this ticket' });
        
        const ticketActions = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`ticket-close:${ticketId}`).setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
        );
        
        const supportMentions = supportRoleIds.length > 0 ? supportRoleIds.map(id => `<@&${id}>`).join(' ') : 'New ticket!';
        
        await ticketChannel.send({ 
          content: `${supportMentions} - <@${interaction.user.id}>`, 
          embeds: [ticketEmbed],
          components: [ticketActions]
        });
        
        return interaction.editReply({ content: `✅ Ticket created: <#${ticketChannel.id}>` });
      } catch (e) {
        console.error('[Ticket] Failed to create ticket with custom fields:', e);
        return interaction.editReply({ content: '❌ Failed to create ticket. Please try again or contact staff.' });
      }
    } catch (e:any) {
      console.error('Ticket modal handler failed:', e);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Something went wrong creating the ticket.', ephemeral: true });
        }
      } catch {}
    }
    return;
  }

  // Payday payment submission modal
  if (customId.startsWith('payday_submit_')) {
    try {
      console.log(`[Payday] Processing payment submission for ${interaction.user.tag} - Type: ${customId.split('_')[2]}`);
      await interaction.deferReply({ ephemeral: true });

      const parts = customId.split('_');
      const paymentType = parts[2]; // paypal, cashapp, venmo, btc, eth, ltc, usdt
      const guildId = parts[3]; // Guild ID embedded in modal
      const paydayId = parts.slice(4).join('_');

      console.log(`[Payday] Payment type: ${paymentType}, Guild: ${guildId}, Payday ID: ${paydayId}`);

      const credentials = interaction.fields.getTextInputValue('credentials');
      const notes = interaction.fields.getTextInputValue('notes') || undefined;

      const { savePaymentMethod, recordPaydaySubmission, getTotalUnpaidBalance, getEffectivePayMultiplier, hasSubmittedForPayday } = await import('./services/payroll');

      // Double-check not already submitted
      if (hasSubmittedForPayday(guildId, interaction.user.id, paydayId)) {
        console.log(`[Payday] User ${interaction.user.tag} already submitted for this payday`);
        return interaction.editReply({ content: '✅ You have already submitted your payment details for this payday!' });
      }

      // Get guild and fetch member to calculate pay (with timeout)
      console.log(`[Payday] Fetching guild ${guildId}...`);
      const guild = await Promise.race([
        interaction.client.guilds.fetch(guildId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Guild fetch timeout')), 5000))
      ]) as any;
      
      console.log(`[Payday] Fetching member ${interaction.user.id}...`);
      const member = await Promise.race([
        guild.members.fetch(interaction.user.id),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Member fetch timeout')), 5000))
      ]) as any;

      // Calculate amount owed
      console.log(`[Payday] Calculating amount owed...`);
      const unpaidBalance = getTotalUnpaidBalance(guildId, interaction.user.id);
      const multiplier = getEffectivePayMultiplier(guildId, interaction.user.id, member.roles.cache.map((r: any) => r.id));
      const amountOwed = unpaidBalance.totalPay * multiplier;
      console.log(`[Payday] Amount owed: $${amountOwed.toFixed(2)}`);

      // Save payment method for future use
      console.log(`[Payday] Saving payment method...`);
      savePaymentMethod(guildId, interaction.user.id, paymentType, credentials, notes);

      // Record submission
      console.log(`[Payday] Recording submission...`);
      recordPaydaySubmission(guildId, interaction.user.id, paydayId, paymentType, credentials, amountOwed);

      // Confirm to user
      console.log(`[Payday] Sending confirmation to user...`);
      await interaction.editReply({ 
        content: `✅ **Payment details submitted successfully!**\n\n**Method:** ${paymentType.toUpperCase()}\n**Amount:** $${amountOwed.toFixed(2)}\n\nYour payment information has been sent to the owner. You will receive payment soon! 💰`
      });
      console.log(`[Payday] User confirmation sent successfully`);

      // Send to owner (wrapped in try-catch so it doesn't block user confirmation)
      try {
        const ownerIds = ['1272923881052704820']; // Your owner ID
        
        for (const ownerId of ownerIds) {
          try {
            const owner = await interaction.client.users.fetch(ownerId);
            
            const paymentEmbed = new EmbedBuilder()
              .setTitle('💰 Payday Payment Submission')
              .setColor(0x57F287)
              .setDescription(`**Staff Member:** ${interaction.user.tag} (<@${interaction.user.id}>)`)
              .addFields(
                { name: '💵 Amount Owed', value: `$${amountOwed.toFixed(2)}`, inline: true },
                { name: '💳 Payment Method', value: paymentType.toUpperCase(), inline: true },
                { name: '⏱️ Hours Worked', value: `${unpaidBalance.totalHours.toFixed(2)}h`, inline: true },
                { name: '📝 Payment Details', value: `\`${credentials}\``, inline: false }
              )
              .setFooter({ text: `Payday ID: ${paydayId} • User ID: ${interaction.user.id}` })
              .setTimestamp();

            if (notes) {
              paymentEmbed.addFields({ name: '📋 Additional Notes', value: notes, inline: false });
            }

            await owner.send({ embeds: [paymentEmbed] });
          } catch (error) {
            console.error(`Failed to send payday notification to owner ${ownerId}:`, error);
          }
        }
      } catch (error) {
        console.error('Failed to notify owners of payday submission:', error);
      }

      return;
    } catch (error: any) {
      console.error('[Payday] Error processing payday submission modal:', error);
      console.error('[Payday] Error details:', {
        message: error?.message,
        stack: error?.stack,
        userId: interaction.user.id,
        customId: customId
      });
      const errorMsg = error?.message || 'Unknown error';
      return interaction.editReply({ 
        content: `❌ An error occurred while processing your payment details.\n\n**Error:** ${errorMsg}\n\nPlease try again or contact an administrator.` 
      }).catch(e => {
        console.error('[Payday] Failed to send error message:', e);
      });
    }
  }
  
  if (customId.startsWith('ticket-feedback-submit:')) {
    // CRITICAL: Defer reply immediately to prevent "interaction failed"
    await interaction.deferReply({ ephemeral: true });

    const [, ticketIdStr, ratingStr] = customId.split(':');
    const ticketId = parseInt(ticketIdStr);
    const rating = parseInt(ratingStr);
    const feedback = interaction.fields.getTextInputValue('feedback');

    const { getTicketById } = await import('./services/tickets');
    const ticket = getTicketById(ticketId);

    if (!ticket) {
      return interaction.editReply({ content: '❌ Ticket not found.' });
    }

    // Only ticket owner can provide feedback
    if (ticket.user_id !== interaction.user.id) {
      return interaction.editReply({ content: '❌ Only the ticket owner can provide feedback.' });
    }

    // Generate transcript
    const channel = await interaction.guild?.channels.fetch(ticket.channel_id);
    let transcript = '';
    if (channel && 'messages' in channel) {
      const messages = await (channel as any).messages.fetch({ limit: 100 });
      transcript = messages.reverse().map((m: any) => 
        `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}`
      ).join('\n');
    }

    // Close ticket with feedback
    await closeTicketWithFeedback(interaction, ticket, rating, transcript, feedback);
  }
});

// Helper function to close ticket with feedback
async function closeTicketWithFeedback(interaction: any, ticket: any, rating: number, transcript: string, feedback?: string) {
  const { closeTicket, getTicketConfig, getTicketHelpers } = await import('./services/tickets');
  
  // Close the ticket
  console.log(`[DEBUG] Closing ticket ${ticket.id} in database`);
  const closed = closeTicket(ticket.channel_id, transcript);
  console.log(`[DEBUG] Ticket close result: ${closed}`);

  // Update support interaction with feedback
  if (ticket.support_interaction_id) {
    try {
      const { endSupportInteraction } = await import('./services/smartSupport');
      endSupportInteraction({
        interactionId: ticket.support_interaction_id,
        wasResolved: rating >= 6,
        satisfactionRating: rating,
        feedbackText: feedback
      });
    } catch (e) {
      console.error('Failed to end support interaction:', e);
    }
  }

  // Save detailed feedback to new system
  try {
    const { submitTicketFeedback, markFeedbackRewardGiven } = await import('./services/tickets');
    const { awardDirectPoints } = await import('./services/rewards');
    
    // Determine helpful/improvement tags based on rating
    const helpfulTags = rating >= 8 ? ['quick-response', 'professional', 'helpful'] : rating >= 6 ? ['resolved'] : [];
    const improvementTags = rating < 6 ? ['response-time', 'clarity'] : [];
    
    const feedbackId = submitTicketFeedback(
      ticket.id,
      ticket.guild_id,
      ticket.user_id,
      ticket.claimed_by,
      rating,
      feedback,
      helpfulTags.length > 0 ? helpfulTags : undefined,
      improvementTags.length > 0 ? improvementTags : undefined
    );
    
    // Check for automatic reward eligibility (rating >= 9)
    if (rating >= 9 && ticket.claimed_by) {
      const REWARD_POINTS = 50; // Bonus points for excellent support
      awardDirectPoints(
        ticket.claimed_by,
        ticket.guild_id,
        REWARD_POINTS,
        `Excellent Support Bonus - Ticket #${ticket.id} (${rating}/10 rating)`,
        'support' // Use support category for bonus
      );
      markFeedbackRewardGiven(feedbackId);
      console.log(`🎁 Awarded ${REWARD_POINTS} bonus points to ${ticket.claimed_by} for ${rating}/10 rating`);
    }
  } catch (e) {
    console.error('Failed to save feedback:', e);
  }

  // Award points to claimer and helpers based on rating and feedback
  try {
    const { calculateTicketPoints, awardDirectPoints } = await import('./services/rewards');
    const helpers = getTicketHelpers(ticket.channel_id);
    
    const pointsCalc = calculateTicketPoints({
      wasClaimed: !!ticket.claimed_by,
      wasResolved: rating >= 6,
      rating: rating,
      feedback: feedback,
      claimerId: ticket.claimed_by,
      helpers: helpers
    });

    // Award points to primary claimer
    if (pointsCalc.primaryRecipient) {
      awardDirectPoints(
        pointsCalc.primaryRecipient,
        ticket.guild_id,
        pointsCalc.totalPoints,
        `Ticket #${ticket.id}: ${pointsCalc.breakdown.map(b => b.reason).join(', ')}`,
        'support'
      );
      console.log(`✨ Awarded ${pointsCalc.totalPoints} points to ${pointsCalc.primaryRecipient} for ticket #${ticket.id}`);
      console.log(`   Breakdown: ${pointsCalc.breakdown.map(b => `${b.reason} (+${b.points})`).join(', ')}`);
    }

    // Award points to helpers
    for (const [helperId, helperPoints] of pointsCalc.helperPoints.entries()) {
      awardDirectPoints(
        helperId,
        ticket.guild_id,
        helperPoints,
        `Ticket #${ticket.id}: Helper assistance`,
        'support'
      );
      console.log(`✨ Awarded ${helperPoints} points to helper ${helperId} for ticket #${ticket.id}`);
    }
  } catch (e) {
    console.error('Failed to award ticket points:', e);
  }

  // Post vouch with feedback if provided
  const config = getTicketConfig(ticket.guild_id);
  if (config?.vouch_channel_id) {
    try {
      const vouchChannel = await interaction.guild?.channels.fetch(config.vouch_channel_id) as any;
      const helpers = getTicketHelpers(ticket.channel_id);
      const allStaff = [...new Set([ticket.claimed_by, ...helpers].filter(Boolean))];

      // Determine color and emoji based on rating
      let color = 0xFF0000; // Red for low ratings
      let titlePrefix = '❌ Low Rating';
      let ratingDisplay = `${rating}/10`;

      if (rating >= 8) {
        color = 0xFFD700; // Gold for excellent (8-10)
        titlePrefix = '⭐ Excellent Support';
        ratingDisplay = `${rating}/10 ⭐`;
      } else if (rating >= 6) {
        color = 0x00AE86; // Green for good (6-7)
        titlePrefix = '✅ Good Support';
        ratingDisplay = `${rating}/10`;
      } else if (rating >= 4) {
        color = 0xFFA500; // Orange for average (4-5)
        titlePrefix = '⚠️ Average Support';
        ratingDisplay = `${rating}/10`;
      }

      const vouchEmbed = new EmbedBuilder()
        .setTitle(`${titlePrefix} - Ticket Review`)
        .setColor(color)
        .setDescription(`**Rating:** ${ratingDisplay}\n**Ticket:** #${ticket.id} - ${ticket.category}`)
        .addFields(
          { name: 'User', value: `<@${ticket.user_id}>`, inline: true },
          { name: 'Support Staff', value: allStaff.map(id => `<@${id}>`).join(', ') || 'Unknown', inline: true }
        )
        .setTimestamp();

      // Add feedback if provided
      if (feedback && feedback.trim()) {
        vouchEmbed.addFields({ name: 'User Feedback', value: feedback.slice(0, 1024) });
      }

      await vouchChannel.send({ embeds: [vouchEmbed] });
    } catch (e) {
      console.error('Failed to post vouch:', e);
    }
  }

  // Log to log channel with feedback
  if (config?.log_channel_id) {
    try {
      const logChannel = await interaction.guild?.channels.fetch(config.log_channel_id) as any;
      const tagsDisplay = formatTicketTags(ticket);
      const logEmbed = new EmbedBuilder()
        .setTitle('🎫 Ticket Closed')
        .setColor(0x5865F2)
        .setDescription(`**Rating:** ${rating}/10${tagsDisplay}`)
        .addFields(
          { name: 'Ticket', value: `#${ticket.id} - ${ticket.category}`, inline: true },
          { name: 'User', value: `<@${ticket.user_id}>`, inline: true },
          { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true }
        );

      if (feedback && feedback.trim()) {
        logEmbed.addFields({ name: 'User Feedback', value: feedback.slice(0, 1024) });
      }

      await logChannel.send({ embeds: [logEmbed], files: transcript ? [{ attachment: Buffer.from(transcript), name: `ticket-${ticket.id}-transcript.txt` }] : [] });
    } catch (e) {
      console.error('Failed to log ticket:', e);
    }
  }

  // Reply and close
  const replyMessage = feedback 
    ? `✅ Thank you for your ${rating}/10 rating and feedback! This ticket will close in 5 seconds.`
    : `✅ Thank you for your ${rating}/10 rating! This ticket will close in 5 seconds.`;

  // Use editReply if deferred, reply if not
  if (interaction.deferred) {
    await interaction.editReply({ content: replyMessage });
  } else {
    await interaction.reply({ content: replyMessage, ephemeral: true });
  }

  // Delete channel after delay
  setTimeout(async () => {
    try {
      console.log(`[DEBUG] Attempting to delete ticket channel ${ticket.channel_id}`);
      const channel = await interaction.guild?.channels.fetch(ticket.channel_id);
      if (channel) {
        console.log(`[DEBUG] Channel found, deleting...`);
        await (channel as any).delete();
        console.log(`[DEBUG] Channel deleted successfully`);
      } else {
        console.log(`[DEBUG] Channel not found for deletion`);
      }
    } catch (e) {
      console.error('Failed to delete channel:', e);
    }
  }, 5000);
}

client.on("interactionCreate", async (interaction) => {
  try {
    // Handle color-picker select menu interaction
    if (interaction.isStringSelectMenu() && interaction.customId === 'color-picker') {
      const selectedColor = interaction.values[0];
      try {
        const guild = interaction.guild;
        if (!guild) {
          return interaction.reply({ content: 'This interaction can only be used in a server.', flags: 64 });
        }

        const member = await guild.members.fetch(interaction.user.id);
        const role = member.roles.cache.find(r => r.name === 'Custom Color');

        if (!role) {
          return interaction.reply({ content: 'You do not have a role named "Custom Color". Please contact an admin.', flags: 64 });
        }

        await role.setColor(selectedColor as ColorResolvable, 'Updated via color-picker interaction');
        await interaction.reply({ content: `Your role color has been updated to ${selectedColor}!`, flags: 64 });
      } catch (error) {
        console.error('Failed to update role color:', error);
        await interaction.reply({ content: 'An error occurred while updating your role color. Please try again later.', flags: 64 });
      }
      return;
    }
    // Button interactions for perks panel and approvals
    if (interaction.isButton()) {
      const btn = interaction.customId || '';
      // Claim from panel: perk-claim:<id>
      if (btn.startsWith('perk-claim:')) {
        const perkId = btn.split(':')[1];
        // Reuse the slash by pseudo-invoking: tell user to run it if not supported here
        try {
          const { getUnlockedPerks } = await import('./services/rewards');
          const { getPerkRolePreference, isPerkEnabled } = await import('./config/perksConfig');
          if (!isPerkEnabled(perkId as any)) {
            return interaction.reply({ content: 'This perk is disabled by server configuration.', ephemeral: true });
          }
          const perks = getUnlockedPerks(interaction.user.id, interaction.guild?.id || null);
          const target = (perks as any[]).find(p => p.id === perkId);
          if (!target || !target.unlocked) {
            return interaction.reply({ content: 'You have not unlocked this perk yet. Use /perks to see requirements.', ephemeral: true });
          }
          // Minimal inline claim for role-based perks; otherwise route to slash
          const guild = interaction.guild!;
          const member = await guild.members.fetch(interaction.user.id);
          // For perks that do NOT require a role, just inform the user
          if (perkId === 'channel_suggest') {
            return interaction.reply({ content: '📣 You can already suggest channels using /channelsuggestion. No role needed.', ephemeral: true });
          }

          if (perkId === 'priority_support' || perkId === 'voice_priority' || perkId === 'exclusive_role') {
            const pref = getPerkRolePreference(perkId as any);
            // Ensure role exists (fallback to name)
            let roleId = pref.roleId;
            if (!roleId) {
              const name = pref.roleName || (perkId === 'priority_support' ? 'Priority Support' : (perkId === 'voice_priority' ? 'Voice Priority' : 'Exclusive VIP'));
              // Attempt smarter matching to avoid duplicate role creation (case-insensitive + synonyms)
              const synonyms: string[] = [];
              if (perkId === 'voice_priority') synonyms.push('priority', 'voice priority', 'priority speaker');
              if (perkId === 'priority_support') synonyms.push('priority support', 'support priority');
              if (perkId === 'exclusive_role') synonyms.push('exclusive vip', 'vip', 'exclusive');
              const lowered = guild.roles.cache.map(r => ({ name: r.name, id: r.id, lower: r.name.toLowerCase() }));
              const targetNames = [name.toLowerCase(), ...synonyms.map(s => s.toLowerCase())];
              const existingMatch = lowered.find(r => targetNames.includes(r.lower));
              const existing = existingMatch ? guild.roles.cache.get(existingMatch.id) : guild.roles.cache.find(r => r.name === name);
              if (existing) roleId = existing.id;
              else {
                const perms = perkId === 'voice_priority' ? (await import('discord.js')).PermissionsBitField.Flags.PrioritySpeaker : undefined;
                const created = await guild.roles.create({ name, permissions: perms ? new (await import('discord.js')).PermissionsBitField(perms) : undefined, reason: 'Perks panel claim' });
                roleId = created.id;
                // Persist so future claims don't recreate
                try { const { setPerkRoleId } = await import('./config/perksConfig'); setPerkRoleId(perkId as any, roleId); } catch {}
              }
            }
            await member.roles.add(roleId!).catch(() => {});
            return interaction.reply({ content: `✅ Perk claimed: ${perkId.replace('_',' ')}`, ephemeral: true });
          }
          if (perkId === 'custom_color') {
            return interaction.reply({ content: 'Use /setcolor to choose your color from a dropdown menu.', ephemeral: true });
          }
          if (perkId === 'custom_emoji') {
            return interaction.reply({ content: 'Use /requestemoji name:<short_name> image:<attachment> to request your emoji.', ephemeral: true });
          }
        } catch (e:any) {
          console.warn('perk panel claim failed:', e?.message ?? e);
          return interaction.reply({ content: 'Could not process this claim here. Please use /claimperk instead.', ephemeral: true });
        }
      }
      // Emoji approvals: perk-emoji-approve:<id> / reject
      if (btn.startsWith('perk-emoji-approve:') || btn.startsWith('perk-emoji-reject:')) {
        if (!interaction.guild) return;
        const approve = btn.startsWith('perk-emoji-approve:');
        const idStr = btn.split(':')[1];
        const reqId = Number(idStr);
        const db = await import('./services/db').then(m => m.getDB());
        const row = db.prepare('SELECT * FROM emoji_requests WHERE id = ?').get(reqId) as any;
        if (!row) return interaction.reply({ content: `Request #${reqId} not found.`, ephemeral: true });
        if (row.status !== 'pending') return interaction.reply({ content: `Request #${reqId} is already ${row.status}.`, ephemeral: true });
        if (!approve) {
          db.prepare('UPDATE emoji_requests SET status = ?, approver_id = ?, decided_at = ? WHERE id = ?').run('rejected', interaction.user.id, new Date().toISOString(), reqId);
          return interaction.reply({ content: `Rejected request #${reqId}.`, ephemeral: true });
        }
        // Approve path: create emoji
        try {
          const me = await interaction.guild.members.fetchMe();
          if (!me.permissions.has((await import('discord.js')).PermissionsBitField.Flags.ManageEmojisAndStickers)) {
            return interaction.reply({ content: 'I need Manage Emojis permission to approve.', ephemeral: true });
          }
          const res = await fetch(row.attachment_url);
          const buf = Buffer.from(await res.arrayBuffer());
          const emoji = await interaction.guild.emojis.create({ attachment: buf, name: row.name });
          db.prepare('UPDATE emoji_requests SET status = ?, approver_id = ?, decided_at = ? WHERE id = ?').run('approved', interaction.user.id, new Date().toISOString(), reqId);
          return interaction.reply({ content: `✅ Created <:${emoji.name}:${emoji.id}> for request #${reqId}.`, ephemeral: true });
        } catch (e:any) {
          db.prepare('UPDATE emoji_requests SET status = ?, approver_id = ?, decision_reason = ?, decided_at = ? WHERE id = ?').run('failed', interaction.user.id, String(e?.message ?? e), new Date().toISOString(), reqId);
          return interaction.reply({ content: `Failed to create emoji: ${e?.message ?? e}`, ephemeral: true });
        }
      }
      
      // Channel suggestion buttons (accept/decline)
      if (btn.startsWith('channel_suggestion_')) {
        try {
          const { handleChannelSuggestionButton } = await import('./services/channelSuggestions');
          const handled = await handleChannelSuggestionButton(interaction as any);
          if (handled) return;
        } catch (e:any) {
          console.warn('channel suggestion button handler failed:', e?.message ?? e);
        }
      }

      // Emoji request buttons (accept/decline)
      if (btn.startsWith('emoji_request_accept_') || btn.startsWith('emoji_request_decline_')) {
        try {
          const { handleEmojiRequestButton } = await import('./services/emojiRequests');
          const handled = await handleEmojiRequestButton(interaction as any);
          if (handled) return;
        } catch (e:any) {
          console.warn('emoji request button handler failed:', e?.message ?? e);
        }
      }

      // Ticket panel open button
      if (btn === 'ticket-open') {
        try {
          if (!interaction.guild) return interaction.reply({ content: 'This can only be used in a server.', ephemeral: true });
          const { getTicketConfig, createTicket, getUserTickets, isTicketBlacklisted, getTicketBlacklist, getTicketCategories } = await import('./services/tickets');
          
          // Check if user is blacklisted
          if (isTicketBlacklisted(interaction.user.id, interaction.guild.id)) {
            const blacklistEntry = getTicketBlacklist(interaction.user.id, interaction.guild.id);
            const reason = blacklistEntry?.reason || 'Violation of ticket system rules';
            return interaction.reply({ 
              content: `❌ You are blacklisted from creating tickets.\n**Reason:** ${reason}\n\nContact an administrator to appeal this blacklist.`, 
              ephemeral: true 
            });
          }
          
          const config = getTicketConfig(interaction.guild.id);
          if (!config || !config.enabled) {
            return interaction.reply({ content: '❌ Ticket system is not configured. Please notify an admin.', ephemeral: true });
          }
          // Check user has no open ticket
          const userTickets = getUserTickets(interaction.guild.id, interaction.user.id);
          const openTicket = userTickets.find((t:any) => t.status !== 'closed');
          if (openTicket) {
            // Try to fetch the channel to see if it still exists
            const channel = await interaction.guild.channels.fetch(openTicket.channel_id).catch(() => null);
            if (!channel) {
              // Channel doesn't exist anymore, force close the ticket
              const { closeTicket } = await import('./services/tickets');
              closeTicket(openTicket.channel_id);
              console.log(`[Ticket] Force closed orphaned ticket #${openTicket.id} (channel deleted)`);
              // Continue with ticket creation
            } else {
              return interaction.reply({ content: `❌ You already have an open ticket: <#${openTicket.channel_id}> (Status: ${openTicket.status})`, ephemeral: true });
            }
          }
          
          // Check if categories exist - show category selection
          const categories = getTicketCategories(interaction.guild.id);
          if (categories.length > 0) {
            // Show category selection dropdown
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId('ticket-category-select')
              .setPlaceholder('Select a ticket category')
              .addOptions(categories.map(cat => ({
                label: cat.name,
                value: cat.name,
                description: cat.description?.slice(0, 100) || 'No description',
                emoji: cat.emoji || '📁'
              })));
            
            const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
            
            return interaction.reply({
              content: '**Please select a ticket category:**',
              components: [row],
              ephemeral: true
            });
          }
          
          // No categories - use old flow (continue with default ticket creation)
          
          // Get support roles to grant them access
          const { getSupportRoleIds } = await import('./services/tickets');
          const supportRoleIds = getSupportRoleIds(interaction.guild.id);
          
          // Create permission overwrites array using PermissionsBitField
          const permissionOverwrites: any[] = [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: interaction.client.user!.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
          ];
          
          // Add permissions for all support roles
          for (const roleId of supportRoleIds) {
            permissionOverwrites.push({
              id: roleId,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks]
            });
          }
          
          // Create ticket channel with support role permissions
          const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: 0,
            parent: config.category_id,
            permissionOverwrites
          });
          
          // Create ticket in database AFTER channel is created successfully
          const ticketId = createTicket(interaction.guild.id, (ticketChannel as any).id, interaction.user.id, 'general');
          console.log(`[Ticket] Created ticket #${ticketId} in channel ${ticketChannel.id} for user ${interaction.user.id}`);
          
          const { getTicketById } = await import('./services/tickets');
          const newTicket = getTicketById(ticketId);
          const tagsDisplay = newTicket ? formatTicketTags(newTicket) : '';
          
          const ticketEmbed = new EmbedBuilder()
            .setTitle(`🎫 Ticket #${ticketId}`)
            .setColor(0x00AE86)
            .setDescription(`**Opened by:** <@${interaction.user.id}>${tagsDisplay}\n\nThanks for opening a ticket. Please describe your issue and any details that can help us assist you.`)
            .setFooter({ text: 'Use the button below or /ticket close to close this ticket' });

          const ticketActions = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`ticket-close:${ticketId}`).setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
          );

          const supportMentions = supportRoleIds.length > 0 
            ? supportRoleIds.map(id => `<@&${id}>`).join(' ')
            : 'New ticket!';

          try {
            await (ticketChannel as any).send({ 
              content: `${supportMentions} - <@${interaction.user.id}>`, 
              embeds: [ticketEmbed],
              components: [ticketActions]
            });
            console.log(`[Ticket] Successfully sent initial message to ticket #${ticketId}`);
          } catch (sendError) {
            console.error(`[Ticket] Failed to send initial message to ticket #${ticketId}:`, sendError);
            // Ticket still exists, just notify user with warning
            return interaction.reply({ 
              content: `⚠️ Ticket created but initial message failed. Please use <#${(ticketChannel as any).id}> - Ticket #${ticketId}`, 
              ephemeral: true 
            });
          }
          
          return interaction.reply({ content: `✅ Ticket created: <#${(ticketChannel as any).id}>`, ephemeral: true });
        } catch (e) {
          console.error('[Ticket] Failed to create ticket:', e);
          return interaction.reply({ content: '❌ Failed to create ticket. Please try again or contact staff.', ephemeral: true });
        }
      }

      // Shift panel refresh button
      if (btn === 'shifts-refresh') {
        try {
          if (!interaction.guild || !interaction.message) {
            return interaction.reply({ content: '❌ Invalid context.', ephemeral: true });
          }
          const embed = await buildShiftPanelEmbed(interaction.guild.id, interaction.client);
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('shifts-refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
          );
          await interaction.message.edit({ embeds: [embed], components: [row] });
          return interaction.reply({ content: '✅ Panel refreshed!', ephemeral: true });
        } catch (e) {
          console.error('Failed to refresh shift panel:', e);
          return interaction.reply({ content: '❌ Failed to refresh panel.', ephemeral: true });
        }
      }

      // Ticket close button
      if (btn.startsWith('ticket-close:')) {
        try {
          const [, ticketIdStr] = btn.split(':');
          const ticketId = parseInt(ticketIdStr);
          console.log(`[Ticket] Close button clicked - Ticket ID: ${ticketId}, Channel: ${interaction.channel?.id}`);

          if (!interaction.guild || !interaction.channel) {
            console.log(`[Ticket] Invalid context - Guild: ${!!interaction.guild}, Channel: ${!!interaction.channel}`);
            return interaction.reply({ content: '❌ Invalid context.', ephemeral: true });
          }

          const { getTicketById, closeTicket, getTicket } = await import('./services/tickets');
          
          // Try both methods to find the ticket
          let ticket = getTicketById(ticketId);
          if (!ticket) {
            console.log(`[Ticket] Not found by ID ${ticketId}, trying by channel ${interaction.channel.id}`);
            ticket = getTicket(interaction.channel.id);
          }

          if (!ticket) {
            console.log(`[Ticket] Ticket not found - ID: ${ticketId}, Channel: ${interaction.channel.id}`);
            return interaction.reply({ content: `❌ Ticket not found. (ID: ${ticketId})`, ephemeral: true });
          }
          
          console.log(`[Ticket] Found ticket - ID: ${ticket.id}, Status: ${ticket.status}, Owner: ${ticket.user_id}`);

          if (ticket.status === 'closed') {
            return interaction.reply({ content: '❌ This ticket is already closed.', ephemeral: true });
          }

          // Check permissions - only ticket owner, claimer, support staff, or admins can close
          const isOwner = ticket.user_id === interaction.user.id;
          const isClaimer = ticket.claimed_by === interaction.user.id;
          const hasManageChannels = (interaction.member as any)?.permissions?.has('ManageChannels');
          
          // Check if user has any support roles
          const { getSupportRoleIds } = await import('./services/tickets');
          const supportRoleIds = getSupportRoleIds(interaction.guild.id);
          const memberRoles = (interaction.member as any)?.roles?.cache 
            ? Array.from((interaction.member as any).roles.cache.keys()) 
            : [];
          const hasAnySupportRole = supportRoleIds.some(roleId => memberRoles.includes(roleId));
          
          if (!isOwner && !isClaimer && !hasManageChannels && !hasAnySupportRole) {
            return interaction.reply({ content: '❌ Only the ticket owner, assigned staff, or administrators can close this ticket.', ephemeral: true });
          }

          // Always ask ticket OWNER to rate before closing (regardless of who initiated the close)
          const ratingEmbed = new EmbedBuilder()
            .setTitle('📊 Rate Your Support Experience')
            .setDescription(`<@${ticket.user_id}>, please rate the support you received before we close this ticket.`)
            .setColor(0x5865F2)
            .addFields(
              { name: 'How would you rate your experience?', value: 'Click a rating below (1-10 scale)' }
            );

          // Create two rows for 1-10 rating buttons
          const ratingRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:1`).setLabel('1').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:2`).setLabel('2').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:3`).setLabel('3').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:4`).setLabel('4').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:5`).setLabel('5').setStyle(ButtonStyle.Secondary)
          );

          const ratingRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:6`).setLabel('6').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:7`).setLabel('7').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:8`).setLabel('8').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:9`).setLabel('9').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:10`).setLabel('10').setStyle(ButtonStyle.Success)
          );

          return interaction.reply({ embeds: [ratingEmbed], components: [ratingRow1, ratingRow2] });

        } catch (e) {
          console.error('Failed to close ticket:', e);
          return interaction.reply({ content: '❌ Failed to close ticket. Please try again.', ephemeral: true });
        }
      }

      // Ticket rating system
      if (btn.startsWith('ticket-rate:')) {
        const [, ticketIdStr, ratingStr] = btn.split(':');
        const ticketId = parseInt(ticketIdStr);
        const rating = parseInt(ratingStr);

        const { getTicketById, getTicketConfig, closeTicket, getTicketHelpers } = await import('./services/tickets');
        const ticket = getTicketById(ticketId);

        if (!ticket) {
          return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        }

        // Only ticket owner can rate
        if (ticket.user_id !== interaction.user.id) {
          return interaction.reply({ content: '❌ Only the ticket owner can rate the support.', ephemeral: true });
        }

        if (ticket.status === 'closed') {
          return interaction.reply({ content: '❌ This ticket is already closed.', ephemeral: true });
        }

        // End support interaction with rating (updated for 1-10 scale)
        if (ticket.support_interaction_id) {
          try {
            const { endSupportInteraction } = await import('./services/smartSupport');
            endSupportInteraction({
              interactionId: ticket.support_interaction_id,
              wasResolved: rating >= 6, // 6+ = resolved (adjusted for 1-10 scale)
              satisfactionRating: rating,
              feedbackText: undefined
            });
          } catch (e) {
            console.error('Failed to end support interaction:', e);
          }
        }

        // Generate transcript
        const channel = await interaction.guild?.channels.fetch(ticket.channel_id);
        let transcript = '';
        if (channel && 'messages' in channel) {
          const messages = await (channel as any).messages.fetch({ limit: 100 });
          transcript = messages.reverse().map((m: any) => 
            `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}`
          ).join('\n');
        }

        // Show feedback options after rating
        const feedbackEmbed = new EmbedBuilder()
          .setTitle(`Thank you for rating ${rating}/10! 📊`)
          .setDescription(`Would you like to add feedback about your support experience?`)
          .setColor(rating >= 6 ? 0x00AE86 : rating >= 4 ? 0xFFA500 : 0xFF0000)
          .addFields({ 
            name: 'Your Options', 
            value: '• **Add Feedback** - Share what went well or could improve\n• **Skip** - Close the ticket without additional feedback' 
          });

        const feedbackButtons = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`ticket-feedback:${ticket.id}:${rating}`)
              .setLabel('📝 Add Feedback')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`ticket-skip:${ticket.id}:${rating}`)
              .setLabel('⏭️ Skip')
              .setStyle(ButtonStyle.Secondary)
          );

        await interaction.update({ embeds: [feedbackEmbed], components: [feedbackButtons] });

        return;
      }

      // Ticket feedback modal button
      if (btn.startsWith('ticket-feedback:')) {
        const [, ticketIdStr, ratingStr] = btn.split(':');
        const ticketId = parseInt(ticketIdStr);
        const rating = parseInt(ratingStr);

        const { getTicketById } = await import('./services/tickets');
        const ticket = getTicketById(ticketId);

        if (!ticket) {
          return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        }

        // Only ticket owner can provide feedback
        if (ticket.user_id !== interaction.user.id) {
          return interaction.reply({ content: '❌ Only the ticket owner can provide feedback.', ephemeral: true });
        }

        // Show modal for feedback input
        const feedbackModal = new ModalBuilder()
          .setCustomId(`ticket-feedback-submit:${ticketId}:${rating}`)
          .setTitle(`Feedback for Rating ${rating}/10`);

        const feedbackInput = new TextInputBuilder()
          .setCustomId('feedback')
          .setLabel('What went well or could be improved?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Your feedback helps us improve our support quality!')
          .setRequired(true)
          .setMaxLength(1000);

        const firstActionRow = new ActionRowBuilder<any>().addComponents(feedbackInput);
        feedbackModal.addComponents(firstActionRow);

        return interaction.showModal(feedbackModal);
      }

      // Skip feedback button
      if (btn.startsWith('ticket-skip:')) {
        const [, ticketIdStr, ratingStr] = btn.split(':');
        const ticketId = parseInt(ticketIdStr);
        const rating = parseInt(ratingStr);

        const { getTicketById } = await import('./services/tickets');
        const ticket = getTicketById(ticketId);

        if (!ticket) {
          return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        }

        // Only ticket owner can skip feedback
        if (ticket.user_id !== interaction.user.id) {
          return interaction.reply({ content: '❌ Only the ticket owner can close this ticket.', ephemeral: true });
        }

        // Generate transcript when skipping
        const channel = await interaction.guild?.channels.fetch(ticket.channel_id);
        let transcript = '';
        if (channel && 'messages' in channel) {
          const messages = await (channel as any).messages.fetch({ limit: 100 });
          transcript = messages.reverse().map((m: any) => 
            `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}`
          ).join('\n');
        }

        // Close ticket without feedback
        await closeTicketWithFeedback(interaction, ticket, rating, transcript, undefined);
        return;
      }

      // Bulk action confirmations
      if (btn.startsWith('bulk-confirm-')) {
        const data = (client as any).bulkActionData?.[interaction.user.id];
        if (!data) {
          return interaction.update({ content: '❌ Session expired. Please run the command again.', components: [], embeds: [] });
        }

        const { action, userIds, reason, duration, guildId, moderatorId } = data;
        if (!interaction.guild || interaction.guild.id !== guildId) {
          return interaction.update({ content: '❌ Invalid guild.', components: [], embeds: [] });
        }

        await interaction.update({ content: `Processing ${action}...`, components: [], embeds: [] });

        const { createCase } = await import('./services/cases');
        const results: string[] = [];
        let successCount = 0;

        for (const userId of userIds) {
          try {
            if (action === 'bulkban') {
              await interaction.guild.members.ban(userId, { reason });
              createCase(guildId, userId, moderatorId, 'ban', reason);
              successCount++;
            } else if (action === 'bulkkick') {
              const member = await interaction.guild.members.fetch(userId);
              await member.kick(reason);
              createCase(guildId, userId, moderatorId, 'kick', reason);
              successCount++;
            } else if (action === 'bulkmute') {
              const member = await interaction.guild.members.fetch(userId);
              const durationMs = duration ? parseDuration(duration) : 600000; // Default 10m
              await member.timeout(durationMs, reason);
              createCase(guildId, userId, moderatorId, 'mute', reason, Math.floor(durationMs / 60000));
              successCount++;
            }
          } catch (err: any) {
            results.push(`❌ ${userId}: ${err.message || 'Failed'}`);
          }
        }

        results.unshift(`✅ Successfully ${action.replace('bulk', '')}ed ${successCount}/${userIds.length} users.`);
        
        await interaction.followUp({ content: results.join('\n').slice(0, 2000), ephemeral: true });
        delete (client as any).bulkActionData[interaction.user.id];
        return;
      }

      if (btn === 'bulk-cancel') {
        delete (client as any).bulkActionData?.[interaction.user.id];
        return interaction.update({ content: '❌ Cancelled.', components: [], embeds: [] });
      }

      // Payday payment method selection
      if (btn.startsWith('payday_')) {
        const parts = btn.split('_');
        const paymentType = parts[1]; // paypal, cashapp, venmo, btc, eth, ltc, usdt
        const guildId = parts[2]; // Guild ID embedded in button
        const paydayId = parts.slice(3).join('_'); // Rejoin in case ID contains underscores

        const { hasSubmittedForPayday, getPaymentMethod } = await import('./services/payroll');

        // Check if already submitted
        if (hasSubmittedForPayday(guildId, interaction.user.id, paydayId)) {
          return interaction.reply({ 
            content: '✅ You have already submitted your payment details for this payday!', 
            ephemeral: true 
          });
        }

        // Get previously saved payment method if exists
        const savedMethod = getPaymentMethod(guildId, interaction.user.id);
        const prefilled = savedMethod && savedMethod.paymentType === paymentType ? savedMethod.credentials : '';

        // Create modal for payment details
        const modal = new ModalBuilder()
          .setCustomId(`payday_submit_${paymentType}_${guildId}_${paydayId}`)
          .setTitle(`${paymentType.toUpperCase()} Payment Details`);

        let labelText = 'Your Payment Details';
        let placeholderText = '';

        switch (paymentType) {
          case 'paypal':
            labelText = 'PayPal Email Address';
            placeholderText = 'example@email.com';
            break;
          case 'cashapp':
            labelText = 'Cash App Username (with $)';
            placeholderText = '$YourUsername';
            break;
          case 'venmo':
            labelText = 'Venmo Username (with @)';
            placeholderText = '@YourUsername';
            break;
          case 'btc':
            labelText = 'Bitcoin (BTC) Wallet Address';
            placeholderText = 'bc1q... or 1... or 3...';
            break;
          case 'eth':
            labelText = 'Ethereum (ETH) Wallet Address';
            placeholderText = '0x...';
            break;
          case 'ltc':
            labelText = 'Litecoin (LTC) Wallet Address';
            placeholderText = 'L... or M...';
            break;
          case 'usdt':
            labelText = 'USDT Wallet Address (specify network)';
            placeholderText = 'Address + network (e.g., TRC20, ERC20)';
            break;
        }

        const credentialsInput = new TextInputBuilder()
          .setCustomId('credentials')
          .setLabel(labelText)
          .setPlaceholder(placeholderText)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200);

        if (prefilled) {
          credentialsInput.setValue(prefilled);
        }

        const notesInput = new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Additional Notes (Optional)')
          .setPlaceholder('Any special instructions or details')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500);

        const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(credentialsInput);
        const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(notesInput);

        modal.addComponents(row1, row2);

        return interaction.showModal(modal);
      }

      return; // handled button
    }

    if (!interaction.isChatInputCommand()) return;

  const name = interaction.commandName;

    // Blacklist check first (overrides everything except owner)
    const userId = interaction.user.id;
    const member = interaction.member as any;
    const guildId = interaction.guild?.id;
    
    if (!isOwnerId(userId)) {
      let blacklisted = isBlacklisted(userId, 'user', guildId);
      if (!blacklisted && member?.roles) {
        const roles = member.roles.cache ? Array.from(member.roles.cache.keys()) : (member.roles || []);
        for (const r of roles) {
          if (isBlacklisted(String(r), 'role', guildId)) {
            blacklisted = true;
            break;
          }
        }
      }
      if (blacklisted) {
        if (interaction.replied || interaction.deferred) {
          console.log('Debug: Interaction already acknowledged. Skipping response.');
          return;
        }
        return await safeReply(interaction, { content: "You have been blacklisted from using this bot.", flags: MessageFlags.Ephemeral });
      }
    }

    // Whitelist check: only respond to whitelisted users/roles (with explicit DM appeal bypass)
    let whitelisted = isWhitelisted(userId, 'user');
    if (!whitelisted && member?.roles) {
      const roles = member.roles.cache ? Array.from(member.roles.cache.keys()) : (member.roles || []);
      for (const r of roles) {
        if (isWhitelisted(String(r), 'role')) {
          whitelisted = true;
          break;
        }
      }
    }
    // Explicit DM bypass for /appeal (user should be able to file even if not whitelisted)
    if (!whitelisted && name === 'appeal' && !interaction.guild) {
      console.log(`DM appeal whitelist bypass for user=${userId}`);
      whitelisted = true;
    }
    if (!whitelisted) {
        if (isOwnerId(userId)) {
            console.log(`Owner bypassing whitelist check: userId=${userId}`); // Debug log
            whitelisted = true; // Force whitelist for owner
        } else if (name === 'appeal') {
            // Allow appeal command to bypass whitelist check
            console.log(`Appeal command bypassing whitelist check: userId=${userId}`);
            whitelisted = true;
        } else {
            if (interaction.replied || interaction.deferred) {
                console.log('Debug: Interaction already acknowledged. Skipping response.');
                return;
            }
      return await safeReply(interaction, { content: "My owner hasn't whitelisted you. To request access you can purchase Synapse script or a subscription. You can still use /appeal in DMs to submit an appeal.", flags: MessageFlags.Ephemeral });
        }
    }
  // Whitelist admin commands (owner only)
  if (isOwnerId(interaction.user.id)) {
    if (interaction.commandName === "diagcommands") {
      try {
        if (interaction.guild) {
          const list = await interaction.guild.commands.fetch();
          const names = Array.from(list.values()).map(c => c.name).sort();
          const out = names.join(', ');
          return interaction.reply({ content: `Guild commands (${names.length}): ${out}`.slice(0, 1900), ephemeral: true });
        } else {
          const list = await client.application!.commands.fetch();
          // @ts-ignore
          const names = Array.from(list.values()).map((c:any) => c.name).sort();
          const out = names.join(', ');
          return interaction.reply({ content: `Global commands (${names.length}): ${out}`.slice(0, 1900), ephemeral: true });
        }
      } catch (e:any) {
        console.error('diagcommands failed:', e);
        return interaction.reply({ content: `Failed to fetch commands: ${e?.message ?? e}`, ephemeral: true });
      }
    }
    if (interaction.commandName === "addwhitelist") {
      const type = (interaction.options.getString('type', true) as string).toLowerCase();
      let idRaw = interaction.options.getString('id', true)!.trim();
      idRaw = idRaw.replace(/[<@&!>]/g, '');
      let expiresAt: number | undefined = undefined;
      const duration = interaction.options.getString('duration');
      if (duration) {
        const { parseDurationToSeconds } = await import("./utils/parseDuration");
        const secs = parseDurationToSeconds(duration);
        if (secs && secs > 0) expiresAt = Date.now() + secs * 1000;
      }
      const autoRoleId = interaction.options.getString('autorole') ?? undefined;
      if (!['user','role'].includes(type)) return interaction.reply({ content: 'Type must be user or role.', ephemeral: true });
      try {
        addWhitelistEntry({ id: idRaw, type: type as any, expiresAt, autoRoleId });
        return interaction.reply({ content: `Whitelisted ${type} ${idRaw}${expiresAt ? ` until ${new Date(expiresAt).toLocaleString()}` : ' (lifetime)'}.`, ephemeral: true });
      } catch (err) {
        console.error('Failed to add whitelist', err);
        return interaction.reply({ content: 'Failed to add whitelist entry.', ephemeral: true });
      }
    }
    if (interaction.commandName === "removewhitelist") {
      const type = (interaction.options.getString('type', true) as string).toLowerCase();
      let idRaw = interaction.options.getString('id', true)!.trim();
      idRaw = idRaw.replace(/[<@&!>]/g, '');
      if (!['user','role'].includes(type)) return interaction.reply({ content: 'Type must be user or role.', ephemeral: true });
      try {
        removeWhitelistEntry(idRaw, type as any);
        return interaction.reply({ content: `Removed whitelist ${type} ${idRaw}.`, ephemeral: true });
      } catch (err) {
        console.error('Failed to remove whitelist', err);
        return interaction.reply({ content: 'Failed to remove whitelist entry.', ephemeral: true });
      }
    }
    if (interaction.commandName === "listwhitelist") {
      try {
        const items = getWhitelist();
        if (!items.length) return interaction.reply({ content: 'No whitelist entries configured.', ephemeral: true });
        const out = items.map(i => `${i.type}:${i.id}${i.expiresAt ? ` expires ${new Date(i.expiresAt).toLocaleString()}` : ' lifetime'}${i.autoRoleId ? ` autoRole=${i.autoRoleId}` : ''}`).join('\n').slice(0, 1900);
        return interaction.reply({ content: `Whitelist entries:\n${out}`, ephemeral: true });
      } catch (err) {
        console.error('Failed to list whitelist', err);
        return interaction.reply({ content: 'Failed to list whitelist entries.', ephemeral: true });
      }
    }
    
    // Blacklist admin commands (owner only)
    if (interaction.commandName === "addblacklist") {
      const type = (interaction.options.getString('type', true) as string).toLowerCase();
      let idRaw = interaction.options.getString('id', true)!.trim();
      idRaw = idRaw.replace(/[<@&!>]/g, '');
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      if (!['user','role'].includes(type)) return interaction.reply({ content: 'Type must be user or role.', ephemeral: true });
      try {
        addBlacklistEntry({ id: idRaw, type: type as any, reason, addedAt: Date.now() });
        return interaction.reply({ content: `Blacklisted ${type} ${idRaw}. Reason: ${reason}`, ephemeral: true });
      } catch (err) {
        console.error('Failed to add blacklist', err);
        return interaction.reply({ content: 'Failed to add blacklist entry.', ephemeral: true });
      }
    }
    if (interaction.commandName === "removeblacklist") {
      const type = (interaction.options.getString('type', true) as string).toLowerCase();
      let idRaw = interaction.options.getString('id', true)!.trim();
      idRaw = idRaw.replace(/[<@&!>]/g, '');
      if (!['user','role'].includes(type)) return interaction.reply({ content: 'Type must be user or role.', ephemeral: true });
      try {
        removeBlacklistEntry(idRaw, type as any, interaction.guild?.id);
        return interaction.reply({ content: `Removed blacklist ${type} ${idRaw}.`, ephemeral: true });
      } catch (err) {
        console.error('Failed to remove blacklist', err);
        return interaction.reply({ content: 'Failed to remove blacklist entry.', ephemeral: true });
      }
    }
    if (interaction.commandName === "listblacklist") {
      try {
        let list: any[] = [];
        if (interaction.guild) {
          const { getGuildBlacklist } = await import('./services/blacklistService');
          list = getGuildBlacklist(interaction.guild.id);
        } else {
          list = getBlacklist();
        }
        if (!list.length) return interaction.reply({ content: 'No blacklist entries configured.', ephemeral: true });
        const out = list.map((i: any) => `${i.type}:${i.id} reason=${i.reason ?? 'none'}`).join('\n').slice(0, 1900);
        return interaction.reply({ content: `Blacklist entries:\n${out}`, ephemeral: true });
      } catch (err) {
        console.error('Failed to list blacklist', err);
        return interaction.reply({ content: 'Failed to list blacklist entries.', ephemeral: true });
      }
    }

    // Consolidated Management Command
    if (interaction.commandName === "manage") {
      if (!isOwnerId(interaction.user.id)) {
        return interaction.reply({ content: 'This command is owner-only.', ephemeral: true });
      }

      const type = interaction.options.getString('type'); // whitelist | blacklist | bypass
      const action = interaction.options.getString('action'); // add | remove | list
      const targetType = interaction.options.getString('target_type'); // user | role
      const id = interaction.options.getString('id');
      const duration = interaction.options.getString('duration');
      const reason = interaction.options.getString('reason');

      try {
        if (type === 'whitelist') {
          if (action === 'add') {
            if (!targetType || !id) {
              return interaction.reply({ content: 'Missing target_type or id for add action.', ephemeral: true });
            }
            const idRaw = id.replace(/[<@&>]/g, '');
            let expiresAt: number | undefined = undefined;
            if (duration) {
              const { parseDurationToSeconds } = await import("./utils/parseDuration");
              const seconds = parseDurationToSeconds(duration);
              if (seconds) expiresAt = Date.now() + seconds * 1000;
            }
            addWhitelistEntry({ id: idRaw, type: targetType as any, expiresAt });
            return interaction.reply({ content: `Added ${targetType} ${idRaw} to whitelist${duration ? ` (expires in ${duration})` : ''}.`, ephemeral: true });
          } else if (action === 'remove') {
            if (!targetType || !id) {
              return interaction.reply({ content: 'Missing target_type or id for remove action.', ephemeral: true });
            }
            const idRaw = id.replace(/[<@&>]/g, '');
            removeWhitelistEntry(idRaw, targetType as any);
            return interaction.reply({ content: `Removed ${targetType} ${idRaw} from whitelist.`, ephemeral: true });
          } else if (action === 'list') {
            const list = getWhitelist();
            if (!list.length) return interaction.reply({ content: 'No whitelist entries configured.', ephemeral: true });
            const out = list.map((i: any) => `${i.type}:${i.id}${i.expiresAt ? ` (expires: ${new Date(i.expiresAt).toLocaleDateString()})` : ''}`).join('\n').slice(0, 1900);
            return interaction.reply({ content: `Whitelist entries:\n${out}`, ephemeral: true });
          }
        } else if (type === 'blacklist') {
          const { addBlacklistEntry, removeBlacklistEntry, getBlacklist } = await import('./services/blacklistService');
          if (action === 'add') {
            if (!targetType || !id) {
              return interaction.reply({ content: 'Missing target_type or id for add action.', ephemeral: true });
            }
            const idRaw = id.replace(/[<@&>]/g, '');
            addBlacklistEntry({ id: idRaw, type: targetType as any, reason: reason || 'No reason provided', addedAt: Date.now() });
            return interaction.reply({ content: `Added ${targetType} ${idRaw} to blacklist.`, ephemeral: true });
          } else if (action === 'remove') {
            if (!targetType || !id) {
              return interaction.reply({ content: 'Missing target_type or id for remove action.', ephemeral: true });
            }
            const idRaw = id.replace(/[<@&>]/g, '');
            removeBlacklistEntry(idRaw, targetType as any);
            return interaction.reply({ content: `Removed ${targetType} ${idRaw} from blacklist.`, ephemeral: true });
          } else if (action === 'list') {
            const list = getBlacklist();
            if (!list.length) return interaction.reply({ content: 'No blacklist entries configured.', ephemeral: true });
            const out = list.map((i: any) => `${i.type}:${i.id} reason=${i.reason ?? 'none'}`).join('\n').slice(0, 1900);
            return interaction.reply({ content: `Blacklist entries:\n${out}`, ephemeral: true });
          }
        } else if (type === 'bypass') {
          const { bypass } = await import('./services/bypass');
          if (action === 'add') {
            if (!targetType || !id) {
              return interaction.reply({ content: 'Missing target_type or id for add action.', ephemeral: true });
            }
            const idRaw = id.replace(/[<@&>]/g, '');
            bypass.add(targetType as any, idRaw, interaction.user.id);
            return interaction.reply({ content: `Added ${targetType} ${idRaw} to bypass list.`, ephemeral: true });
          } else if (action === 'remove') {
            if (!targetType || !id) {
              return interaction.reply({ content: 'Missing target_type or id for remove action.', ephemeral: true });
            }
            const idRaw = id.replace(/[<@&>]/g, '');
            const removed = bypass.remove(targetType as any, idRaw);
            if (removed) {
              return interaction.reply({ content: `Removed ${targetType} ${idRaw} from bypass list.`, ephemeral: true });
            } else {
              return interaction.reply({ content: `${targetType} ${idRaw} was not in bypass list.`, ephemeral: true });
            }
          } else if (action === 'list') {
            const entries = bypass.list();
            if (!entries.length) return interaction.reply({ content: 'No bypass entries configured.', ephemeral: true });
            const users = entries.filter(e => e.type === 'user').map(e => e.id);
            const roles = entries.filter(e => e.type === 'role').map(e => e.id);
            const out = [];
            if (users.length) out.push(`Users: ${users.join(', ')}`);
            if (roles.length) out.push(`Roles: ${roles.join(', ')}`);
            return interaction.reply({ content: `Bypass entries:\n${out.join('\n')}`, ephemeral: true });
          }
        }
        
        return interaction.reply({ content: 'Invalid type or action. Use: whitelist/blacklist/bypass with add/remove/list.', ephemeral: true });
      } catch (err) {
        console.error('Failed to execute manage command:', err);
        return interaction.reply({ content: 'Failed to execute command.', ephemeral: true });
      }
    }

    // Command Permissions Management
    if (interaction.commandName === "cmdpermissions") {
      if (!interaction.guild) {
        if (interaction.replied || interaction.deferred) {
          console.log('Debug: Interaction already acknowledged. Skipping response.');
          return;
        }
        return await safeReply(interaction, { content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
      }
      
      const { 
        addCommandPermission, 
        removeCommandPermission, 
        clearRoleCommandPermissions, 
        getRoleCommands,
        RESTRICTABLE_COMMANDS,
        COMMAND_PRESETS
      } = await import('./services/commandPermissions');

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "panel") {
        // Interactive panel with buttons
        const embed = new EmbedBuilder()
          .setTitle('🔐 Command Permissions System')
          .setColor(0xe74c3c)
          .setDescription('Configure which roles can use specific commands. Use the subcommands below:')
          .addFields(
            { name: '📝 Add Permission(s)', value: '`/cmdpermissions add role:<role> commands:<cmd1,cmd2,...>`\nGrant one or more commands to a role (comma-separated)', inline: false },
            { name: '🗑️ Remove Permission(s)', value: '`/cmdpermissions remove role:<role> commands:<cmd1,cmd2,...>`\nRevoke one or more commands from a role', inline: false },
            { name: '📦 Apply Preset', value: '`/cmdpermissions preset role:<role> preset:<preset>`\nPresets: `head_support`, `support`, `trial_support`, `moderator`, `admin`', inline: false },
            { name: '📋 List Permissions', value: '`/cmdpermissions list role:<role>`\nView all commands a role can use', inline: false },
            { name: '🧹 Clear Permissions', value: '`/cmdpermissions clear role:<role>`\nRemove all command permissions from a role', inline: false },
            { name: '⚙️ Available Commands', value: RESTRICTABLE_COMMANDS.slice(0, 20).join(', ') + '...', inline: false }
          )
          .setFooter({ text: 'Owner/Admin only • Permissions are checked before command execution' });

        return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (subcommand === "add") {
        const role = interaction.options.getRole('role', true);
        const commandsInput = interaction.options.getString('commands', true).toLowerCase();
        
        // Split by comma and trim whitespace
        const commandList = commandsInput.split(',').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
        
        if (commandList.length === 0) {
          return interaction.reply({ 
            content: '❌ No valid commands provided.', 
            ephemeral: true 
          });
        }

        // Check all commands are valid
        const invalidCommands = commandList.filter(cmd => !RESTRICTABLE_COMMANDS.includes(cmd));
        if (invalidCommands.length > 0) {
          return interaction.reply({ 
            content: `❌ Invalid command(s): ${invalidCommands.join(', ')}\n\nAvailable: ${RESTRICTABLE_COMMANDS.join(', ')}`, 
            ephemeral: true 
          });
        }

        // Add all commands
        let successCount = 0;
        for (const command of commandList) {
          if (addCommandPermission(interaction.guild.id, role.id, command)) {
            successCount++;
          }
        }

        if (successCount === commandList.length) {
          return interaction.reply({ 
            content: `✅ Added ${successCount} permission(s) to <@&${role.id}>: \`${commandList.join(', ')}\``, 
            ephemeral: true 
          });
        } else {
          return interaction.reply({ 
            content: `⚠️ Added ${successCount}/${commandList.length} permissions. Some may already exist.`, 
            ephemeral: true 
          });
        }
      }

      if (subcommand === "remove") {
        const role = interaction.options.getRole('role', true);
        const commandsInput = interaction.options.getString('commands', true).toLowerCase();
        
        // Split by comma and trim whitespace
        const commandList = commandsInput.split(',').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
        
        if (commandList.length === 0) {
          return interaction.reply({ 
            content: '❌ No valid commands provided.', 
            ephemeral: true 
          });
        }

        // Remove all commands
        let successCount = 0;
        for (const command of commandList) {
          if (removeCommandPermission(interaction.guild.id, role.id, command)) {
            successCount++;
          }
        }

        return interaction.reply({ 
          content: `✅ Removed ${successCount} permission(s) from <@&${role.id}>: \`${commandList.join(', ')}\``, 
          ephemeral: true 
        });
      }

      if (subcommand === "preset") {
        const role = interaction.options.getRole('role', true);
        const preset = interaction.options.getString('preset', true).toLowerCase();

        if (!(preset in COMMAND_PRESETS)) {
          return interaction.reply({ 
            content: `❌ Invalid preset. Available: ${Object.keys(COMMAND_PRESETS).join(', ')}`, 
            ephemeral: true 
          });
        }

        // Clear existing permissions first
        clearRoleCommandPermissions(interaction.guild.id, role.id);

        // Add all commands from preset
        const commands = COMMAND_PRESETS[preset as keyof typeof COMMAND_PRESETS];
        for (const cmd of commands) {
          addCommandPermission(interaction.guild.id, role.id, cmd);
        }

        return interaction.reply({ 
          content: `✅ Applied \`${preset}\` preset to <@&${role.id}> (${commands.length} commands)`, 
          ephemeral: true 
        });
      }

      if (subcommand === "clear") {
        const role = interaction.options.getRole('role', true);

        const success = clearRoleCommandPermissions(interaction.guild.id, role.id);
        if (success) {
          return interaction.reply({ 
            content: `✅ Cleared all command permissions from <@&${role.id}>`, 
            ephemeral: true 
          });
        } else {
          return interaction.reply({ content: '❌ Failed to clear permissions.', ephemeral: true });
        }
      }

      if (subcommand === "list") {
        const role = interaction.options.getRole('role', true);

        const commands = getRoleCommands(interaction.guild.id, role.id);
        if (commands.length === 0) {
          return interaction.reply({ 
            content: `<@&${role.id}> has no command permissions configured.`, 
            ephemeral: true 
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(`🔐 Command Permissions for ${role.name}`)
          .setColor(0x3498db)
          .setDescription(`**Allowed Commands (${commands.length}):**\n\`\`\`${commands.join(', ')}\`\`\``)
          .setFooter({ text: 'Use /cmdpermissions to modify permissions' });

        return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    }

    // Anti-Abuse Bypass Management
    if (interaction.commandName === "abusebypass") {
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
      
      const { addBypassRole, removeBypassRole, getBypassedRoles, clearBypassedRoles } = await import('./services/antiAbuse');
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "add") {
        const role = interaction.options.getRole('role', true);
        addBypassRole(role.id);
        return interaction.reply({ 
          content: `✅ Added <@&${role.id}> to inappropriate content filter bypass list. Members with this role will not be warned for inappropriate language.`, 
          ephemeral: true 
        });
      }

      if (subcommand === "remove") {
        const role = interaction.options.getRole('role', true);
        const success = removeBypassRole(role.id);
        if (success) {
          return interaction.reply({ 
            content: `✅ Removed <@&${role.id}> from bypass list.`, 
            ephemeral: true 
          });
        } else {
          return interaction.reply({ content: '❌ Role not found in bypass list.', ephemeral: true });
        }
      }

      if (subcommand === "list") {
        const roleIds = getBypassedRoles();
        if (roleIds.length === 0) {
          return interaction.reply({ 
            content: 'No roles configured to bypass the inappropriate content filter.', 
            ephemeral: true 
          });
        }

        const roleMentions = roleIds.map(id => `<@&${id}>`).join(', ');
        return interaction.reply({ 
          content: `**Bypass Roles (${roleIds.length}):**\n${roleMentions}`, 
          ephemeral: true 
        });
      }

      if (subcommand === "clear") {
        clearBypassedRoles();
        return interaction.reply({ 
          content: '✅ Cleared all bypass roles.', 
          ephemeral: true 
        });
      }
    }
  }

    // helper to check admin or bypass
    const adminOrBypass = (memberMaybe: any) => {
      try {
        if (!memberMaybe) return false;
        // real admin permission
        if (memberMaybe.permissions && memberMaybe.permissions.has && memberMaybe.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
        // if interaction.memberPermissions exists
        if (interaction.memberPermissions?.has && interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) return true;
        // bypass by user id
        if (bypass.isUserBypassed(interaction.user.id)) return true;
        // bypass by any role the member has
        const roles = memberMaybe.roles?.cache ? Array.from(memberMaybe.roles.cache.keys()) : (memberMaybe.roles || []);
        for (const r of roles) {
          if (bypass.isRoleBypassed(String(r))) return true;
        }
      } catch (err) { /* ignore */ }
      return false;
    };

  // Helper to check command permissions (admin/bypass OR custom command permissions)
  const hasCommandAccess = async (memberMaybe: any, commandName: string, guildId: string | null): Promise<boolean> => {
    // First check if they're admin or bypassed
    if (adminOrBypass(memberMaybe)) return true;
    
    // Then check command permissions system
    if (guildId) {
      try {
        const { hasCommandPermission } = await import('./services/commandPermissions');
        const userRoles = memberMaybe?.roles?.cache ? Array.from(memberMaybe.roles.cache.keys()) : (memberMaybe?.roles || []);
        return hasCommandPermission(guildId, userRoles, commandName);
      } catch (err) {
        console.error('Command permission check failed:', err);
      }
    }
    
    return false;
  };

  // Try enhanced feature commands first
  const enhancedHandled = await handleEnhancedCommands(interaction as any);
  if (enhancedHandled) return;

  // Phase 1 Advanced Ticket Commands
  if (name === 'ticketsla') {
    const { handleTicketSLA } = await import('./commands/advancedTickets');
    await handleTicketSLA(interaction);
    return;
  }
  
  if (name === 'tickettag') {
    const { handleTicketTag } = await import('./commands/advancedTickets');
    await handleTicketTag(interaction);
    return;
  }
  
  if (name === 'ticketnote') {
    const { handleTicketNote } = await import('./commands/advancedTickets');
    await handleTicketNote(interaction);
    return;
  }
  
  if (name === 'ticketanalytics') {
    const { handleTicketAnalytics } = await import('./commands/advancedTickets');
    await handleTicketAnalytics(interaction);
    return;
  }
  
  if (name === 'ticketcategory') {
    const { handleTicketCategory } = await import('./commands/advancedTickets');
    await handleTicketCategory(interaction);
    return;
  }
  
  // Advanced Ticket Feature Commands
  if (name === 'ticketfeedback') {
    const { handleTicketFeedback } = await import('./commands/advancedTicketFeatures');
    await handleTicketFeedback(interaction);
    return;
  }
  
  if (name === 'autoresponse') {
    const { handleAutoResponse } = await import('./commands/advancedTicketFeatures');
    await handleAutoResponse(interaction);
    return;
  }
  
  if (name === 'staffexpertise') {
    const { handleStaffExpertise } = await import('./commands/advancedTicketFeatures');
    await handleStaffExpertise(interaction);
    return;
  }
  
  if (name === 'ticketrouting') {
    const { handleTicketRouting } = await import('./commands/advancedTicketFeatures');
    await handleTicketRouting(interaction);
    return;
  }

  // Auto-Moderation Commands
  if (name === "automod") {
    if (!(await hasCommandAccess(interaction.member, 'automod', interaction.guild?.id || null))) {
      if (interaction.replied || interaction.deferred) {
        console.log('Debug: Interaction already acknowledged. Skipping response.');
        return;
      }
      return await safeReply(interaction, '❌ You don\'t have permission to use this command.', { flags: MessageFlags.Ephemeral });
    }
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

    const subCmd = interaction.options.getSubcommand();
    const { getAutoModRules, setAutoModRule, deleteAutoModRule } = await import('./services/automod');

    if (subCmd === "set") {
      const rule = interaction.options.getString('rule', true) as any;
      const enabled = interaction.options.getBoolean('enabled', true);
      const action = interaction.options.getString('action', true) as any;
      const threshold = interaction.options.getInteger('threshold');
      const muteDuration = interaction.options.getInteger('mute_duration');

      setAutoModRule({
        guild_id: interaction.guild.id,
        rule_type: rule,
        enabled: enabled,
        action: action,
        threshold: threshold || undefined,
        mute_duration: muteDuration || undefined
      });

      return await safeReply(interaction, { content: `✅ Auto-mod rule **${rule}** has been ${enabled ? 'enabled' : 'disabled'} with action **${action}**.`, ephemeral: true });
    }

    if (subCmd === "list") {
      const rules = getAutoModRules(interaction.guild.id);
      if (rules.length === 0) {
        return interaction.reply({ content: 'No auto-mod rules configured.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🤖 Auto-Moderation Rules')
        .setColor(0x00AE86);

      for (const rule of rules) {
        const statusEmoji = rule.enabled ? '✅' : '❌';
        const thresholdInfo = rule.threshold ? ` (threshold: ${rule.threshold})` : '';
        const muteInfo = rule.mute_duration ? ` (${rule.mute_duration}m)` : '';
        embed.addFields({
          name: `${statusEmoji} ${rule.rule_type}`,
          value: `Action: **${rule.action}**${thresholdInfo}${muteInfo}`,
          inline: false
        });
      }

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "delete") {
      const rule = interaction.options.getString('rule', true) as any;
      deleteAutoModRule(interaction.guild.id, rule);
      return await safeReply(interaction, { content: `✅ Deleted auto-mod rule **${rule}**.`, flags: MessageFlags.Ephemeral });
    }
  }

  // Case Management Commands
  if (name === "case") {
    if (!(await hasCommandAccess(interaction.member, 'case', interaction.guild?.id || null))) {
      return await safeReply(interaction, '❌ You don\'t have permission to use this command.', { flags: MessageFlags.Ephemeral });
    }

    const caseNumber = interaction.options.getInteger('number', true);
    const { getCase } = await import('./services/cases');
    const caseData = getCase(caseNumber);

    if (!caseData) {
      if (interaction.replied || interaction.deferred) {
        console.log('Debug: Interaction already acknowledged. Skipping response.');
        return;
      }
      if (interaction.replied || interaction.deferred) {
        console.log('Debug: Interaction already acknowledged. Skipping response.');
        return;
      }
      return await safeReply(interaction, `❌ Case #${caseNumber} not found.`, { flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 Case #${caseData.case_number}`)
      .setColor(0xFF5555)
      .addFields(
        { name: 'User', value: `<@${caseData.user_id}>`, inline: true },
        { name: 'Moderator', value: `<@${caseData.moderator_id}>`, inline: true },
        { name: 'Action', value: caseData.action_type.toUpperCase(), inline: true },
        { name: 'Reason', value: caseData.reason, inline: false }
      )
      .setTimestamp(new Date(caseData.created_at));

    if (caseData.duration) {
      embed.addFields({ name: 'Duration', value: `${caseData.duration} minutes`, inline: true });
    }

    return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (name === "cases") {
    if (!(await hasCommandAccess(interaction.member, 'cases', interaction.guild?.id || null))) {
      return await safeReply(interaction, '❌ You don\'t have permission to use this command.', { flags: MessageFlags.Ephemeral });
    }
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });

    const user = interaction.options.getUser('user', true);
    const { getUserCases } = await import('./services/cases');
    const cases = getUserCases(interaction.guild.id, user.id);

    if (cases.length === 0) {
      if (interaction.replied || interaction.deferred) {
        console.log('Debug: Interaction already acknowledged. Skipping response.');
        return;
      }
      return await safeReply(interaction, `${user.tag} has no moderation cases.`, { flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 Cases for ${user.tag}`)
      .setColor(0xFF5555)
      .setDescription(`Total cases: ${cases.length}`);

    const displayCases = cases.slice(0, 10);
    for (const c of displayCases) {
      const date = new Date(c.created_at).toLocaleDateString();
      embed.addFields({
        name: `Case #${c.case_number} - ${c.action_type.toUpperCase()}`,
        value: `${c.reason}\n*${date} by <@${c.moderator_id}>*`,
        inline: false
      });
    }

    if (cases.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${cases.length} cases` });
    }

    return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (name === "updatecase") {
    if (!(await hasCommandAccess(interaction.member, 'updatecase', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
    }

    const caseNumber = interaction.options.getInteger('number', true);
    const reason = interaction.options.getString('reason', true);
    const { updateCaseReason } = await import('./services/cases');

    const success = updateCaseReason(caseNumber, reason);
    if (success) {
      return await safeReply(interaction, { content: `✅ Updated case #${caseNumber} reason.`, flags: MessageFlags.Ephemeral });
    } else {
      return await safeReply(interaction, `❌ Case #${caseNumber} not found.`, { flags: MessageFlags.Ephemeral });
    }
  }

  if (name === "appeal") {
    // Skip whitelist check for appeal command (rate limited)
    const type = interaction.options.getString('type', true) as any;
    const reason = interaction.options.getString('reason', true);

    const { createAppeal, canSubmitAppeal } = await import('./services/appeals');
    const guildId = interaction.guild?.id || process.env.GUILD_ID;
    console.log(`[Appeals] /appeal invoked by user=${interaction.user.id} tag=${interaction.user.tag} type=${type} inDM=${!interaction.guild} guildIdResolved=${!!guildId}`);
    // Immediately acknowledge to avoid Discord 3s timeout
    await safeDeferReply(interaction, interaction.guild ? { ephemeral: true } : undefined);
    if (!guildId) {
      return await safeReply(
        interaction,
        '❌ Could not determine server. Please use this command in the server or ask an admin to configure the bot (missing GUILD_ID for DM appeals).',
        { flags: MessageFlags.Ephemeral }
      );
    }

    // For staff suspension appeals, check if they have an active suspension
    let suspensionId: number | undefined;
    if (type === 'staff_suspension') {
      const { getSuspensionHistory } = await import('./services/staffSuspension');
      const history = getSuspensionHistory(interaction.user.id, guildId);
      const activeSuspension = history.find(s => s.is_active === 1 || s.is_permanent === 1);
      console.log(`[Appeals] staff_suspension path: historyCount=${history.length} activeFound=${!!activeSuspension}`);
      
      if (!activeSuspension && history.length === 0) {
        return await safeReply(interaction, { content: '❌ You do not have a staff suspension record to appeal.', flags: MessageFlags.Ephemeral });
      }
      
      // Use most recent suspension if active one not found
      suspensionId = activeSuspension?.id || history[0]?.id;
      console.log(`[Appeals] selected suspensionId=${suspensionId ?? 'none'}`);
    }

    // Rate limit: 1 submission per 12 hours per type
    const windowSeconds = 12 * 60 * 60; // 12h
    const rl = canSubmitAppeal(guildId, interaction.user.id, type, windowSeconds);
    if (!rl.allowed) {
      const hrs = Math.max(1, Math.ceil((rl.retryAfterSeconds || 0) / 3600));
      console.log(`[Appeals] rate limited: retryAfterSeconds=${rl.retryAfterSeconds} approxHours=${hrs}`);
      return await safeReply(interaction, { content: `⏳ You recently submitted a ${type} appeal. Please wait about ${hrs} hour(s) before submitting another.`, flags: MessageFlags.Ephemeral });
    }

    try {
      const appealId = createAppeal(guildId, interaction.user.id, type, reason, suspensionId);
      console.log(`[Appeals] created appeal id=${appealId} type=${type} user=${interaction.user.id} suspensionId=${suspensionId ?? 'none'}`);
      
      // Send notification to mod log and owner
      const guild = await client.guilds.fetch(guildId);
      const modLogChannelId = getModLogChannelId();
      
      const appealEmbed = new EmbedBuilder()
        .setColor(0xFAB005)
        .setTitle('📨 New Appeal Submitted')
        .setDescription(`**${interaction.user.tag}** has submitted a ${type.replace('_', ' ')} appeal.`)
        .addFields(
          { name: 'Appeal ID', value: `#${appealId}`, inline: true },
          { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Type', value: type.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()), inline: true },
          { name: 'Reason/Explanation', value: reason.length > 1000 ? reason.substring(0, 997) + '...' : reason }
        )
        .setTimestamp()
        .setFooter({ text: `Use /appeals approve id:${appealId} or /appeals deny id:${appealId}` });
      
      // Send to mod log
      if (modLogChannelId) {
        const modLogChannel = await guild.channels.fetch(modLogChannelId).catch(() => null) as any;
        if (modLogChannel) {
          await modLogChannel.send({ embeds: [appealEmbed] });
        }
      }
      
      // Send to owner DMs
      const ownerId = process.env.OWNER_USER_ID;
      if (ownerId) {
        try {
          const owner = await client.users.fetch(ownerId);
          await owner.send({ embeds: [appealEmbed] });
        } catch (err) {
          console.error('Failed to DM owner about appeal:', err);
        }
      }
      
      return await safeReply(interaction, { content: `✅ Appeal #${appealId} submitted successfully. Staff will review it soon. You will be notified of the decision.`, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.warn('[Appeals] createAppeal failed:', err?.message ?? err);
      return await safeReply(interaction, `❌ ${err.message || 'Failed to submit appeal.'}`, { flags: MessageFlags.Ephemeral });
    }
  }

  if (name === "appeals") {
    if (!(await hasCommandAccess(interaction.member, 'appeals', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });

    const subCmd = interaction.options.getSubcommand();
    const { getPendingAppeals, getAppeal, reviewAppeal } = await import('./services/appeals');

    if (subCmd === "view") {
      const appeals = getPendingAppeals(interaction.guild.id);
      if (appeals.length === 0) {
        return interaction.reply({ content: 'No pending appeals.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('📨 Pending Appeals')
        .setColor(0xFFAA00);

      for (const appeal of appeals) {
        embed.addFields({
          name: `Appeal #${appeal.id} - ${appeal.appeal_type}`,
          value: `**User:** <@${appeal.user_id}>\n**Reason:** ${appeal.reason}\n**Submitted:** ${new Date(appeal.created_at).toLocaleString()}`,
          inline: false
        });
      }

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "approve" || subCmd === "deny") {
      const appealId = interaction.options.getInteger('id', true);
      const note = interaction.options.getString('note');

      const success = reviewAppeal(appealId, interaction.user.id, subCmd === "approve" ? 'approved' : 'denied', note || undefined);
      if (success) {
        const appeal = getAppeal(appealId);
        if (appeal) {
          // If approved, automatically reverse the original punishment
          if (subCmd === 'approve') {
            try {
              // Ensure we operate against the correct guild
              const guild = interaction.guild?.id === appeal.guild_id
                ? interaction.guild
                : await client.guilds.fetch(appeal.guild_id).catch(() => null);

              if (guild) {
                if (appeal.appeal_type === 'ban') {
                  // Unban the user if currently banned
                  try {
                    await guild.bans.remove(appeal.user_id, 'Appeal approved');
                  } catch (e) {
                    console.warn(`[Appeals] Unban skipped or failed for ${appeal.user_id}:`, (e as any)?.message ?? e);
                  }
                } else if (appeal.appeal_type === 'mute') {
                  // Remove timeout (unmute)
                  try {
                    const member = await guild.members.fetch(appeal.user_id).catch(() => null);
                    if (member) {
                      await member.timeout(null, 'Appeal approved: unmute');
                    } else {
                      console.warn(`[Appeals] Unmute skipped: member ${appeal.user_id} not found in guild ${guild.id}`);
                    }
                  } catch (e) {
                    console.warn(`[Appeals] Unmute failed for ${appeal.user_id}:`, (e as any)?.message ?? e);
                  }
                } else if (appeal.appeal_type === 'blacklist') {
                  // Remove from blacklist (both JSON and DB-backed if present)
                  try {
                    const { removeBlacklistEntry } = await import('./services/blacklistService');
                    removeBlacklistEntry(appeal.user_id, 'user', appeal.guild_id);
                  } catch (e) {
                    console.warn(`[Appeals] Remove blacklist failed for ${appeal.user_id}:`, (e as any)?.message ?? e);
                  }
                } else if (appeal.appeal_type === 'staff_suspension') {
                  // Restore staff member and cancel suspension
                  try {
                    const { getSuspensionHistory } = await import('./services/staffSuspension');
                    const { getSupportRoles } = await import('./services/supportRoles');
                    
                    const history = getSuspensionHistory(appeal.user_id, appeal.guild_id);
                    const suspension = appeal.suspension_id 
                      ? history.find(s => s.id === appeal.suspension_id)
                      : history.find(s => s.is_active === 1) || history[0];
                    
                    if (suspension) {
                      const member = await guild.members.fetch(appeal.user_id).catch(() => null);
                      if (member) {
                        // Restore original roles from before suspension
                        const originalRoles = JSON.parse(suspension.original_roles) as string[];
                        if (originalRoles.length > 0) {
                          await member.roles.add(originalRoles, `Appeal #${appealId} approved - restoring staff roles`);
                        }
                        
                        // Mark suspension as resolved
                        const { completeSuspension } = await import('./services/staffSuspension');
                        completeSuspension(suspension.id!);
                      }
                    }
                  } catch (e) {
                    console.warn(`[Appeals] Staff suspension restoration failed for ${appeal.user_id}:`, (e as any)?.message ?? e);
                  }
                }
              } else {
                console.warn(`[Appeals] Guild ${appeal.guild_id} not found for auto-reversal`);
              }
            } catch (e) {
              console.warn('[Appeals] Auto-reversal encountered an error:', (e as any)?.message ?? e);
            }
          }
          // Notify user
          try {
            const user = await client.users.fetch(appeal.user_id);
            const statusMsg = subCmd === "approve" ? '✅ Your appeal has been **approved**!' : '❌ Your appeal has been **denied**.';
            const autoMsg = subCmd === 'approve'
              ? (appeal.appeal_type === 'ban' ? '\n\nAction: You have been unbanned.'
                : appeal.appeal_type === 'mute' ? '\n\nAction: You have been unmuted.'
                : appeal.appeal_type === 'blacklist' ? '\n\nAction: You have been removed from the blacklist.'
                : appeal.appeal_type === 'staff_suspension' ? '\n\nAction: Your staff roles have been restored.'
                : '')
              : '';
            const noteMsg = note ? `\n\n**Note:** ${note}` : '';
            await user.send(`${statusMsg} (Appeal #${appealId})${autoMsg}${noteMsg}`);
          } catch {}

          // Audit log to moderation channel and staff summary in the current channel (on approval only)
          if (subCmd === 'approve') {
            try {
              const actionText = appeal.appeal_type === 'ban'
                ? 'Unbanned'
                : appeal.appeal_type === 'mute'
                  ? 'Unmuted'
                  : appeal.appeal_type === 'blacklist'
                    ? 'Removed from Blacklist'
                    : appeal.appeal_type === 'staff_suspension'
                      ? 'Staff Roles Restored'
                      : 'Action Taken';

              const summaryEmbed = new EmbedBuilder()
                .setTitle('✅ Appeal Approved')
                .setColor(0x00AE86)
                .addFields(
                  { name: 'Appeal ID', value: `#${appealId}`, inline: true },
                  { name: 'User', value: `<@${appeal.user_id}> (${appeal.user_id})`, inline: true },
                  { name: 'Type', value: appeal.appeal_type, inline: true },
                  { name: 'Action Taken', value: actionText, inline: true },
                  { name: 'Reviewed By', value: `<@${interaction.user.id}>`, inline: true },
                  { name: 'Reason', value: appeal.reason || 'None', inline: false },
                  { name: 'Note', value: note || 'None', inline: false }
                )
                .setTimestamp(new Date());

              // Send to moderation log channel if configured
              try {
                const guild = interaction.guild ?? (await client.guilds.fetch(appeal.guild_id).catch(() => null));
                if (guild) {
                  await sendToModLog(guild as any, summaryEmbed, `Appeal #${appealId} approved`);
                }
              } catch (e) {
                console.warn('[Appeals] Failed to send mod-log embed:', (e as any)?.message ?? e);
              }

              // Also post a summary embed in the current channel if text-based (for staff visibility)
              try {
                const ch: any = interaction.channel;
                if (ch && ch.isTextBased && ch.isTextBased()) {
                  await ch.send({ embeds: [summaryEmbed] });
                }
              } catch (e) {
                console.warn('[Appeals] Failed to send staff summary embed:', (e as any)?.message ?? e);
              }
            } catch (e) {
              console.warn('[Appeals] Logging summary encountered an error:', (e as any)?.message ?? e);
            }
          }
        }
        return interaction.reply({ content: `✅ Appeal #${appealId} ${subCmd === "approve" ? 'approved' : 'denied'}.`, ephemeral: true });
      } else {
        return interaction.reply({ content: `❌ Appeal #${appealId} not found or already reviewed.`, ephemeral: true });
      }
    }
  }

  // Appeal history: users can view their own; staff can view anyone
  if (name === "appealhistory") {
    const { getUserAppeals } = await import('./services/appeals');
    const targetUser = interaction.options.getUser('user');
    const isDm = !interaction.guild;
    const guildId = interaction.guild?.id || process.env.GUILD_ID || '';
    if (!guildId) {
      return await safeReply(interaction, { content: '❌ Could not determine server to look up appeals.', flags: MessageFlags.Ephemeral });
    }

    // Permission: in DMs or non-staff → restrict to self
    let userIdToView = interaction.user.id;
    if (targetUser) {
      const isStaff = await hasCommandAccess(interaction.member, 'appeals', interaction.guild?.id || null);
      if (!isStaff) {
        return await safeReply(interaction, { content: '❌ You can only view your own appeal history.', flags: MessageFlags.Ephemeral });
      }
      userIdToView = targetUser.id;
    }

    const appeals = getUserAppeals(guildId, userIdToView);
    if (!appeals.length) {
      return await safeReply(interaction, { content: `No appeals found for <@${userIdToView}>.`, flags: MessageFlags.Ephemeral });
    }

    const page = 1; // simple single page for now
    const max = Math.min(10, appeals.length);
    const slice = appeals.slice(0, max);
    const embed = new EmbedBuilder()
      .setTitle(`📜 Appeal History — ${userIdToView === interaction.user.id ? 'You' : `<@${userIdToView}>`}`)
      .setColor(0x3366FF)
      .setFooter({ text: `Showing ${slice.length}/${appeals.length}` })
      .setTimestamp(new Date());

    for (const a of slice) {
      const status = a.status.toUpperCase();
      const when = new Date(a.created_at).toLocaleString();
      const reviewed = a.reviewed_at ? new Date(a.reviewed_at).toLocaleString() : '—';
      embed.addFields({
        name: `#${a.id} • ${a.appeal_type} • ${status}`,
        value: `Reason: ${a.reason}\nSubmitted: ${when}\nReviewed: ${reviewed}`,
        inline: false
      });
    }

    return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Reminders System
  if (name === "remind") {
    const timeStr = interaction.options.getString('time', true);
    const message = interaction.options.getString('message', true);

    const { parseTimeString, createReminder } = await import('./services/reminders');
    const minutes = parseTimeString(timeStr);

    if (!minutes) {
      if (interaction.replied || interaction.deferred) {
        console.log('Debug: Interaction already acknowledged. Skipping response.');
        return;
      }
      return await safeReply(interaction, '❌ Invalid time format. Use formats like: 2h, 30m, 1d, 45s', { flags: MessageFlags.Ephemeral });
    }

    const reminderId = createReminder(
      interaction.user.id,
      message,
      minutes,
      interaction.guild?.id,
      interaction.channelId
    );

    const reminderTime = new Date(Date.now() + minutes * 60000);
    return await safeReply(interaction, `✅ Reminder #${reminderId} set for <t:${Math.floor(reminderTime.getTime() / 1000)}:R>!\n**Message:** ${message}`, { flags: MessageFlags.Ephemeral });
  }

  if (name === "reminders") {
    const { getUserReminders } = await import('./services/reminders');
    const reminders = getUserReminders(interaction.user.id);

    if (reminders.length === 0) {
      if (interaction.replied || interaction.deferred) {
        console.log('Debug: Interaction already acknowledged. Skipping response.');
        return;
      }
      return await safeReply(interaction, 'You have no active reminders.', { flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle('⏰ Your Reminders')
      .setColor(0x00AE86);

    for (const reminder of reminders) {
      const remindAt = new Date(reminder.remind_at);
      embed.addFields({
        name: `Reminder #${reminder.id}`,
        value: `**Message:** ${reminder.message}\n**Time:** <t:${Math.floor(remindAt.getTime() / 1000)}:R>`,
        inline: false
      });
    }

    return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (name === "cancelreminder") {
    const reminderId = interaction.options.getInteger('id', true);
    const { cancelReminder } = await import('./services/reminders');

    const success = cancelReminder(reminderId, interaction.user.id);
    if (success) {
      return await safeReply(interaction, `✅ Cancelled reminder #${reminderId}.`, { flags: MessageFlags.Ephemeral });
    } else {
      if (interaction.replied || interaction.deferred) {
        console.log('Debug: Interaction already acknowledged. Skipping response.');
        return;
      }
      return await safeReply(interaction, `❌ Reminder #${reminderId} not found or doesn't belong to you.`, { flags: MessageFlags.Ephemeral });
    }
  }

  // UPT (Unpaid Time Off) System
  if (name === "upt") {
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });

    const subCmd = interaction.options.getSubcommand();
    const { getUPTBalance, getUPTHistory, accrueUPT, deductUPT } = await import('./services/scheduling');

    if (subCmd === "balance") {
      const balance = getUPTBalance(interaction.guild.id, interaction.user.id);
      const hours = Math.floor(balance / 60);
      const mins = balance % 60;

      const embed = new EmbedBuilder()
        .setTitle('💳 Your UPT Balance')
        .setDescription(`You have **${hours}h ${mins}m** (${balance} minutes) of Unpaid Time Off available.`)
        .setColor(0x5865F2)
        .addFields(
          { name: 'ℹ️ What is UPT?', value: 'UPT (Unpaid Time Off) protects you from penalties:\n• Late clock-ins auto-deduct UPT\n• Missed shifts use UPT (480 min = 8 hours)\n• Earn 15 minutes per successful clock-in' }
        )
        .setTimestamp();

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "history") {
      const limit = interaction.options.getInteger('limit') || 10;
      const history = getUPTHistory(interaction.guild.id, interaction.user.id, limit);

      if (history.length === 0) {
        return await safeReply(interaction, '📋 No UPT transactions yet.', { flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 UPT Transaction History')
        .setColor(0x5865F2)
        .setTimestamp();

      const lines = history.map(tx => {
        const amount = tx.amount_minutes;
        const sign = amount > 0 ? '+' : '';
        const emoji = amount > 0 ? '✅' : '❌';
        const date = new Date(tx.created_at).toLocaleDateString();
        return `${emoji} **${sign}${amount} min** - ${tx.reason} (${date})`;
      });

      embed.setDescription(lines.join('\n'));

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "adjust") {
      if (!isOwnerId(interaction.user.id)) {
        return await safeReply(interaction, '❌ Only the owner can adjust UPT balances.', { flags: MessageFlags.Ephemeral });
      }

      const user = interaction.options.getUser('user', true);
      const minutes = interaction.options.getInteger('minutes', true);
      const reason = interaction.options.getString('reason', true);

      if (minutes > 0) {
        accrueUPT(interaction.guild.id, user.id, minutes);
      } else {
        const success = deductUPT(interaction.guild.id, user.id, Math.abs(minutes), 'manual_adjustment', reason);
        if (!success) {
          return await safeReply(interaction, '❌ User doesn\'t have enough UPT to deduct.', { flags: MessageFlags.Ephemeral });
        }
      }

      const newBalance = getUPTBalance(interaction.guild.id, user.id);
      return await safeReply(interaction, `✅ Adjusted <@${user.id}>'s UPT by ${minutes > 0 ? '+' : ''}${minutes} minutes.\n**New balance:** ${newBalance} minutes\n**Reason:** ${reason}`, { flags: MessageFlags.Ephemeral });
    }
  }

  // Attendance and Write-up System
  if (name === "attendance") {
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });

    const subCmd = interaction.options.getSubcommand();
    const { getWriteupCount, getUserWriteups, issueWriteup, clearWriteups, getMissedScheduledShiftCount } = await import('./services/scheduling');

    if (subCmd === "stats") {
      const writeupCount = getWriteupCount(interaction.guild.id, interaction.user.id);
      const missedShifts = getMissedScheduledShiftCount(interaction.guild.id, interaction.user.id);
      const { getUPTBalance } = await import('./services/scheduling');
      const uptBalance = getUPTBalance(interaction.guild.id, interaction.user.id);

      const embed = new EmbedBuilder()
        .setTitle('📊 Your Attendance Record')
        .setColor(writeupCount >= 2 || missedShifts >= 1 ? 0xED4245 : 0x57F287)
        .addFields(
          { name: '⚠️ Write-ups', value: `${writeupCount}/3 ${writeupCount >= 2 ? '⚠️' : ''}`, inline: true },
          { name: '❌ Missed Shifts', value: `${missedShifts}/2 ${missedShifts >= 1 ? '⚠️' : ''}`, inline: true },
          { name: '💳 UPT Balance', value: `${Math.floor(uptBalance / 60)}h ${uptBalance % 60}m`, inline: true }
        )
        .setFooter({ text: '3 write-ups OR 2 missed scheduled shifts = automatic demotion' })
        .setTimestamp();

      if (writeupCount >= 2 || missedShifts >= 1) {
        embed.setDescription('⚠️ **Warning:** You are at risk of demotion!');
      }

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "writeups") {
      const writeups = getUserWriteups(interaction.guild.id, interaction.user.id);

      if (writeups.length === 0) {
        return await safeReply(interaction, '✅ You have no write-ups on your record.', { flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle('⚠️ Your Write-ups')
        .setColor(0xED4245)
        .setDescription(`You have **${writeups.length}** write-up(s) on record:`)
        .setFooter({ text: '3 write-ups = automatic demotion' })
        .setTimestamp();

      const lines = writeups.slice(0, 5).map((w, idx) => {
        const date = new Date(w.created_at).toLocaleDateString();
        const severity = w.severity === 'severe' ? '🔴 SEVERE' : '🟡 Standard';
        return `**${idx + 1}.** ${severity} - ${w.reason} (${date})`;
      });

      embed.addFields({ name: 'Recent Write-ups', value: lines.join('\n') });

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "issue") {
      if (!isOwnerId(interaction.user.id)) {
        return await safeReply(interaction, '❌ Only the owner can issue write-ups.', { flags: MessageFlags.Ephemeral });
      }

      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      const severity = (interaction.options.getString('severity') || 'standard') as 'standard' | 'severe';
      const notes = interaction.options.getString('notes');

      issueWriteup(interaction.guild.id, user.id, reason, interaction.user.id, severity, notes || undefined);

      const writeupCount = getWriteupCount(interaction.guild.id, user.id);

      // Check if demotion is needed (3 write-ups)
      if (writeupCount >= 3) {
        const { handleAutoDemotion } = await import('./services/attendanceTracking');
        await handleAutoDemotion(interaction.guild.id, user.id, 'Three write-ups accumulated', interaction.client);
        return await safeReply(interaction, `✅ Write-up issued to <@${user.id}>.\n**Reason:** ${reason}\n**Severity:** ${severity}\n**Total write-ups:** ${writeupCount}/3\n\n📉 **User has been automatically demoted due to reaching 3 write-ups.**`, { flags: MessageFlags.Ephemeral });
      }

      // Send DM to user
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle('⚠️ Write-up Issued')
          .setColor(0xED4245)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Severity', value: severity === 'severe' ? '🔴 SEVERE' : '🟡 Standard' },
            { name: 'Write-ups', value: `${writeupCount}/3` }
          )
          .setFooter({ text: '3 write-ups = automatic demotion' })
          .setTimestamp();

        if (notes) dmEmbed.addFields({ name: 'Notes', value: notes });
        if (writeupCount >= 2) {
          dmEmbed.setDescription('⚠️ **Warning:** One more write-up will result in demotion!');
        }

        await user.send({ embeds: [dmEmbed] });
      } catch (error) {
        console.error('Failed to DM user about write-up:', error);
      }

      return await safeReply(interaction, `✅ Write-up issued to <@${user.id}>.\n**Reason:** ${reason}\n**Severity:** ${severity}\n**Total write-ups:** ${writeupCount}/3`, { flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "clear") {
      if (!isOwnerId(interaction.user.id)) {
        return await safeReply(interaction, '❌ Only the owner can clear write-ups.', { flags: MessageFlags.Ephemeral });
      }

      const user = interaction.options.getUser('user', true);
      clearWriteups(interaction.guild.id, user.id);

      return await safeReply(interaction, `✅ Cleared all write-ups for <@${user.id}>.`, { flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "report") {
      if (!isOwnerId(interaction.user.id)) {
        return await safeReply(interaction, '❌ Only the owner can view attendance reports.', { flags: MessageFlags.Ephemeral });
      }

      const user = interaction.options.getUser('user', true);
      const writeups = getUserWriteups(interaction.guild.id, user.id);
      const writeupCount = getWriteupCount(interaction.guild.id, user.id);
      const missedShifts = getMissedScheduledShiftCount(interaction.guild.id, user.id);
      const { getUPTBalance } = await import('./services/scheduling');
      const uptBalance = getUPTBalance(interaction.guild.id, user.id);

      const embed = new EmbedBuilder()
        .setTitle(`📊 Attendance Report: ${user.username}`)
        .setColor(writeupCount >= 2 || missedShifts >= 1 ? 0xED4245 : 0x57F287)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: '⚠️ Write-ups', value: `${writeupCount}/3 ${writeupCount >= 2 ? '⚠️' : ''}`, inline: true },
          { name: '❌ Missed Shifts', value: `${missedShifts}/2 ${missedShifts >= 1 ? '⚠️' : ''}`, inline: true },
          { name: '💳 UPT Balance', value: `${Math.floor(uptBalance / 60)}h ${uptBalance % 60}m`, inline: true }
        )
        .setTimestamp();

      if (writeups.length > 0) {
        const writeupLines = writeups.slice(0, 3).map((w, idx) => {
          const date = new Date(w.created_at).toLocaleDateString();
          const severity = w.severity === 'severe' ? '🔴 SEVERE' : '🟡';
          return `${idx + 1}. ${severity} ${w.reason} (${date})`;
        });
        embed.addFields({ name: 'Recent Write-ups', value: writeupLines.join('\n') });
      }

      if (writeupCount >= 2 || missedShifts >= 1) {
        embed.setDescription('⚠️ **Warning:** This user is at risk of automatic demotion!');
      }

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }

  // Payroll System
  if (name === "payroll") {
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });
    
    const subCmd = interaction.options.getSubcommand();
    console.log(`[PAYROLL DEBUG] User ${interaction.user.id} attempting subcommand: ${subCmd}`);
    console.log(`[PAYROLL DEBUG] isOwner check: ${isOwnerId(interaction.user.id)}`);
    console.log(`[PAYROLL DEBUG] Should allow: ${subCmd === "viewbalance" || isOwnerId(interaction.user.id)}`);
    
    const { getPayrollConfig, updatePayrollConfig, calculatePay, createPayPeriod, getUnpaidPayPeriods, markPayPeriodPaid, getUserPayPeriods } = await import('./services/payroll');

    // viewbalance is accessible to all staff, other commands require owner
    if (subCmd !== "viewbalance" && !isOwnerId(interaction.user.id)) {
      console.log(`[PAYROLL DEBUG] BLOCKING user ${interaction.user.id} from ${subCmd}`);
      return await safeReply(interaction, '❌ Only the owner can manage payroll settings.', { flags: MessageFlags.Ephemeral });
    }
    
    console.log(`[PAYROLL DEBUG] ALLOWING user ${interaction.user.id} to use ${subCmd}`);

    if (subCmd === "config") {
      const hourlyRate = interaction.options.getNumber('hourly_rate');
      const maxHoursDay = interaction.options.getInteger('max_hours_day');
      const maxDaysWeek = interaction.options.getInteger('max_days_week');
      const autoBreakMinutes = interaction.options.getInteger('auto_break_minutes');

      const updates: any = {};
      if (hourlyRate !== null) updates.hourly_rate = hourlyRate;
      if (maxHoursDay !== null) updates.max_hours_per_day = maxHoursDay;
      if (maxDaysWeek !== null) updates.max_days_per_week = maxDaysWeek;
      if (autoBreakMinutes !== null) updates.auto_break_minutes = autoBreakMinutes;

      updatePayrollConfig(interaction.guild.id, updates);
      const config = getPayrollConfig(interaction.guild.id);

      return await safeReply(interaction, `✅ Payroll configuration updated!\n\n**Hourly Rate:** $${config.hourly_rate}\n**Max Hours/Day:** ${config.max_hours_per_day}\n**Max Days/Week:** ${config.max_days_per_week}\n**Auto-Break After:** ${config.auto_break_minutes} minutes`, { flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "view") {
      const config = getPayrollConfig(interaction.guild.id);
      const status = config.is_enabled ? '🟢 Enabled' : '🔴 Disabled';

      const embed = new EmbedBuilder()
        .setTitle('💰 Payroll Configuration')
        .setColor(0x00AE86)
        .addFields(
          { name: 'Status', value: status, inline: true },
          { name: 'Hourly Rate', value: `$${config.hourly_rate}`, inline: true },
          { name: 'Max Hours/Day', value: `${config.max_hours_per_day}h`, inline: true },
          { name: 'Max Days/Week', value: `${config.max_days_per_week} days`, inline: true },
          { name: 'Auto-Break After', value: `${config.auto_break_minutes} min`, inline: true }
        );

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "calculate") {
      const user = interaction.options.getUser('user', true);
      const startDate = interaction.options.getString('start_date', true);
      const endDate = interaction.options.getString('end_date', true);

      const payData = calculatePay(interaction.guild.id, user.id, startDate, endDate);
      const periodId = createPayPeriod(interaction.guild.id, user.id, startDate, endDate);

      const embed = new EmbedBuilder()
        .setTitle(`💰 Pay Calculation - ${user.tag}`)
        .setColor(0x57F287)
        .addFields(
          { name: 'Period', value: `${startDate} to ${endDate}`, inline: false },
          { name: 'Total Hours', value: `${payData.totalHours}h`, inline: true },
          { name: 'Total Shifts', value: `${payData.shifts}`, inline: true },
          { name: 'Total Pay', value: `$${payData.totalPay}`, inline: true }
        )
        .setFooter({ text: `Pay Period ID: ${periodId} | Use /payroll markpaid to mark as paid` });

      return await safeReply(interaction, { embeds: [embed] });
    }

    if (subCmd === "unpaid") {
      const user = interaction.options.getUser('user');
      const periods = getUnpaidPayPeriods(interaction.guild.id, user?.id);

      if (periods.length === 0) {
        return await safeReply(interaction, '✅ No unpaid pay periods!', { flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle('💰 Unpaid Pay Periods')
        .setColor(0xED4245);

      for (const period of periods.slice(0, 10)) {
        embed.addFields({
          name: `#${period.id} - <@${period.user_id}>`,
          value: `**Period:** ${period.start_date} to ${period.end_date}\n**Hours:** ${period.total_hours}h\n**Pay:** $${period.total_pay}`,
          inline: false
        });
      }

      return await safeReply(interaction, { embeds: [embed] });
    }

    if (subCmd === "markpaid") {
      const periodId = interaction.options.getInteger('period_id', true);
      const success = markPayPeriodPaid(periodId);
      
      if (!success) {
        return await safeReply(interaction, `❌ Pay period #${periodId} not found or already marked as paid!`, { flags: MessageFlags.Ephemeral });
      }
      
      return await safeReply(interaction, `✅ Pay period #${periodId} marked as paid!`, { flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "history") {
      const user = interaction.options.getUser('user') || interaction.user;
      const periods = getUserPayPeriods(interaction.guild.id, user.id, 10);

      if (periods.length === 0) {
        return await safeReply(interaction, `${user.id === interaction.user.id ? 'You have' : user.tag + ' has'} no pay period history.`, { flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle(`💰 Pay History - ${user.tag}`)
        .setColor(0x57F287);

      for (const period of periods) {
        const status = period.paid ? '✅ Paid' : '⏳ Unpaid';
        embed.addFields({
          name: `#${period.id} - ${status}`,
          value: `**Period:** ${period.start_date} to ${period.end_date}\n**Hours:** ${period.total_hours}h | **Pay:** $${period.total_pay}${period.paid_at ? `\n**Paid:** ${new Date(period.paid_at).toLocaleDateString()}` : ''}`,
          inline: false
        });
      }

      return await safeReply(interaction, { embeds: [embed] });
    }

    if (subCmd === "reset") {
      const targetUser = interaction.options.getUser('user', true);
      const days = interaction.options.getInteger('days') || 30;
      
      const { resetPayrollHours } = await import('./services/payroll');
      const { forceClockOut } = await import('./services/payroll');
      const { getActiveShift } = await import('./services/shifts');
      
      // Force clock out if currently clocked in
      const activeShift = getActiveShift(interaction.guild.id, targetUser.id);
      if (activeShift) {
        forceClockOut(interaction.guild.id, targetUser.id);
      }
      
      const result = resetPayrollHours(interaction.guild.id, targetUser.id, days);
      
      const embed = new EmbedBuilder()
        .setTitle('🔄 Payroll Hours Reset')
        .setColor(0xFF6B00)
        .setDescription(`Reset payroll data for ${targetUser.tag}`)
        .addFields(
          { name: '📅 Time Period', value: `Last ${days} days`, inline: true },
          { name: '🗑️ Shifts Deleted', value: result.deletedShifts.toString(), inline: true },
          { name: '⏱️ Hours Removed', value: `${result.deletedHours}h`, inline: true }
        )
        .setTimestamp();
      
      // Try to notify the user
      try {
        await targetUser.send({
          embeds: [{
            color: 0xFF6B00,
            title: '⚠️ Payroll Hours Reset',
            description: `Your payroll hours have been reset by an administrator.\n\n**Time Period:** Last ${days} days\n**Shifts Deleted:** ${result.deletedShifts}\n**Hours Removed:** ${result.deletedHours}h`,
            timestamp: new Date().toISOString()
          }]
        });
      } catch (err) {
        // User has DMs disabled
      }
      
      return await safeReply(interaction, { embeds: [embed] });
    }

    if (subCmd === "adjustpay") {
      const targetType = interaction.options.getString('target_type', true) as 'user' | 'role';
      const user = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');
      const multiplier = interaction.options.getNumber('multiplier', true);
      const reason = interaction.options.getString('reason', true);

      if (targetType === 'user' && !user) {
        return await safeReply(interaction, '❌ You must specify a user when target_type is "user".', { flags: MessageFlags.Ephemeral });
      }

      if (targetType === 'role' && !role) {
        return await safeReply(interaction, '❌ You must specify a role when target_type is "role".', { flags: MessageFlags.Ephemeral });
      }

      if (multiplier <= 0 || multiplier > 5) {
        return await safeReply(interaction, '❌ Multiplier must be between 0 and 5.', { flags: MessageFlags.Ephemeral });
      }

      const { setPayAdjustment } = await import('./services/payroll');
      const targetId = targetType === 'user' ? user!.id : role!.id;

      setPayAdjustment(interaction.guild.id, targetId, targetType, multiplier, reason, interaction.user.id);

      const targetName = targetType === 'user' ? user!.tag : role!.name;
      const changePercent = ((multiplier - 1) * 100).toFixed(0);
      const changeText = multiplier > 1 
        ? `+${changePercent}% increase` 
        : multiplier < 1 
          ? `${changePercent}% decrease` 
          : 'no change (1.0x)';

      const embed = new EmbedBuilder()
        .setTitle('💰 Pay Adjustment Set')
        .setColor(multiplier > 1 ? 0x57F287 : multiplier < 1 ? 0xED4245 : 0x5865F2)
        .addFields(
          { name: 'Target', value: `${targetType === 'user' ? '👤' : '👥'} ${targetName}`, inline: true },
          { name: 'Multiplier', value: `${multiplier}x (${changeText})`, inline: true },
          { name: '\u200b', value: '\u200b', inline: true },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Set By', value: interaction.user.tag, inline: true }
        )
        .setTimestamp();

      return await safeReply(interaction, { embeds: [embed] });
    }

    if (subCmd === "removepay") {
      const targetType = interaction.options.getString('target_type', true) as 'user' | 'role';
      const user = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');

      if (targetType === 'user' && !user) {
        return await safeReply(interaction, '❌ You must specify a user when target_type is "user".', { flags: MessageFlags.Ephemeral });
      }

      if (targetType === 'role' && !role) {
        return await safeReply(interaction, '❌ You must specify a role when target_type is "role".', { flags: MessageFlags.Ephemeral });
      }

      const { removePayAdjustment, getPayAdjustment } = await import('./services/payroll');
      const targetId = targetType === 'user' ? user!.id : role!.id;

      // Check if adjustment exists
      const existing = getPayAdjustment(interaction.guild.id, targetId, targetType);
      if (!existing) {
        const targetName = targetType === 'user' ? user!.tag : role!.name;
        return await safeReply(interaction, `❌ No pay adjustment found for ${targetName}.`, { flags: MessageFlags.Ephemeral });
      }

      removePayAdjustment(interaction.guild.id, targetId, targetType);

      const targetName = targetType === 'user' ? user!.tag : role!.name;
      return await safeReply(interaction, `✅ Pay adjustment removed for ${targetName}.`, { flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "listpay") {
      const { listPayAdjustments } = await import('./services/payroll');
      const adjustments = listPayAdjustments(interaction.guild.id);

      if (adjustments.length === 0) {
        return await safeReply(interaction, '✅ No active pay adjustments.', { flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle('💰 Active Pay Adjustments')
        .setColor(0x5865F2)
        .setDescription(`Total: ${adjustments.length} adjustment(s)`);

      const userAdjustments = adjustments.filter(a => a.targetType === 'user');
      const roleAdjustments = adjustments.filter(a => a.targetType === 'role');

      if (userAdjustments.length > 0) {
        const userList = userAdjustments.map(a => {
          const changePercent = ((a.multiplier - 1) * 100).toFixed(0);
          const changeText = a.multiplier > 1 ? `+${changePercent}%` : `${changePercent}%`;
          return `<@${a.targetId}>: **${a.multiplier}x** (${changeText})\n└ _${a.reason}_`;
        }).join('\n\n');

        embed.addFields({ name: '👤 User Adjustments', value: userList.slice(0, 1000), inline: false });
      }

      if (roleAdjustments.length > 0) {
        const roleList = roleAdjustments.map(a => {
          const changePercent = ((a.multiplier - 1) * 100).toFixed(0);
          const changeText = a.multiplier > 1 ? `+${changePercent}%` : `${changePercent}%`;
          return `<@&${a.targetId}>: **${a.multiplier}x** (${changeText})\n└ _${a.reason}_`;
        }).join('\n\n');

        embed.addFields({ name: '👥 Role Adjustments', value: roleList.slice(0, 1000), inline: false });
      }

      return await safeReply(interaction, { embeds: [embed] });
    }

    if (subCmd === "viewbalance") {
      const targetUser = interaction.options.getUser('user');
      
      // If checking another user, must be owner
      if (targetUser && targetUser.id !== interaction.user.id && !isOwnerId(interaction.user.id)) {
        return await safeReply(interaction, '❌ Only the owner can view other users\' balances.', { flags: MessageFlags.Ephemeral });
      }

      const userToCheck = targetUser || interaction.user;
      const { getTotalUnpaidBalance, getCurrentBiWeeklyPay, getCurrentMonthlyPay, getLastMonthlyPay, getEffectivePayMultiplier } = await import('./services/payroll');
      
      const balance = getTotalUnpaidBalance(interaction.guild.id, userToCheck.id);
      const biWeekly = getCurrentBiWeeklyPay(interaction.guild.id, userToCheck.id);
      const thisMonth = getCurrentMonthlyPay(interaction.guild.id, userToCheck.id);
      const lastMonth = getLastMonthlyPay(interaction.guild.id, userToCheck.id);
      
      const member = await interaction.guild.members.fetch(userToCheck.id);
      const multiplier = getEffectivePayMultiplier(interaction.guild.id, userToCheck.id, member.roles.cache.map(r => r.id));

      const embed = new EmbedBuilder()
        .setTitle(`💰 Pay Summary - ${userToCheck.tag}`)
        .setColor(0xFEE75C)
        .setDescription(`Pay rate: **$${(await import('./services/payroll')).getPayrollConfig(interaction.guild.id).hourly_rate}/hr** • Multiplier: **${multiplier}x**`)
        .addFields(
          { 
            name: '📅 Last 14 Days (Bi-Weekly)', 
            value: biWeekly.shifts > 0 
              ? `**$${(biWeekly.totalPay * multiplier).toFixed(2)}**\n${biWeekly.totalHours.toFixed(2)} hours • ${biWeekly.shifts} shifts`
              : 'No shifts worked', 
            inline: false 
          },
          { 
            name: `� ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })} (This Month)`, 
            value: thisMonth.shifts > 0
              ? `**$${(thisMonth.totalPay * multiplier).toFixed(2)}**\n${thisMonth.totalHours.toFixed(2)} hours • ${thisMonth.shifts} shifts`
              : 'No shifts worked', 
            inline: true 
          },
          { 
            name: `📆 ${new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleString('default', { month: 'long', year: 'numeric' })} (Last Month)`, 
            value: lastMonth.shifts > 0
              ? `**$${(lastMonth.totalPay * multiplier).toFixed(2)}**\n${lastMonth.totalHours.toFixed(2)} hours • ${lastMonth.shifts} shifts`
              : 'No shifts worked', 
            inline: true 
          }
        );

      if (balance.totalPay > 0) {
        embed.addFields({
          name: '� Unpaid Balance (All Time)',
          value: `**$${(balance.totalPay * multiplier).toFixed(2)}**\n${balance.totalHours.toFixed(2)} hours • ${balance.periods} pay periods`,
          inline: false
        });
      }

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "payday") {
      const { getAllUnpaidBalances, getEffectivePayMultiplier } = await import('./services/payroll');
      
      const unpaidUsers = getAllUnpaidBalances(interaction.guild.id);
      
      if (unpaidUsers.length === 0) {
        return await safeReply(interaction, '✅ No staff have unpaid balances!', { flags: MessageFlags.Ephemeral });
      }

      await safeReply(interaction, `💰 **Payday initiated!** Sending DMs to ${unpaidUsers.length} staff member(s) with unpaid balances...`, { flags: MessageFlags.Ephemeral });

      const paydayId = `payday_${Date.now()}`;
      let successCount = 0;
      let failCount = 0;
      const failedUsers: Array<{userId: string, username: string, reason: string}> = [];

      for (const userData of unpaidUsers) {
        try {
          const member = await interaction.guild.members.fetch(userData.userId).catch(() => null);
          
          if (!member) {
            failedUsers.push({
              userId: userData.userId,
              username: 'Unknown User',
              reason: 'User not found in server'
            });
            failCount++;
            continue;
          }

          const multiplier = getEffectivePayMultiplier(interaction.guild.id, userData.userId, member.roles.cache.map(r => r.id));
          const amountOwed = (userData.totalPay * multiplier).toFixed(2);

          const embed = new EmbedBuilder()
            .setTitle('💰 Payday - Payment Information Required')
            .setColor(0x57F287)
            .setDescription(`Hello ${member.user.username}! It's payday! 🎉\n\nYou have **$${amountOwed}** in unpaid earnings.\n\nPlease select your preferred payment method and provide your payment details below.`)
            .addFields(
              { name: '💵 Amount Owed', value: `$${amountOwed}`, inline: true },
              { name: '⏱️ Total Hours', value: `${userData.totalHours.toFixed(2)}h`, inline: true },
              { name: '📋 Pay Periods', value: `${userData.periods}`, inline: true }
            )
            .setFooter({ text: 'Click a button below to submit your payment details' })
            .setTimestamp();

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`payday_paypal_${interaction.guild.id}_${paydayId}`)
              .setLabel('PayPal')
              .setEmoji('💳')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`payday_cashapp_${interaction.guild.id}_${paydayId}`)
              .setLabel('Cash App')
              .setEmoji('💵')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`payday_venmo_${interaction.guild.id}_${paydayId}`)
              .setLabel('Venmo')
              .setEmoji('💰')
              .setStyle(ButtonStyle.Success)
          );

          const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`payday_btc_${interaction.guild.id}_${paydayId}`)
              .setLabel('Bitcoin (BTC)')
              .setEmoji('🪙')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`payday_eth_${interaction.guild.id}_${paydayId}`)
              .setLabel('Ethereum (ETH)')
              .setEmoji('💎')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`payday_ltc_${interaction.guild.id}_${paydayId}`)
              .setLabel('Litecoin (LTC)')
              .setEmoji('🔷')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`payday_usdt_${interaction.guild.id}_${paydayId}`)
              .setLabel('USDT (Tether)')
              .setEmoji('💵')
              .setStyle(ButtonStyle.Secondary)
          );

          await member.send({ embeds: [embed], components: [row, row2] });
          successCount++;
        } catch (error: any) {
          const member = await interaction.guild.members.fetch(userData.userId).catch(() => null);
          const username = member ? member.user.tag : `User ID: ${userData.userId}`;
          const reason = error?.code === 50007 ? 'DMs disabled or bot blocked' : error?.message || 'Unknown error';
          
          console.error(`Failed to send payday DM to ${userData.userId}:`, error);
          failedUsers.push({
            userId: userData.userId,
            username,
            reason
          });
          failCount++;
        }
      }

      // Send summary to owner
      try {
        const owner = await interaction.client.users.fetch(interaction.user.id);
        const summaryEmbed = new EmbedBuilder()
          .setTitle('💰 Payday Summary')
          .setColor(failCount > 0 ? 0xFEE75C : 0x57F287)
          .setDescription(`Payday initiated!\n\n**ID:** ${paydayId}`)
          .addFields(
            { name: '✅ DMs Sent', value: `${successCount}`, inline: true },
            { name: '❌ Failed', value: `${failCount}`, inline: true },
            { name: '📊 Total Staff', value: `${unpaidUsers.length}`, inline: true }
          )
          .setTimestamp();

        // Add failed users details if any
        if (failedUsers.length > 0) {
          const failedList = failedUsers.map(f => 
            `• <@${f.userId}> (${f.username})\n  *Reason:* ${f.reason}`
          ).join('\n\n');
          
          summaryEmbed.addFields({
            name: '⚠️ Failed to Send DMs',
            value: failedList.slice(0, 1000) // Limit to 1000 chars
          });
          summaryEmbed.setFooter({ text: 'Staff with failed DMs need to enable DMs from server members or contact you manually' });
        } else {
          summaryEmbed.setFooter({ text: 'You will receive payment details as staff submit them' });
        }

        await owner.send({ embeds: [summaryEmbed] });
      } catch (error) {
        console.error('Failed to send payday summary to owner:', error);
      }
    }

    if (subCmd === "enable") {
      updatePayrollConfig(interaction.guild.id, { is_enabled: true });
      return await safeReply(interaction, '✅ Clock-in system enabled!', { flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "disable") {
      updatePayrollConfig(interaction.guild.id, { is_enabled: false });
      return await safeReply(interaction, '⏸️ Clock-in system disabled! Staff will not be able to clock in until re-enabled.', { flags: MessageFlags.Ephemeral });
    }
  }

  // Staff Shifts
  if (name === "clockin") {
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });

    const { canClockIn } = await import('./services/payroll');
    const { clockIn, getShiftPanels } = await import('./services/shifts');
    const { isScheduledToday, hasApprovedWorkRequestToday, createWorkRequest } = await import('./services/scheduling');
    
    // Check if user can clock in (payroll limits)
    const canClock = canClockIn(interaction.guild.id, interaction.user.id);
    if (!canClock.canClock) {
      return await safeReply(interaction, `❌ ${canClock.reason}`, { flags: MessageFlags.Ephemeral });
    }
    
    // Check if user is scheduled to work today
    const scheduled = isScheduledToday(interaction.guild.id, interaction.user.id);
    const hasApproval = hasApprovedWorkRequestToday(interaction.guild.id, interaction.user.id);
    
    if (!scheduled && !hasApproval) {
      // Not scheduled - show options
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`work_request_${interaction.user.id}`)
          .setLabel('📝 Request to Work Today')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('work_request_skip')
          .setLabel('Skip')
          .setStyle(ButtonStyle.Secondary)
      );
      
      return await safeReply(interaction, {
        content: '⚠️ **You are not scheduled to work today.**\n\nYou can either:\n• Request permission from the owner to work today\n• Wait for your next scheduled day',
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    }
    
    const result = clockIn(interaction.guild.id, interaction.user.id);

    // Initialize activity tracking for payroll/break system
    if (result.success && result.shiftId) {
      const { trackActivity } = await import('./services/payroll');
      trackActivity(interaction.guild.id, interaction.user.id, result.shiftId);
    }

    // Auto-update all shift panels
    if (result.success) {
      const panels = getShiftPanels(interaction.guild.id);
      const embed = await buildShiftPanelEmbed(interaction.guild.id, interaction.client);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('shifts-refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
      );

      for (const panel of panels) {
        try {
          const channel = await interaction.guild.channels.fetch(panel.channel_id);
          if (channel?.isTextBased()) {
            const message = await (channel as any).messages.fetch(panel.message_id);
            await message.edit({ embeds: [embed], components: [row] });
          }
        } catch (e) {
          // Panel message may have been deleted
        }
      }
    }

    return await safeReply(interaction, result.message, { flags: MessageFlags.Ephemeral });
  }

  if (name === "clockout") {
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });

    const { clockOut, getShiftPanels, getActiveShift } = await import('./services/shifts');
    const activeShift = getActiveShift(interaction.guild.id, interaction.user.id);
    
    if (activeShift) {
      // End any active break before clocking out
      const { endAutoBreak, cleanupActivityTracker } = await import('./services/payroll');
      endAutoBreak(activeShift.id);
      cleanupActivityTracker(activeShift.id);
    }
    
    const result = clockOut(interaction.guild.id, interaction.user.id);

    // Auto-update all shift panels
    if (result.success) {
      const panels = getShiftPanels(interaction.guild.id);
      const embed = await buildShiftPanelEmbed(interaction.guild.id, interaction.client);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('shifts-refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
      );

      for (const panel of panels) {
        try {
          const channel = await interaction.guild.channels.fetch(panel.channel_id);
          if (channel?.isTextBased()) {
            const message = await (channel as any).messages.fetch(panel.message_id);
            await message.edit({ embeds: [embed], components: [row] });
          }
        } catch (e) {
          // Panel message may have been deleted
        }
      }
    }

    if (result.success && result.duration) {
      const hours = Math.floor(result.duration / 60);
      const mins = result.duration % 60;
      return await safeReply(interaction, `${result.message} Duration: **${hours}h ${mins}m**`, { flags: MessageFlags.Ephemeral });
    }

    return await safeReply(interaction, { content: result.message, flags: MessageFlags.Ephemeral });
  }

  if (name === "forceclockout") {
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });
    
    if (!isOwnerId(interaction.user.id)) {
      return await safeReply(interaction, '❌ This command is owner-only.', { flags: MessageFlags.Ephemeral });
    }
    
    const targetUser = interaction.options.getUser('user', true);
    const { forceClockOut } = await import('./services/payroll');
    const { getShiftPanels } = await import('./services/shifts');
    
    const result = forceClockOut(interaction.guild.id, targetUser.id);
    
    // Update shift panels if successful
    if (result.success) {
      const panels = getShiftPanels(interaction.guild.id);
      const embed = await buildShiftPanelEmbed(interaction.guild.id, interaction.client);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('shifts-refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
      );

      for (const panel of panels) {
        try {
          const channel = await interaction.guild.channels.fetch(panel.channel_id);
          if (channel?.isTextBased()) {
            const message = await (channel as any).messages.fetch(panel.message_id);
            await message.edit({ embeds: [embed], components: [row] });
          }
        } catch (e) {
          // Panel message may have been deleted
        }
      }
      
      // Try to notify the user
      try {
        const hours = Math.floor(result.duration! / 60);
        const mins = result.duration! % 60;
        await targetUser.send({
          embeds: [{
            color: 0xFF6B00,
            title: '⚠️ Force Clock-Out',
            description: `You have been clocked out by an administrator.\n\n**Shift Duration:** ${hours}h ${mins}m`,
            timestamp: new Date().toISOString()
          }]
        });
      } catch (err) {
        // User has DMs disabled
      }
    }
    
    if (result.success && result.duration) {
      const hours = Math.floor(result.duration / 60);
      const mins = result.duration % 60;
      return await safeReply(interaction, `✅ Clocked out ${targetUser.tag}. Duration: **${hours}h ${mins}m**`, { flags: MessageFlags.Ephemeral });
    }
    
    return await safeReply(interaction, result.message, { flags: MessageFlags.Ephemeral });
  }

  if (name === "shifts") {
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });

    const subCmd = interaction.options.getSubcommand();
    
    if (subCmd === "history") {
      const user = interaction.options.getUser('user') || interaction.user;
      const limit = interaction.options.getInteger('limit') || 10;

      const { getUserShifts } = await import('./services/shifts');
      const shifts = getUserShifts(interaction.guild.id, user.id, limit);

      if (shifts.length === 0) {
        return interaction.reply({ content: `${user.id === interaction.user.id ? 'You have' : user.tag + ' has'} no recorded shifts.`, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🕒 Shift History - ${user.tag}`)
        .setColor(0x5865F2)
        .setDescription(`Use \`/shifts detail shift_id:<ID>\` to see break details for a specific shift.`);

      for (const shift of shifts) {
        const clockIn = new Date(shift.clock_in);
        const status = shift.clock_out ? 
          `**Duration:** ${Math.floor(shift.duration_minutes! / 60)}h ${shift.duration_minutes! % 60}m\n**Ended:** ${new Date(shift.clock_out).toLocaleString()}` :
          '**Status:** Currently clocked in';
        
        embed.addFields({
          name: `Shift #${shift.id}`,
          value: `**Started:** ${clockIn.toLocaleString()}\n${status}`,
          inline: false
        });
      }

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "detail") {
      const shiftId = interaction.options.getInteger('shift_id', true);
      const { getDB } = await import('./services/db');
      const { getShiftBreaks } = await import('./services/payroll');
      
      const db = getDB();
      const shift = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(shiftId) as any;
      
      if (!shift) {
        return interaction.reply({ content: '❌ Shift not found.', ephemeral: true });
      }
      
      if (shift.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ That shift is not in this server.', ephemeral: true });
      }
      
      const breaks = getShiftBreaks(shiftId);
      const clockIn = new Date(shift.clock_in);
      const clockOut = shift.clock_out ? new Date(shift.clock_out) : null;
      
      // Calculate totals
      const totalElapsedMinutes = clockOut ? Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000) : 0;
      const totalBreakMinutes = breaks.filter(b => b.break_end).reduce((sum, b) => sum + (b.duration_minutes || 0), 0);
      const netWorkedMinutes = totalElapsedMinutes - totalBreakMinutes;
      
      const embed = new EmbedBuilder()
        .setTitle(`🕒 Shift #${shiftId} - Detailed Breakdown`)
        .setColor(0x5865F2)
        .addFields(
          { name: '⏰ Clock In', value: clockIn.toLocaleString(), inline: true },
          { name: '⏰ Clock Out', value: clockOut ? clockOut.toLocaleString() : '❌ Still active', inline: true },
          { name: '📊 Total Elapsed', value: `${Math.floor(totalElapsedMinutes / 60)}h ${totalElapsedMinutes % 60}m`, inline: true },
          { name: '☕ Break Time', value: `${Math.floor(totalBreakMinutes / 60)}h ${totalBreakMinutes % 60}m (${breaks.length} breaks)`, inline: true },
          { name: '💼 Net Worked', value: `${Math.floor(netWorkedMinutes / 60)}h ${netWorkedMinutes % 60}m`, inline: true },
          { name: '💰 Paid Hours', value: `${(netWorkedMinutes / 60).toFixed(2)} hours`, inline: true }
        );
      
      if (breaks.length > 0) {
        const breakList = breaks.map((b, idx) => {
          const start = new Date(b.break_start);
          const end = b.break_end ? new Date(b.break_end) : null;
          const duration = b.duration_minutes || 0;
          return `**Break ${idx + 1}:** ${start.toLocaleTimeString()} - ${end ? end.toLocaleTimeString() : '⏳ Ongoing'} (${duration}m)`;
        }).join('\n');
        embed.addFields({ name: '☕ Break Details', value: breakList || 'No breaks', inline: false });
      }
      
      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "panel") {
      const member = interaction.member as any;
      if (!member.permissions.has('ManageChannels')) {
        return interaction.reply({ content: '❌ You need Manage Channels permission to post shift panels.', ephemeral: true });
      }

      const { registerShiftPanel } = await import('./services/shifts');
      
      try {
        const embed = await buildShiftPanelEmbed(interaction.guild.id, interaction.client);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('shifts-refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );

        if (interaction.channel && 'send' in interaction.channel) {
          const message = await interaction.channel.send({ embeds: [embed], components: [row] });
          registerShiftPanel(interaction.guild.id, interaction.channel.id, message.id);
          return interaction.reply({ content: '✅ Posted shift tracker panel in this channel!', flags: MessageFlags.Ephemeral });
        } else {
          return interaction.reply({ content: '❌ Cannot post shift panel in this channel type.', flags: MessageFlags.Ephemeral });
        }
      } catch (error: any) {
        console.error('Error posting shift panel:', error);
        if (error.code === 50001) {
          return interaction.reply({ content: '❌ I don\'t have permission to send messages in this channel. Please check my permissions.', flags: MessageFlags.Ephemeral });
        } else {
          return interaction.reply({ content: '❌ Failed to post shift panel. Please try again.', flags: MessageFlags.Ephemeral });
        }
      }
    }
  }

  if (name === "shiftstats") {
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });

    const user = interaction.options.getUser('user') || interaction.user;
    const days = interaction.options.getInteger('days') || 30;

    const { getShiftStats } = await import('./services/shifts');
    const stats = getShiftStats(interaction.guild.id, user.id, days);

    const totalHours = Math.floor(stats.totalMinutes / 60);
    const totalMins = stats.totalMinutes % 60;
    const avgHours = Math.floor(stats.averageMinutes / 60);
    const avgMins = stats.averageMinutes % 60;

    const embed = new EmbedBuilder()
      .setTitle(`📊 Shift Statistics - ${user.tag}`)
      .setColor(0x5865F2)
      .setDescription(`Last ${days} days`)
      .addFields(
        { name: 'Total Shifts', value: `${stats.totalShifts}`, inline: true },
        { name: 'Total Time', value: `${totalHours}h ${totalMins}m`, inline: true },
        { name: 'Average Shift', value: `${avgHours}h ${avgMins}m`, inline: true }
      );

    return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (name === "whosonduty") {
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

    const { getActiveStaff } = await import('./services/shifts');
    const activeStaff = getActiveStaff(interaction.guild.id);

    if (activeStaff.length === 0) {
      return await safeReply(interaction, 'No staff currently clocked in.', { flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle('👥 Staff On Duty')
      .setColor(0x00FF00);

    for (const shift of activeStaff) {
      const clockIn = new Date(shift.clock_in);
      const duration = Math.floor((Date.now() - clockIn.getTime()) / 60000);
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;

      embed.addFields({
        name: `<@${shift.user_id}>`,
        value: `Clocked in <t:${Math.floor(clockIn.getTime() / 1000)}:R> (${hours}h ${mins}m)`,
        inline: false
      });
    }

    return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Scheduling System
  if (name === "schedule") {
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });

    const subCmd = interaction.options.getSubcommand();
    const {
      setStaffAvailability,
      getStaffAvailability,
      getStaffSchedule,
      getAllSchedulesForWeek,
      getCurrentWeekStart,
      getNextWeekStart,
      createShiftSwapRequest,
      getPendingSwapRequests
    } = await import('./services/scheduling');

    if (subCmd === "setavailability") {
      const daysStr = interaction.options.getString('days', true);
      const startTime = interaction.options.getString('start_time', true);
      const endTime = interaction.options.getString('end_time', true);

      // Parse days
      const days = daysStr.toLowerCase().split(',').map(d => d.trim());
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const invalidDays = days.filter(d => !validDays.includes(d));

      if (invalidDays.length > 0) {
        return await safeReply(interaction, `❌ Invalid day(s): ${invalidDays.join(', ')}`, { flags: MessageFlags.Ephemeral });
      }

      // Validate time format
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return await safeReply(interaction, '❌ Invalid time format. Use HH:MM (e.g., 09:00)', { flags: MessageFlags.Ephemeral });
      }

      setStaffAvailability(interaction.guild.id, interaction.user.id, days, { start: startTime, end: endTime });

      const embed = new EmbedBuilder()
        .setTitle('✅ Availability Set')
        .setColor(0x57F287)
        .addFields(
          { name: '📅 Preferred Days', value: days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', '), inline: false },
          { name: '⏰ Preferred Hours', value: `${startTime} - ${endTime}`, inline: false }
        )
        .setFooter({ text: 'This will be used when generating weekly schedules' });

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "view") {
      const week = interaction.options.getString('week') || 'current';
      const weekStart = week === 'next' ? getNextWeekStart() : getCurrentWeekStart();
      const schedules = getAllSchedulesForWeek(interaction.guild.id, weekStart);

      if (schedules.size === 0) {
        return await safeReply(interaction, '📅 No schedule generated yet for this week.', { flags: MessageFlags.Ephemeral });
      }

      const weekStartDate = new Date(weekStart);
      const weekEndDate = new Date(weekStart);
      weekEndDate.setDate(weekEndDate.getDate() + 6);

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📅 ${week === 'next' ? 'Next' : 'Current'} Week Schedule`)
        .setDescription(`**${weekStartDate.toLocaleDateString()} - ${weekEndDate.toLocaleDateString()}**`)
        .setTimestamp();

      // Organize by day (Sunday through Saturday)
      const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const daySchedules = new Map<string, string[]>();

      daysOfWeek.forEach(day => daySchedules.set(day, []));

      for (const [userId, days] of schedules.entries()) {
        days.forEach(day => {
          const staffList = daySchedules.get(day) || [];
          staffList.push(userId);
          daySchedules.set(day, staffList);
        });
      }

      for (const day of daysOfWeek) {
        const staffIds = daySchedules.get(day) || [];
        const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
        
        if (staffIds.length > 0) {
          const staffList = staffIds.map(id => `<@${id}>`).join(', ');
          embed.addFields({ name: dayLabel, value: staffList, inline: false });
        }
      }

      return await safeReply(interaction, { embeds: [embed] });
    }

    if (subCmd === "myschedule") {
      const schedule = getStaffSchedule(interaction.guild.id, interaction.user.id);

      if (!schedule) {
        const availability = getStaffAvailability(interaction.guild.id, interaction.user.id);
        
        if (!availability) {
          return await safeReply(interaction, '📅 You don\'t have a schedule yet. Use `/schedule setavailability` to set your preferences first.', { flags: MessageFlags.Ephemeral });
        }
        
        return await safeReply(interaction, '📅 No schedule assigned yet for this week. Check back after Sunday at 6 PM.', { flags: MessageFlags.Ephemeral });
      }

      const weekStart = getCurrentWeekStart();
      const weekStartDate = new Date(weekStart);
      const weekEndDate = new Date(weekStart);
      weekEndDate.setDate(weekEndDate.getDate() + 6);

      const embed = new EmbedBuilder()
        .setTitle('📅 Your Schedule')
        .setColor(0x57F287)
        .setDescription(`**${weekStartDate.toLocaleDateString()} - ${weekEndDate.toLocaleDateString()}**\n\nYou are scheduled ${schedule.length} day(s) this week:`)
        .setTimestamp();

      const daysList = schedule.map(day => {
        const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
        return `• **${dayLabel}**`;
      }).join('\n');

      embed.addFields({ name: 'Your Days', value: daysList, inline: false });

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "drop") {
      const day = interaction.options.getString('day', true);
      const schedule = getStaffSchedule(interaction.guild.id, interaction.user.id);

      if (!schedule || !schedule.includes(day)) {
        return await safeReply(interaction, `❌ You are not scheduled for ${day}.`, { flags: MessageFlags.Ephemeral });
      }

      const requestId = createShiftSwapRequest(interaction.guild.id, interaction.user.id, day, 'drop');

      // Notify all staff about the dropped shift
      const { getDB } = await import('./services/db');
      const db = getDB();
      const allStaff = db.prepare(`
        SELECT DISTINCT user_id FROM staff_schedules WHERE guild_id = ?
      `).all(interaction.guild.id) as any[];

      for (const { user_id } of allStaff) {
        if (user_id === interaction.user.id) continue;

        try {
          const user = await client.users.fetch(user_id);
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`accept_swap_${requestId}`)
              .setLabel('✅ Pick Up Shift')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`decline_swap_${requestId}`)
              .setLabel('Skip')
              .setStyle(ButtonStyle.Secondary)
          );

          await user.send({
            content: `📋 **Shift Available**\n\n<@${interaction.user.id}> has dropped their **${day.charAt(0).toUpperCase() + day.slice(1)}** shift.\n\nWould you like to pick it up? First to accept gets it!`,
            components: [row]
          });
        } catch (err) {
          console.error(`Failed to notify user ${user_id}:`, err);
        }
      }

      return await safeReply(interaction, `✅ Your **${day}** shift has been dropped. Staff will be notified.`, { flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "swap") {
      const giveDay = interaction.options.getString('give_day', true);
      const receiveDay = interaction.options.getString('receive_day', true);
      const targetUser = interaction.options.getUser('target_user', true);

      const mySchedule = getStaffSchedule(interaction.guild.id, interaction.user.id);
      const targetSchedule = getStaffSchedule(interaction.guild.id, targetUser.id);

      if (!mySchedule || !mySchedule.includes(giveDay)) {
        return await safeReply(interaction, `❌ You are not scheduled for ${giveDay}.`, { flags: MessageFlags.Ephemeral });
      }

      if (!targetSchedule || !targetSchedule.includes(receiveDay)) {
        return await safeReply(interaction, `❌ ${targetUser.tag} is not scheduled for ${receiveDay}.`, { flags: MessageFlags.Ephemeral });
      }

      const requestId = createShiftSwapRequest(
        interaction.guild.id,
        interaction.user.id,
        giveDay,
        'swap',
        targetUser.id,
        receiveDay
      );

      // Notify target user
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`accept_swap_${requestId}`)
          .setLabel('✅ Accept Swap')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`decline_swap_${requestId}`)
          .setLabel('❌ Decline')
          .setStyle(ButtonStyle.Danger)
      );

      try {
        await targetUser.send({
          content: `📋 **Shift Swap Request**\n\n<@${interaction.user.id}> wants to swap shifts with you:\n• They give you: **${giveDay.charAt(0).toUpperCase() + giveDay.slice(1)}**\n• You give them: **${receiveDay.charAt(0).toUpperCase() + receiveDay.slice(1)}**\n\nDo you accept?`,
          components: [row]
        });
      } catch (err) {
        return await safeReply(interaction, `❌ Failed to send swap request to ${targetUser.tag}.`, { flags: MessageFlags.Ephemeral });
      }

      return await safeReply(interaction, `✅ Swap request sent to ${targetUser.tag}!`, { flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "generate") {
      if (!isOwnerId(interaction.user.id)) {
        return await safeReply(interaction, '❌ Only the owner can generate schedules.', { flags: MessageFlags.Ephemeral });
      }

      const { generateWeeklySchedule, saveWeeklySchedule } = await import('./services/scheduling');
      const nextWeek = getNextWeekStart();
      const schedule = generateWeeklySchedule(interaction.guild.id, nextWeek);

      if (schedule.size === 0) {
        return await safeReply(interaction, '❌ No staff have set their availability yet. Staff must use `/schedule setavailability` first.', { flags: MessageFlags.Ephemeral });
      }

      saveWeeklySchedule(interaction.guild.id, nextWeek, schedule);

      return await safeReply(interaction, `✅ Generated schedule for ${schedule.size} staff members for next week starting ${nextWeek}.`, { flags: MessageFlags.Ephemeral });
    }
  }

  // Standalone Balance Command (accessible to all staff)
  if (name === "balance") {
    if (!interaction.guild) return await safeReply(interaction, 'This command can only be used in a server.', { flags: MessageFlags.Ephemeral });
    
    const targetUser = interaction.options.getUser('user');
    
    // If checking another user, must be owner
    if (targetUser && targetUser.id !== interaction.user.id && !isOwnerId(interaction.user.id)) {
      return await safeReply(interaction, '❌ Only the owner can view other users\' balances.', { flags: MessageFlags.Ephemeral });
    }

    const userToCheck = targetUser || interaction.user;
    const { getTotalUnpaidBalance, getCurrentBiWeeklyPay, getCurrentMonthlyPay, getLastMonthlyPay, getEffectivePayMultiplier, getPayrollConfig } = await import('./services/payroll');
    
    const balance = getTotalUnpaidBalance(interaction.guild.id, userToCheck.id);
    const biWeekly = getCurrentBiWeeklyPay(interaction.guild.id, userToCheck.id);
    const thisMonth = getCurrentMonthlyPay(interaction.guild.id, userToCheck.id);
    const lastMonth = getLastMonthlyPay(interaction.guild.id, userToCheck.id);
    
    const member = await interaction.guild.members.fetch(userToCheck.id);
    const multiplier = getEffectivePayMultiplier(interaction.guild.id, userToCheck.id, member.roles.cache.map(r => r.id));

    const embed = new EmbedBuilder()
      .setTitle(`💰 Pay Summary - ${userToCheck.tag}`)
      .setColor(0xFEE75C)
      .setDescription(`Pay rate: **$${getPayrollConfig(interaction.guild.id).hourly_rate}/hr** • Multiplier: **${multiplier}x**`)
      .addFields(
        { 
          name: '📅 Last 14 Days (Bi-Weekly)', 
          value: biWeekly.shifts > 0 
            ? `**$${(biWeekly.totalPay * multiplier).toFixed(2)}**\n${biWeekly.totalHours.toFixed(2)} hours • ${biWeekly.shifts} shifts`
            : 'No shifts worked', 
          inline: false 
        },
        { 
          name: `📅 ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })} (This Month)`, 
          value: thisMonth.shifts > 0
            ? `**$${(thisMonth.totalPay * multiplier).toFixed(2)}**\n${thisMonth.totalHours.toFixed(2)} hours • ${thisMonth.shifts} shifts`
            : 'No shifts worked', 
          inline: true 
        },
        { 
          name: `📆 ${new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleString('default', { month: 'long', year: 'numeric' })} (Last Month)`, 
          value: lastMonth.shifts > 0
            ? `**$${(lastMonth.totalPay * multiplier).toFixed(2)}**\n${lastMonth.totalHours.toFixed(2)} hours • ${lastMonth.shifts} shifts`
            : 'No shifts worked', 
          inline: true 
        }
      );

    if (balance.totalPay > 0) {
      embed.addFields({
        name: '💵 Unpaid Balance (All Time)',
        value: `**$${(balance.totalPay * multiplier).toFixed(2)}**\n${balance.totalHours.toFixed(2)} hours • ${balance.periods} pay periods`,
        inline: false
      });
    }

    return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Server Stats Channels
  if (name === "statschannels") {
    if (!(await hasCommandAccess(interaction.member, 'statschannels', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

    const subCmd = interaction.options.getSubcommand();
    const { setStatsChannel, getStatsChannels, removeStatsChannel } = await import('./services/statsChannels');

    if (subCmd === "set") {
      const type = interaction.options.getString('type', true) as any;
      const channel = interaction.options.getChannel('channel', true);
      const format = interaction.options.getString('format', true);

      setStatsChannel({
        guild_id: interaction.guild.id,
        channel_type: type,
        channel_id: channel.id,
        format: format,
        enabled: true
      });

      return await safeReply(interaction, `✅ Stats channel configured: ${channel.name} will show ${type}.`, { flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "list") {
      const channels = getStatsChannels(interaction.guild.id);
      if (channels.length === 0) {
        return interaction.reply({ content: 'No stats channels configured.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('📊 Server Stats Channels')
        .setColor(0x5865F2);

      for (const ch of channels) {
        embed.addFields({
          name: ch.channel_type,
          value: `<#${ch.channel_id}>\nFormat: \`${ch.format}\``,
          inline: false
        });
      }

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "remove") {
      const channel = interaction.options.getChannel('channel', true);
      const success = removeStatsChannel(channel.id);
      
      if (success) {
        return interaction.reply({ content: `✅ Removed stats channel configuration.`, ephemeral: true });
      } else {
        return interaction.reply({ content: `❌ No stats channel configuration found for that channel.`, ephemeral: true });
      }
    }
  }

  // Bulk Moderation Actions
  if (name === "bulkban" || name === "bulkkick" || name === "bulkmute") {
    if (!(await hasCommandAccess(interaction.member, name, interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

    const usersStr = interaction.options.getString('users', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const duration = name === "bulkmute" ? interaction.options.getString('duration') : null;

    // Parse user IDs
    const userIds = usersStr.split(/[,\s]+/).filter(id => id.trim().length > 0);

    if (userIds.length === 0) {
      return await safeReply(interaction, '❌ No valid user IDs provided.', { flags: MessageFlags.Ephemeral });
    }

    if (userIds.length > 20) {
      return await safeReply(interaction, '❌ Maximum 20 users at a time.', { flags: MessageFlags.Ephemeral });
    }

    // Confirmation
    const confirmEmbed = new EmbedBuilder()
      .setTitle(`⚠️ Confirm Bulk ${name.replace('bulk', '').toUpperCase()}`)
      .setColor(0xFF0000)
      .setDescription(`You are about to ${name.replace('bulk', '')} **${userIds.length}** users.\n\n**Reason:** ${reason}${duration ? `\n**Duration:** ${duration}` : ''}`)
      .addFields({ name: 'User IDs', value: userIds.join(', ').slice(0, 1000), inline: false });

    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`bulk-confirm-${name}`)
        .setLabel('Confirm')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('bulk-cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], flags: MessageFlags.Ephemeral });

    // Store data for button handler
    (client as any).bulkActionData = (client as any).bulkActionData || {};
    (client as any).bulkActionData[interaction.user.id] = { action: name, userIds, reason, duration, guildId: interaction.guild.id, moderatorId: interaction.user.id };

    return;
  }

  // Ticket System
  if (name === "ticket") {
    const subCmd = interaction.options.getSubcommand();

    if (subCmd === "setup") {
      if (!(await hasCommandAccess(interaction.member, 'ticket', interaction.guild?.id || null))) {
        return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const category = interaction.options.getChannel('category', true);
      const logChannel = interaction.options.getChannel('log_channel');
      const supportRole = interaction.options.getRole('support_role');
      const vouchChannel = interaction.options.getChannel('vouch_channel');

      const { setTicketConfig, getSupportRoleIds } = await import('./services/tickets');
      
      // Get existing support roles or create new array with the provided role
      let supportRoleIds: string[] = getSupportRoleIds(interaction.guild.id);
      if (supportRole && !supportRoleIds.includes(supportRole.id)) {
        supportRoleIds.push(supportRole.id);
      }
      
      setTicketConfig({
        guild_id: interaction.guild.id,
        category_id: category.id,
        log_channel_id: logChannel?.id,
        support_role_ids: supportRoleIds.length > 0 ? JSON.stringify(supportRoleIds) : undefined,
        vouch_channel_id: vouchChannel?.id,
        enabled: true
      });

      // Try to post a ticket panel in the current channel
      try {
        // @ts-ignore union types for channel
        const ch: any = interaction.channel;
        if (ch && ch.send) {
          const panelEmbed = new EmbedBuilder()
            .setTitle('🎫 Need Help?')
            .setDescription('Click the button below to open a private support ticket. A staff member will assist you shortly.')
            .setColor(0x5865F2);
          const panelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('ticket-open').setLabel('Open Ticket').setStyle(ButtonStyle.Primary)
          );
          await ch.send({ embeds: [panelEmbed], components: [panelRow] });
        }
      } catch {}

      return await safeReply(interaction, '✅ Ticket system configured! I posted a ticket panel here.', { ephemeral: true } as any);
    }

    if (subCmd === "panel") {
      if (!(await hasCommandAccess(interaction.member, 'ticket', interaction.guild?.id || null))) {
        return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
      try {
        const panelEmbed = new EmbedBuilder()
          .setTitle('🎫 Need Help?')
          .setDescription('Click the button below to open a private support ticket. A staff member will assist you shortly.')
          .setColor(0x5865F2);
        const panelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('ticket-open').setLabel('Open Ticket').setStyle(ButtonStyle.Primary)
        );
        // @ts-ignore
        await (interaction.channel as any)?.send({ embeds: [panelEmbed], components: [panelRow] });
        return interaction.reply({ content: '✅ Posted a ticket panel in this channel.', ephemeral: true });
      } catch {
        return interaction.reply({ content: '❌ Failed to post panel here. Check my permissions for Send Messages and Embed Links.', ephemeral: true });
      }
    }

    if (subCmd === "create") {
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const category = interaction.options.getString('category', true);
      const description = interaction.options.getString('description') || 'No description provided';

      const { getTicketConfig, createTicket, getUserTickets, isTicketBlacklisted, getTicketBlacklist } = await import('./services/tickets');
      
      // Check if user is blacklisted
      if (isTicketBlacklisted(interaction.user.id, interaction.guild.id)) {
        const blacklistEntry = getTicketBlacklist(interaction.user.id, interaction.guild.id);
        const reason = blacklistEntry?.reason || 'Violation of ticket system rules';
        return interaction.reply({ 
          content: `❌ You are blacklisted from creating tickets.\n**Reason:** ${reason}\n\nContact an administrator to appeal this blacklist.`, 
          ephemeral: true 
        });
      }
      
      const config = getTicketConfig(interaction.guild.id);

      if (!config || !config.enabled) {
        return interaction.reply({ content: '❌ Ticket system is not configured. Ask an admin to run `/ticket setup`.', ephemeral: true });
      }

      // Check if user already has open ticket
      const userTickets = getUserTickets(interaction.guild.id, interaction.user.id);
      const openTicket = userTickets.find(t => t.status !== 'closed');
      if (openTicket) {
        return interaction.reply({ content: `❌ You already have an open ticket: <#${openTicket.channel_id}>`, ephemeral: true });
      }

      // Get support roles to grant them access
      const { getSupportRoleIds } = await import('./services/tickets');
      const supportRoleIds = getSupportRoleIds(interaction.guild.id);

      // Create permission overwrites array using PermissionsBitField
      const permissionOverwrites: any[] = [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
        },
        {
          id: client.user!.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels]
        }
      ];

      // Add permissions for all support roles
      for (const roleId of supportRoleIds) {
        permissionOverwrites.push({
          id: roleId,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks]
        });
      }

      // Create ticket channel with support role permissions
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: 0, // Text channel
        parent: config.category_id,
        permissionOverwrites
      });

      const ticketId = createTicket(interaction.guild.id, ticketChannel.id, interaction.user.id, category);

      const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎫 Ticket #${ticketId}`)
        .setColor(0x00AE86)
        .setDescription(`**Opened by:** <@${interaction.user.id}>\n**Category:** ${category}\n**Description:** ${description}\n\nSupport will be with you shortly!`)
        .setFooter({ text: 'Use the button below or /ticket close to close this ticket' });

      const ticketActions = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ticket-close:${ticketId}`).setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
      );

      const supportMentions = supportRoleIds.length > 0 
        ? supportRoleIds.map(id => `<@&${id}>`).join(' ')
        : 'New ticket!';

      await ticketChannel.send({ 
        content: `${supportMentions} - <@${interaction.user.id}>`, 
        embeds: [ticketEmbed],
        components: [ticketActions]
      });

      return await safeReply(interaction, `✅ Ticket created: ${ticketChannel}`, { flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "close") {
      if (!interaction.channel || !('guild' in interaction.channel)) {
        return interaction.reply({ content: 'This command must be used in a ticket channel.', ephemeral: true });
      }

      const { getTicket, getTicketConfig } = await import('./services/tickets');
      const ticket = getTicket(interaction.channel.id);

      if (!ticket) {
        return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
      }

      if (ticket.status === 'closed') {
        return interaction.reply({ content: '❌ This ticket is already closed.', ephemeral: true });
      }

      // Check if user can close the ticket
      const isOwner = ticket.user_id === interaction.user.id;
      const isClaimer = ticket.claimed_by === interaction.user.id;
      const hasManageChannels = (interaction.member as any)?.permissions?.has('ManageChannels');
      
      // Check if user has any support roles
      const { getSupportRoleIds } = await import('./services/tickets');
      const supportRoleIds = interaction.guild ? getSupportRoleIds(interaction.guild.id) : [];
      const memberRoles = (interaction.member as any)?.roles?.cache 
        ? Array.from((interaction.member as any).roles.cache.keys()) 
        : [];
      const hasAnySupportRole = supportRoleIds.some(roleId => memberRoles.includes(roleId));
      
      if (!isOwner && !isClaimer && !hasManageChannels && !hasAnySupportRole) {
        return interaction.reply({ content: '❌ Only the ticket owner, assigned staff, or administrators can close this ticket.', ephemeral: true });
      }

      // Always ask ticket OWNER to rate before closing (regardless of who initiated the close)
      const ratingEmbed = new EmbedBuilder()
        .setTitle('📊 Rate Your Support Experience')
        .setDescription(`<@${ticket.user_id}>, please rate the support you received before we close this ticket.`)
        .setColor(0x5865F2)
        .addFields(
          { name: 'How would you rate your experience?', value: 'Click a rating below (1-10 scale)\n*After rating, you can send a message with feedback if you\'d like!*' }
        );

      // Create two rows for 1-10 rating buttons
      const ratingRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:1`).setLabel('1').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:2`).setLabel('2').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:3`).setLabel('3').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:4`).setLabel('4').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:5`).setLabel('5').setStyle(ButtonStyle.Secondary)
      );

      const ratingRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:6`).setLabel('6').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:7`).setLabel('7').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:8`).setLabel('8').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:9`).setLabel('9').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ticket-rate:${ticket.id}:10`).setLabel('10').setStyle(ButtonStyle.Success)
      );

      return interaction.reply({ embeds: [ratingEmbed], components: [ratingRow1, ratingRow2] });
    }

    if (subCmd === "claim") {
      console.log(`[Ticket] Claim command used in channel ${interaction.channel?.id} by ${interaction.user.tag}`);
      
      if (!interaction.channel || !('guild' in interaction.channel)) {
        return interaction.reply({ content: 'This command must be used in a ticket channel.', ephemeral: true });
      }

      const { getTicket, claimTicket, linkTicketToSupport } = await import('./services/tickets');
      const ticket = getTicket(interaction.channel.id);

      if (!ticket) {
        console.log(`[Ticket] No ticket found for channel ${interaction.channel.id}`);
        return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
      }
      
      console.log(`[Ticket] Found ticket - ID: ${ticket.id}, Claimed by: ${ticket.claimed_by || 'none'}`);

      if (ticket.claimed_by) {
        return interaction.reply({ content: `❌ This ticket is already claimed by <@${ticket.claimed_by}>.`, ephemeral: true });
      }

      // Check if staff is clocked in, auto-clock-in if not
      const { getActiveShift, clockIn } = await import('./services/shifts');
      const activeShift = getActiveShift(interaction.guild!.id, interaction.user.id);
      
      if (!activeShift) {
        // Auto-clock-in the staff member
        const clockInResult = clockIn(interaction.guild!.id, interaction.user.id);
        if (clockInResult.success) {
          await interaction.channel.send(`⏰ <@${interaction.user.id}> was automatically clocked in when claiming this ticket.`);
          
          // Update shift panels
          try {
            const { getShiftPanels } = await import('./services/shifts');
            const panels = getShiftPanels(interaction.guild!.id);
            const embed = await buildShiftPanelEmbed(interaction.guild!.id, interaction.client);
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId('shifts-refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
            );

            for (const panel of panels) {
              try {
                const channel = await interaction.guild!.channels.fetch(panel.channel_id);
                if (channel?.isTextBased()) {
                  const message = await (channel as any).messages.fetch(panel.message_id);
                  await message.edit({ embeds: [embed], components: [row] });
                }
              } catch (e) {
                // Panel message may have been deleted
              }
            }
          } catch (e) {
            console.error('Failed to update shift panels:', e);
          }
        }
      }

      claimTicket(interaction.channel.id, interaction.user.id);

      // Award points for claiming ticket
      try {
        const { awardDirectPoints } = await import('./services/rewards');
        awardDirectPoints(
          interaction.user.id,
          interaction.guild!.id,
          5,
          'Claimed a support ticket',
          'support'
        );
        console.log(`✨ Awarded 5 points to ${interaction.user.id} for claiming ticket #${ticket.id}`);
      } catch (e) {
        console.error('Failed to award claim points:', e);
      }

      // Auto-start support interaction
      try {
        const { startSupportInteraction } = await import('./services/smartSupport');
        const supportId = startSupportInteraction({
          userId: ticket.user_id,
          supportMemberId: interaction.user.id,
          guildId: interaction.guild!.id,
          channelId: interaction.channel.id,
          questionText: `Ticket #${ticket.id}: ${ticket.category}`
        });
        linkTicketToSupport(interaction.channel.id, supportId);
      } catch (e) {
        console.error('Failed to start support interaction for ticket:', e);
      }

      const claimEmbed = new EmbedBuilder()
        .setTitle('🎫 Ticket Claimed')
        .setColor(0x00AE86)
        .setDescription(`<@${interaction.user.id}> is now handling this ticket. (+5 points)`);

      return await safeReply(interaction, { embeds: [claimEmbed] });
    }

    if (subCmd === "addhelper") {
      if (!interaction.channel || !('guild' in interaction.channel)) {
        return interaction.reply({ content: 'This command must be used in a ticket channel.', ephemeral: true });
      }

      const { getTicket, addTicketHelper } = await import('./services/tickets');
      const ticket = getTicket(interaction.channel.id);

      if (!ticket) {
        return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
      }

      const helper = interaction.options.getUser('user', true);

      // Check if helper is clocked in
      const { getActiveShift } = await import('./services/shifts');
      const activeShift = getActiveShift(interaction.guild!.id, helper.id);
      
      if (!activeShift) {
        return interaction.reply({ 
          content: `❌ <@${helper.id}> must be clocked in to be added as a helper. They can use \`/clockin\` first.`,
          ephemeral: true 
        });
      }

      if (!ticket.support_interaction_id) {
        return interaction.reply({ content: '❌ This ticket doesn\'t have a support interaction. Claim it first with `/ticket claim`.', ephemeral: true });
      }

      // Add to ticket helpers
      const added = addTicketHelper(interaction.channel.id, helper.id);
      
      if (!added) {
        return interaction.reply({ content: `❌ <@${helper.id}> is already a helper on this ticket.`, ephemeral: true });
      }

      // Add to support interaction
      try {
        const { addSupportHelper } = await import('./services/smartSupport');
        addSupportHelper(ticket.support_interaction_id, helper.id);
      } catch (e) {
        console.error('Failed to add helper to support interaction:', e);
      }

      // Grant channel permissions to the helper
      try {
        const channel = interaction.channel as any;
        if (channel.permissionOverwrites) {
          await channel.permissionOverwrites.create(helper.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true
          });
          console.log(`✅ Granted channel permissions to helper ${helper.id} in ticket ${ticket.id}`);
        }
      } catch (e) {
        console.error('Failed to grant channel permissions to helper:', e);
        // Continue even if permissions fail - helper was still added to database
      }

      return await safeReply(interaction, `✅ Added <@${helper.id}> as a helper to this ticket and granted them access.`, { flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "unclaim") {
      if (!interaction.channel || !('guild' in interaction.channel)) {
        return interaction.reply({ content: 'This command must be used in a ticket channel.', ephemeral: true });
      }

      const { getTicket, unclaimTicket } = await import('./services/tickets');
      const ticket = getTicket(interaction.channel.id);

      if (!ticket) {
        return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
      }

      if (!ticket.claimed_by) {
        return interaction.reply({ content: '❌ This ticket is not claimed.', ephemeral: true });
      }

      if (ticket.claimed_by !== interaction.user.id) {
        return interaction.reply({ content: `❌ This ticket is claimed by <@${ticket.claimed_by}>. Only they can unclaim it.`, ephemeral: true });
      }

      const unclaimed = unclaimTicket(interaction.channel.id, interaction.user.id);

      if (!unclaimed) {
        return interaction.reply({ content: '❌ Failed to unclaim ticket.', ephemeral: true });
      }

      // End the support interaction if it exists
      if (ticket.support_interaction_id) {
        try {
          const { endSupportInteraction } = await import('./services/smartSupport');
          endSupportInteraction({
            interactionId: ticket.support_interaction_id,
            wasResolved: false,
            satisfactionRating: undefined,
            feedbackText: 'Ticket unclaimed by staff'
          });
        } catch (e) {
          console.error('Failed to end support interaction:', e);
        }
      }

      const unclaimEmbed = new EmbedBuilder()
        .setTitle('🎫 Ticket Unclaimed')
        .setColor(0xFFA500)
        .setDescription(`<@${interaction.user.id}> has unclaimed this ticket. It's now available for other staff to claim.`);

      return await safeReply(interaction, { embeds: [unclaimEmbed] });
    }

    if (subCmd === "list") {
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const { getOpenTickets } = await import('./services/tickets');
      const tickets = getOpenTickets(interaction.guild.id);

      if (tickets.length === 0) {
        return interaction.reply({ content: 'No open tickets.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🎫 Open Tickets')
        .setColor(0x00AE86);

      for (const ticket of tickets) {
        const status = ticket.claimed_by ? `Claimed by <@${ticket.claimed_by}>` : 'Unclaimed';
        const priorityTag = ticket.priority ? '🚨 **PRIORITY** ' : '';
        embed.addFields({
          name: `${priorityTag}Ticket #${ticket.id}`,
          value: `<#${ticket.channel_id}>\n**User:** <@${ticket.user_id}>\n**Status:** ${status}`,
          inline: false
        });
      }

      return await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "config") {
      if (!(await hasCommandAccess(interaction.member, 'ticket', interaction.guild?.id || null))) {
        return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const { getTicketConfig, getSupportRoleIds } = await import('./services/tickets');
      const config = getTicketConfig(interaction.guild.id);

      if (!config) {
        return interaction.reply({ content: '❌ Ticket system is not configured. Run `/ticket setup` to configure it.', ephemeral: true });
      }

      const supportRoleIds = getSupportRoleIds(interaction.guild.id);
      const supportRolesList = supportRoleIds.length > 0 
        ? supportRoleIds.map(id => `<@&${id}>`).join(', ')
        : 'Not set';

      const embed = new EmbedBuilder()
        .setTitle('🎫 Ticket System Configuration')
        .setColor(0x5865F2)
        .addFields(
          { 
            name: '📁 Ticket Category', 
            value: `<#${config.category_id}>`, 
            inline: true 
          },
          { 
            name: '📋 Log Channel', 
            value: config.log_channel_id ? `<#${config.log_channel_id}>` : 'Not set', 
            inline: true 
          },
          { 
            name: '👥 Support Roles', 
            value: supportRolesList, 
            inline: true 
          },
          { 
            name: '⭐ Vouch Channel', 
            value: config.vouch_channel_id ? `<#${config.vouch_channel_id}>` : 'Not set', 
            inline: true 
          },
          { 
            name: '✅ Status', 
            value: config.enabled ? 'Enabled' : 'Disabled', 
            inline: true 
          }
        )
        .setFooter({ text: 'Use /ticket setup to modify settings, /ticket addsupportrole or /ticket removesupportrole to manage support roles' });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subCmd === "addsupportrole") {
      if (!(await hasCommandAccess(interaction.member, 'ticket', interaction.guild?.id || null))) {
        return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const role = interaction.options.getRole('role', true);
      const { addSupportRole, getTicketConfig } = await import('./services/tickets');
      
      const config = getTicketConfig(interaction.guild.id);
      if (!config) {
        return interaction.reply({ content: '❌ Ticket system is not configured. Run `/ticket setup` first.', ephemeral: true });
      }

      const added = addSupportRole(interaction.guild.id, role.id);
      if (added) {
        return interaction.reply({ content: `✅ Added ${role} as a support role.`, ephemeral: true });
      } else {
        return interaction.reply({ content: `❌ ${role} is already a support role.`, ephemeral: true });
      }
    }

    if (subCmd === "removesupportrole") {
      if (!(await hasCommandAccess(interaction.member, 'ticket', interaction.guild?.id || null))) {
        return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const role = interaction.options.getRole('role', true);
      const { removeSupportRole, getTicketConfig } = await import('./services/tickets');
      
      const config = getTicketConfig(interaction.guild.id);
      if (!config) {
        return interaction.reply({ content: '❌ Ticket system is not configured. Run `/ticket setup` first.', ephemeral: true });
      }

      const removed = removeSupportRole(interaction.guild.id, role.id);
      if (removed) {
        return interaction.reply({ content: `✅ Removed ${role} from support roles.`, ephemeral: true });
      } else {
        return interaction.reply({ content: `❌ ${role} is not a support role.`, ephemeral: true });
      }
    }

    if (subCmd === "blacklist") {
      if (!(await hasCommandAccess(interaction.member, 'ticket', interaction.guild?.id || null))) {
        return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);

      const { blacklistFromTickets, isTicketBlacklisted } = await import('./services/tickets');

      try {
        const blacklistId = blacklistFromTickets(user.id, interaction.guild.id, reason, interaction.user.id);

        // Send DM to blacklisted user
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('🚫 Ticket Blacklist Notice')
            .setDescription(`You have been blacklisted from creating tickets in **${interaction.guild.name}**.`)
            .addFields(
              { name: 'Reason', value: reason },
              { name: 'Note', value: 'You will not be able to create new support tickets. Contact an administrator if you believe this is a mistake.' }
            )
            .setTimestamp();

          await user.send({ embeds: [dmEmbed] });
        } catch (err) {
          console.error('Failed to DM blacklisted user:', err);
        }

        // Log to mod channel
        const modLogChannelId = getModLogChannelId();
        if (modLogChannelId) {
          const modLogChannel = await interaction.guild.channels.fetch(modLogChannelId).catch(() => null) as any;
          if (modLogChannel) {
            const logEmbed = new EmbedBuilder()
              .setColor(0xFF6B6B)
              .setTitle('🚫 User Blacklisted from Tickets')
              .addFields(
                { name: 'User', value: `<@${user.id}>`, inline: true },
                { name: 'Blacklisted By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Reason', value: reason }
              )
              .setTimestamp();

            await modLogChannel.send({ embeds: [logEmbed] });
          }
        }

        return interaction.reply({ content: `✅ ${user.tag} has been blacklisted from creating tickets.`, ephemeral: true });
      } catch (err: any) {
        return interaction.reply({ content: `❌ ${err.message || 'Failed to blacklist user.'}`, ephemeral: true });
      }
    }

    if (subCmd === "unblacklist") {
      if (!(await hasCommandAccess(interaction.member, 'ticket', interaction.guild?.id || null))) {
        return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const user = interaction.options.getUser('user', true);

      const { unblacklistFromTickets, isTicketBlacklisted } = await import('./services/tickets');

      if (!isTicketBlacklisted(user.id, interaction.guild.id)) {
        return interaction.reply({ content: `❌ ${user.tag} is not blacklisted from tickets.`, ephemeral: true });
      }

      const removed = unblacklistFromTickets(user.id, interaction.guild.id, interaction.user.id);

      if (!removed) {
        return interaction.reply({ content: `❌ Failed to remove blacklist.`, ephemeral: true });
      }

      // Notify user
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor(0x51CF66)
          .setTitle('✅ Ticket Blacklist Removed')
          .setDescription(`You have been removed from the ticket blacklist in **${interaction.guild.name}**.`)
          .addFields(
            { name: 'Status', value: 'You can now create support tickets again.' }
          )
          .setTimestamp();

        await user.send({ embeds: [dmEmbed] });
      } catch (err) {
        console.error('Failed to DM user about unblacklist:', err);
      }

      // Log to mod channel
      const modLogChannelId = getModLogChannelId();
      if (modLogChannelId) {
        const modLogChannel = await interaction.guild.channels.fetch(modLogChannelId).catch(() => null) as any;
        if (modLogChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor(0x51CF66)
            .setTitle('✅ User Unblacklisted from Tickets')
            .addFields(
              { name: 'User', value: `<@${user.id}>`, inline: true },
              { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();

          await modLogChannel.send({ embeds: [logEmbed] });
        }
      }

      return interaction.reply({ content: `✅ ${user.tag} has been removed from the ticket blacklist.`, ephemeral: true });
    }

    if (subCmd === "blacklists") {
      if (!(await hasCommandAccess(interaction.member, 'ticket', interaction.guild?.id || null))) {
        return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const { getAllTicketBlacklists } = await import('./services/tickets');
      const blacklists = getAllTicketBlacklists(interaction.guild.id);

      if (blacklists.length === 0) {
        return interaction.reply({ content: '✅ No users are currently blacklisted from tickets.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🚫 Ticket Blacklisted Users')
        .setColor(0xFF6B6B)
        .setDescription(`**${blacklists.length}** user(s) blacklisted from creating tickets`);

      for (const blacklist of blacklists.slice(0, 10)) {
        const date = new Date(blacklist.blacklisted_at);
        embed.addFields({
          name: `User: <@${blacklist.user_id}>`,
          value: [
            `**Reason:** ${blacklist.reason}`,
            `**Blacklisted by:** <@${blacklist.blacklisted_by}>`,
            `**Date:** <t:${Math.floor(date.getTime() / 1000)}:R>`
          ].join('\n'),
          inline: false
        });
      }

      if (blacklists.length > 10) {
        embed.setFooter({ text: `Showing first 10 of ${blacklists.length} blacklisted users` });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subCmd === "diagnoseblacklist") {
      if (!(await hasCommandAccess(interaction.member, 'ticket', interaction.guild?.id || null))) {
        return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const user = interaction.options.getUser('user', true);

      const { isTicketBlacklisted, getTicketBlacklist } = await import('./services/tickets');
      const { getBlacklist, isBlacklisted } = await import('./services/blacklistService');
      const { getDB } = await import('./services/db');

      const ticketBlacklisted = isTicketBlacklisted(user.id, interaction.guild.id);
      const ticketEntry = ticketBlacklisted ? getTicketBlacklist(user.id, interaction.guild.id) : null;

      // Legacy JSON blacklist
      const jsonList = getBlacklist();
      const jsonEntry = jsonList.find(e => e.id === user.id && e.type === 'user') || null;

      // DB-backed global blacklist (guild-specific)
      let dbEntry: any = null;
      try {
        const db = getDB();
        dbEntry = db.prepare('SELECT * FROM blacklist WHERE guild_id = ? AND user_id = ? LIMIT 1').get(interaction.guild.id, user.id) || null;
      } catch {
        // table may not exist; ignore
      }

      const embed = new EmbedBuilder()
        .setTitle('🧰 Blacklist Diagnostics')
        .setColor(0x5865F2)
        .setDescription(`Results for <@${user.id}> in ${interaction.guild.name}`)
        .addFields(
          { name: 'Ticket Blacklist (ticket_blacklist)', value: ticketBlacklisted ? 'Yes' : 'No', inline: true },
          { name: 'Legacy JSON Blacklist (data/blacklist.json)', value: jsonEntry ? 'Yes' : 'No', inline: true },
          { name: 'DB Blacklist (blacklist table)', value: dbEntry ? 'Yes' : 'No', inline: true }
        )
        .setTimestamp();

      if (ticketEntry) {
        embed.addFields({ name: 'Ticket Reason', value: ticketEntry.reason || 'N/A', inline: false });
      }
      if (jsonEntry) {
        const when = jsonEntry.addedAt ? `<t:${Math.floor(jsonEntry.addedAt / 1000)}:R>` : 'unknown';
        embed.addFields({ name: 'JSON Reason', value: jsonEntry.reason || 'N/A', inline: true });
        embed.addFields({ name: 'JSON Added', value: when, inline: true });
      }
      if (dbEntry) {
        embed.addFields({ name: 'DB Reason', value: dbEntry.reason || 'N/A', inline: true });
        const createdAt = dbEntry.created_at ? Math.floor(new Date(dbEntry.created_at).getTime() / 1000) : null;
        if (createdAt) embed.addFields({ name: 'DB Added', value: `<t:${createdAt}:R>`, inline: true });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subCmd === "unblacklistall") {
      if (!(await hasCommandAccess(interaction.member, 'ticket', interaction.guild?.id || null))) {
        return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const user = interaction.options.getUser('user', true);

      const { unblacklistFromTickets, isTicketBlacklisted } = await import('./services/tickets');
      const { removeBlacklistEntry, isBlacklisted } = await import('./services/blacklistService');

      let changes: string[] = [];

      // Ticket blacklist removal
      try {
        if (isTicketBlacklisted(user.id, interaction.guild.id)) {
          const ok = unblacklistFromTickets(user.id, interaction.guild.id, interaction.user.id);
          if (ok) changes.push('ticket_blacklist');
        }
      } catch {}

      // JSON + DB blacklist removal (blacklistService handles both when guildId passed)
      try {
        if (isBlacklisted(user.id, 'user', interaction.guild.id)) {
          removeBlacklistEntry(user.id, 'user', interaction.guild.id);
          changes.push('legacy_json/blacklist_table');
        }
      } catch {}

      // Notify user (best-effort)
      if (changes.length > 0) {
        try {
          const dm = new EmbedBuilder()
            .setColor(0x51CF66)
            .setTitle('✅ Blacklist Cleared')
            .setDescription(`Your blacklist status in **${interaction.guild.name}** has been cleared.`)
            .addFields({ name: 'Cleared Sources', value: changes.join(', ') })
            .setTimestamp();
          await user.send({ embeds: [dm] });
        } catch {}
      }

      // Log to mod channel
      const modLogChannelId = getModLogChannelId();
      if (modLogChannelId) {
        const modLogChannel = await interaction.guild.channels.fetch(modLogChannelId).catch(() => null) as any;
        if (modLogChannel) {
          const log = new EmbedBuilder()
            .setColor(changes.length ? 0x51CF66 : 0xFFA94D)
            .setTitle(changes.length ? '✅ User Fully Unblacklisted' : 'ℹ️ No Blacklist Entries Found')
            .addFields(
              { name: 'User', value: `<@${user.id}>`, inline: true },
              { name: 'By', value: `<@${interaction.user.id}>`, inline: true },
            )
            .setTimestamp();
          if (changes.length) log.addFields({ name: 'Cleared Sources', value: changes.join(', ') });
          await modLogChannel.send({ embeds: [log] });
        }
      }

      if (changes.length === 0) {
        return interaction.reply({ content: `ℹ️ No active blacklist entries found for ${user.tag}.`, ephemeral: true });
      }

      return interaction.reply({ content: `✅ Cleared ${changes.join(', ')} for ${user.tag}.`, ephemeral: true });
    }

    if (subCmd === "debug") {
      if (!isOwnerId(interaction.user.id)) {
        return interaction.reply({ content: '❌ Only the bot owner can use this debug command.', ephemeral: true });
      }
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

      const channel = interaction.options.getChannel('channel');
      const { getTicket, getInactiveTickets } = await import('./services/tickets');

      if (channel) {
        // Debug specific ticket
        const ticket = getTicket(channel.id);
        if (!ticket) {
          return interaction.reply({ content: `❌ ${channel} is not a ticket channel.`, ephemeral: true });
        }

        const now = new Date();
        const createdAt = new Date(ticket.created_at);
        const lastMessage = ticket.last_user_message_at ? new Date(ticket.last_user_message_at) : null;
        const hoursSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        const hoursSinceLastMessage = lastMessage ? (now.getTime() - lastMessage.getTime()) / (1000 * 60 * 60) : null;

        const embed = new EmbedBuilder()
          .setTitle(`🔍 Ticket Debug: #${ticket.id}`)
          .setColor(0x5865F2)
          .addFields(
            { name: 'Channel', value: `<#${ticket.channel_id}>`, inline: true },
            { name: 'Owner', value: `<@${ticket.user_id}>`, inline: true },
            { name: 'Status', value: ticket.status, inline: true },
            { name: 'Created', value: `<t:${Math.floor(createdAt.getTime() / 1000)}:R> (${hoursSinceCreated.toFixed(1)}h ago)`, inline: false },
            { name: 'Last User Message', value: lastMessage ? `<t:${Math.floor(lastMessage.getTime() / 1000)}:R> (${hoursSinceLastMessage!.toFixed(1)}h ago)` : 'Never (NULL)', inline: false },
            { name: 'Would Be Caught?', value: (!lastMessage || hoursSinceLastMessage! >= 24) && hoursSinceCreated >= 24 && ticket.status !== 'closed' ? '✅ Yes - Inactive' : '❌ No - Active or too new', inline: false }
          );

        return interaction.reply({ embeds: [embed], ephemeral: true });
      } else {
        // Show all inactive tickets
        const inactiveTickets = getInactiveTickets(interaction.guild.id, 24);
        
        if (inactiveTickets.length === 0) {
          return interaction.reply({ content: '✅ No inactive tickets found (24h+ without user response).', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle('🔍 Inactive Tickets (24h+)')
          .setColor(0xFF6B6B)
          .setDescription(`Found **${inactiveTickets.length}** inactive ticket(s) that should be auto-blacklisted on next hourly check.`);

        for (const ticket of inactiveTickets.slice(0, 10)) {
          const createdAt = new Date(ticket.created_at);
          const lastMessage = ticket.last_user_message_at ? new Date(ticket.last_user_message_at) : null;
          const hoursSinceCreated = (new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60);
          const hoursSinceLastMessage = lastMessage ? (new Date().getTime() - lastMessage.getTime()) / (1000 * 60 * 60) : null;

          embed.addFields({
            name: `Ticket #${ticket.id} - <#${ticket.channel_id}>`,
            value: [
              `**Owner:** <@${ticket.user_id}>`,
              `**Created:** ${hoursSinceCreated.toFixed(1)}h ago`,
              `**Last Message:** ${lastMessage ? `${hoursSinceLastMessage!.toFixed(1)}h ago` : 'Never (NULL)'}`,
              `**Status:** ${ticket.status}`
            ].join('\n'),
            inline: false
          });
        }

        if (inactiveTickets.length > 10) {
          embed.setFooter({ text: `Showing first 10 of ${inactiveTickets.length} inactive tickets` });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  }

  if (name === "unban") {
    if (!(await hasCommandAccess(interaction.member, 'unban', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

    const userId = interaction.options.getString('user_id', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      await interaction.guild.bans.remove(userId, reason);

      const embed = buildModerationEmbed({
        action: 'Unbanned',
        guildName: interaction.guild.name,
        targetId: userId,
        targetTag: 'User',
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason
      });

      await sendToModLog(interaction.guild, embed, `<@${userId}>`);

      return interaction.reply({ content: `✅ Unbanned user ID: ${userId}`, ephemeral: true });
    } catch (err) {
      console.error('Failed to unban:', err);
      return interaction.reply({ content: `❌ Failed to unban user. They may not be banned or the ID is invalid.`, ephemeral: true });
    }
  }

  // Temporary Channels
  if (name === "tempchannels") {
    if (!(await hasCommandAccess(interaction.member, 'tempchannels', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });

    const subCmd = interaction.options.getSubcommand();
    const { setTempChannelConfig, getGuildTempChannelConfigs, removeTempChannelConfig } = await import('./services/tempChannels');

    if (subCmd === "setup") {
      const trigger = interaction.options.getChannel('trigger', true);
      const type = interaction.options.getString('type', true) as any;
      const template = interaction.options.getString('template', true);
      const category = interaction.options.getChannel('category');
      const userLimit = interaction.options.getInteger('user_limit');

      setTempChannelConfig({
        guild_id: interaction.guild.id,
        trigger_channel_id: trigger.id,
        channel_type: type,
        name_template: template,
        category_id: category?.id,
        user_limit: userLimit || undefined,
        enabled: true
      });

      return interaction.reply({ content: `✅ Temp channel configured! Users joining ${trigger.name} will create ${type} channels.`, flags: MessageFlags.Ephemeral });
    }

    if (subCmd === "list") {
      const configs = getGuildTempChannelConfigs(interaction.guild.id);
      if (configs.length === 0) {
        return interaction.reply({ content: 'No temp channel configs.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🔊 Temporary Channel Configs')
        .setColor(0x5865F2);

      for (const config of configs) {
        embed.addFields({
          name: `<#${config.trigger_channel_id}>`,
          value: `Type: **${config.channel_type}**\nTemplate: \`${config.name_template}\``,
          inline: false
        });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subCmd === "remove") {
      const trigger = interaction.options.getChannel('trigger', true);
      const success = removeTempChannelConfig(trigger.id);

      if (success) {
        return interaction.reply({ content: '✅ Removed temp channel config.', ephemeral: true });
      } else {
        return interaction.reply({ content: '❌ No temp channel config found for that trigger.', ephemeral: true });
      }
    }
  }

      if (name === "help") return interaction.reply({ content: `Use ${prefix}help or mention me to get conversational replies. Use moderation commands with appropriate permissions.`, ephemeral: true });

      // Support ticket tracking commands
      if (name === "supportstart") {
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        // Allow admins/bypass or users in support roles
        let allowed = adminOrBypass(interaction.member);
        if (!allowed) {
          try {
            const { listSupportMembers } = await import('./services/supportRoles');
            const lists = await listSupportMembers(interaction.guild);
            const all = ([] as any[]).concat(lists.head, lists.support, lists.trial);
            allowed = all.some((m:any) => m.id === interaction.user.id);
          } catch {}
        }
        if (!allowed) return interaction.reply({ content: 'Only support staff or admins can use this.', ephemeral: true });
        const target = interaction.options.getUser('user', true);
        const question = interaction.options.getString('question', true);
        try {
          const { startSupportInteraction } = await import('./services/smartSupport');
          const id = startSupportInteraction({
            userId: target.id,
            supportMemberId: interaction.user.id,
            guildId: interaction.guild.id,
            channelId: interaction.channelId,
            questionText: question
          });
          return interaction.reply({ content: `Started support interaction #${id} for <@${target.id}>`, flags: MessageFlags.Ephemeral });
        } catch (e:any) {
          console.error('supportstart failed:', e);
          return interaction.reply({ content: `Failed to start interaction: ${e?.message ?? e}`, flags: MessageFlags.Ephemeral });
        }
      }
      if (name === "supportend") {
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        let allowed = adminOrBypass(interaction.member);
        if (!allowed) {
          try {
            const { listSupportMembers } = await import('./services/supportRoles');
            const lists = await listSupportMembers(interaction.guild);
            const all = ([] as any[]).concat(lists.head, lists.support, lists.trial);
            allowed = all.some((m:any) => m.id === interaction.user.id);
          } catch {}
        }
        if (!allowed) return interaction.reply({ content: 'Only support staff or admins can use this.', ephemeral: true });
        const id = interaction.options.getInteger('id', true)!;
        const resolved = interaction.options.getBoolean('resolved', true)!;
        const rating = interaction.options.getInteger('rating') ?? undefined;
        const feedback = interaction.options.getString('feedback') ?? undefined;
        try {
          const { endSupportInteraction } = await import('./services/smartSupport');
          endSupportInteraction({ interactionId: id, wasResolved: resolved, satisfactionRating: rating, feedbackText: feedback });
          return interaction.reply({ content: `Ended support interaction #${id} (${resolved ? 'resolved' : 'unresolved'})` + (rating ? ` • rating ${rating}/5` : ''), flags: MessageFlags.Ephemeral });
        } catch (e:any) {
          console.error('supportend failed:', e);
          return interaction.reply({ content: `Failed to end interaction: ${e?.message ?? e}`, flags: MessageFlags.Ephemeral });
        }
      }
      if (name === "supportrate") {
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        const id = interaction.options.getInteger('id', true)!;
        const rating = interaction.options.getInteger('rating', true)!;
        const feedback = interaction.options.getString('feedback') ?? undefined;
        try {
          const db = await import('./services/db').then(m => m.getDB());
          const row = db.prepare('SELECT user_id FROM support_interactions WHERE id = ?').get(id) as any;
          if (!row) return interaction.reply({ content: `Interaction #${id} not found.`, ephemeral: true });
          if (row.user_id !== interaction.user.id && !isOwnerId(interaction.user.id)) {
            return interaction.reply({ content: 'Only the ticket requester can rate this interaction.', ephemeral: true });
          }
          const { rateSupportInteraction } = await import('./services/smartSupport');
          const res = rateSupportInteraction({ interactionId: id, byUserId: interaction.user.id, rating, feedbackText: feedback });
          if (!res.ok) return interaction.reply({ content: `Could not record rating: ${res.reason}`, ephemeral: true });
          return interaction.reply({ content: `Thanks! Recorded your rating ${rating}/5 for #${id}.`, flags: MessageFlags.Ephemeral });
        } catch (e:any) {
          console.error('supportrate failed:', e);
          return interaction.reply({ content: `Failed to record rating: ${e?.message ?? e}`, flags: MessageFlags.Ephemeral });
        }
      }
      if (name === "supportaddhelper") {
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        // Allow admins/bypass or users in support roles
        let allowed = adminOrBypass(interaction.member);
        if (!allowed) {
          try {
            const { listSupportMembers } = await import('./services/supportRoles');
            const lists = await listSupportMembers(interaction.guild);
            const all = ([] as any[]).concat(lists.head, lists.support, lists.trial);
            allowed = all.some((m:any) => m.id === interaction.user.id);
          } catch {}
        }
        if (!allowed) return interaction.reply({ content: 'Only support staff or admins can use this.', ephemeral: true });
        const id = interaction.options.getInteger('id', true)!;
        const member = interaction.options.getUser('member', true);
        try {
          const { addSupportHelper } = await import('./services/smartSupport');
          const helpers = addSupportHelper(id, member.id);
          return interaction.reply({ content: `Added <@${member.id}> as helper on #${id}. Helpers now: ${helpers.map(h=>`<@${h}>`).join(', ')}`, flags: MessageFlags.Ephemeral });
        } catch (e:any) {
          console.error('supportaddhelper failed:', e);
          return interaction.reply({ content: `Failed to add helper: ${e?.message ?? e}`, flags: MessageFlags.Ephemeral });
        }
      }
      if (name === "listopentickets") {
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        // Allow admins/bypass or users in support roles
        let allowed = adminOrBypass(interaction.member);
        if (!allowed) {
          try {
            const { listSupportMembers } = await import('./services/supportRoles');
            const lists = await listSupportMembers(interaction.guild);
            const all = ([] as any[]).concat(lists.head, lists.support, lists.trial);
            allowed = all.some((m:any) => m.id === interaction.user.id);
          } catch {}
        }
        if (!allowed) return interaction.reply({ content: 'Only support staff or admins can use this.', ephemeral: true });
        try {
          const { getOpenSupportTickets } = await import('./services/smartSupport');
          const tickets = getOpenSupportTickets(interaction.guild.id);
          if (!tickets.length) return interaction.reply({ content: 'No open support tickets.', ephemeral: true });
          const lines = tickets.slice(0, 25).map(t => {
            const helpers = t.helpers.length > 0 ? ` (+${t.helpers.length} helper${t.helpers.length > 1 ? 's' : ''})` : '';
            const time = new Date(t.started_at).toLocaleString();
            return `**#${t.id}** • <@${t.user_id}> helped by <@${t.support_member_id}>${helpers}\n  ${t.question_category || 'general'} • ${time}\n  ${(t.question || 'No description').slice(0, 80)}`;
          });
          const out = lines.join('\n\n').slice(0, 1900);
          return interaction.reply({ content: `**Open Support Tickets (${tickets.length})**\n\n${out}`, flags: MessageFlags.Ephemeral });
        } catch (e:any) {
          console.error('listopentickets failed:', e);
          return interaction.reply({ content: `Failed to list tickets: ${e?.message ?? e}`, flags: MessageFlags.Ephemeral });
        }
      }
  if (name === "rpsai") {
    // Whitelist already enforced above
    const difficultyRaw = (interaction.options.getString('difficulty') || 'normal').toLowerCase();
    const modeRaw = (interaction.options.getString('mode') || 'bo1').toLowerCase();
    const difficulty = (['easy','normal','hard'].includes(difficultyRaw) ? difficultyRaw : 'normal') as any;
    const mode = (['bo1','bo3'].includes(modeRaw) ? modeRaw : 'bo1') as any;
    const { startRpsSession, setRpsSessionMessage, scoreLine } = await import('./services/games/rpsAi');
    const sess = startRpsSession(interaction.user.id, interaction.channelId!, difficulty, mode);

    const embed = new EmbedBuilder()
      .setTitle('Rock-Paper-Scissors vs SynapseAI')
      .setDescription('Pick your move below. First to the target wins!')
      .addFields(
        { name: 'Difficulty', value: String(difficulty).toUpperCase(), inline: true },
        { name: 'Mode', value: String(mode).toUpperCase(), inline: true },
        { name: 'Score', value: scoreLine(sess), inline: false }
      )
      .setColor(0x00A8FF);

    const makeButtons = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`rpsai:${sess.id}:rock`).setLabel('Rock').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rpsai:${sess.id}:paper`).setLabel('Paper').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rpsai:${sess.id}:scissors`).setLabel('Scissors').setStyle(ButtonStyle.Primary)
    );

    const msg = await interaction.reply({ embeds: [embed], components: [makeButtons()], fetchReply: true });
    // @ts-ignore - union
    setRpsSessionMessage(sess.id, (msg as any).id);
    return;
  }
  if (name === "blackjack") {
    // Whitelist already enforced above
    const diff = (interaction.options.getString('difficulty') || 'normal').toLowerCase();
    const difficulty = (['easy','normal','hard'].includes(diff) ? diff : 'normal') as any;
    const { startBjSession, setBjMessageId, bjEmbedFields, bjTalkLine } = await import('./services/games/blackjack');
    const sess = startBjSession(interaction.user.id, interaction.channelId!, difficulty);
    const embed = new EmbedBuilder()
      .setTitle('Blackjack vs SynapseAI')
      .setDescription(bjTalkLine(sess, 'deal'))
      .addFields(bjEmbedFields(sess, false))
      .setColor(0x2ecc71);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`blackjack:${sess.id}:hit`).setLabel('Hit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`blackjack:${sess.id}:stand`).setLabel('Stand').setStyle(ButtonStyle.Secondary)
    );
    const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
    // @ts-ignore
    setBjMessageId(sess.id, (msg as any).id);
    return;
  }
  if (name === "remember") {
    if (!adminOrBypass(interaction.member) && !isOwnerId(interaction.user.id)) {
      return interaction.reply({ content: "You are not authorized to use this feature.", flags: MessageFlags.Ephemeral });
    }
    const { saveMemory, upsertUniqueMemory } = await import('./services/memory');
    const type = (interaction.options.getString('type', true) as string).toLowerCase();
    const key = interaction.options.getString('key', true).trim();
    const value = interaction.options.getString('value', true).trim();
    try {
      const uniq = new Set(['name','timezone','favorite_team','birthday','location']);
      if (uniq.has(key.toLowerCase())) {
        upsertUniqueMemory(interaction.user.id, interaction.guild?.id ?? null, key, value);
      } else {
        saveMemory({
          user_id: interaction.user.id,
          guild_id: interaction.guild?.id ?? null,
          type: (['fact','preference','note'].includes(type) ? (type as any) : 'fact'),
          key,
          value,
          source_msg_id: null,
          confidence: 0.9
        });
      }
      return interaction.reply({ content: `Saved (${type}) ${key}: ${value}`, flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error('remember failed', e);
      return interaction.reply({ content: 'Failed to save memory.', flags: MessageFlags.Ephemeral });
    }
  }
  if (name === "forget") {
    if (!adminOrBypass(interaction.member) && !isOwnerId(interaction.user.id)) {
      return interaction.reply({ content: "You are not authorized to use this feature.", flags: MessageFlags.Ephemeral });
    }
    const { deleteMemoryByKey } = await import('./services/memory');
    const key = interaction.options.getString('key', true).trim();
    try {
      const n = deleteMemoryByKey(interaction.user.id, key, interaction.guild?.id ?? null);
      if (n > 0) return interaction.reply({ content: `Deleted ${n} entr${n === 1 ? 'y' : 'ies'} for key '${key}'.`, ephemeral: true });
      return interaction.reply({ content: `No entries found for key '${key}'.`, flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error('forget failed', e);
      return interaction.reply({ content: 'Failed to delete memory.', flags: MessageFlags.Ephemeral });
    }
  }
  if (name === "getmention") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', flags: MessageFlags.Ephemeral });
    try {
      const { getMentionConfig } = await import('./services/ownerMentions');
      const cfg = getMentionConfig();
      const lines = [
        'Owner Mention Preferences:',
        `PobKC: ${cfg.pobkc ? 'enabled (@mention)' : 'disabled (name only)'}`,
        `Joycemember: ${cfg.joycemember ? 'enabled (@mention)' : 'disabled (name only)'}`
      ].join('\n');
      return interaction.reply({ content: lines, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('getmention failed:', err);
      return interaction.reply({ content: `Failed to get mention config: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "aliases") {
    if (!adminOrBypass(interaction.member) && !isOwnerId(interaction.user.id)) {
      return interaction.reply({ content: "You are not authorized to use this feature.", flags: MessageFlags.Ephemeral });
    }
    const { getAliases } = await import('./services/memory');
    try {
      const aliases = getAliases(interaction.user.id, interaction.guild?.id ?? null);
      if (!aliases.length) return interaction.reply({ content: 'No name aliases found.', ephemeral: true });
      return interaction.reply({ content: `Your name aliases: ${aliases.join(', ')}`, flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error('aliases failed', e);
      return interaction.reply({ content: 'Failed to retrieve aliases.', flags: MessageFlags.Ephemeral });
    }
  }
  if (name === "history") {
    if (!adminOrBypass(interaction.member) && !isOwnerId(interaction.user.id)) {
      return interaction.reply({ content: "You are not authorized to use this feature.", flags: MessageFlags.Ephemeral });
    }
    const { getMemoryHistory } = await import('./services/memory');
    const key = interaction.options.getString('key', true).trim();
    const limit = Math.max(1, Math.min(20, interaction.options.getInteger('limit') ?? 5));
    try {
      const hist = getMemoryHistory(interaction.user.id, key, interaction.guild?.id ?? null, limit);
      if (!hist.length) return interaction.reply({ content: `No history found for key '${key}'.`, ephemeral: true });
      const lines = hist.map((h: any) => `[${new Date(h.changed_at).toLocaleString()}] ${h.action}: ${h.old_value ? `${h.old_value} → ` : ''}${h.new_value}`).join('\n').slice(0, 1900);
      return interaction.reply({ content: `History for '${key}':\n${lines}`, flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error('history failed', e);
      return interaction.reply({ content: 'Failed to retrieve history.', flags: MessageFlags.Ephemeral });
    }
  }
  if (name === "revert") {
    const { revertMemory } = await import('./services/memory');
    const key = interaction.options.getString('key', true).trim();
    try {
      const event = revertMemory(interaction.user.id, key, interaction.guild?.id ?? null);
      if (!event) return interaction.reply({ content: `No previous value found for key '${key}'.`, ephemeral: true });
      return interaction.reply({ content: `Reverted '${key}' from ${event.oldValue} back to ${event.newValue}.`, flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error('revert failed', e);
      return interaction.reply({ content: 'Failed to revert memory.', flags: MessageFlags.Ephemeral });
    }
  }
  if (name === "redeploy") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: 'Starting deploy... I will pull latest code, rebuild, and restart.', flags: MessageFlags.Ephemeral });
    try {
      const { exec } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        exec('bash /opt/synapseai-bot/deploy.sh', { timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
          if (error) return reject(error);
          resolve();
        });
      });
      await interaction.followUp({ content: 'Deploy finished. If I briefly went offline, that was the restart.', flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('Redeploy failed:', err);
      await interaction.followUp({ content: `Deploy failed: ${err?.message ?? err}. Try again or use the DigitalOcean console.`, ephemeral: true });
    }
    return;
  }
  if (name === "setgeminikey") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', flags: MessageFlags.Ephemeral });
    const newKey = interaction.options.getString('key', true).trim();
    if (!newKey || !/^AIza[0-9A-Za-z-_]{30,}$/.test(newKey)) {
      return interaction.reply({ content: 'That does not look like a valid Gemini API key.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const fs = await import('fs/promises');
      const path = '/opt/synapseai-bot/.env';
      let content = '';
      try { content = await fs.readFile(path, 'utf8'); } catch { content = ''; }
      if (content.includes('GEMINI_API_KEY=')) {
        content = content.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY=${newKey}`);
      } else {
        const nl = content.endsWith('\n') || content.length === 0 ? '' : '\n';
        content = `${content}${nl}GEMINI_API_KEY=${newKey}\n`;
      }
      await fs.writeFile(path, content, 'utf8');
      // Verify write
      const verify = await fs.readFile(path, 'utf8');
      if (!verify.includes(`GEMINI_API_KEY=${newKey}`)) throw new Error('Verification failed: key not found after write.');
      // Apply immediately and reset cached client
      try {
        process.env.GEMINI_API_KEY = newKey;
        const { resetGeminiClient } = await import('./services/openai');
        resetGeminiClient();
      } catch {}
      // Respond quickly, restart in background
      await interaction.editReply({ content: 'Gemini key saved. Restarting the bot now… You can test with /diagai shortly.' });
      try {
        const { exec } = await import('child_process');
        exec('pm2 restart synapseai-bot --update-env', (error) => {
          if (error) console.error('pm2 restart failed:', error);
        });
      } catch (e) {
        console.error('Failed to invoke pm2 restart:', e);
      }
    } catch (err: any) {
      console.error('setgeminikey failed:', err);
      await interaction.editReply({ content: `Failed to update key: ${err?.message ?? err}` });
    }
    return;
  }
  if (name === "setopenai") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', flags: MessageFlags.Ephemeral });
    const newKey = interaction.options.getString('key', true).trim();
    if (!newKey || !/^sk-/.test(newKey)) {
      return interaction.reply({ content: 'That does not look like a valid OpenAI API key (expected to start with sk-).', ephemeral: true });
    }
    // Defer and only show the final result (success/failure). Avoid the noisy pre-message.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const fs = await import('fs/promises');
      const path = '/opt/synapseai-bot/.env';
      let content = '';
      try { content = await fs.readFile(path, 'utf8'); } catch { content = ''; }
      if (content.includes('OPENAI_API_KEY=')) {
        content = content.replace(/OPENAI_API_KEY=.*/g, `OPENAI_API_KEY=${newKey}`);
      } else {
        const nl = content.endsWith('\n') || content.length === 0 ? '' : '\n';
        content = `${content}${nl}OPENAI_API_KEY=${newKey}\n`;
      }
      await fs.writeFile(path, content, 'utf8');
      // Verify the write succeeded by re-reading the file
      try {
        const verify = await fs.readFile(path, 'utf8');
        if (!verify.includes(`OPENAI_API_KEY=${newKey}`)) {
          throw new Error('Verification failed: key not found after write.');
        }
      } catch (ve: any) {
        throw ve;
      }
      // Apply immediately to current process and reset cached client in case restart lags
      try {
        process.env.OPENAI_API_KEY = newKey;
        const { resetOpenAIClient } = await import('./services/openai');
        resetOpenAIClient();
      } catch {}
      // Respond first to minimize the "thinking" time, then restart in background
      await interaction.editReply({ content: 'OpenAI key saved. Restarting the bot now… You can test with /diagai in a few seconds.' });
      try {
        const { exec } = await import('child_process');
        exec('pm2 restart synapseai-bot --update-env', (error) => {
          if (error) console.error('pm2 restart failed:', error);
        });
      } catch (e) {
        console.error('Failed to invoke pm2 restart:', e);
      }
    } catch (err: any) {
      console.error('setopenai failed:', err);
      await interaction.editReply({ content: `Failed to update key: ${err?.message ?? err}` });
    }
    return;
  }
  if (name === "setprovider") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', flags: MessageFlags.Ephemeral });
    const provider = (interaction.options.getString('provider', true) || '').toLowerCase();
    if (!['openai','gemini'].includes(provider)) {
      return interaction.reply({ content: 'Provider must be openai or gemini.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const fs = await import('fs/promises');
      const path = '/opt/synapseai-bot/.env';
      let content = '';
      try { content = await fs.readFile(path, 'utf8'); } catch { content = ''; }
      if (content.includes('AI_PROVIDER=')) {
        content = content.replace(/AI_PROVIDER=.*/g, `AI_PROVIDER=${provider}`);
      } else {
        const nl = content.endsWith('\n') || content.length === 0 ? '' : '\n';
        content = `${content}${nl}AI_PROVIDER=${provider}\n`;
      }
      await fs.writeFile(path, content, 'utf8');
      const check = await fs.readFile(path, 'utf8');
      if (!check.includes(`AI_PROVIDER=${provider}`)) throw new Error('Verification failed: provider not found after write.');
      // Apply immediately
      process.env.AI_PROVIDER = provider;
      await interaction.editReply({ content: `Provider set to ${provider}. Restarting the bot now…` });
      try {
        const { exec } = await import('child_process');
        exec('pm2 restart synapseai-bot --update-env', (error) => { if (error) console.error('pm2 restart failed:', error); });
      } catch (e) { console.error('Failed to invoke pm2 restart:', e); }
    } catch (err: any) {
      console.error('setprovider failed:', err);
      await interaction.editReply({ content: `Failed to set provider: ${err?.message ?? err}` });
    }
    return;
  }
  if (name === "pm2clean") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: `Deleting old PM2 process 'synapseai' and saving...`, flags: MessageFlags.Ephemeral });
    try {
      const { exec } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        exec("pm2 delete synapseai || true && pm2 save", (error, stdout, stderr) => error ? reject(error) : resolve());
      });
      await interaction.followUp({ content: `PM2 cleanup done. If duplicates remain, run /redeploy once more.`, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('pm2clean failed:', err);
      await interaction.followUp({ content: `pm2clean failed: ${err?.message ?? err}`, ephemeral: true });
    }
    return;
  }
  if (name === "version") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', flags: MessageFlags.Ephemeral });
    try {
      const { execSync } = await import('child_process');
      let commit = 'unknown';
      try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore','pipe','ignore'] }).toString().trim(); } catch {}
      const provider = process.env.AI_PROVIDER ?? 'auto';
      const openaiModel = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
      const geminiModel = process.env.GEMINI_MODEL ?? '(auto)';
      const lines = [
        `Version`,
        `Commit: ${commit}`,
        `AI_PROVIDER: ${provider}`,
        `OPENAI_MODEL: ${openaiModel}`,
        `GEMINI_MODEL: ${geminiModel}`,
        `Node: ${process.version}`
      ].join('\n');
      return interaction.reply({ content: lines, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('version failed:', err);
      return interaction.reply({ content: `version failed: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "envcheck") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', flags: MessageFlags.Ephemeral });
    try {
      const target = (interaction.options.getString('name') || '').trim();
      const fs = await import('fs/promises');
      const path = '/opt/synapseai-bot/.env';
      let text = '';
      try { text = await fs.readFile(path, 'utf8'); } catch { text = ''; }
      const parseEnv = (t: string) => {
        const out: Record<string,string> = {};
        t.split(/\r?\n/).forEach(line => {
          const s = line.trim();
          if (!s || s.startsWith('#')) return;
          const idx = s.indexOf('=');
          if (idx === -1) return;
          const k = s.slice(0, idx).trim();
          const v = s.slice(idx + 1).trim();
          out[k] = v;
        });
        return out;
      };
      const fileEnv = parseEnv(text);
      const mask = (key: string, val?: string) => {
        if (!val) return 'absent';
        if (!key.endsWith('_API_KEY')) return val;
        const head = val.slice(0, 3);
        const tail = val.slice(-4);
        return `${head}…${tail} (len=${val.length})`;
      };
      const keys = target ? [target] : ['AI_PROVIDER','OPENAI_MODEL','GEMINI_MODEL','OPENAI_API_KEY','GEMINI_API_KEY'];
      const lines: string[] = [];
      for (const k of keys) {
        const fv = fileEnv[k];
        const rv = process.env[k];
        const match = (fv ?? '') === (rv ?? '');
        lines.push(`${k}: file=${mask(k, fv)} | runtime=${mask(k, rv)} | match=${match ? 'yes' : 'no'}`);
      }
      return interaction.reply({ content: `Env check:\n${lines.join('\n')}`.slice(0, 1900), flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('envcheck failed:', err);
      return interaction.reply({ content: `envcheck failed: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "setmodel") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', flags: MessageFlags.Ephemeral });
    const provider = (interaction.options.getString('provider', true) || '').toLowerCase();
    const model = interaction.options.getString('model', true).trim();
    if (!['openai','gemini'].includes(provider)) return interaction.reply({ content: 'Provider must be openai or gemini.', ephemeral: true });
    if (!model) return interaction.reply({ content: 'Model cannot be empty.', ephemeral: true });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const fs = await import('fs/promises');
      const path = '/opt/synapseai-bot/.env';
      let content = '';
      try { content = await fs.readFile(path, 'utf8'); } catch { content = ''; }
      const key = provider === 'openai' ? 'OPENAI_MODEL' : 'GEMINI_MODEL';
      const regex = new RegExp(`${key}=.*`);
      if (content.match(regex)) {
        content = content.replace(regex, `${key}=${model}`);
      } else {
        const nl = content.endsWith('\n') || content.length === 0 ? '' : '\n';
        content = `${content}${nl}${key}=${model}\n`;
      }
      await fs.writeFile(path, content, 'utf8');
      const verify = await fs.readFile(path, 'utf8');
      if (!verify.includes(`${key}=${model}`)) throw new Error('Verification failed: model not found after write.');
      process.env[key] = model;
      await interaction.editReply({ content: `Model updated. ${key}=${model}. Restarting the bot now…` });
      try {
        const { exec } = await import('child_process');
        exec('pm2 restart synapseai-bot --update-env', (error) => { if (error) console.error('pm2 restart failed:', error); });
      } catch (e) { console.error('Failed to invoke pm2 restart:', e); }
    } catch (err: any) {
      console.error('setmodel failed:', err);
      await interaction.editReply({ content: `setmodel failed: ${err?.message ?? err}` });
    }
    return;
  }
  if (name === "setmodelpreset") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', flags: MessageFlags.Ephemeral });
    const preset = (interaction.options.getString('preset', true) || '').toLowerCase();
    const providerArg = (interaction.options.getString('provider') || '').toLowerCase();
    const provider = providerArg || (process.env.AI_PROVIDER || 'openai').toLowerCase();
    const validPresets = ['fast','balanced','cheap'];
    if (!validPresets.includes(preset)) return interaction.reply({ content: 'Preset must be one of: fast, balanced, cheap.', ephemeral: true });
    if (!['openai','gemini'].includes(provider)) return interaction.reply({ content: 'Provider must be openai or gemini.', ephemeral: true });

    // Map presets to models
    const pickModel = (prov: string, p: string) => {
      if (prov === 'openai') {
        if (p === 'balanced') return 'gpt-4o';
        // fast/cheap default to mini
        return 'gpt-4o-mini';
      }
      // gemini
      if (p === 'balanced') return 'gemini-1.5-pro-latest';
      // fast/cheap
      return 'gemini-1.5-flash-latest';
    };

    const model = pickModel(provider, preset);
    await interaction.deferReply({ ephemeral: true });
    try {
      const fs = await import('fs/promises');
      const path = '/opt/synapseai-bot/.env';
      let content = '';
      try { content = await fs.readFile(path, 'utf8'); } catch { content = ''; }
      const key = provider === 'openai' ? 'OPENAI_MODEL' : 'GEMINI_MODEL';
      const regex = new RegExp(`${key}=.*`);
      if (content.match(regex)) {
        content = content.replace(regex, `${key}=${model}`);
      } else {
        const nl = content.endsWith('\n') || content.length === 0 ? '' : '\n';
        content = `${content}${nl}${key}=${model}\n`;
      }
      await fs.writeFile(path, content, 'utf8');
      const verify = await fs.readFile(path, 'utf8');
      if (!verify.includes(`${key}=${model}`)) throw new Error('Verification failed: model not found after write.');
      process.env[key] = model;
      await interaction.editReply({ content: `Model preset '${preset}' applied: ${key}=${model}. Restarting the bot now…` });
      try {
        const { exec } = await import('child_process');
        exec('pm2 restart synapseai-bot --update-env', (error) => { if (error) console.error('pm2 restart failed:', error); });
      } catch (e) { console.error('Failed to invoke pm2 restart:', e); }
    } catch (err: any) {
      console.error('setmodelpreset failed:', err);
      await interaction.editReply({ content: `setmodelpreset failed: ${err?.message ?? err}` });
    }
    return;
  }
  if (name === "settaunt") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const toneRaw = (interaction.options.getString('tone', true) || '').toLowerCase();
    if (!['soft','normal','edgy'].includes(toneRaw)) return interaction.reply({ content: 'Tone must be one of: soft, normal, edgy.', ephemeral: true });
    try {
      const { setTauntMode, getTauntMode } = await import('./config');
      setTauntMode(toneRaw as any);
      const now = getTauntMode();
      return interaction.reply({ content: `Trash talk tone set to '${now}'.`, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('settaunt failed:', err);
      return interaction.reply({ content: `Failed to set tone: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "setsupportroles") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    try {
      const headRole = interaction.options.getRole('head');
      const supportRole = interaction.options.getRole('support');
      const trialRole = interaction.options.getRole('trial');
      const { setSupportRole, getSupportRoles } = await import('./services/supportRoles');
      if (headRole) setSupportRole('head', headRole.id);
      if (supportRole) setSupportRole('support', supportRole.id);
      if (trialRole) setSupportRole('trial', trialRole.id);
      const cfg = getSupportRoles();
      const lines = [
        'Support roles updated:',
        `Head: ${cfg.head ? `<@&${cfg.head}>` : 'not set'}`,
        `Support: ${cfg.support ? `<@&${cfg.support}>` : 'not set'}`,
        `Trial: ${cfg.trial ? `<@&${cfg.trial}>` : 'not set'}`
      ].join('\n');
      return interaction.reply({ content: lines, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('setsupportroles failed:', err);
      return interaction.reply({ content: `Failed to set support roles: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "setsupportintercept") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    try {
      const enabled = interaction.options.getBoolean('enabled', true);
      const { setSupportInterceptEnabled, getSupportInterceptStatus } = await import('./services/supportIntercept');
      setSupportInterceptEnabled(interaction.guild.id, !!enabled);
      const status = getSupportInterceptStatus(interaction.guild.id);
      return interaction.reply({ content: `Global support interception is now ${status} for this server.`, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('setsupportintercept failed:', err);
      return interaction.reply({ content: `Failed to update setting: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "getsupportintercept") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    try {
      const { getSupportInterceptStatus } = await import('./services/supportIntercept');
      const status = getSupportInterceptStatus(interaction.guild.id);
      return interaction.reply({ content: `Global support interception: ${status}`, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('getsupportintercept failed:', err);
      return interaction.reply({ content: `Failed to get setting: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "setfounderrole") {
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    try {
      const { isFounderUser } = await import('./services/founders');
      const founderOk = isFounderUser(interaction.guild, interaction.user.id, interaction.member as any);
      if (!(isOwnerId(interaction.user.id) || founderOk)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
      const role = interaction.options.getRole('role', true);
      const { setFounderRole, getFounders } = await import('./services/founders');
      setFounderRole(interaction.guild.id, role.id);
      const f = getFounders(interaction.guild.id);
      const lines = [
        'Founder config updated:',
        `Role: <@&${f.roleId}>`,
        `Users: ${(f.userIds || []).length ? f.userIds.map(id => `<@${id}>`).join(', ') : 'none set'}`
      ].join('\n');
      return interaction.reply({ content: lines, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('setfounderrole failed:', err);
      return interaction.reply({ content: `Failed to set founder role: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "addfounder") {
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    try {
      const { isFounderUser } = await import('./services/founders');
      const founderOk = isFounderUser(interaction.guild, interaction.user.id, interaction.member as any);
      if (!(isOwnerId(interaction.user.id) || founderOk)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
      const user = interaction.options.getUser('user', true);
      const { addFounderUser, getFounders } = await import('./services/founders');
      addFounderUser(interaction.guild.id, user.id);
      const f = getFounders(interaction.guild.id);
      const lines = [
        'Founder user added:',
        `Role: ${f.roleId ? `<@&${f.roleId}>` : 'none set'}`,
        `Users: ${(f.userIds || []).map(id => `<@${id}>`).join(', ') || 'none set'}`
      ].join('\n');
      return interaction.reply({ content: lines, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('addfounder failed:', err);
      return interaction.reply({ content: `Failed to add founder: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "removefounder") {
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    try {
      const { isFounderUser } = await import('./services/founders');
      const founderOk = isFounderUser(interaction.guild, interaction.user.id, interaction.member as any);
      if (!(isOwnerId(interaction.user.id) || founderOk)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
      const user = interaction.options.getUser('user', true);
      const { removeFounderUser, getFounders } = await import('./services/founders');
      removeFounderUser(interaction.guild.id, user.id);
      const f = getFounders(interaction.guild.id);
      const lines = [
        'Founder user removed:',
        `Role: ${f.roleId ? `<@&${f.roleId}>` : 'none set'}`,
        `Users: ${(f.userIds || []).map(id => `<@${id}>`).join(', ') || 'none set'}`
      ].join('\n');
      return interaction.reply({ content: lines, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      console.error('removefounder failed:', err);
      return interaction.reply({ content: `Failed to remove founder: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "getfounders") {
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    try {
      const { isFounderUser } = await import('./services/founders');
      const founderOk = isFounderUser(interaction.guild, interaction.user.id, interaction.member as any);
      if (!(isOwnerId(interaction.user.id) || founderOk)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
      const { getFounders, DEFAULT_FOUNDER_USER_IDS } = await import('./services/founders');
      const f = getFounders(interaction.guild.id);
      const lines = [
        'Founder configuration:',
        `Role: ${f.roleId ? `<@&${f.roleId}>` : 'none set'}`,
        `Users: ${(f.userIds || []).map(id => `<@${id}>`).join(', ') || 'none set'}`,
        `Defaults (always treated as founders): ${Array.from(DEFAULT_FOUNDER_USER_IDS).map(id => `<@${id}>`).join(', ')}`
      ].join('\n');
      return interaction.reply({ content: lines, ephemeral: true });
    } catch (err: any) {
      console.error('getfounders failed:', err);
      return interaction.reply({ content: `Failed to get founder config: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "registercommands") {
    if (!interaction.guild) return interaction.reply({ content: 'This must be run inside a server.', ephemeral: true });
    try {
      const { isFounderUser } = await import('./services/founders');
      const founderOk = isFounderUser(interaction.guild, interaction.user.id, interaction.member as any);
      if (!(isOwnerId(interaction.user.id) || founderOk)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
      const cmds = [
        { name: "help", description: "Show help for bot commands" },
        { name: "ping", description: "Check bot latency" },
        { name: "pong", description: "Alias for ping" },
        { name: "joke", description: "Tell a random joke" },
        { name: "dadjoke", description: "Tell a dad joke" },
        { name: "redeploy", description: "Owner: pull latest code and restart bot (runs deploy.sh)" },
        { name: "setgeminikey", description: "Owner: set Gemini API key and restart bot", options: [ { name: "key", description: "Gemini API key", type: 3, required: true } ] },
        { name: "setopenai", description: "Owner: set OpenAI API key and restart bot", options: [ { name: "key", description: "OpenAI API key", type: 3, required: true } ] },
        { name: "setprovider", description: "Owner: choose AI provider (openai|gemini) and restart", options: [ { name: "provider", description: "openai or gemini", type: 3, required: true } ] },
        { name: "pm2clean", description: "Owner: remove old PM2 process 'synapseai' and save" },
        { name: "version", description: "Owner: show running commit and config" },
        { name: "envcheck", description: "Owner: verify env values on server (masked)", options: [ { name: "name", description: "Optional env name to check (e.g., OPENAI_API_KEY)", type: 3, required: false } ] },
        { name: "setmodel", description: "Owner: set AI model for a provider and restart", options: [ { name: "provider", description: "openai or gemini", type: 3, required: true }, { name: "model", description: "Model id (e.g., gpt-4o-mini or gemini-1.5-pro-latest)", type: 3, required: true } ] },
        { name: "setmodelpreset", description: "Owner: set AI model by preset (fast|balanced|cheap)", options: [ { name: "preset", description: "fast | balanced | cheap", type: 3, required: true }, { name: "provider", description: "openai or gemini (defaults to AI_PROVIDER)", type: 3, required: false } ] },
        { name: "settaunt", description: "Owner: set trash talk tone (soft|normal|edgy)", options: [ { name: "tone", description: "soft | normal | edgy", type: 3, required: true } ] },
        { name: "diagai", description: "Owner: AI health check (env + test call)" },
        { name: "setsupportroles", description: "Owner: set support role IDs (head/support/trial)", options: [ { name: "head", description: "Head Support role", type: 8, required: false }, { name: "support", description: "Support role", type: 8, required: false }, { name: "trial", description: "Trial Support role", type: 8, required: false } ] },
        { name: "getsupportroles", description: "Owner: show configured support roles" },
        { name: "support", description: "List current support staff in this server" },
        { name: "setsupportintercept", description: "Owner: toggle global 'who are support' interception for this server", options: [ { name: "enabled", description: "true or false", type: 5, required: true } ] },
  { name: "getsupportintercept", description: "Owner: show global 'who are support' interception status" },
  { name: "setfounderrole", description: "Owner: set the Founder role for this server", options: [ { name: "role", description: "Founder role", type: 8, required: true } ] },
  { name: "addfounder", description: "Owner: add a founder user for this server", options: [ { name: "user", description: "User to add as founder", type: 6, required: true } ] },
  { name: "removefounder", description: "Owner: remove a founder user for this server", options: [ { name: "user", description: "User to remove from founders", type: 6, required: true } ] },
  { name: "getfounders", description: "Owner: show founder config for this server" },
        { name: "setmention", description: "Owner: toggle @mentions for PobKC or Joycemember", options: [ { name: "owner", description: "pobkc or joycemember", type: 3, required: true }, { name: "enabled", description: "true or false", type: 5, required: true } ] },
        { name: "getmention", description: "Owner: show mention preference status for owners" },
        { name: "addwhitelist", description: "Owner: add a whitelist entry (user or role)", options: [ { name: "type", description: "user or role", type: 3, required: true }, { name: "id", description: "User ID or Role ID (or mention)", type: 3, required: true }, { name: "duration", description: "Optional duration (e.g., 7d, 24h, 3600)", type: 3, required: false }, { name: "autorole", description: "Optional auto-assign role id", type: 3, required: false } ] },
        { name: "removewhitelist", description: "Owner: remove a whitelist entry", options: [ { name: "type", description: "user or role", type: 3, required: true }, { name: "id", description: "User ID or Role ID (or mention)", type: 3, required: true } ] },
        { name: "listwhitelist", description: "Owner: list whitelist entries" },
        { name: "addblacklist", description: "Owner: add a blacklist entry (user or role)", options: [ { name: "type", description: "user or role", type: 3, required: true }, { name: "id", description: "User ID or Role ID (or mention)", type: 3, required: true }, { name: "reason", description: "Reason for blacklist", type: 3, required: false } ] },
        { name: "removeblacklist", description: "Owner: remove a blacklist entry", options: [ { name: "type", description: "user or role", type: 3, required: true }, { name: "id", description: "User ID or Role ID (or mention)", type: 3, required: true } ] },
        { name: "listblacklist", description: "Owner: list blacklist entries" },
        { name: "giveaway", description: "Manage giveaways", options: [ { name: "start", description: "Start a new giveaway", type: 1, options: [ { name: "prize", description: "Prize for the giveaway", type: 3, required: true }, { name: "duration", description: "Duration (e.g., 7d, 24h, 3600)", type: 3, required: true }, { name: "winners", description: "Number of winners", type: 4, required: true }, { name: "channel", description: "Channel for giveaway", type: 7, required: false }, { name: "minmessages", description: "Minimum messages requirement", type: 4, required: false }, { name: "mininvites", description: "Minimum invites requirement", type: 4, required: false }, { name: "requiredroles", description: "Required role IDs (comma-separated)", type: 3, required: false } ] }, { name: "end", description: "End a giveaway early", type: 1, options: [ { name: "id", description: "Giveaway ID", type: 3, required: true } ] }, { name: "reroll", description: "Reroll winners for a giveaway", type: 1, options: [ { name: "id", description: "Giveaway ID", type: 3, required: true } ] }, { name: "list", description: "List active giveaways", type: 1 } ] },
        { name: "rpsai", description: "Play Rock-Paper-Scissors vs SynapseAI", options: [ { name: "difficulty", description: "easy | normal | hard", type: 3, required: false }, { name: "mode", description: "bo1 | bo3", type: 3, required: false } ] },
        { name: "blackjack", description: "Play Blackjack vs SynapseAI", options: [ { name: "difficulty", description: "easy | normal | hard", type: 3, required: false } ] },
        { name: "remember", description: "Save a personal fact or preference for better replies", options: [ { name: "key", description: "Short label (e.g., name, timezone, favorite_team)", type: 3, required: true }, { name: "value", description: "Value to remember", type: 3, required: true }, { name: "type", description: "Type: fact | preference | note", type: 3, required: false } ] },
        { name: "forget", description: "Delete a saved memory by key", options: [ { name: "key", description: "The memory key to delete", type: 3, required: true } ] },
        { name: "memories", description: "List your recent saved memories", options: [ { name: "limit", description: "How many to show (default 10)", type: 4, required: false } ] },
        { name: "aliases", description: "View your name aliases (alternate spellings)" },
        { name: "history", description: "See change history for a saved fact", options: [ { name: "key", description: "Memory key (e.g., name, timezone)", type: 3, required: true }, { name: "limit", description: "How many changes to show (default 5)", type: 4, required: false } ] },
        { name: "revert", description: "Undo the last change to a memory", options: [ { name: "key", description: "Memory key to revert (e.g., name)", type: 3, required: true } ] },
        { name: "setquestiontimeout", description: "Set the question repeat timeout (in seconds)", options: [{ name: "seconds", description: "Timeout in seconds (e.g., 300 for 5 minutes)", type: 4, required: true }] },
        { name: "getquestiontimeout", description: "Get the current question repeat timeout" },
        { name: "addbypass", description: "Add a bypass entry (user or role) to allow using admin commands", options: [{ name: 'type', description: 'user or role', type: 3, required: true }, { name: 'id', description: 'User ID or Role ID (or mention)', type: 3, required: true }] },
        { name: "removebypass", description: "Remove a bypass entry", options: [{ name: 'type', description: 'user or role', type: 3, required: true }, { name: 'id', description: 'User ID or Role ID (or mention)', type: 3, required: true }] },
        { name: "listbypass", description: "List bypass entries" },
        { name: "setresponserule", description: "Add a rule to customize responses (admin)", options: [{ name: 'type', description: 'Type: phrase|emoji|sticker', type: 3, required: true }, { name: 'trigger', description: 'Trigger text/emoji/sticker id', type: 3, required: true }, { name: 'response', description: 'Response text (use __IGNORE__ to make bot ignore). Can be JSON object for translations.', type: 3, required: true }, { name: 'match', description: 'Match type: contains|equals|regex (phrase only)', type: 3, required: false }] },
        { name: "listresponserules", description: "List configured response rules (admin)" },
        { name: "delresponserule", description: "Delete a response rule by id (admin)", options: [{ name: 'id', description: 'Rule id', type: 3, required: true }] },
        { name: "setmodlog", description: "Set the moderation log channel (admin)", options: [{ name: 'channel', type: 7, description: 'Channel to receive moderation logs', required: true }] },
        { name: "getmodlog", description: "Show the current moderation log channel (admin)" },
        { name: "clearmodlog", description: "Clear the moderation log channel (admin)" },
    { name: "warn", description: "Warn a user (DM and record)", options: [{ name: 'user', type: 6, description: 'User to warn', required: true }, { name: 'reason', type: 3, description: 'Reason', required: false }] },
  { name: "warns", description: "Check user warnings", options: [{ name: 'user', type: 6, description: 'User to check', required: true }] },
  { name: "clearwarn", description: "Clear warnings for a user", options: [{ name: 'user', type: 6, description: 'User', required: true }] },
        { name: "unmute", description: "Remove timeout from a member", options: [{ name: 'user', type: 6, description: 'Member to unmute', required: true }] },
        { name: "announce", description: "Send an announcement as the bot", options: [{ name: 'message', type: 3, description: 'Message content', required: true }, { name: 'channel', type: 7, description: 'Channel to announce in', required: false }] },
        { name: "membercount", description: "Show member count (optionally for a role)", options: [{ name: 'role', type: 8, description: 'Role to count', required: false }] },
        { name: "purge", description: "Delete recent messages from the channel", options: [{ name: 'count', type: 4, description: 'Number of messages to delete', required: true }] },
        { name: "kick", description: "Kick a member", options: [{ name: "user", description: "Member to kick", type: 6, required: true }, { name: "reason", description: "Reason for kick", type: 3, required: false }] },
        { name: "ban", description: "Ban a member", options: [{ name: "user", description: "Member to ban", type: 6, required: true }, { name: "reason", description: "Reason for ban", type: 3, required: false }] },
        { name: "mute", description: "Timeout a member", options: [{ name: "user", description: "Member to timeout", type: 6, required: true }, { name: "duration", description: "Duration (e.g., 20s, 10m, 1h, or seconds)", type: 3, required: false }, { name: "reason", description: "Reason", type: 3, required: false }] },
        { name: "addrole", description: "Add a role to a member", options: [{ name: "user", description: "Member to modify", type: 6, required: true }, { name: "role", description: "Role to add", type: 8, required: true }] },
        { name: "removerole", description: "Remove a role from a member", options: [{ name: "user", description: "Member to modify", type: 6, required: true }, { name: "role", description: "Role to remove", type: 8, required: true }] },
        { name: "setdefaultmute", description: "Set default mute duration (e.g. 10m, 1h)", options: [{ name: "duration", description: "Duration (e.g. 10m or seconds)", type: 3, required: true }] },
  { name: "getdefaultmute", description: "Show the current default mute duration" },
        // Enhanced Features (added to ensure /registercommands includes the new commands)
        { name: "supportstats", description: "View support member performance stats", options: [ { name: "member", description: "Support member to view stats for", type: 6, required: false } ] },
        { name: "leaderboard", description: "Show support or achievement leaderboards", options: [ { name: "type", description: "resolution|speed|rating|volume|points|support_category", type: 3, required: true }, { name: "category", description: "Support category (for support_category type)", type: 3, required: false } ] },
        { name: "kb", description: "📚 Knowledge Base - AI-powered FAQ system", options: [
          { name: "search", description: "🔍 Search the knowledge base for answers", type: 1, options: [ { name: "query", description: "What you're looking for", type: 3, required: true } ] },
          { name: "add", description: "➕ Add a new FAQ entry (Admin)", type: 1, options: [ { name: "category", description: "Category (e.g., setup, billing, features)", type: 3, required: true }, { name: "question", description: "The question to add", type: 3, required: true }, { name: "answer", description: "The answer", type: 3, required: true }, { name: "tags", description: "Tags for better search (comma-separated)", type: 3, required: false } ] },
          { name: "trending", description: "🔥 See most-viewed knowledge entries", type: 1, options: [ { name: "days", description: "Days to look back (default 7)", type: 4, required: false } ] },
          { name: "suggest", description: "💡 AI suggestions for missing FAQ entries (Admin)", type: 1, options: [ { name: "days", description: "Days to analyze support questions (default 7)", type: 4, required: false } ] },
          { name: "stats", description: "📊 Knowledge base analytics (Admin)", type: 1 }
        ] },
        { name: "achievements", description: "🏆 View earned achievements and rewards", options: [ { name: "user", description: "User to view (defaults to you)", type: 6, required: false } ] },
        { name: "patterns", description: "📈 Admin: View detected user behavior patterns" },
        { name: "insights", description: "🔮 Admin: Get AI predictions for best posting times" },
        { name: "checkins", description: "📋 Admin: View scheduled proactive user follow-ups" },
        { name: "sentiment", description: "💭 Admin: Real-time emotional analysis of conversations", options: [ { name: "channel", description: "Channel to analyze (defaults to current)", type: 7, required: false } ] },
        { name: "commonissues", description: "🔍 Admin: Detect recurring support issues", options: [ { name: "hours", description: "Hours to analyze (default 24)", type: 4, required: false } ] },
        { name: "listopentickets", description: "List all open support tickets" },
        // Auto-Moderation
        { name: "automod", description: "🤖 Configure auto-moderation rules" },
        // Mod Cases
        { name: "case", description: "📋 View a moderation case by number", options: [ { name: "number", description: "Case number", type: 4, required: true } ] },
        { name: "cases", description: "📋 View all cases for a user", options: [ { name: "user", description: "User to check cases for", type: 6, required: true } ] },
        { name: "updatecase", description: "📝 Update case reason", options: [ { name: "number", description: "Case number", type: 4, required: true }, { name: "reason", description: "New reason", type: 3, required: true } ] },
        // Reminders
        { name: "remind", description: "⏰ Set a reminder", options: [ { name: "time", description: "Time (e.g., 2h, 30m, 1d)", type: 3, required: true }, { name: "message", description: "What to remind you about", type: 3, required: true } ] },
        { name: "reminders", description: "⏰ List your active reminders" },
        { name: "cancelreminder", description: "⏰ Cancel a reminder", options: [ { name: "id", description: "Reminder ID", type: 4, required: true } ] },
        // Staff Shifts
        { name: "clockin", description: "🕒 Clock in for your shift" },
        { name: "clockout", description: "🕒 Clock out from your shift" },
        { name: "shifts", description: "🕒 View shift history", options: [ { name: "user", description: "User to check (defaults to you)", type: 6, required: false }, { name: "limit", description: "Number of shifts to show (default 10)", type: 4, required: false } ] },
        { name: "shiftstats", description: "📊 View shift statistics", options: [ { name: "user", description: "User to check (defaults to you)", type: 6, required: false }, { name: "days", description: "Days to analyze (default 30)", type: 4, required: false } ] },
        { name: "whosonduty", description: "👥 View currently clocked-in staff" },
        // Server Stats Channels
        { name: "statschannels", description: "📊 Configure auto-updating stats channels" },
        // Bulk Actions
        { name: "bulkban", description: "🔨 Ban multiple users", options: [ { name: "users", description: "User IDs (comma or space separated)", type: 3, required: true }, { name: "reason", description: "Ban reason", type: 3, required: false } ] },
        { name: "bulkkick", description: "👢 Kick multiple users", options: [ { name: "users", description: "User IDs (comma or space separated)", type: 3, required: true }, { name: "reason", description: "Kick reason", type: 3, required: false } ] },
        { name: "bulkmute", description: "🔇 Mute multiple users", options: [ { name: "users", description: "User IDs (comma or space separated)", type: 3, required: true }, { name: "duration", description: "Duration (e.g., 10m, 1h)", type: 3, required: false }, { name: "reason", description: "Mute reason", type: 3, required: false } ] },
        // Ticket System
        { name: "ticket", description: "🎫 Ticket system commands" },
        // Temporary Channels
        { name: "tempchannels", description: "🔊 Configure temporary channels" }
      ];
      const registered = await client.application!.commands.set(cmds as any, interaction.guild.id);
      const names = (Array.isArray(cmds) ? cmds : []).map((c:any) => c?.name).filter(Boolean);
      const hasCheckwarn = names.includes('checkwarn');
      const aliasList = ['warnings', 'checkwarnings'].filter(n => names.includes(n));
      const aliasText = aliasList.length ? aliasList.join(', ') : 'none';
      return interaction.reply({ content: `Re-registered ${(registered as any)?.size ?? names.length} slash commands for this server (${interaction.guild.name}).\ncheckwarn: ${hasCheckwarn ? 'present' : 'missing'} | aliases: ${aliasText}.`, ephemeral: true });
    } catch (err: any) {
      console.error('registercommands failed:', err);
      return interaction.reply({ content: `Failed to register commands: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "getsupportroles") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    try {
      const { getSupportRoles } = await import('./services/supportRoles');
      const cfg = getSupportRoles();
      const lines = [
        `Configured support roles:`,
        `Head: ${cfg.head ? `<@&${cfg.head}>` : 'not set'}`,
        `Support: ${cfg.support ? `<@&${cfg.support}>` : 'not set'}`,
        `Trial: ${cfg.trial ? `<@&${cfg.trial}>` : 'not set'}`
      ].join('\n');
      return interaction.reply({ content: lines, ephemeral: true });
    } catch (err: any) {
      console.error('getsupportroles failed:', err);
      return interaction.reply({ content: `Failed to get support roles: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "support") {
    try {
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
      // Defer immediately since fetching members can take a few seconds
      await interaction.deferReply();
  const { listSupportMembers } = await import('./services/supportRoles');
  const { isFounderUser, isFounderMember } = await import('./services/founders');
      const listsRaw = await listSupportMembers(interaction.guild);
      // Ensure each member appears only under their HIGHEST support role: Head > Support > Trial
  // Founder detection is via service; keep constants only as fallback (service includes them)
      const assigned = new Set<string>();
      // Filter out founders from support lists
  const isFounderMemberLocal = (gm: any) => isFounderMember(gm);
  const headOnly = listsRaw.head.filter((m:any) => { if (isFounderMemberLocal(m) || assigned.has(m.id)) return false; assigned.add(m.id); return true; });
  const supportOnly = listsRaw.support.filter((m:any) => { if (isFounderMemberLocal(m) || assigned.has(m.id)) return false; assigned.add(m.id); return true; });
  const trialOnly = listsRaw.trial.filter((m:any) => { if (isFounderMemberLocal(m) || assigned.has(m.id)) return false; assigned.add(m.id); return true; });
      const lists = { head: headOnly, support: supportOnly, trial: trialOnly } as const;
      const formatList = (arr: any[]) => {
        if (!arr.length) return 'None';
        const shown = arr.slice(0, 25);
        const text = shown.map((m:any) => `<@${m.id}>`).join(', ');
        return text + (arr.length > 25 ? ` …(+${arr.length-25})` : '');
      };
      // Determine requester context (Founder vs Support vs Other)
  const requesterId = interaction.user.id;
  const requesterMember: any = interaction.member;
    const allMembersFiltered = ([] as any[]).concat(lists.head, lists.support, lists.trial);
  const isFounder = isFounderUser(interaction.guild, requesterId, requesterMember);
    const isRequesterSupport = allMembersFiltered.some((m:any) => m.id === requesterId);
      const header = isFounder
        ? `You're one of the founders. Here’s the team:`
        : (isRequesterSupport ? `You’re part of Support. Here’s the team:` : `Support team:`);
      const lines = [
        header,
        `Founders: PobKC, Joycemember`,
        `Head Support: ${formatList(lists.head)}`,
        `Support: ${formatList(lists.support)}`,
        `Trial Support: ${formatList(lists.trial)}`
      ].join('\n');
      // Only allow mentions for members we actually mentioned (exclude requester)
      const mentionedIds = new Set<string>();
      for (const arr of [lists.head, lists.support, lists.trial]) {
        for (const m of arr.slice(0,25)) {
          if (m.id !== interaction.user.id) mentionedIds.add(m.id);
        }
      }
  await interaction.editReply({ content: lines, allowedMentions: { users: Array.from(mentionedIds) } });
      return;
    } catch (err: any) {
      console.error('support list failed:', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `Failed to list support members: ${err?.message ?? err}` });
      } else {
        await interaction.reply({ content: `Failed to list support members: ${err?.message ?? err}`, ephemeral: true });
      }
      return;
    }
  }
  if (name === "diagai") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    try {
      const envSummary = [
        `AI_PROVIDER: ${process.env.AI_PROVIDER ?? 'auto'}`,
        `OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'present' : 'missing'}`,
        `GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'present' : 'missing'}`,
        `GUILD_ID: ${process.env.GUILD_ID ? process.env.GUILD_ID : 'not set'}`,
        `WAKE_WORD: ${process.env.WAKE_WORD ?? 'SynapseAI'}`,
      ].join('\n');
      // Try a tiny model call
      const { generateReply } = await import('./services/openai');
      let ok = false, sample = '';
      try {
        const res = await generateReply('Health check: reply with OK.');
        ok = true;
        sample = (res || '').slice(0, 160);
      } catch (e: any) {
        sample = `AI error: ${e?.message ?? String(e)}`;
      }
      // Try to get commit hash (best-effort)
      let commit = 'unknown';
      try {
        const { execSync } = await import('child_process');
        commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      } catch {}
      const lines = [
        `DiagAI`,
        `Commit: ${commit}`,
        envSummary,
        `Node: ${process.version}`,
        `AI test: ${ok ? 'OK' : 'FAILED'}`,
        `Sample/Err: ${sample}`
      ].join('\n');
      return interaction.reply({ content: lines.slice(0, 1900), ephemeral: true });
    } catch (err: any) {
      console.error('diagai failed:', err);
      return interaction.reply({ content: `diagai failed: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "setmention") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const ownerArg = (interaction.options.getString('owner', true) || '').toLowerCase();
    const enabled = interaction.options.getBoolean('enabled', true);
    if (!['pobkc','joycemember'].includes(ownerArg)) return interaction.reply({ content: 'Owner must be pobkc or joycemember.', ephemeral: true });
    try {
      const { setMentionEnabled } = await import('./services/ownerMentions');
      setMentionEnabled(ownerArg as any, enabled);
      return interaction.reply({ content: `Mention preference for ${ownerArg}: ${enabled ? 'enabled (@mention)' : 'disabled (name only)'}.`, ephemeral: true });
    } catch (err: any) {
      console.error('setmention failed:', err);
      return interaction.reply({ content: `Failed to set mention: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "perkspanel") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    try {
      const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = await import('discord.js');
      const embed = new EmbedBuilder().setTitle('🎁 Perks Panel').setDescription('Claim your unlocked perks here').setColor(0x9b59b6);
      const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('perk-claim:custom_color').setLabel('Custom Color').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('perk-claim:priority_support').setLabel('Priority Support').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('perk-claim:custom_emoji').setLabel('Custom Emoji').setStyle(ButtonStyle.Secondary)
      );
      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('perk-claim:channel_suggest').setLabel('Channel Suggest').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('perk-claim:voice_priority').setLabel('Voice Priority').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('perk-claim:exclusive_role').setLabel('Exclusive VIP').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ embeds: [embed], components: [row1, row2] });
      return;
    } catch (e:any) {
      console.error('perkspanel failed:', e);
      return interaction.reply({ content: `Failed to post panel: ${e?.message ?? e}`, ephemeral: true });
    }
  }
  if (name === "setperkrole") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    try {
      const perk = (interaction.options.getString('perk', true) || '').toLowerCase();
      const role = interaction.options.getRole('role', true)!;
      const valid = ['custom_color','priority_support','custom_emoji','channel_suggest','voice_priority','exclusive_role'];
      if (!valid.includes(perk)) return interaction.reply({ content: `Perk must be one of: ${valid.join(', ')}`, ephemeral: true });
      const { setPerkRoleId } = await import('./config/perksConfig');
      setPerkRoleId(perk as any, role.id);
      return interaction.reply({ content: `Perk '${perk}' bound to role ${role.name} (${role.id}).`, ephemeral: true });
    } catch (e:any) {
      console.error('setperkrole failed:', e);
      return interaction.reply({ content: `Failed: ${e?.message ?? e}`, ephemeral: true });
    }
  }
  if (name === "getmention") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    try {
      const { getMentionConfig } = await import('./services/ownerMentions');
      const cfg = getMentionConfig();
      const lines = [
        'Owner Mention Preferences:',
        `PobKC: ${cfg.pobkc ? 'enabled (@mention)' : 'disabled (name only)'}`,
        `Joycemember: ${cfg.joycemember ? 'enabled (@mention)' : 'disabled (name only)'}`
      ].join('\n');
      return interaction.reply({ content: lines, ephemeral: true });
    } catch (err: any) {
      console.error('getmention failed:', err);
      return interaction.reply({ content: `Failed to get mention config: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "ping") return interaction.reply(`Pong!`);
  if (name === "pong") return interaction.reply(`Pong!`);
  if (name === "joke") {
    const joke = getRandomJoke();
    if (joke.setup) {
      return interaction.reply(`${joke.setup}\n\n||${joke.punchline}||`);
    }
    return interaction.reply(joke.punchline);
  }
  if (name === "dadjoke") {
    const joke = getRandomJoke('dad-joke');
    if (joke.setup) {
      return interaction.reply(`${joke.setup}\n\n||${joke.punchline}||`);
    }
    return interaction.reply(joke.punchline);
  }
  
  // Giveaway commands
  if (name === "giveaway") {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === "start") {
      if (!adminOrBypass(interaction.member)) {
        return interaction.reply({ content: "You are not authorized to use this feature.", flags: MessageFlags.Ephemeral });
      }
      
      const prize = interaction.options.getString("prize", true);
      const durationStr = interaction.options.getString("duration", true);
      const winners = interaction.options.getInteger("winners", true);
      const channel = interaction.options.getChannel("channel") ?? interaction.channel;
      const minMessages = interaction.options.getInteger("minmessages") ?? undefined;
      const minInvites = interaction.options.getInteger("mininvites") ?? undefined;
      const requiredRolesStr = interaction.options.getString("requiredroles") ?? undefined;
      
      if (winners < 1) return interaction.reply({ content: "Winner count must be at least 1.", ephemeral: true });
      
      const { parseDurationToSeconds } = await import("./utils/parseDuration");
      const secs = parseDurationToSeconds(durationStr);
      if (!secs || secs < 1) return interaction.reply({ content: "Invalid duration. Examples: 7d, 24h, 3600", ephemeral: true });
      
      const requiredRoles = requiredRolesStr ? requiredRolesStr.split(',').map(r => r.trim()) : undefined;
      
      const giveaway = createGiveaway({
        prize,
        channelId: (channel as any).id,
        guildId: interaction.guild!.id,
        hostId: interaction.user.id,
        durationMs: secs * 1000,
        winnerCount: winners,
        requirements: {
          minMessages,
          minInvites,
          requiredRoles
        }
      });
      
      try {
        const embed = {
          title: `🎉 GIVEAWAY 🎉`,
          description: `**Prize:** ${prize}\n**Winners:** ${winners}\n**Hosted by:** <@${interaction.user.id}>\n**Ends:** <t:${Math.floor(giveaway.endTime / 1000)}:R>`,
          color: 0x00FF00,
          footer: { text: `React with 🎉 to enter • ID: ${giveaway.id}` }
        };
        
        if (minMessages || minInvites || requiredRoles) {
          let reqText = '\n**Requirements:**\n';
          if (minMessages) reqText += `• ${minMessages}+ messages sent\n`;
          if (minInvites) reqText += `• ${minInvites}+ invites\n`;
          if (requiredRoles && requiredRoles.length > 0) reqText += `• Must have role: ${requiredRoles.map(r => `<@&${r}>`).join(', ')}\n`;
          embed.description += reqText;
        }
        
        const msg = await (channel as any).send({ embeds: [embed] });
        await msg.react('🎉');
        setGiveawayMessageId(giveaway.id, msg.id);
        
        return interaction.reply({ content: `Giveaway started in <#${(channel as any).id}>! ID: ${giveaway.id}`, ephemeral: true });
      } catch (err) {
        console.error('Failed to start giveaway', err);
        return interaction.reply({ content: 'Failed to start giveaway.', ephemeral: true });
      }
    }
    
    if (subcommand === "end") {
      if (!adminOrBypass(interaction.member)) {
        return interaction.reply({ content: "You are not authorized to use this feature.", flags: MessageFlags.Ephemeral });
      }
      
      const id = interaction.options.getString("id", true);
      const giveaway = getGiveawayById(id);
      
      if (!giveaway) return interaction.reply({ content: "Giveaway not found.", ephemeral: true });
      if (giveaway.status !== "active") return interaction.reply({ content: "Giveaway is not active.", ephemeral: true });
      
      const winners = pickWinners(giveaway);
      endGiveaway(id, winners);
      
      try {
        const channel = await client.channels.fetch(giveaway.channelId);
        if (channel && 'send' in channel) {
          const winnerText = winners.length > 0 
            ? winners.map(w => `<@${w}>`).join(', ')
            : 'No valid entries';
          await (channel as any).send({ content: `🎉 Giveaway ended!\n**Prize:** ${giveaway.prize}\n**Winners:** ${winnerText}` });
        }
        return interaction.reply({ content: `Giveaway ${id} ended. Winners: ${winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'None'}`, ephemeral: true });
      } catch (err) {
        console.error('Failed to end giveaway', err);
        return interaction.reply({ content: 'Giveaway ended but failed to announce winners.', ephemeral: true });
      }
    }
    
    if (subcommand === "reroll") {
      if (!adminOrBypass(interaction.member)) {
        return interaction.reply({ content: "You are not authorized to use this feature.", flags: MessageFlags.Ephemeral });
      }
      
      const id = interaction.options.getString("id", true);
      const giveaway = getGiveawayById(id);
      
      if (!giveaway) return interaction.reply({ content: "Giveaway not found.", ephemeral: true });
      if (giveaway.status !== "ended") return interaction.reply({ content: "Can only reroll ended giveaways.", ephemeral: true });
      
      const newWinners = pickWinners(giveaway);
      giveaway.winners = newWinners;
      
      try {
        const channel = await client.channels.fetch(giveaway.channelId);
        if (channel && 'send' in channel) {
          const winnerText = newWinners.length > 0 
            ? newWinners.map(w => `<@${w}>`).join(', ')
            : 'No valid entries';
          await (channel as any).send({ content: `🎉 Giveaway rerolled!\n**Prize:** ${giveaway.prize}\n**New Winners:** ${winnerText}` });
        }
        return interaction.reply({ content: `Rerolled winners: ${newWinners.length > 0 ? newWinners.map(w => `<@${w}>`).join(', ') : 'None'}`, ephemeral: true });
      } catch (err) {
        console.error('Failed to reroll giveaway', err);
        return interaction.reply({ content: 'Failed to reroll giveaway.', ephemeral: true });
      }
    }
    
    if (subcommand === "list") {
      const giveaways = getActiveGiveaways(interaction.guild?.id);
      if (giveaways.length === 0) return interaction.reply({ content: 'No active giveaways.', ephemeral: true });
      
      const list = giveaways.map(g => `**${g.id}** - ${g.prize} (${g.entries.length} entries, ends <t:${Math.floor(g.endTime / 1000)}:R>)`).join('\n').slice(0, 1900);
      return interaction.reply({ content: `Active giveaways:\n${list}`, ephemeral: true });
    }
  }
  
  if (name === "setquestiontimeout") {
    if (!(await hasCommandAccess(interaction.member, 'setquestiontimeout', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const seconds = interaction.options.getInteger("seconds", true);
    if (seconds < 1) {
      return interaction.reply({ content: "Timeout must be at least 1 second.", ephemeral: true });
    }
    try {
      responseTracker.setRepeatTimeout(seconds);
      return interaction.reply({ content: `Question repeat timeout updated to ${seconds} seconds.`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to update timeout setting.", ephemeral: true });
    }
  }
  if (name === "getquestiontimeout") {
    const timeout = responseTracker.getRepeatTimeout();
    const minutes = Math.floor(timeout / 60);
    const remainingSeconds = timeout % 60;
    const timeString = minutes > 0 
      ? `${minutes} minute${minutes !== 1 ? 's' : ''}${remainingSeconds > 0 ? ` and ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}` : ''}`
      : `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
    return interaction.reply({ content: `Current question repeat timeout: ${timeString}`, ephemeral: true });
  }

  if (name === 'addbypass') {
    // Only true administrators or the configured owner may manage bypass entries
    if (!(interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) || isOwnerId(interaction.user.id))) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const type = (interaction.options.getString('type', true) as string).toLowerCase();
    let idRaw = interaction.options.getString('id', true)!.trim();
    // allow mentions like <@123> or <@&123>
    idRaw = idRaw.replace(/[<@&!>]/g, '');
    if (!['user','role'].includes(type)) return interaction.reply({ content: 'Type must be user or role.', ephemeral: true });
    try {
      const entry = bypass.add(type as any, idRaw, interaction.user.id);
      if (!entry) return interaction.reply({ content: 'Entry already exists.', ephemeral: true });
      return interaction.reply({ content: `Bypass entry added: ${type} ${idRaw}`, ephemeral: true });
    } catch (err) {
      console.error('Failed to add bypass', err);
      return interaction.reply({ content: 'Failed to add bypass entry.', ephemeral: true });
    }
  }

  if (name === 'removebypass') {
    // Only true administrators or the configured owner may manage bypass entries
    if (!(interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) || isOwnerId(interaction.user.id))) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const type = (interaction.options.getString('type', true) as string).toLowerCase();
    let idRaw = interaction.options.getString('id', true)!.trim();
    idRaw = idRaw.replace(/[<@&!>]/g, '');
    if (!['user','role'].includes(type)) return interaction.reply({ content: 'Type must be user or role.', ephemeral: true });
    try {
      const ok = bypass.remove(type as any, idRaw);
      return interaction.reply({ content: ok ? `Removed bypass ${type} ${idRaw}` : 'Bypass entry not found', ephemeral: true });
    } catch (err) {
      console.error('Failed to remove bypass', err);
      return interaction.reply({ content: 'Failed to remove bypass entry.', ephemeral: true });
    }
  }

  if (name === 'listbypass') {
    // Only true administrators or the configured owner may view bypass entries
    if (!(interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) || isOwnerId(interaction.user.id))) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    try {
      const items = bypass.list();
      if (!items.length) return interaction.reply({ content: 'No bypass entries configured.', ephemeral: true });
      const out = items.map(i => `${i.type}:${i.id} addedBy=${i.addedBy ?? 'unknown'}`).join('\n').slice(0, 1900);
      return interaction.reply({ content: `Bypass entries:\n${out}`, ephemeral: true });
    } catch (err) {
      console.error('Failed to list bypasses', err);
      return interaction.reply({ content: 'Failed to list bypass entries.', ephemeral: true });
    }
  }

  if (name === 'setresponserule') {
    if (!(await hasCommandAccess(interaction.member, 'setresponserule', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const type = (interaction.options.getString('type', true) as string).toLowerCase();
    const trigger = interaction.options.getString('trigger', true)!;
    const match = (interaction.options.getString('match') ?? 'contains').toLowerCase();
    const resp = interaction.options.getString('response', true)!;

    if (!['phrase','emoji','sticker'].includes(type)) return interaction.reply({ content: 'Invalid type. Use phrase, emoji, or sticker.', ephemeral: true });
    if (!['contains','equals','regex'].includes(match)) return interaction.reply({ content: 'Invalid match type. Use contains, equals, or regex.', ephemeral: true });

    try {
      // support providing language-specific responses via a JSON-like syntax in the response field
      // example: {"en":"Hi","es":"Hola"}
      let parsed: any = undefined;
      try {
        parsed = JSON.parse(resp);
      } catch (e) {
        // not JSON, leave parsed undefined
      }
      const addArg: any = { type: type as any, matchType: match as any, trigger, createdBy: interaction.user.id };
      if (parsed && typeof parsed === 'object') {
        addArg.responsesPerLang = parsed;
      } else {
        addArg.response = resp;
      }
      const rule = responseRules.addRule(addArg);
      return interaction.reply({ content: `Rule created (id: ${rule.id}).`, ephemeral: true });
    } catch (err) {
      console.error('Failed to create response rule', err);
      return interaction.reply({ content: 'Failed to create rule.', ephemeral: true });
    }
  }

  if (name === 'listresponserules') {
    if (!(await hasCommandAccess(interaction.member, 'listresponserules', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const rules = responseRules.listRules();
    if (!rules.length) return interaction.reply({ content: 'No response rules configured.', ephemeral: true });
  const lines = rules.map(r => `${r.id} [${r.type}/${r.matchType}] trigger=${r.trigger} -> ${r.response ?? JSON.stringify(r.responsesPerLang ?? {})}`);
    // If too long, truncate
    const out = lines.join('\n').slice(0, 1900);
    return interaction.reply({ content: `Configured rules:\n${out}`, ephemeral: true });
  }

  if (name === 'delresponserule') {
    if (!(await hasCommandAccess(interaction.member, 'delresponserule', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const id = interaction.options.getString('id', true)!;
    const ok = responseRules.removeRule(id);
    return interaction.reply({ content: ok ? `Removed rule ${id}` : `Rule ${id} not found`, ephemeral: true });
  }

  if (name === 'setmodlog') {
    if (!(await hasCommandAccess(interaction.member, 'setmodlog', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const ch = interaction.options.getChannel('channel');
    if (!ch || !('id' in ch)) return interaction.reply({ content: 'Invalid channel.', ephemeral: true });
    try {
      setModLogChannelId((ch as any).id);
      return interaction.reply({ content: `Moderation log channel set to <#${(ch as any).id}>`, ephemeral: true });
    } catch (err) {
      console.error('Failed to set mod log channel', err);
      return interaction.reply({ content: 'Failed to set moderation log channel.', ephemeral: true });
    }
  }

  if (name === 'getmodlog') {
    if (!(await hasCommandAccess(interaction.member, 'getmodlog', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const id = getModLogChannelId();
    return interaction.reply({ content: id ? `Moderation log channel: <#${id}>` : 'Moderation log channel not set.', ephemeral: true });
  }

  if (name === 'clearmodlog') {
    if (!(await hasCommandAccess(interaction.member, 'clearmodlog', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    try { clearModLogChannelId(); return interaction.reply({ content: 'Moderation log channel cleared.', ephemeral: true }); } catch (e) { return interaction.reply({ content: 'Failed to clear moderation log channel.', ephemeral: true }); }
  }

  // New admin commands: warn / checkwarn / clearwarn / unmute / announce / membercount / purge
  if (name === 'warn') {
  if (!(await hasCommandAccess(interaction.member, 'warn', interaction.guild?.id || null))) {
    return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
  }
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') ?? 'No reason provided';
  if (!user || !interaction.guild) return interaction.reply({ content: 'User not found.', ephemeral: true });
    // DM with embed
    const embed = buildModerationEmbed({
      action: 'Warned',
      guildName: interaction.guild?.name ?? 'a server',
      targetId: user.id,
      targetTag: user.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason
    });
    try { await user.send({ content: `<@${user.id}>`, embeds: [embed] }); } catch { /* ignore */ }
    await sendToModLog(interaction.guild!, embed, `<@${user.id}>`);
    warnings.addWarning(user.id, interaction.user.id, reason);
    
    // Create case
    const { createCase } = await import('./services/cases');
    const caseNum = createCase(interaction.guild.id, user.id, interaction.user.id, 'warn', reason);
    
    // Check if user should be auto-suspended (3 warnings)
    const { checkWarningsAndSuspend } = await import('./services/staffSuspension');
    const modLogChannelId = getModLogChannelId();
    const modLogChannel = modLogChannelId ? await interaction.guild.channels.fetch(modLogChannelId).catch(() => null) as any : null;
    const suspensionResult = await checkWarningsAndSuspend(
      user.id,
      interaction.guild.id,
      interaction.guild,
      modLogChannel || undefined
    );
    
    if (suspensionResult.shouldSuspend) {
      return interaction.reply({ 
        content: `⚠️ Warned ${user.tag} (Case #${caseNum})\n\n🚫 **User has been automatically suspended** for accumulating ${suspensionResult.warningCount} warnings.`, 
        ephemeral: true 
      });
    }
    
    return interaction.reply({ content: `Warned ${user.tag} (Case #${caseNum})`, ephemeral: true });
  }

  if (name === 'checkwarn' || name === 'warnings' || name === 'checkwarnings' || name === 'warns') {
    if (!(await hasCommandAccess(interaction.member, 'checkwarn', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const user = interaction.options.getUser('user');
    if (!user || !interaction.guild) {
      return interaction.reply({ content: 'User not found.', ephemeral: true });
    }

    try {
      const { getWarningDetails } = await import('./services/antiAbuse');
      const details = getWarningDetails(user.id, interaction.guild.id);
      
      // Build warning embed
      const warningEmbed = new EmbedBuilder()
        .setTitle(`⚠️ Warnings for ${user.tag}`)
        .setColor(details.total === 0 ? 0x00FF00 : details.total >= 3 ? 0xFF0000 : 0xFFAA00)
        .addFields(
          { name: 'Total Warnings', value: `${details.total}`, inline: true },
          { name: 'Spam Warnings', value: `${details.spam}`, inline: true },
          { name: 'Bypass Warnings', value: `${details.bypass}`, inline: true },
          { name: 'Inappropriate Content', value: `${details.inappropriate}`, inline: true }
        );

      if (details.lastWarning) {
        const lastWarnDate = new Date(details.lastWarning);
        warningEmbed.addFields({ 
          name: 'Last Warning', 
          value: `<t:${Math.floor(lastWarnDate.getTime() / 1000)}:R>`, 
          inline: false 
        });
      }

      // Add next action info
      if (details.inappropriate >= 3) {
        const muteAfter = details.inappropriate - 2; // 3rd = 1st mute, 4th = 2nd mute, etc.
        const muteDuration = muteAfter === 1 ? '10 minutes' : 
                            muteAfter === 2 ? '30 minutes' : 
                            muteAfter === 3 ? '1 hour' : 
                            '24 hours';
        warningEmbed.addFields({
          name: '⏰ Next Action',
          value: `Next inappropriate content will result in **${muteDuration} mute**`,
          inline: false
        });
      } else if (details.spam >= 3 || details.bypass >= 3) {
        warningEmbed.addFields({
          name: '🚫 Status',
          value: 'User should be blacklisted (3+ warnings)',
          inline: false
        });
      } else if (details.total > 0) {
        warningEmbed.addFields({
          name: '📋 Status',
          value: `${3 - details.total} more warning(s) until action taken`,
          inline: false
        });
      }

      return interaction.reply({ embeds: [warningEmbed], ephemeral: true });
    } catch (err) {
      console.error('Failed to check warnings:', err);
      return interaction.reply({ content: 'Failed to retrieve warning information.', ephemeral: true });
    }
  }

  if (name === 'clearwarn') {
    if (!(await hasCommandAccess(interaction.member, 'clearwarn', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const user = interaction.options.getUser('user');
    const removed = user ? warnings.clearWarningsFor(user.id) : 0;
    
    // Also clear anti-abuse warnings from database
    let abuseWarningsCleared = 0;
    if (user && interaction.guild) {
      try {
        const { clearWarnings } = await import('./services/antiAbuse');
        const cleared = clearWarnings(user.id, interaction.guild.id);
        if (cleared) abuseWarningsCleared = 1;
      } catch (err) {
        console.error('Failed to clear anti-abuse warnings:', err);
      }
    }
    
    const totalCleared = removed + abuseWarningsCleared;
    return interaction.reply({ 
      content: `Cleared ${totalCleared} warning${totalCleared !== 1 ? 's' : ''} for ${user?.tag ?? 'unknown user'}`, 
      ephemeral: true 
    });
  }

  if (name === 'unmute') {
    if (!(await hasCommandAccess(interaction.member, 'unmute', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const target = interaction.options.getMember('user') as any;
    if (!target) return interaction.reply({ content: 'Member not found.', ephemeral: true });
    try {
      await target.timeout(null);
      return interaction.reply({ content: `${target.user.tag} has been unmuted.`, ephemeral: true });
    } catch (err) {
      console.error('Failed to unmute', err);
      return interaction.reply({ content: 'Failed to unmute member.', ephemeral: true });
    }
  }

  if (name === 'suspendstaff') {
    if (!(await hasCommandAccess(interaction.member, 'suspendstaff', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    
    const user = interaction.options.getUser('user', true);
    const duration = interaction.options.getInteger('duration', true);
    const reason = interaction.options.getString('reason', true);
    
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ This command must be used in a guild.', ephemeral: true });
    }
    
    if (duration < 1 || duration > 30) {
      return interaction.reply({ content: '❌ Duration must be between 1 and 30 days.', ephemeral: true });
    }
    
    try {
      const member = await interaction.guild.members.fetch(user.id);
      const { suspendStaffMember } = await import('./services/staffSuspension');
      
      const modLogChannelId = getModLogChannelId();
      const modLogChannel = modLogChannelId ? await interaction.guild.channels.fetch(modLogChannelId).catch(() => null) as any : null;
      
      const result = await suspendStaffMember(
        member,
        reason,
        interaction.user.id,
        duration,
        modLogChannel || undefined
      );
      
      if (result.success) {
        return interaction.reply({ content: `✅ ${result.message}`, ephemeral: true });
      } else {
        return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
      }
    } catch (err) {
      console.error('Failed to suspend staff member:', err);
      return interaction.reply({ content: `❌ Failed to suspend: ${err}`, ephemeral: true });
    }
  }

  if (name === 'cancelsuspension') {
    if (!(await hasCommandAccess(interaction.member, 'cancelsuspension', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    
    const user = interaction.options.getUser('user', true);
    
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ This command must be used in a guild.', ephemeral: true });
    }
    
    try {
      const { getActiveSuspension, cancelStaffSuspension } = await import('./services/staffSuspension');
      
      const suspension = getActiveSuspension(user.id, interaction.guild.id);
      if (!suspension) {
        return interaction.reply({ content: `❌ ${user.tag} does not have an active suspension.`, ephemeral: true });
      }
      
      const modLogChannelId = getModLogChannelId();
      const modLogChannel = modLogChannelId ? await interaction.guild.channels.fetch(modLogChannelId).catch(() => null) as any : null;
      
      const result = await cancelStaffSuspension(
        suspension.id!,
        interaction.user.id,
        interaction.guild,
        modLogChannel || undefined
      );
      
      if (result.success) {
        return interaction.reply({ content: `✅ ${result.message}`, ephemeral: true });
      } else {
        return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
      }
    } catch (err) {
      console.error('Failed to cancel suspension:', err);
      return interaction.reply({ content: `❌ Failed to cancel suspension: ${err}`, ephemeral: true });
    }
  }

  if (name === 'suspensions') {
    if (!(await hasCommandAccess(interaction.member, 'suspensions', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ This command must be used in a guild.', ephemeral: true });
    }
    
    try {
      const { getActiveSuspensions } = await import('./services/staffSuspension');
      const suspensions = getActiveSuspensions().filter(s => s.guild_id === interaction.guild!.id);
      
      if (suspensions.length === 0) {
        return interaction.reply({ content: '✅ No active suspensions.', ephemeral: true });
      }
      
      const embed = new EmbedBuilder()
        .setTitle('🚫 Active Staff Suspensions')
        .setColor(0xFF6B6B)
        .setDescription(`**${suspensions.length}** active suspension(s)`)
        .setTimestamp();
      
      for (const suspension of suspensions.slice(0, 10)) {
        const endDate = new Date(suspension.end_date);
        const endTimestamp = Math.floor(endDate.getTime() / 1000);
        
        embed.addFields({
          name: `User: <@${suspension.user_id}>`,
          value: [
            `**Reason:** ${suspension.reason}`,
            `**Suspended by:** <@${suspension.suspended_by}>`,
            `**Ends:** <t:${endTimestamp}:R>`,
            `**Type:** ${suspension.is_permanent ? '🔴 Permanent (must appeal)' : '🟡 Temporary (will be demoted)'}`
          ].join('\n'),
          inline: false
        });
      }
      
      if (suspensions.length > 10) {
        embed.setFooter({ text: `Showing first 10 of ${suspensions.length} suspensions` });
      }
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error('Failed to list suspensions:', err);
      return interaction.reply({ content: `❌ Failed to list suspensions: ${err}`, ephemeral: true });
    }
  }

  // Staff Activity Tracking System
  if (name === 'staffactivity') {
    if (!adminOrBypass(interaction.member)) {
      return interaction.reply({ content: '❌ Only server administrators can use this command.', ephemeral: true });
    }

    const {
      setStaffActivityConfig,
      getStaffActivityConfig,
      updateStaffActivity,
      getStaffActivity,
      getAllStaffActivity,
      getInactiveStaff,
      exemptStaffFromDemotion,
      removeStaffExemption,
      getDemotionHistory
    } = await import('./services/staffActivity');

    const subCmd = interaction.options.getSubcommand();

    if (subCmd === 'setup') {
      const headSupportRole = interaction.options.getRole('head_support_role', true);
      const supportRole = interaction.options.getRole('support_role', true);
      const trialSupportRole = interaction.options.getRole('trial_support_role', true);
      const inactivityDays = interaction.options.getInteger('inactivity_days') || 2;

      setStaffActivityConfig({
        guild_id: interaction.guild!.id,
        head_support_role_id: headSupportRole.id,
        support_role_id: supportRole.id,
        trial_support_role_id: trialSupportRole.id,
        inactivity_days: inactivityDays,
        enabled: true
      });

      const embed = new EmbedBuilder()
        .setColor(0x51CF66)
        .setTitle('✅ Staff Activity System Configured')
        .addFields(
          { name: 'Head Support Role', value: `<@&${headSupportRole.id}>`, inline: true },
          { name: 'Support Role', value: `<@&${supportRole.id}>`, inline: true },
          { name: 'Trial Support Role', value: `<@&${trialSupportRole.id}>`, inline: true },
          { name: 'Inactivity Period', value: `${inactivityDays} days`, inline: false },
          { name: 'Demotion Hierarchy', value: 'Head Support → Support → Trial Support → Removed', inline: false }
        )
        .setFooter({ text: 'Staff will be automatically demoted after inactivity period' });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subCmd === 'exempt') {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);

      exemptStaffFromDemotion(interaction.guild!.id, user.id, reason);

      return interaction.reply({ 
        content: `✅ <@${user.id}> has been exempted from auto-demotion.\n**Reason:** ${reason}`, 
        ephemeral: true 
      });
    }

    if (subCmd === 'unexempt') {
      const user = interaction.options.getUser('user', true);

      removeStaffExemption(interaction.guild!.id, user.id);

      return interaction.reply({ 
        content: `✅ <@${user.id}> is no longer exempted from auto-demotion.`, 
        ephemeral: true 
      });
    }

    if (subCmd === 'check') {
      const user = interaction.options.getUser('user');

      if (user) {
        const activity = getStaffActivity(interaction.guild!.id, user.id);

        if (!activity) {
          return interaction.reply({ content: `❌ ${user.tag} is not being tracked in the staff activity system.`, ephemeral: true });
        }

        const lastActivityDate = new Date(activity.last_activity_at);
        const daysSinceActivity = Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));

        const embed = new EmbedBuilder()
          .setColor(activity.exempted ? 0x51CF66 : (daysSinceActivity >= 2 ? 0xFF6B6B : 0x3498DB))
          .setTitle(`📊 Staff Activity: ${user.tag}`)
          .addFields(
            { name: 'Current Role', value: activity.current_role.replace('_', ' ').toUpperCase(), inline: true },
            { name: 'Last Activity', value: `<t:${Math.floor(lastActivityDate.getTime() / 1000)}:R>`, inline: true },
            { name: 'Days Inactive', value: `${daysSinceActivity} days`, inline: true },
            { name: 'Exempted', value: activity.exempted ? '✅ Yes' : '❌ No', inline: true }
          );

        if (activity.exempted && activity.exemption_reason) {
          embed.addFields({ name: 'Exemption Reason', value: activity.exemption_reason, inline: false });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
      } else {
        // Show all staff
        const allActivity = getAllStaffActivity(interaction.guild!.id);

        if (allActivity.length === 0) {
          return interaction.reply({ content: '❌ No staff members are being tracked.', ephemeral: true });
        }

        const config = getStaffActivityConfig(interaction.guild!.id);
        const inactivityDays = config?.inactivity_days || 2;

        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle(`📊 All Staff Activity (${allActivity.length} members)`)
          .setDescription(`Tracking staff activity with ${inactivityDays} day inactivity limit`);

        for (const activity of allActivity.slice(0, 10)) {
          const lastActivityDate = new Date(activity.last_activity_at);
          const daysSinceActivity = Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));
          const status = activity.exempted ? '🟢 Exempted' : (daysSinceActivity >= inactivityDays ? '🔴 Inactive' : '🟢 Active');

          embed.addFields({
            name: `<@${activity.user_id}>`,
            value: `**Role:** ${activity.current_role.replace('_', ' ')}\n**Last Activity:** ${daysSinceActivity}d ago\n**Status:** ${status}`,
            inline: true
          });
        }

        if (allActivity.length > 10) {
          embed.setFooter({ text: `Showing first 10 of ${allActivity.length} staff members` });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    if (subCmd === 'history') {
      const user = interaction.options.getUser('user');
      const history = getDemotionHistory(interaction.guild!.id, user?.id);

      if (history.length === 0) {
        return interaction.reply({ 
          content: user ? `❌ No demotion history for ${user.tag}.` : '❌ No demotion history found.', 
          ephemeral: true 
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle(`📜 Demotion History${user ? ` - ${user.tag}` : ''}`)
        .setDescription(`Showing ${history.length} demotion${history.length > 1 ? 's' : ''}`);

      for (const log of history.slice(0, 10)) {
        const demotedDate = new Date(log.demoted_at!);
        embed.addFields({
          name: `<@${log.user_id}>`,
          value: `**From:** ${log.from_role.replace('_', ' ')}\n**To:** ${log.to_role === 'removed' ? 'Removed from Staff' : log.to_role.replace('_', ' ')}\n**Reason:** ${log.reason}\n**Date:** <t:${Math.floor(demotedDate.getTime() / 1000)}:R>`,
          inline: false
        });
      }

      if (history.length > 10) {
        embed.setFooter({ text: `Showing first 10 of ${history.length} demotions` });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subCmd === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const config = getStaffActivityConfig(interaction.guild!.id);

      if (!config) {
        return interaction.reply({ content: '❌ Please run `/staffactivity setup` first.', ephemeral: true });
      }

      config.enabled = enabled;
      setStaffActivityConfig(config);

      return interaction.reply({ 
        content: `✅ Staff activity system ${enabled ? 'enabled' : 'disabled'}.`, 
        ephemeral: true 
      });
    }
  }

  // Anti-Nuke System
  if (name === 'antinuke') {
    if (!adminOrBypass(interaction.member)) {
      return interaction.reply({ content: '❌ Only server administrators can use this command.', ephemeral: true });
    }

    const {
      setAntiNukeConfig,
      getAntiNukeConfig,
      addToWhitelist,
      removeFromWhitelist,
      addRoleToWhitelist,
      removeRoleFromWhitelist,
      getAntiNukeTriggers
    } = await import('./services/antiNuke');

    const subCmd = interaction.options.getSubcommand();

    if (subCmd === 'setup') {
      const maxChannelDeletes = interaction.options.getInteger('max_channel_deletes') || 3;
      const maxRoleDeletes = interaction.options.getInteger('max_role_deletes') || 3;
      const maxBans = interaction.options.getInteger('max_bans') || 5;
      const timeWindow = interaction.options.getInteger('time_window') || 60;

      const currentConfig = getAntiNukeConfig(interaction.guild!.id);

      setAntiNukeConfig({
        guild_id: interaction.guild!.id,
        enabled: true,
        max_channel_deletes: maxChannelDeletes,
        max_role_deletes: maxRoleDeletes,
        max_bans: maxBans,
        time_window_seconds: timeWindow,
        whitelist_role_ids: currentConfig?.whitelist_role_ids || [],
        whitelist_user_ids: currentConfig?.whitelist_user_ids || [],
        lockdown_on_trigger: true
      });

      const embed = new EmbedBuilder()
        .setColor(0x51CF66)
        .setTitle('🛡️ Anti-Nuke Protection Configured')
        .addFields(
          { name: 'Max Channel Deletes', value: `${maxChannelDeletes} in ${timeWindow}s`, inline: true },
          { name: 'Max Role Deletes', value: `${maxRoleDeletes} in ${timeWindow}s`, inline: true },
          { name: 'Max Bans', value: `${maxBans} in ${timeWindow}s`, inline: true },
          { name: 'Protection', value: '🟢 Active', inline: false },
          { name: 'Action on Trigger', value: '• Remove permissions\n• Ban user\n• Log to modlog', inline: false }
        )
        .setFooter({ text: 'Whitelisted users/roles are exempt' });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subCmd === 'whitelist') {
      const user = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');

      if (!user && !role) {
        return interaction.reply({ content: '❌ Please provide a user or role to whitelist.', ephemeral: true });
      }

      if (user) {
        addToWhitelist(interaction.guild!.id, user.id);
        return interaction.reply({ content: `✅ <@${user.id}> has been whitelisted from anti-nuke.`, ephemeral: true });
      }

      if (role) {
        addRoleToWhitelist(interaction.guild!.id, role.id);
        return interaction.reply({ content: `✅ <@&${role.id}> has been whitelisted from anti-nuke.`, ephemeral: true });
      }
    }

    if (subCmd === 'unwhitelist') {
      const user = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');

      if (!user && !role) {
        return interaction.reply({ content: '❌ Please provide a user or role to remove from whitelist.', ephemeral: true });
      }

      if (user) {
        removeFromWhitelist(interaction.guild!.id, user.id);
        return interaction.reply({ content: `✅ <@${user.id}> has been removed from anti-nuke whitelist.`, ephemeral: true });
      }

      if (role) {
        removeRoleFromWhitelist(interaction.guild!.id, role.id);
        return interaction.reply({ content: `✅ <@&${role.id}> has been removed from anti-nuke whitelist.`, ephemeral: true });
      }
    }

    if (subCmd === 'status') {
      const config = getAntiNukeConfig(interaction.guild!.id);

      if (!config) {
        return interaction.reply({ content: '❌ Anti-nuke is not configured. Run `/antinuke setup` first.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(config.enabled ? 0x51CF66 : 0xFF6B6B)
        .setTitle(`🛡️ Anti-Nuke Status: ${config.enabled ? '🟢 Active' : '🔴 Disabled'}`)
        .addFields(
          { name: 'Max Channel Deletes', value: `${config.max_channel_deletes} in ${config.time_window_seconds}s`, inline: true },
          { name: 'Max Role Deletes', value: `${config.max_role_deletes} in ${config.time_window_seconds}s`, inline: true },
          { name: 'Max Bans', value: `${config.max_bans} in ${config.time_window_seconds}s`, inline: true },
          { name: 'Whitelisted Users', value: config.whitelist_user_ids.length > 0 ? config.whitelist_user_ids.map(id => `<@${id}>`).join(', ') : 'None', inline: false },
          { name: 'Whitelisted Roles', value: config.whitelist_role_ids.length > 0 ? config.whitelist_role_ids.map(id => `<@&${id}>`).join(', ') : 'None', inline: false }
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subCmd === 'triggers') {
      const triggers = getAntiNukeTriggers(interaction.guild!.id, 10);

      if (triggers.length === 0) {
        return interaction.reply({ content: '✅ No anti-nuke triggers have been recorded.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('🚨 Recent Anti-Nuke Triggers')
        .setDescription(`Showing ${triggers.length} most recent trigger${triggers.length > 1 ? 's' : ''}`);

      for (const trigger of triggers) {
        const triggerDate = new Date(trigger.triggered_at!);
        embed.addFields({
          name: `<@${trigger.user_id}>`,
          value: `**Type:** ${trigger.trigger_type.replace('_', ' ')}\n**Actions:** ${trigger.actions_count}\n**Action Taken:** ${trigger.action_taken}\n**Date:** <t:${Math.floor(triggerDate.getTime() / 1000)}:R>`,
          inline: true
        });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subCmd === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const config = getAntiNukeConfig(interaction.guild!.id);

      if (!config) {
        return interaction.reply({ content: '❌ Please run `/antinuke setup` first.', ephemeral: true });
      }

      config.enabled = enabled;
      setAntiNukeConfig(config);

      return interaction.reply({ 
        content: `✅ Anti-nuke protection ${enabled ? 'enabled' : 'disabled'}.`, 
        ephemeral: true 
      });
    }
  }

  if (name === 'promotion') {
    if (!isOwnerId(interaction.user.id) && !adminOrBypass(interaction.member)) {
      return interaction.reply({ content: '❌ Only administrators can use this command.', ephemeral: true });
    }

    const {
      runPromotionCheck,
      getPendingPromotions,
      approvePromotion,
      denyPromotion
    } = await import('./services/promotionService');
    
    const { getPromotionStats } = await import('./services/promotionStats');

    const subCmd = interaction.options.getSubcommand();

    if (subCmd === 'check') {
      await interaction.deferReply({ ephemeral: true });
      
      try {
        await runPromotionCheck(client, interaction.guild!.id);
        return interaction.editReply({ content: '✅ Promotion check completed! Check pending promotions with `/promotion pending`.' });
      } catch (error) {
        console.error('[Promotion] Error running check:', error);
        return interaction.editReply({ content: `❌ Error running promotion check: ${error}` });
      }
    }

    if (subCmd === 'pending') {
      const pending = getPendingPromotions(interaction.guild!.id);

      if (pending.length === 0) {
        return interaction.reply({ content: '✅ No pending promotions.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🎯 Pending Promotions')
        .setDescription(`${pending.length} promotion${pending.length > 1 ? 's' : ''} awaiting approval`);

      for (const promo of pending) {
        embed.addFields({
          name: `<@${promo.user_id}> (ID: ${promo.id})`,
          value: `**From:** ${promo.from_role} → **To:** ${promo.to_role}\n**Tickets:** ${promo.tickets_resolved} | **Messages:** ${promo.messages_sent} | **Hours:** ${promo.hours_clocked}\n**Queued:** <t:${Math.floor(new Date(promo.queued_at).getTime() / 1000)}:R>`,
          inline: false
        });
      }

      embed.setFooter({ text: 'Use /promotion approve <id> or /promotion deny <id>' });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subCmd === 'approve') {
      const promotionId = interaction.options.getInteger('promotion_id', true);

      const result = await approvePromotion(client, interaction.guild!.id, promotionId, interaction.user.id);

      if (result.success) {
        return interaction.reply({ content: `✅ ${result.message}`, ephemeral: true });
      } else {
        return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
      }
    }

    if (subCmd === 'deny') {
      const promotionId = interaction.options.getInteger('promotion_id', true);

      const result = denyPromotion(promotionId, interaction.user.id);

      if (result.success) {
        return interaction.reply({ content: `✅ ${result.message}`, ephemeral: true });
      } else {
        return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
      }
    }

    if (subCmd === 'stats') {
      const user = interaction.options.getUser('user', true);
      const stats = getPromotionStats(interaction.guild!.id, user.id);

      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle(`🎯 Promotion Stats for ${user.tag}`)
        .addFields(
          { name: 'Tickets Resolved', value: stats.ticketsResolved.toString(), inline: true },
          { name: 'Messages Sent', value: stats.supportMessages.toString(), inline: true },
          { name: 'Hours Clocked In', value: stats.hoursClockedIn.toString(), inline: true }
        )
        .setFooter({ text: 'Criteria: Trial→Support: 20 tickets, 150 msgs, 12h | Support→Head: 45 tickets, 300 msgs, 25h' });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  if (name === 'announce') {
    if (!(await hasCommandAccess(interaction.member, 'announce', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const ch = interaction.options.getChannel('channel') ?? interaction.channel;
    const msg = interaction.options.getString('message', true)!;
    try {
      // @ts-ignore - Channel type union
      await (ch as any).send(msg);
      return interaction.reply({ content: 'Announcement sent.', ephemeral: true });
    } catch (err) {
      console.error('Failed to announce', err);
      return interaction.reply({ content: 'Failed to send announcement.', ephemeral: true });
    }
  }

  if (name === 'membercount') {
    if (!(await hasCommandAccess(interaction.member, 'membercount', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const role = interaction.options.getRole('role');
    try {
      if (!interaction.guild) return interaction.reply({ content: 'Guild-only command.', ephemeral: true });
      await interaction.guild.members.fetch();
      if (role) {
        const count = interaction.guild.members.cache.filter(m => (m.roles as any).cache.has(role.id)).size;
        return interaction.reply({ content: `Members with role ${role.name}: ${count}`, ephemeral: true });
      }
      return interaction.reply({ content: `Total members: ${interaction.guild.memberCount}`, ephemeral: true });
    } catch (err) {
      console.error('Failed to count members', err);
      return interaction.reply({ content: 'Failed to determine member count.', ephemeral: true });
    }
  }

  if (name === 'purge') {
    if (!(await hasCommandAccess(interaction.member, 'purge', interaction.guild?.id || null))) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    }
    const count = interaction.options.getInteger('count', true) ?? 0;
    if (count < 1 || count > 1000) return interaction.reply({ content: 'Count must be between 1 and 1000.', ephemeral: true });
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const ch = interaction.channel;
      if (!ch || !('bulkDelete' in ch)) return interaction.editReply({ content: 'This command must be used in a text channel.' });
      
      let totalDeleted = 0;
      let remaining = count;
      
      // Discord limits bulkDelete to 100 messages per call and messages must be < 14 days old
      while (remaining > 0) {
        const batchSize = Math.min(remaining, 100);
        try {
          // @ts-ignore
          const deleted = await (ch as any).bulkDelete(batchSize, true);
          const deletedCount = deleted.size ?? deleted;
          totalDeleted += deletedCount;
          remaining -= batchSize;
          
          // If we deleted fewer than requested, we've hit old messages or run out
          if (deletedCount < batchSize) {
            break;
          }
          
          // Small delay to avoid rate limits
          if (remaining > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (err) {
          console.error('Purge batch failed', err);
          break;
        }
      }
      
      return interaction.editReply({ content: `Deleted ${totalDeleted} messages.` });
    } catch (err) {
      console.error('Purge failed', err);
      return interaction.editReply({ content: 'Failed to purge messages. Messages older than 14 days cannot be bulk-deleted.' });
    }
  }

    if (name === "setdefaultmute") {
      // admin-only
      if (!(await hasCommandAccess(interaction.member, 'setdefaultmute', interaction.guild?.id || null))) {
        return interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
      }
      const durationStr = interaction.options.getString("duration", true);
      // parse duration string using util
      const { parseDurationToSeconds } = await import("./utils/parseDuration");
      const secs = parseDurationToSeconds(durationStr);
      if (!secs) return interaction.reply({ content: "Could not parse duration. Examples: 10m, 1h30m, 3600", ephemeral: true });
      const { setDefaultMuteSeconds } = await import("./config");
      setDefaultMuteSeconds(secs);
      return interaction.reply({ content: `Default mute duration updated to ${secs} seconds.`, ephemeral: true });
    }

    if (name === "getdefaultmute") {
      const { getDefaultMuteSeconds } = await import("./config");
      const secs = getDefaultMuteSeconds();
      // small formatter
      const human = formatSeconds(secs);
      return interaction.reply({ content: `Default mute duration: ${secs} seconds (${human}).`, flags: MessageFlags.Ephemeral });
    }

    // Moderation interactions
    if (name === "kick" || name === "ban" || name === "mute" || name === "addrole" || name === "removerole") {
      // Check command permissions system first
      let hasPermission = adminOrBypass(interaction.member);
      
      if (!hasPermission && interaction.guild) {
        try {
          const { hasCommandPermission } = await import('./services/commandPermissions');
          const member = interaction.member as any;
          const userRoles = member.roles?.cache ? Array.from(member.roles.cache.keys()) : (member.roles || []);
          hasPermission = hasCommandPermission(interaction.guild.id, userRoles, name);
        } catch (err) {
          console.error('Command permission check failed:', err);
        }
      }

      if (!hasPermission) {
        return interaction.reply({ content: "❌ You don't have permission to use this command. Contact an administrator if you believe this is an error.", ephemeral: true });
      }

      const target = interaction.options.getMember("user") as any;
      const reason = interaction.options.getString("reason") ?? undefined;

      if (!target) return interaction.reply({ content: "Member not found or not in this guild.", ephemeral: true });

      if (name === "kick") {
        try {
          const finalReason = reason ?? 'No reason provided';
          const embed = buildModerationEmbed({
            action: 'Kicked',
            guildName: interaction.guild?.name ?? 'a server',
            targetId: target.id,
            targetTag: target.user.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: finalReason
          });
          try { await target.user.send({ content: `<@${target.id}>`, embeds: [embed] }); } catch { /* ignore */ }
          await target.kick(finalReason);
          await sendToModLog(interaction.guild!, embed, `<@${target.id}>`);
          
          // Create case
          if (interaction.guild) {
            const { createCase } = await import('./services/cases');
            const caseNum = createCase(interaction.guild.id, target.id, interaction.user.id, 'kick', finalReason);
            return interaction.reply({ content: `${target.user.tag} was kicked. Reason: ${reason ?? 'None'} (Case #${caseNum})` });
          }
          return interaction.reply({ content: `${target.user.tag} was kicked. Reason: ${reason ?? 'None'}` });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: "Failed to kick member. Check bot permissions.", ephemeral: true });
        }
      }

      if (name === "ban") {
        try {
          const finalReason = reason ?? 'No reason provided';
          const embed = buildModerationEmbed({
            action: 'Banned',
            guildName: interaction.guild?.name ?? 'a server',
            targetId: target.id,
            targetTag: target.user.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: finalReason
          });
          try { await target.user.send({ content: `<@${target.id}>`, embeds: [embed] }); } catch { /* ignore */ }
          await target.ban({ reason: finalReason });
          await sendToModLog(interaction.guild!, embed, `<@${target.id}>`);
          
          // Create case
          if (interaction.guild) {
            const { createCase } = await import('./services/cases');
            const caseNum = createCase(interaction.guild.id, target.id, interaction.user.id, 'ban', finalReason);
            return interaction.reply({ content: `${target.user.tag} was banned. Reason: ${reason ?? 'None'} (Case #${caseNum})` });
          }
          return interaction.reply({ content: `${target.user.tag} was banned. Reason: ${reason ?? 'None'}` });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: "Failed to ban member. Check bot permissions.", ephemeral: true });
        }
      }

      if (name === "mute") {
        try {
          const durationStr = interaction.options.getString("duration") ?? undefined;
          const { parseDurationToSeconds } = await import("./utils/parseDuration");
          const { getDefaultMuteSeconds } = await import("./config");
          let secs = durationStr ? parseDurationToSeconds(durationStr) : undefined;
          if (!secs || secs <= 0) secs = getDefaultMuteSeconds();
          const ms = secs * 1000;

          const finalReason = reason ?? 'No reason provided';
          const embed = buildModerationEmbed({
            action: 'Muted',
            guildName: interaction.guild?.name ?? 'a server',
            targetId: target.id,
            targetTag: target.user.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: finalReason,
            durationSeconds: secs
          });
          try { await target.user.send({ content: `<@${target.id}>`, embeds: [embed] }); } catch { /* ignore */ }
          await target.timeout(ms, reason ?? 'No reason provided');
          await sendToModLog(interaction.guild!, embed, `<@${target.id}>`);
          
          // Create case
          if (interaction.guild) {
            const { createCase } = await import('./services/cases');
            const caseNum = createCase(interaction.guild.id, target.id, interaction.user.id, 'mute', finalReason, Math.floor(secs / 60));
            return interaction.reply({ content: `${target.user.tag} was timed out for ${ms/1000}s.` + (reason ? ` Reason: ${reason}` : '') + ` (Case #${caseNum})` });
          }
          return interaction.reply({ content: `${target.user.tag} was timed out for ${ms/1000}s.` + (reason ? ` Reason: ${reason}` : '') });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: "Failed to timeout member. Check bot permissions.", ephemeral: true });
        }
      }

      if (name === "addrole" || name === "removerole") {
        const role = interaction.options.getRole("role");
        if (!role) return interaction.reply({ content: "Role not found.", ephemeral: true });
        try {
          if (name === "addrole") await target.roles.add(role);
          else await target.roles.remove(role);
          return interaction.reply({ content: `${role.name} ${name === 'addrole' ? 'added to' : 'removed from'} ${target.user.tag}` });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: "Failed to modify roles. Check bot permissions and role hierarchy.", ephemeral: true });
        }
      }
    }
  } catch (err) {
    console.error("Interaction handler error:", err);
  }
});

// Utility: format seconds to human (e.g. 1h30m)
function formatSeconds(total: number) {
  const days = Math.floor(total / 86400);
  total %= 86400;
  const hours = Math.floor(total / 3600);
  total %= 3600;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds) parts.push(`${seconds}s`);
  return parts.length ? parts.join("") : "0s";
}

// Giveaway reaction handler
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  
  try {
    // Fetch partial reactions/messages
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    
    // Check if reaction is 🎉 on a giveaway message
    if (reaction.emoji.name !== '🎉') return;
    
    const giveaways = getActiveGiveaways();
    const giveaway = giveaways.find(g => g.messageId === reaction.message.id);
    
    if (!giveaway || giveaway.status !== 'active') return;
    
    const guildId = reaction.message.guild?.id;
    
    // Check blacklist only (removed whitelist requirement so anyone can join)
    if (!isOwnerId(user.id)) {
      if (isBlacklisted(user.id, 'user', guildId)) {
        try {
          await user.send("You are blacklisted and cannot enter giveaways.");
        } catch { /* ignore */ }
        await reaction.users.remove(user.id);
        return;
      }
      
      const member = await reaction.message.guild?.members.fetch(user.id);
      if (member) {
        const roles = member.roles.cache ? Array.from(member.roles.cache.keys()) : [];
        for (const r of roles) {
          if (isBlacklisted(String(r), 'role', guildId)) {
            try {
              await user.send("You are blacklisted and cannot enter giveaways.");
            } catch { /* ignore */ }
            await reaction.users.remove(user.id);
            return;
          }
        }
        
        // Check requirements (role/message/invite requirements if set)
        if (giveaway.requirements.requiredRoles && giveaway.requirements.requiredRoles.length > 0) {
          const hasRole = giveaway.requirements.requiredRoles.some(roleId => roles.includes(roleId));
          if (!hasRole) {
            try {
              await user.send(`You don't meet the role requirements for this giveaway.`);
            } catch { /* ignore */ }
            await reaction.users.remove(user.id);
            return;
          }
        }
        
        // Note: minMessages and minInvites would require tracking those stats separately
        // For now, we'll just add the entry if requirements are met
      }
    }
    
    // Add entry
    const added = addGiveawayEntry(giveaway.id, user.id);
    if (added) {
      console.log(`User ${user.id} entered giveaway ${giveaway.id}`);
    }
  } catch (err) {
    console.error('Error handling giveaway reaction:', err);
  }
});

client.on("messageCreate", async (message: Message) => {
  console.log(`[MessageCreate] ====== NEW MESSAGE ${message.id} from ${message.author.username}: "${message.content?.substring(0, 50)}" ======`);
  console.log(`[MessageCreate] Channel type: ${message.channel.type}, Is DM: ${message.channel.type === ChannelType.DM}, Attachments: ${message.attachments.size}`);
  if (message.author.bot) return;

  // Track message activity and award points for milestones (every 100 messages)
  if (message.guild) {
    // Update ticket last message timestamp if this is a ticket channel
    try {
      const { getTicket, updateTicketLastMessage } = await import('./services/tickets');
      const ticket = getTicket(message.channel.id);
      if (ticket && ticket.user_id === message.author.id && ticket.status !== 'closed') {
        updateTicketLastMessage(message.channel.id);
        
        // Check for auto-responses when ticket owner sends a message
        try {
          const { findMatchingAutoResponse } = await import('./services/tickets');
          const autoResponse = findMatchingAutoResponse(message.guild!.id, message.content, ticket.category);
          
          if (autoResponse) {
            await message.reply({
              content: `🤖 **Auto-Response:**\n\n${autoResponse.response_message}`,
              allowedMentions: { repliedUser: false }
            });
            console.log(`[AutoResponse] Sent auto-response ${autoResponse.id} in ticket #${ticket.id}`);
          }
        } catch (err) {
          console.error('[AutoResponse] Failed to check/send auto-response:', err);
        }
      }
    } catch (err) {
      console.error('[Tickets] Failed to update last message timestamp:', err);
    }
    
    // Track staff activity for auto-demotion system
    try {
      const { getStaffActivityConfig, updateStaffActivity } = await import('./services/staffActivity');
      const config = getStaffActivityConfig(message.guild.id);
      
      if (config && config.enabled) {
        const member = message.member;
        if (member) {
          // Check which staff role they have and update activity
          if (config.head_support_role_id && member.roles.cache.has(config.head_support_role_id)) {
            updateStaffActivity(message.guild.id, message.author.id, 'head_support');
          } else if (config.support_role_id && member.roles.cache.has(config.support_role_id)) {
            updateStaffActivity(message.guild.id, message.author.id, 'support');
          } else if (config.trial_support_role_id && member.roles.cache.has(config.trial_support_role_id)) {
            updateStaffActivity(message.guild.id, message.author.id, 'trial_support');
          }
        }
      }
    } catch (err) {
      console.error('[StaffActivity] Failed to update staff activity:', err);
    }
    
    try {
      const { trackMessageActivity } = await import('./services/rewards');
      const activityResult = trackMessageActivity(message.author.id, message.guild.id);
      
      // If user hit a milestone, celebrate!
      if (activityResult.milestone) {
        try {
          await message.react('🎉');
          await message.reply({
            content: `🎉 Congratulations! You've reached **${activityResult.milestone} messages** and earned **${activityResult.pointsAwarded} points**! Keep being active! 🪙`,
            allowedMentions: { repliedUser: true }
          });
        } catch (err) {
          console.error('[MessageActivity] Failed to celebrate milestone:', err);
        }
      }
      
      // Track welcomes - if message contains welcome keywords and mentions a user who joined recently
      if (message.mentions.users.size > 0) {
        const welcomeKeywords = ['welcome', 'hello', 'hi', 'hey', 'greetings', 'glad to have', 'nice to see'];
        const lowerContent = message.content.toLowerCase();
        const hasWelcomeKeyword = welcomeKeywords.some(kw => lowerContent.includes(kw));
        
        if (hasWelcomeKeyword) {
          try {
            const db = await import('./services/db').then(m => m.getDB());
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            
            // Check if any mentioned users joined recently
            for (const [userId, user] of message.mentions.users) {
              if (user.bot) continue;
              
              const recentJoin = db.prepare(`
                SELECT user_id FROM user_interactions
                WHERE user_id = ? AND guild_id = ? AND interaction_type = 'member_joined'
                  AND created_at > ?
                LIMIT 1
              `).get(userId, message.guild.id, fiveMinutesAgo);
              
              if (recentJoin) {
                // This is a welcome to a new member!
                const { trackWelcome } = await import('./services/rewards');
                trackWelcome(message.author.id, message.guild.id, userId);
                
                // Mark that this welcome was tracked
                db.prepare(`
                  INSERT OR IGNORE INTO user_interactions (user_id, guild_id, interaction_type, target_user_id, created_at)
                  VALUES (?, ?, 'welcomed_user', ?, ?)
                `).run(message.author.id, message.guild.id, userId, new Date().toISOString());
              }
            }
          } catch (err) {
            console.error('[WelcomeTracking] Error tracking welcome:', err);
          }
        }
      }
      
      // Track conversation starts - if someone starts a conversation by mentioning another user (not in a support channel)
      if (message.mentions.users.size > 0 && message.content.length > 20) {
        try {
          // Check if this is a new conversation (first message mentioning someone in the last hour)
          const db = await import('./services/db').then(m => m.getDB());
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          
          for (const [mentionedUserId, mentionedUser] of message.mentions.users) {
            if (mentionedUser.bot || mentionedUserId === message.author.id) continue;
            
            // Check if author has mentioned this user recently in this channel
            const recentMention = db.prepare(`
              SELECT id FROM user_interactions
              WHERE user_id = ? AND guild_id = ? AND interaction_type = 'conversation_start'
                AND target_user_id = ? AND created_at > ?
              LIMIT 1
            `).get(message.author.id, message.guild.id, mentionedUserId, oneHourAgo);
            
            if (!recentMention) {
              // New conversation!
              const { trackConversationStart } = await import('./services/rewards');
              trackConversationStart(message.author.id, message.guild.id);
              
              // Mark conversation as tracked
              db.prepare(`
                INSERT INTO user_interactions (user_id, guild_id, interaction_type, target_user_id, created_at)
                VALUES (?, ?, 'conversation_start', ?, ?)
              `).run(message.author.id, message.guild.id, mentionedUserId, new Date().toISOString());
              break; // Only track once per message
            }
          }
        } catch (err) {
          console.error('[ConversationTracking] Error tracking conversation:', err);
        }
      }
    } catch (err) {
      console.error('[MessageActivity] Error tracking message activity:', err);
    }
  }

  // Check for bot command triggers (e.g., HWID reset)
  try {
    const { detectBotCommandTrigger, triggerBotCommand, hasPermissionToTrigger } = await import('./services/botCommandTrigger');
    const triggerResult = detectBotCommandTrigger(message);
    
    if (triggerResult.shouldTrigger && triggerResult.commandKey && triggerResult.botName && triggerResult.command) {
      // Check if user has permission
      if (hasPermissionToTrigger(message, triggerResult.commandKey)) {
        await triggerBotCommand(message, triggerResult.botName, triggerResult.command);
        return; // Command triggered, stop processing
      } else {
        await message.reply('❌ You do not have permission to trigger this command.');
        return;
      }
    }
  } catch (err) {
    console.error('[BotCommandTrigger] Error checking for bot command triggers:', err);
  }

  // Handle replies to the bot's messages - if it responds, don't process further
  const handledByReplySystem = await handleReply(message);
  if (handledByReplySystem) {
    console.log(`[DEBUG] handleReply processed message, stopping further processing`);
    return; // Stop processing if the reply system handled it
  }

  // Debugging log for bot mention
  console.log(`[DEBUG] Message content: ${message.content}`);
  // Check if this is a direct mention (not a reply) - if so, let conversational handler deal with it
  if (client.user && message.mentions.has(client.user) && !message.reference?.messageId) {
    console.log(`[DEBUG] Bot mentioned (not a reply) by ${message.author.username} - will use conversational handler`);
  }

  // Auto-detect and save owner announcements
  if (isOwnerId(message.author.id) && message.guild) {
    try {
      const { autoDetectAnnouncement } = await import('./services/announcements');
      const hasEveryoneMention = message.content.includes('@everyone') || message.content.includes('@here');
      const hasRoleMention = message.mentions.roles.size > 0;
      const isLongMessage = message.content.length > 100;
      
      // Only auto-save if it's a significant announcement (has @everyone/@role and is substantial)
      if ((hasEveryoneMention || hasRoleMention) && isLongMessage) {
        const announcementId = autoDetectAnnouncement(
          message.guild.id,
          message.author.id,
          message.content,
          message.id,
          message.channel.id
        );
        
        if (announcementId) {
          console.log(`📢 Auto-saved owner announcement: ID ${announcementId}`);
        }
      }
    } catch (err) {
      console.error('Failed to auto-detect announcement:', err);
    }
  }

  // Respond to direct messages to the bot
  if (message.channel.type === ChannelType.DM) {
    console.log(`[DEBUG] Direct message received from ${message.author.username}`);
    
    // Check if user is asking to simplify a previous response
    const simplifyKeywords = ['simplify', 'simpler', 'shorter', 'brief', 'summarize', 'summary', 'tldr', 'short version', 'condense', 'quick'];
    const messageContent = message.content.toLowerCase();
    
    if (simplifyKeywords.some(kw => messageContent.includes(kw))) {
      try {
        let targetMessage = null;
        
        // First, check if they replied to a specific message
        if (message.reference?.messageId) {
          targetMessage = await message.channel.messages.fetch(message.reference.messageId);
        } else {
          // If not a reply, look for the most recent bot message
          const recentMessages = await message.channel.messages.fetch({ limit: 10 });
          targetMessage = recentMessages.find(msg => 
            msg.author.id === client.user?.id && 
            msg.content.length > 200 &&
            msg.createdTimestamp < message.createdTimestamp
          );
        }
        
        if (targetMessage && targetMessage.author.id === client.user?.id && targetMessage.content.length > 200) {
          await message.channel.sendTyping();
          
          const { generateReply } = await import('./services/openai');
          const simplifiedPrompt = `The user asked you to simplify this answer. Provide a much shorter, simpler version (2-3 sentences max) that gives just the key points:\n\n${targetMessage.content}`;
          
          const simplified = await generateReply(simplifiedPrompt);
          await message.reply(`📝 **Simplified Answer:**\n\n${simplified}`);
          return;
        }
      } catch (error) {
        console.error('[Simplify] Error:', error);
      }
    }
    
    // Check for homework help requests with images
    if (message.attachments.size > 0) {
      const imageAttachment = message.attachments.find(att => 
        att.contentType?.startsWith('image/') || 
        att.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
      );
      
      if (imageAttachment) {
        try {
          const { analyzeHomework, isHomeworkRelated } = await import('./services/homeworkHelper');
          
          // Check if the message content suggests homework help
          const messageContent = message.content.toLowerCase();
          const isLikelyHomework = isHomeworkRelated(messageContent) || 
                                   messageContent.includes('help') || 
                                   messageContent.length < 100; // Short message with image likely homework
          
          if (isLikelyHomework || messageContent.length === 0) {
            await message.channel.sendTyping();
            
            const result = await analyzeHomework(imageAttachment.url, message.content);
            
            // Split long responses into chunks (Discord has 2000 char limit)
            const chunks = [];
            let currentChunk = '';
            const lines = result.answer.split('\n');
            
            for (const line of lines) {
              if ((currentChunk + line + '\n').length > 1900) {
                chunks.push(currentChunk);
                currentChunk = line + '\n';
              } else {
                currentChunk += line + '\n';
              }
            }
            if (currentChunk) chunks.push(currentChunk);
            
            // Send response(s)
            for (let i = 0; i < chunks.length; i++) {
              if (i === 0) {
                await message.reply(chunks[i] + '\n\n*💡 Reply with "simplify" or "shorter" if you want a brief version!*');
              } else {
                await message.channel.send(chunks[i]);
              }
            }
            
            console.log(`[Homework Help] Analyzed image for ${message.author.username} - Subject: ${result.subject || 'Unknown'}`);
            return;
          }
        } catch (error: any) {
          console.error('[Homework Help] Error:', error);
          await message.reply('❌ Sorry, I had trouble analyzing that image. Make sure it\'s clear and try again, or describe your question in text!');
          return;
        }
      }
    }
    
    // Default DM response for non-homework messages
    await message.reply('Thank you for reaching out! How can I help you?\n\n💡 **Tip:** Send me a picture of your homework assignment and I\'ll help you solve it! Works for any subject - Math, Science, English, History, and more.');
    return;
  }

  // Command to toggle whitelist bypass (owner only)
  // Temporarily disable whitelist bypass logic for testing
  if (isOwnerId(message.author.id) && message.content.startsWith("!toggleWhitelistBypass")) {
    console.log("[DEBUG] whitelistBypassEnabled logic temporarily disabled for testing.");
    message.reply("Whitelist bypass logic is currently disabled for debugging purposes.");
    return;
  }

  // Anti-abuse detection
  try {
    // Skip anti-abuse checks for bot owner
    if (isOwnerId(message.author.id)) {
      // Owners bypass anti-abuse system
    } else {
      const { trackMessage, detectBypassAttempt, detectInappropriateContent, getWarnings, incrementWarning, shouldAutoMute, hasBypassRole, autoBlacklist } = await import('./services/antiAbuse');
      const guildId = message.guild?.id || '';
      
      // Check if user has bypass role (staff)
      const userRoles = message.member?.roles?.cache ? Array.from(message.member.roles.cache.keys()) : [];
      const hasStaffBypass = hasBypassRole(userRoles);
      
      // Staff bypass inappropriate content checks
      if (!hasStaffBypass) {
        // Check for inappropriate content first
        const isInappropriate = detectInappropriateContent(message.content);
        if (isInappropriate) {
          const reason = 'Inappropriate content detected';
          
          const newWarnings = incrementWarning(message.author.id, guildId, 'other', reason);
          const muteDuration = shouldAutoMute(message.author.id, guildId);
          
          if (muteDuration) {
            // Auto-mute user
            try {
              await message.member?.timeout(muteDuration * 1000, `Auto-mute: ${reason} (${newWarnings} warnings)`);
              
              // Log to mod channel
              try {
                const logChannel = getModLogChannelId();
                if (logChannel && message.guild) {
                  const channel = await message.guild.channels.fetch(logChannel);
                  if (channel?.isTextBased()) {
                    const duration = muteDuration < 60 ? `${muteDuration}s` : muteDuration < 3600 ? `${Math.round(muteDuration / 60)}min` : `${Math.round(muteDuration / 3600)}hr`;
                    await (channel as any).send(`� **Auto-Mute**\nUser: <@${message.author.id}> (${message.author.tag})\nReason: ${reason}\nWarnings: ${newWarnings}\nDuration: ${duration}\nMessage: "${message.content.slice(0, 100)}"`);
                  }
                }
              } catch (err) {
                console.error('Failed to log auto-mute:', err);
              }
            } catch (err) {
              console.error('Failed to auto-mute user:', err);
            }
            
            // Delete the inappropriate message
            try {
              await message.delete();
            } catch (err) {
              console.error('Failed to delete inappropriate message:', err);
            }
            return;
          }
          
          // Warn user (not muted yet)
          await message.reply(`⚠️ Warning: ${reason}. Please keep conversations appropriate. You will be muted after 3 warnings. (${newWarnings}/3 warnings)`);
          
          // Delete the inappropriate message
          try {
            await message.delete();
          } catch (err) {
            console.error('Failed to delete inappropriate message:', err);
          }
          return;
        }
      }
      
      const isBypass = detectBypassAttempt(message.author.id, message.content);
      
      // Check for bypass attempts (immediate warning)
      if (isBypass) {
        const reason = 'Permission bypass attempt (@everyone/@here)';
        
        const newWarnings = incrementWarning(message.author.id, guildId, 'bypass', reason);
        
        if (newWarnings >= 3) {
          // Auto-blacklist on 3rd bypass attempt
          autoBlacklist(message.author.id, guildId, reason);
          
          // Log to mod channel
          try {
            const logChannel = getModLogChannelId();
            if (logChannel && message.guild) {
              const channel = await message.guild.channels.fetch(logChannel);
              if (channel?.isTextBased()) {
                await (channel as any).send(`🚨 **Auto-Blacklist**\nUser: <@${message.author.id}> (${message.author.tag})\nReason: ${reason}\nWarnings: ${newWarnings}/3`);
              }
            }
          } catch (err) {
            console.error('Failed to log auto-blacklist:', err);
          }
          return;
        }
        
        await message.reply(`⚠️ Warning: ${reason}. Further abuse will result in automatic blacklist. (${newWarnings}/3 warnings)`);
        return;
      }
      
      // Track message and check for spam
      const isSpam = trackMessage(message.author.id);
      
      if (isSpam) {
        const warnings = getWarnings(message.author.id, guildId);
        const newWarnings = incrementWarning(message.author.id, guildId, 'spam', 'Spam detection (repeated messages)');
        
        // Immediately stop responding if spamming (don't let them continue)
        if (newWarnings >= 3) {
          // Auto-blacklist
          autoBlacklist(message.author.id, guildId, 'Spam detection (repeated messages)');
          
          // Log to mod channel
          try {
            const logChannel = getModLogChannelId();
            if (logChannel && message.guild) {
              const channel = await message.guild.channels.fetch(logChannel);
              if (channel?.isTextBased()) {
                await (channel as any).send(`🚨 **Auto-Blacklist**\nUser: <@${message.author.id}> (${message.author.tag})\nReason: Spam detection (repeated messages)\nWarnings: ${newWarnings}/3`);
              }
            }
          } catch (err) {
            console.error('Failed to log auto-blacklist:', err);
          }
          return;
        }
        
        // Warn and ignore message (don't respond)
        if (newWarnings < 3) {
          await message.reply(`⚠️ Warning: Spam detection (too many messages too quickly). Slow down or you will be automatically blacklisted. (${newWarnings}/3 warnings)`);
        }
        return; // Don't process spam messages
      }
    }
  } catch (err) {
    console.error('Anti-abuse check failed:', err);
  }

  // Auto-Moderation checks
  if (message.guild && !isOwnerId(message.author.id)) {
    try {
      const { checkAutoMod } = await import('./services/automod');
      const { createCase } = await import('./services/cases');
      const result = await checkAutoMod(message);
      
      if (result.violated && result.rule) {
        const rule = result.rule;
        
        // Execute action
        switch (rule.action) {
          case 'delete':
            try {
              await message.delete();
              if (message.channel.isTextBased()) {
                (message.channel as any).send(`⚠️ <@${message.author.id}> ${result.reason || 'Auto-mod violation'}`).then((msg: any) => {
                  setTimeout(() => msg.delete().catch(() => {}), 5000);
                }).catch(() => {});
              }
            } catch {}
            break;
            
          case 'warn':
            try {
              await message.delete();
              const { incrementWarning } = await import('./services/antiAbuse');
              incrementWarning(message.author.id, message.guild!.id, 'other', result.reason || 'Auto-mod violation');
              createCase(message.guild!.id, message.author.id, client.user!.id, 'warn', result.reason || 'Auto-mod violation');
              if (message.channel.isTextBased()) {
                (message.channel as any).send(`⚠️ <@${message.author.id}> has been warned: ${result.reason}`).then((msg: any) => {
                  setTimeout(() => msg.delete().catch(() => {}), 10000);
                }).catch(() => {});
              }
            } catch {}
            break;
            
          case 'mute':
            try {
              await message.delete();
              const duration = rule.mute_duration || 10;
              await message.member?.timeout(duration * 60 * 1000, result.reason || 'Auto-mod violation');
              createCase(message.guild!.id, message.author.id, client.user!.id, 'mute', result.reason || 'Auto-mod violation', duration);
              if (message.channel.isTextBased()) {
                (message.channel as any).send(`🔇 <@${message.author.id}> has been muted for ${duration} minutes: ${result.reason}`).then((msg: any) => {
                  setTimeout(() => msg.delete().catch(() => {}), 10000);
                }).catch(() => {});
              }
            } catch {}
            break;
            
          case 'kick':
            try {
              await message.delete();
              createCase(message.guild!.id, message.author.id, client.user!.id, 'kick', result.reason || 'Auto-mod violation');
              await message.member?.kick(result.reason || 'Auto-mod violation');
            } catch {}
            break;
        }
        
        // Log to mod channel
        try {
          const logChannel = getModLogChannelId();
          if (logChannel && message.guild) {
            const channel = await message.guild.channels.fetch(logChannel);
            if (channel?.isTextBased()) {
              await (channel as any).send(`🤖 **Auto-Mod Action**\nUser: <@${message.author.id}>\nRule: ${rule.rule_type}\nAction: ${rule.action}\nReason: ${result.reason}`);
            }
          }
        } catch {}
        
        return; // Don't process further
      }
    } catch (err) {
      console.error('Auto-mod check failed:', err);
    }
  }

  // Blacklist check first (overrides everything except owner)
  const userId = message.author.id;
  const guildId = message.guild?.id;
  
  if (!isOwnerId(userId)) {
    let blacklisted = isBlacklisted(userId, 'user', guildId);
    if (!blacklisted && message.member?.roles) {
      let roles: string[] = [];
      if (message.member.roles.cache) {
        roles = Array.from(message.member.roles.cache.keys());
      } else if (Array.isArray(message.member.roles)) {
        roles = message.member.roles.map((r: any) => typeof r === 'string' ? r : r.id);
      }
      for (const r of roles) {
        if (isBlacklisted(String(r), 'role', guildId)) {
          blacklisted = true;
          break;
        }
      }
    }
    if (blacklisted) {
      return; // silently ignore blacklisted users
    }
  }

  // Whitelist check: only respond to whitelisted users/roles
  let whitelisted = isWhitelisted(userId, 'user');
  if (!whitelisted && message.member?.roles) {
    let roles: string[] = [];
    if (message.member.roles.cache) {
      roles = Array.from(message.member.roles.cache.keys());
    } else if (Array.isArray(message.member.roles)) {
      roles = message.member.roles.map((r: any) => typeof r === 'string' ? r : r.id);
    }
    for (const r of roles) {
      if (isWhitelisted(String(r), 'role')) {
        whitelisted = true;
        break;
      }
    }
  }
  // Track activity for payroll system (must be after blacklist/whitelist checks)
  if (!message.author.bot && message.guild) {
    try {
      const { getActiveShift } = await import('./services/shifts');
      const { trackActivity, endAutoBreak, getActiveBreak } = await import('./services/payroll');
      
      const activeShift = getActiveShift(message.guild.id, message.author.id);
      if (activeShift) {
        // Check if user is on break - if so, end the break
        const activeBreak = getActiveBreak(activeShift.id);
        if (activeBreak) {
          endAutoBreak(activeShift.id);
          console.log(`📥 ${message.author.tag} returned from break (shift ${activeShift.id})`);
          
          // Update shift panels to show resumed status
          await updateShiftPanels(client, message.guild.id);
        }
        
        // Track activity for auto-break detection
        trackActivity(message.guild.id, message.author.id, activeShift.id);
      }
    } catch (err) {
      console.error('Payroll activity tracking failed:', err);
    }
  }
  
  // Decide if the message is trying to interact with the bot (prefix, wake word, or direct mention)
  // Accept both ! and . as command prefixes
  const tryingToUse = message.content.startsWith(prefix)
    || message.content.startsWith('.')
    || isWakeWord(message, wakeWord)
    || (!!message.mentions && !!message.mentions.users?.has(client.user?.id || ''));
  
  // Process message with enhanced features (sentiment, patterns, etc.)
  try {
    if (!message.author.bot && message.guild) {
        // Track specific interactions for achievements
        const db = await import('./services/db').then(m => m.getDB());
      
        // Track welcome messages
        if (message.content.toLowerCase().includes('welcome') && message.mentions.users.size > 0) {
          try {
            db.prepare(`
              INSERT INTO user_interactions (user_id, guild_id, interaction_type, target_user_id, created_at)
              VALUES (?, ?, 'welcomed_user', ?, ?)
            `).run(message.author.id, message.guild.id, Array.from(message.mentions.users.keys())[0], new Date().toISOString());
          } catch (e) { /* ignore */ }
        }
      
        // Track conversation starters (we'll mark this if the message later gets a reply)
        // For now, store message IDs to check later
      
      const enhancedData = await processMessageWithEnhancedFeatures(message);
      
      // Check if we should celebrate a user achievement
      if (enhancedData.celebration.celebrate) {
        // Could send a celebration message here
        console.log(`🎉 Celebration detected for ${message.author.tag}: ${enhancedData.celebration.achievementType}`);
      }
      
      // Check for new achievements
      if (enhancedData.achievements.length > 0) {
        console.log(`🏆 New achievements for ${message.author.tag}:`, enhancedData.achievements);
        // Could notify user of new achievements here
      }
      
      // Log if escalation is needed
      if (enhancedData.shouldEscalate) {
        console.log(`⚠️ User ${message.author.tag} may need escalation (high frustration detected)`);
      }
      
      // If auto-response available and confidence is high, could auto-reply here
      if (enhancedData.autoResponse?.suggested && enhancedData.autoResponse.confidence > 0.8) {
        console.log(`💡 High-confidence auto-response available for ${message.author.tag}`);
      }
    }
  } catch (err) {
    console.error('Enhanced features processing error:', err);
  }
  
  // Global support interception before whitelist early return
  try {
    if (message.guild) {
      const { isSupportInterceptEnabled } = await import('./services/supportIntercept');
      const enabled = isSupportInterceptEnabled(message.guild.id);
      if (enabled) {
        const text = (message.content || '').toLowerCase();
        const supportRe = /\b(who(?:'s| is| are)?\s+(?:the\s+)?support|support\s+team|who\s+are\s+staff(?:\s+support)?|who\s+are\s+(?:head\s+)?support)\b/;
        if (supportRe.test(text)) {
          try {
            const { listSupportMembers } = await import('./services/supportRoles');
            const { isFounderUser, isFounderMember } = await import('./services/founders');
            const listsRaw = await listSupportMembers(message.guild);
            // Highest-role grouping: Head > Support > Trial
            const assigned = new Set<string>();
            // Filter out founders from support lists
            const isFounderMemberLocal = (gm: any) => isFounderMember(gm);
            const headOnly = listsRaw.head.filter((m:any) => { if (isFounderMemberLocal(m) || assigned.has(m.id)) return false; assigned.add(m.id); return true; });
            const supportOnly = listsRaw.support.filter((m:any) => { if (isFounderMemberLocal(m) || assigned.has(m.id)) return false; assigned.add(m.id); return true; });
            const trialOnly = listsRaw.trial.filter((m:any) => { if (isFounderMemberLocal(m) || assigned.has(m.id)) return false; assigned.add(m.id); return true; });
            const lists = { head: headOnly, support: supportOnly, trial: trialOnly } as const;
            const formatList = (arr: any[]) => {
              if (!arr.length) return 'None';
              const shown = arr.slice(0, 25);
              const text = shown.map((m:any) => `<@${m.id}>`).join(', ');
              return text + (arr.length > 25 ? ` …(+${arr.length-25})` : '');
            };
            const allMembersFiltered = ([] as any[]).concat(lists.head, lists.support, lists.trial);
            const isRequesterSupport = allMembersFiltered.some((m:any) => m.id === message.author.id);
            const isFounder = isFounderUser(message.guild!, message.author.id, message.member as any);
            const header = isFounder ? `You're one of the founders. Here’s the team:` : (isRequesterSupport ? `You’re part of Support. Here’s the team:` : `Support team:`);
            const lines = [
              header,
              `Founders: PobKC, Joycemember`,
              `Head Support: ${formatList(lists.head)}`,
              `Support: ${formatList(lists.support)}`,
              `Trial Support: ${formatList(lists.trial)}`
            ].join('\n');
            const mentionedIds = new Set<string>();
            for (const arr of [lists.head, lists.support, lists.trial]) {
              for (const m of arr.slice(0,25)) {
                if (m.id !== message.author.id) mentionedIds.add(m.id);
              }
            }
            await message.reply({ content: lines, allowedMentions: { users: Array.from(mentionedIds),  } as any });
            return;
          } catch (e) {
            console.warn('Global support intercept failed to assemble list:', (e as any)?.message ?? e);
          }
        }
      }
    }
    } catch (e) {
    console.warn('Global support intercept check failed:', String(e || 'Unknown error'));
  }
  if (!whitelisted && !isOwnerId(userId)) {
    if (tryingToUse) {
      try {
        await message.reply("My owner hasn't whitelisted you. You can either pay to use my services or buy Synapse script to use my commands and have a conversation for free.");
      } catch (e) { /* ignore */ }
    }
    return;
  }

  // helper for prefix-based admin or bypass checks
  const isAdminOrBypassForMessage = (member: any) => {
    try {
      if (!member) return false;
      if (member.permissions && member.permissions.has && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
      if (bypass.isUserBypassed(message.author.id)) return true;
      const roles = member.roles?.cache ? Array.from(member.roles.cache.keys()) : (member.roles || []);
      for (const r of roles) {
        if (bypass.isRoleBypassed(String(r))) return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  };

  // Prefix commands
  // Accept both ! and . as command prefixes
  if (message.content.startsWith(prefix) || message.content.startsWith('.')) {
    const usedPrefix = message.content.startsWith('.') ? '.' : prefix;
    const args = message.content.slice(usedPrefix.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();

    // Ignore if just the prefix alone or multiple dots/punctuation with no actual command
    if (!command || command === '' || /^[.\s!]+$/.test(command)) return;

    if (command === "help") return helpCommand(message, prefix);
    if (command === "ping") return message.reply(`Pong! ${Date.now() - message.createdTimestamp}ms`);
    if (command === "pong") return message.reply(`Pong! ${Date.now() - message.createdTimestamp}ms`);
    
    if (command === "joke") {
      const joke = getRandomJoke();
      if (joke.setup) {
        return message.reply(`${joke.setup}\n\n||${joke.punchline}||`);
      }
      return message.reply(joke.punchline);
    }
    
    if (command === "dadjoke") {
      const joke = getRandomJoke('dad-joke');
      if (joke.setup) {
        return message.reply(`${joke.setup}\n\n||${joke.punchline}||`);
      }
      return message.reply(joke.punchline);
    }

    if (command === "setdefaultmute") {
      // admin-only prefix command to update default mute duration
      if (!isAdminOrBypassForMessage(message.member)) return message.reply("You are not authorized to use this feature.");
      const arg = args[0];
      if (!arg) return message.reply("Please provide a duration (e.g. 10m, 1h30m, or seconds).");
      const { parseDurationToSeconds } = await import("./utils/parseDuration");
      const secs = parseDurationToSeconds(arg);
      if (!secs) return message.reply("Could not parse duration. Examples: 10m, 1h30m, 3600");
      const { setDefaultMuteSeconds } = await import("./config");
      setDefaultMuteSeconds(secs);
      return message.reply(`Default mute duration updated to ${secs} seconds.`);
    }
    if (command === "getdefaultmute") {
      const { getDefaultMuteSeconds } = await import("./config");
      const secs = getDefaultMuteSeconds();
      const human = formatSeconds(secs);
      return message.reply(`Default mute duration: ${secs} seconds (${human}).`);
    }

    // Moderation commands: expect mentions for user and role
    if (["kick", "ban", "mute", "addrole", "removerole"].includes(command)) {
      // Check command permissions system first
      let hasPermission = isAdminOrBypassForMessage(message.member);
      
      if (!hasPermission && message.guild) {
        try {
          const { hasCommandPermission } = await import('./services/commandPermissions');
          const member = message.member;
          const userRoles = member?.roles?.cache ? Array.from(member.roles.cache.keys()) : [];
          hasPermission = hasCommandPermission(message.guild.id, userRoles, command);
        } catch (err) {
          console.error('Command permission check failed:', err);
        }
      }

      if (!hasPermission) {
        return message.reply("❌ You don't have permission to use this command.");
      }
      
      const mentioned = message.mentions.members?.first() ?? null;
      const mentionedRole = message.mentions.roles?.first() ?? null;

      if (command === "kick") {
        // Filter out the mention from args to get just the reason
        const reason = args.filter(arg => !arg.startsWith('<@')).join(" ").trim();
        return kickCommand(message, mentioned, reason || undefined);
      }
      if (command === "ban") return banCommand(message, mentioned, args.join(" "));
      if (command === "mute") {
        // Parse mute arguments: optional duration (supports 20s, 10m, 1h, or seconds) followed by optional reason.
        const cleaned = args.filter(a => !a.startsWith('<@'));
        let duration: number | undefined;
        let reason: string | undefined;
        if (cleaned.length > 0) {
          const { parseDurationToSeconds } = await import("./utils/parseDuration");
          const secs = parseDurationToSeconds(cleaned[0]);
          if (secs && secs > 0) {
            duration = secs;
            reason = cleaned.slice(1).join(" ").trim() || undefined;
          } else {
            // no parseable duration provided -> all remaining args are reason
            duration = undefined;
            reason = cleaned.join(" ").trim() || undefined;
          }
        }
        return muteCommand(message, mentioned, duration, reason);
      }
      if (command === "addrole") return addRoleCommand(message, mentioned, mentionedRole);
      if (command === "removerole") return removeRoleCommand(message, mentioned, mentionedRole);
    }

    // Prefix alias: addbypass / removebypass / listbypass
    if (command === 'addbypass' || command === 'removebypass' || command === 'listbypass') {
      // Only true administrators or the configured owner may manage bypass entries
      if (!(message.member?.permissions.has(PermissionsBitField.Flags.Administrator) || isOwnerId(message.author.id))) return message.reply('You are not authorized to use this feature.');
      if (command === 'listbypass') {
        const items = bypass.list();
        if (!items.length) return message.reply('No bypass entries configured.');
        const out = items.map(i => `${i.type}:${i.id} addedBy=${i.addedBy ?? 'unknown'}`).join('\n').slice(0, 1900);
        return message.reply(`Bypass entries:\n${out}`);
      }
      // add/remove expect: type id
      const typ = args[0]?.toLowerCase();
      let idRaw = args[1] ?? '';
      if (!typ || !idRaw) return message.reply('Usage: ' + prefix + command + ' <user|role> <id or mention>');
      idRaw = idRaw.replace(/[<@&!>]/g, '');
      if (!['user','role'].includes(typ)) return message.reply('Type must be user or role.');
      if (command === 'addbypass') {
        const entry = bypass.add(typ as any, idRaw, message.author.id);
        if (!entry) return message.reply('Entry already exists.');
        return message.reply(`Bypass entry added: ${typ} ${idRaw}`);
      }
      if (command === 'removebypass') {
        const ok = bypass.remove(typ as any, idRaw);
        return message.reply(ok ? `Removed bypass ${typ} ${idRaw}` : 'Bypass entry not found');
      }
    }

    // Prefix alias: announce
    if (command === 'announce') {
      if (!isAdminOrBypassForMessage(message.member) && !isOwnerId(message.author.id)) return message.reply('You are not authorized to use this feature.');
      const maybeChannel = message.mentions.channels?.first();
      const msg = args.join(' ').trim();
      if (!msg) return message.reply('Usage: ' + prefix + 'announce <message> [#channel]');
      try {
        const ch = maybeChannel ?? message.channel;
        // @ts-ignore
        await (ch as any).send(msg);
        return message.reply('Announcement sent.');
      } catch (err) {
        console.error('Failed to announce (prefix)', err);
        return message.reply('Failed to send announcement.');
      }
    }

    // Prefix alias: membercount
    if (command === 'membercount') {
      if (!isAdminOrBypassForMessage(message.member) && !isOwnerId(message.author.id)) return message.reply('You are not authorized to use this feature.');
      const role = message.mentions.roles?.first();
      try {
        if (!message.guild) return message.reply('Guild-only command.');
        await message.guild.members.fetch();
        if (role) {
          const count = message.guild.members.cache.filter(m => (m.roles as any).cache.has(role.id)).size;
          return message.reply(`Members with role ${role.name}: ${count}`);
        }
        return message.reply(`Total members: ${message.guild.memberCount}`);
      } catch (err) {
        console.error('Failed to count members (prefix)', err);
        return message.reply('Failed to determine member count.');
      }
    }

    // Prefix alias: purge
    if (command === 'purge') {
      if (!isAdminOrBypassForMessage(message.member) && !isOwnerId(message.author.id)) return message.reply('You are not authorized to use this feature.');
      const count = Number(args[0]) || 0;
      if (count < 1 || count > 1000) return message.reply('Count must be between 1 and 1000.');
      try {
        // Handle large purges with batching like the slash command
        let totalDeleted = 0;
        let remaining = count;
        
        while (remaining > 0) {
          const batchSize = Math.min(remaining, 100);
          try {
            // @ts-ignore
            const deleted = await (message.channel as any).bulkDelete(batchSize, true);
            const deletedCount = deleted.size ?? deleted;
            totalDeleted += deletedCount;
            remaining -= batchSize;
            
            if (deletedCount < batchSize) {
              break;
            }
            
            if (remaining > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (err) {
            console.error('Purge batch failed (prefix)', err);
            break;
          }
        }
        
        return message.reply(`Deleted ${totalDeleted} messages.`);
      } catch (err) {
        console.error('Purge failed (prefix)', err);
        return message.reply('Failed to purge messages. Messages older than 14 days cannot be bulk-deleted.');
      }
    }

    // Prefix alias: unmute
    if (command === 'unmute') {
      // Align permission logic with other moderation prefix commands (kick/ban/mute)
      let hasPermission = isAdminOrBypassForMessage(message.member) || isOwnerId(message.author.id);
      if (!hasPermission && message.guild) {
        try {
          const { hasCommandPermission } = await import('./services/commandPermissions');
          const member = message.member;
          const userRoles = member?.roles?.cache ? Array.from(member.roles.cache.keys()) : [];
          hasPermission = hasCommandPermission(message.guild.id, userRoles, 'unmute');
        } catch (err) {
          console.error('Command permission check (prefix unmute) failed:', err);
        }
      }
      if (!hasPermission) return message.reply('You are not authorized to use this feature.');
      const target = message.mentions.members?.first();
      if (!target) return message.reply('Please mention a member to unmute.');
      try {
        await (target as any).timeout(null);
        return message.reply(`${target.user.tag} has been unmuted.`);
      } catch (err) {
        console.error('Failed to unmute (prefix)', err);
        return message.reply('Failed to unmute member.');
      }
    }

    // Prefix alias: warn / checkwarn / clearwarn
    if (command === 'warn') {
      if (!isAdminOrBypassForMessage(message.member)) return message.reply('You are not authorized to use this feature.');
      const target = message.mentions.users?.first();
      const reason = args.filter(a => !a.startsWith('<@')).slice(1).join(' ') || 'No reason provided';
      if (!target) return message.reply('Please mention a user to warn.');
      const embed = buildModerationEmbed({
        action: 'Warned',
        guildName: message.guild?.name ?? 'a server',
        targetId: target.id,
        targetTag: target.tag,
        moderatorId: message.author.id,
        moderatorTag: message.author.tag,
        reason
      });
      try { await target.send({ content: `<@${target.id}>`, embeds: [embed] }); } catch (e) { /* ignore */ }
      await sendToModLog(message.guild!, embed, `<@${target.id}>`);
      warnings.addWarning(target.id, message.author.id, reason);
      return message.reply(`Warned ${target.tag}`);
    }

    if (command === 'checkwarn' || command === 'warnings' || command === 'checkwarnings' || command === 'warns') {
      if (!isAdminOrBypassForMessage(message.member)) return message.reply('You are not authorized to use this feature.');
      const target = message.mentions.users?.first();
      if (!target || !message.guild) return message.reply('Please mention a user to check warnings for.');
      
      try {
        const { getWarningDetails } = await import('./services/antiAbuse');
        const details = getWarningDetails(target.id, message.guild.id);
        
        const warningEmbed = new EmbedBuilder()
          .setTitle(`⚠️ Warnings for ${target.tag}`)
          .setColor(details.total === 0 ? 0x00FF00 : details.total >= 3 ? 0xFF0000 : 0xFFAA00)
          .addFields(
            { name: 'Total Warnings', value: `${details.total}`, inline: true },
            { name: 'Spam Warnings', value: `${details.spam}`, inline: true },
            { name: 'Bypass Warnings', value: `${details.bypass}`, inline: true },
            { name: 'Inappropriate Content', value: `${details.inappropriate}`, inline: true }
          );

        if (details.lastWarning) {
          const lastWarnDate = new Date(details.lastWarning);
          warningEmbed.addFields({ 
            name: 'Last Warning', 
            value: `<t:${Math.floor(lastWarnDate.getTime() / 1000)}:R>`, 
            inline: false 
          });
        }

        if (details.inappropriate >= 3) {
          const muteAfter = details.inappropriate - 2;
          const muteDuration = muteAfter === 1 ? '10 minutes' : 
                              muteAfter === 2 ? '30 minutes' : 
                              muteAfter === 3 ? '1 hour' : 
                              '24 hours';
          warningEmbed.addFields({
            name: '⏰ Next Action',
            value: `Next inappropriate content will result in **${muteDuration} mute**`,
            inline: false
          });
        } else if (details.spam >= 3 || details.bypass >= 3) {
          warningEmbed.addFields({
            name: '🚫 Status',
            value: 'User should be blacklisted (3+ warnings)',
            inline: false
          });
        } else if (details.total > 0) {
          warningEmbed.addFields({
            name: '📋 Status',
            value: `${3 - details.total} more warning(s) until action taken`,
            inline: false
          });
        }

        return message.reply({ embeds: [warningEmbed] });
      } catch (err) {
        console.error('Failed to check warnings:', err);
        return message.reply('Failed to retrieve warning information.');
      }
    }

    if (command === 'clearwarn') {
      if (!isAdminOrBypassForMessage(message.member)) return message.reply('You are not authorized to use this feature.');
      const target = message.mentions.users?.first();
      if (!target) return message.reply('Please mention a user to clear warnings for.');
      const removed = warnings.clearWarningsFor(target.id);
      return message.reply(`Cleared ${removed} warnings for ${target.tag}`);
    }

    return message.reply("Unknown command. Use `" + prefix + "help` to see available commands.");
  }

  // Wake word or mention -> conversational reply
  try {
    // If this is a reply to the bot's message, handleReply already processed it above
    if (message.reference?.messageId && handledByReplySystem) {
      console.log(`[DEBUG] Skipping wake word check - reply was already handled by handleReply`);
      return; // Already handled, don't process again to avoid double responses
    }
    
    if (isWakeWord(message, wakeWord)) {
      console.log(`[DEBUG] Wake word detected, processing conversational reply`);
      // Intercept common "support" queries to list staff by roles
      const text = (message.content || '').toLowerCase();
      const supportRe = /\b(who(?:'s| is| are)?\s+(?:the\s+)?support|support\s+team|who\s+are\s+staff(?:\s+support)?|who\s+are\s+(?:head\s+)?support)\b/;
      if (supportRe.test(text) && message.guild) {
        try {
          const { listSupportMembers } = await import('./services/supportRoles');
          const { isFounderUser, isFounderMember } = await import('./services/founders');
          const listsRaw = await listSupportMembers(message.guild);
          // Highest-role grouping: Head > Support > Trial
          const assigned = new Set<string>();
          // Filter out founders from support lists
          const isFounderMemberLocal = (gm: any) => isFounderMember(gm as any);
          const headOnly = listsRaw.head.filter((m:any) => { if (isFounderMemberLocal(m) || assigned.has(m.id)) return false; assigned.add(m.id); return true; });
          const supportOnly = listsRaw.support.filter((m:any) => { if (isFounderMemberLocal(m) || assigned.has(m.id)) return false; assigned.add(m.id); return true; });
          const trialOnly = listsRaw.trial.filter((m:any) => { if (isFounderMemberLocal(m) || assigned.has(m.id)) return false; assigned.add(m.id); return true; });
          const lists = { head: headOnly, support: supportOnly, trial: trialOnly } as const;
          const formatList = (arr: any[]) => {
            if (!arr.length) return 'None';
            const shown = arr.slice(0, 25);
            const text = shown.map((m:any) => `<@${m.id}>`).join(', ');
            return text + (arr.length > 25 ? ` …(+${arr.length-25})` : '');
          };
          const allMembersFiltered = ([] as any[]).concat(lists.head, lists.support, lists.trial);
          const isRequesterSupport = allMembersFiltered.some((m:any) => m.id === message.author.id);
          const isFounder = isFounderUser(message.guild!, message.author.id, message.member as any);
          const header = isFounder ? `You're one of the founders. Here’s the team:` : (isRequesterSupport ? `You’re part of Support. Here’s the team:` : `Support team:`);
          const lines = [
            header,
            `Founders: PobKC, Joycemember`,
            `Head Support: ${formatList(lists.head)}`,
            `Support: ${formatList(lists.support)}`,
            `Trial Support: ${formatList(lists.trial)}`
          ].join('\n');
          const mentionedIds = new Set<string>();
          for (const arr of [lists.head, lists.support, lists.trial]) {
            for (const m of arr.slice(0,25)) {
              if (m.id !== message.author.id) mentionedIds.add(m.id);
            }
          }
          await message.reply({ content: lines, allowedMentions: { users: Array.from(mentionedIds),  } as any });
          return;
        } catch (e) {
          console.warn('Failed to assemble support list:', (e as any)?.message ?? e);
        }
      }
      console.log(`[Wake word handler] About to call handleConversationalReply for message ${message.id}`);
      await handleConversationalReply(message);
      console.log(`[Wake word handler] handleConversationalReply completed for message ${message.id}`);
    }
  } catch (err) {
    console.error("Error handling conversational reply:", err);
  }

  // Check response rules (phrase/emoji/sticker) before conversational logic
  try {
    const content = message.content ?? '';
    // collect simple Unicode emojis present (regex won't catch custom server emojis)
    const emojiRegex = /(?:\p{Emoji_Presentation}|\p{Emoji}|[\u2600-\u27BF])/gu;
    const unicodeEmojis = Array.from((content.match(emojiRegex) || []));
    // extract custom emoji ids like <:name:123456> or <a:name:123456>
    const customEmojiIds: string[] = [];
    const customEmojiRegex = /<a?:\w+:(\d+)>/g;
    let m: RegExpExecArray | null;
    while ((m = customEmojiRegex.exec(content)) !== null) {
      customEmojiIds.push(m[1]);
    }
    const stickerIds = (message.stickers ?? []).map(s => s.id ?? '').filter(Boolean);
    const rule = responseRules.findMatchingRule(content, unicodeEmojis, customEmojiIds, stickerIds);
    if (rule) {
      // pick response based on detected language when available
      const detected = await LanguageHandler.detectLanguage(content || message.content || '');
      let replyRaw: string | undefined = undefined;
      if (rule.responsesPerLang && rule.responsesPerLang[detected]) replyRaw = rule.responsesPerLang[detected];
      if (!replyRaw && rule.response) replyRaw = rule.response;
      if (!replyRaw) return; // nothing to reply with
      if (replyRaw === '__IGNORE__') return; // silent ignore
      const replyText = replyRaw.replace('{username}', message.author.username);
      await message.reply(replyText);
      return;
    }
  } catch (err) {
    console.error('Error evaluating response rules:', err);
  }
});

// Button interactions (Games)
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isButton()) return;
    const id = interaction.customId || '';
    if (id.startsWith('rpsai:')) {
      const parts = id.split(':');
      const sessionId = parts[1];
      const move = (parts[2] || '').toLowerCase();
      if (!['rock','paper','scissors'].includes(move)) return interaction.reply({ content: 'Invalid move.', ephemeral: true });

      const { getRpsSession, handlePlayerMove, rpsEmoji, scoreLine, endRpsSession } = await import('./services/games/rpsAi');
      const { getTrashTalk } = await import('./services/games/trashTalk');
      const sess = getRpsSession(sessionId);
      if (!sess) return interaction.reply({ content: 'This match has expired.', ephemeral: true });
      if (interaction.user.id !== sess.userId) {
        return interaction.reply({ content: 'Only the challenger can play in this match.', ephemeral: true });
      }

      const result = handlePlayerMove(sessionId, move as any);
      if (!result) return interaction.reply({ content: 'Match not found.', ephemeral: true });

      const { session, aiMove, outcome, finished } = result;
      const talk = getTrashTalk({ outcome, difficulty: session.difficulty as any, playerName: interaction.user.username, playerMove: move, aiMove });

      const lastRound = `You ${rpsEmoji(move as any)} vs ${rpsEmoji(aiMove)} SynapseAI → ${outcome.toUpperCase()}`;
      const embed = new EmbedBuilder()
        .setTitle('Rock-Paper-Scissors vs SynapseAI')
        .setDescription(`${lastRound}\n${talk}`)
        .addFields(
          { name: 'Difficulty', value: String(session.difficulty).toUpperCase(), inline: true },
          { name: 'Mode', value: String(session.mode).toUpperCase(), inline: true },
          { name: 'Score', value: scoreLine(session), inline: false }
        )
        .setColor(finished ? (session.playerWins > session.aiWins ? 0x00D26A : 0xFF4D4F) : 0x00A8FF);

      const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`rpsai:${session.id}:rock`).setLabel('Rock').setStyle(ButtonStyle.Primary).setDisabled(finished),
        new ButtonBuilder().setCustomId(`rpsai:${session.id}:paper`).setLabel('Paper').setStyle(ButtonStyle.Primary).setDisabled(finished),
        new ButtonBuilder().setCustomId(`rpsai:${session.id}:scissors`).setLabel('Scissors').setStyle(ButtonStyle.Primary).setDisabled(finished),
      );

      if (finished) endRpsSession(session.id);
      await interaction.update({ embeds: [embed], components: [buttonsRow] });
      return;
    }

    if (id.startsWith('blackjack:')) {
      const parts = id.split(':');
      const sessionId = parts[1];
      const action = (parts[2] || '').toLowerCase();
      const { getBjSession, hitPlayer, standAndResolve, bjEmbedFields, bjTalkLine, endBjSession } = await import('./services/games/blackjack');
      const sess = getBjSession(sessionId);
      if (!sess) return interaction.reply({ content: 'This table has closed.', ephemeral: true });
      if (interaction.user.id !== sess.userId) return interaction.reply({ content: 'Only the player can act on this table.', ephemeral: true });

      if (action === 'hit') {
        const s = hitPlayer(sessionId);
        if (!s) return interaction.reply({ content: 'Cannot hit now.', ephemeral: true });
        const finished = s.finished;
        const embed = new EmbedBuilder()
          .setTitle('Blackjack vs SynapseAI')
          .setDescription(bjTalkLine(s, finished ? 'finish' : 'hit'))
          .addFields(bjEmbedFields(s, finished))
          .setColor(finished ? (s.outcome === 'win' ? 0x00D26A : s.outcome === 'lose' ? 0xFF4D4F : 0x00A8FF) : 0x2ecc71);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`blackjack:${s.id}:hit`).setLabel('Hit').setStyle(ButtonStyle.Primary).setDisabled(finished),
          new ButtonBuilder().setCustomId(`blackjack:${s.id}:stand`).setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(finished)
        );
        if (finished) endBjSession(s.id);
        await interaction.update({ embeds: [embed], components: [row] });
        return;
      }

      if (action === 'stand') {
        const s = standAndResolve(sessionId);
        if (!s) return interaction.reply({ content: 'Cannot stand now.', ephemeral: true });
        const embed = new EmbedBuilder()
          .setTitle('Blackjack vs SynapseAI')
          .setDescription(bjTalkLine(s, 'finish'))
          .addFields(bjEmbedFields(s, true))
          .setColor(s.outcome === 'win' ? 0x00D26A : s.outcome === 'lose' ? 0xFF4D4F : 0x00A8FF);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`blackjack:${s.id}:hit`).setLabel('Hit').setStyle(ButtonStyle.Primary).setDisabled(true),
          new ButtonBuilder().setCustomId(`blackjack:${s.id}:stand`).setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        endBjSession(s.id);
        await interaction.update({ embeds: [embed], components: [row] });
        return;
      }

      return interaction.reply({ content: 'Unknown action.', ephemeral: true });
    }

    // Work request buttons
    if (id.startsWith('work_request_')) {
      const userId = id.replace('work_request_', '');
      
      if (userId !== interaction.user.id) {
        return interaction.reply({ content: '❌ This is not your request.', ephemeral: true });
      }
      
      const { createWorkRequest } = await import('./services/scheduling');
      const today = new Date().toISOString().split('T')[0];
      const requestId = createWorkRequest(interaction.guild!.id, userId, today);
      
      // Notify owner
      const ownerIds = process.env.OWNER_IDS?.split(',') || [];
      
      for (const ownerId of ownerIds) {
        try {
          const owner = await client.users.fetch(ownerId.trim());
          const requestRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`approve_work_${requestId}`)
              .setLabel('✅ Approve')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`deny_work_${requestId}`)
              .setLabel('❌ Deny')
              .setStyle(ButtonStyle.Danger)
          );
          
          await owner.send({
            content: `📋 **Work Request from <@${userId}>**\n\n<@${userId}> is requesting permission to clock in and work today (${new Date().toLocaleDateString()}).\n\nThey are not scheduled for today. Do you want to approve this request?`,
            components: [requestRow]
          });
        } catch (err) {
          console.error(`Failed to notify owner ${ownerId}:`, err);
        }
      }
      
      await interaction.update({
        content: '✅ **Work request sent to the owner.**\n\nYou will receive a DM when they respond to your request.',
        components: []
      });
      return;
    }

    if (id === 'work_request_skip') {
      await interaction.update({
        content: '✅ No problem! You can clock in on your next scheduled day.',
        components: []
      });
      return;
    }

    // Owner response to work requests
    if (id.startsWith('approve_work_') || id.startsWith('deny_work_')) {
      const approved = id.startsWith('approve_work_');
      const requestId = parseInt(id.replace(approved ? 'approve_work_' : 'deny_work_', ''));
      
      const { respondToWorkRequest, getWorkRequest } = await import('./services/scheduling');
      const request = getWorkRequest(requestId);
      
      if (!request) {
        return interaction.reply({ content: '❌ Request not found.', ephemeral: true });
      }
      
      if (request.status !== 'pending') {
        return interaction.reply({ content: '⚠️ This request has already been handled.', ephemeral: true });
      }
      
      respondToWorkRequest(requestId, approved);
      
      // Notify the staff member
      try {
        const staffUser = await client.users.fetch(request.user_id);
        const statusEmoji = approved ? '✅' : '❌';
        const statusText = approved ? 'approved' : 'denied';
        const additionalInfo = approved 
          ? '\n\nYou can now use `/clockin` to start your shift!'
          : '\n\nPlease wait for your next scheduled day to work.';
        
        await staffUser.send({
          content: `${statusEmoji} **Your work request has been ${statusText}.**\n\nRequest for: ${new Date(request.requested_date).toLocaleDateString()}${additionalInfo}`
        });
      } catch (err) {
        console.error(`Failed to notify user ${request.user_id}:`, err);
      }
      
      await interaction.update({
        content: `${approved ? '✅ Approved' : '❌ Denied'} work request for <@${request.user_id}> on ${new Date(request.requested_date).toLocaleDateString()}.`,
        components: []
      });
      return;
    }

    // Shift swap buttons
    if (id.startsWith('accept_swap_') || id.startsWith('decline_swap_')) {
      const accepted = id.startsWith('accept_swap_');
      const requestId = parseInt(id.replace(accepted ? 'accept_swap_' : 'decline_swap_', ''));
      
      const { acceptShiftSwap, declineShiftSwap, getShiftSwapRequest } = await import('./services/scheduling');
      const request = getShiftSwapRequest(requestId);
      
      if (!request) {
        return interaction.reply({ content: '❌ Request not found.', ephemeral: true });
      }
      
      if (request.status !== 'pending') {
        return interaction.reply({ content: '⚠️ This request has already been handled.', ephemeral: true });
      }
      
      if (accepted) {
        const success = acceptShiftSwap(requestId, interaction.user.id);
        
        if (!success) {
          return interaction.reply({ content: '❌ Failed to accept swap.', ephemeral: true });
        }
        
        // Notify requester
        try {
          const requester = await client.users.fetch(request.requester_id);
          
          if (request.request_type === 'drop') {
            await requester.send({
              content: `✅ **Your shift drop was accepted!**\n\n<@${interaction.user.id}> has picked up your **${request.day_to_give}** shift.`
            });
          } else {
            await requester.send({
              content: `✅ **Your shift swap was accepted!**\n\n<@${interaction.user.id}> has agreed to swap:\n• You give: **${request.day_to_give}**\n• You receive: **${request.day_to_receive}**`
            });
          }
        } catch (err) {
          console.error(`Failed to notify requester ${request.requester_id}:`, err);
        }
        
        await interaction.update({
          content: `✅ Shift ${request.request_type === 'drop' ? 'pickup' : 'swap'} accepted!`,
          components: []
        });
      } else {
        declineShiftSwap(requestId);
        
        // Notify requester
        try {
          const requester = await client.users.fetch(request.requester_id);
          await requester.send({
            content: `❌ **Your shift ${request.request_type} was declined.**\n\n<@${interaction.user.id}> declined your request for **${request.day_to_give}**.`
          });
        } catch (err) {
          console.error(`Failed to notify requester ${request.requester_id}:`, err);
        }
        
        await interaction.update({
          content: `❌ Shift ${request.request_type} declined.`,
          components: []
        });
      }
      return;
    }

    // Unrecognized button type
    return;
  } catch (err) {
    console.error('Button interaction error:', err);
    if (interaction.isRepliable()) {
      try { await interaction.reply({ content: 'Something went wrong updating the match.', ephemeral: true }); } catch {}
    }
  }
});

// Anti-Nuke Protection - Channel Delete
client.on('channelDelete', async (channel) => {
  if (!('guild' in channel) || !channel.guild) return;

  try {
    const {
      getAntiNukeConfig,
      trackAntiNukeAction,
      getRecentActions,
      isWhitelisted,
      logAntiNukeTrigger
    } = await import('./services/antiNuke');

    const config = getAntiNukeConfig(channel.guild.id);
    if (!config || !config.enabled) return;

    // Get audit log to find who deleted the channel
    const auditLogs = await channel.guild.fetchAuditLogs({
      type: 12, // CHANNEL_DELETE
      limit: 1
    });

    const deleteLog = auditLogs.entries.first();
    if (!deleteLog || !deleteLog.executor) return;

    const executor = deleteLog.executor;
    const member = await channel.guild.members.fetch(executor.id).catch(() => null);
    if (!member) return;

    // Check if whitelisted
    const userRoles = Array.from(member.roles.cache.keys()) as string[];
    if (isWhitelisted(config, executor.id, userRoles)) return;

    // Track the action
    trackAntiNukeAction(channel.guild.id, executor.id, 'channel_delete');

    // Check if threshold exceeded
    const recentDeletes = getRecentActions(
      channel.guild.id,
      executor.id,
      'channel_delete',
      config.time_window_seconds
    );

    if (recentDeletes >= config.max_channel_deletes) {
      // TRIGGER ANTI-NUKE
      console.log(`🚨 Anti-nuke triggered: ${executor.tag} deleted ${recentDeletes} channels`);

      // Ban the user
      try {
        await member.ban({ reason: `Anti-nuke: Deleted ${recentDeletes} channels in ${config.time_window_seconds}s` });
        logAntiNukeTrigger(channel.guild.id, executor.id, 'channel_delete', recentDeletes, 'banned');
      } catch (err) {
        console.error('Failed to ban nuke user:', err);
        logAntiNukeTrigger(channel.guild.id, executor.id, 'channel_delete', recentDeletes, 'failed_to_ban');
      }

      // Alert admins
      const modLogChannelId = getModLogChannelId();
      if (modLogChannelId) {
        const modLogChannel = await channel.guild.channels.fetch(modLogChannelId).catch(() => null) as any;
        if (modLogChannel) {
          await modLogChannel.send({
            content: '@everyone',
            embeds: [{
              color: 0xFF0000,
              title: '🚨 ANTI-NUKE TRIGGERED',
              description: `**User:** <@${executor.id}> (${executor.tag})\n**Action:** Mass Channel Deletion\n**Channels Deleted:** ${recentDeletes} in ${config.time_window_seconds}s\n**Response:** User has been banned`,
              timestamp: new Date().toISOString()
            }]
          });
        }
      }
    }
  } catch (err) {
    console.error('Anti-nuke channel delete handler error:', err);
  }
});

// Anti-Nuke Protection - Role Delete
client.on('roleDelete', async (role) => {
  try {
    const {
      getAntiNukeConfig,
      trackAntiNukeAction,
      getRecentActions,
      isWhitelisted,
      logAntiNukeTrigger
    } = await import('./services/antiNuke');

    const config = getAntiNukeConfig(role.guild.id);
    if (!config || !config.enabled) return;

    // Get audit log to find who deleted the role
    const auditLogs = await role.guild.fetchAuditLogs({
      type: 32, // ROLE_DELETE
      limit: 1
    });

    const deleteLog = auditLogs.entries.first();
    if (!deleteLog || !deleteLog.executor) return;

    const executor = deleteLog.executor;
    const member = await role.guild.members.fetch(executor.id).catch(() => null);
    if (!member) return;

    // Check if whitelisted
    const userRoles = Array.from(member.roles.cache.keys());
    if (isWhitelisted(config, executor.id, userRoles)) return;

    // Track the action
    trackAntiNukeAction(role.guild.id, executor.id, 'role_delete');

    // Check if threshold exceeded
    const recentDeletes = getRecentActions(
      role.guild.id,
      executor.id,
      'role_delete',
      config.time_window_seconds
    );

    if (recentDeletes >= config.max_role_deletes) {
      // TRIGGER ANTI-NUKE
      console.log(`🚨 Anti-nuke triggered: ${executor.tag} deleted ${recentDeletes} roles`);

      // Ban the user
      try {
        await member.ban({ reason: `Anti-nuke: Deleted ${recentDeletes} roles in ${config.time_window_seconds}s` });
        logAntiNukeTrigger(role.guild.id, executor.id, 'role_delete', recentDeletes, 'banned');
      } catch (err) {
        console.error('Failed to ban nuke user:', err);
        logAntiNukeTrigger(role.guild.id, executor.id, 'role_delete', recentDeletes, 'failed_to_ban');
      }

      // Alert admins
      const modLogChannelId = getModLogChannelId();
      if (modLogChannelId) {
        const modLogChannel = await role.guild.channels.fetch(modLogChannelId).catch(() => null) as any;
        if (modLogChannel) {
          await modLogChannel.send({
            content: '@everyone',
            embeds: [{
              color: 0xFF0000,
              title: '🚨 ANTI-NUKE TRIGGERED',
              description: `**User:** <@${executor.id}> (${executor.tag})\n**Action:** Mass Role Deletion\n**Roles Deleted:** ${recentDeletes} in ${config.time_window_seconds}s\n**Response:** User has been banned`,
              timestamp: new Date().toISOString()
            }]
          });
        }
      }
    }
  } catch (err) {
    console.error('Anti-nuke role delete handler error:', err);
  }
});

// Anti-Nuke Protection - Mass Ban
client.on('guildBanAdd', async (ban) => {
  try {
    const {
      getAntiNukeConfig,
      trackAntiNukeAction,
      getRecentActions,
      isWhitelisted,
      logAntiNukeTrigger
    } = await import('./services/antiNuke');

    const config = getAntiNukeConfig(ban.guild.id);
    if (!config || !config.enabled) return;

    // Get audit log to find who banned
    const auditLogs = await ban.guild.fetchAuditLogs({
      type: 22, // MEMBER_BAN_ADD
      limit: 1
    });

    const banLog = auditLogs.entries.first();
    if (!banLog || !banLog.executor) return;

    const executor = banLog.executor;
    const member = await ban.guild.members.fetch(executor.id).catch(() => null);
    if (!member) return;

    // Check if whitelisted
    const userRoles = Array.from(member.roles.cache.keys());
    if (isWhitelisted(config, executor.id, userRoles)) return;

    // Track the action
    trackAntiNukeAction(ban.guild.id, executor.id, 'ban');

    // Check if threshold exceeded
    const recentBans = getRecentActions(
      ban.guild.id,
      executor.id,
      'ban',
      config.time_window_seconds
    );

    if (recentBans >= config.max_bans) {
      // TRIGGER ANTI-NUKE
      console.log(`🚨 Anti-nuke triggered: ${executor.tag} banned ${recentBans} users`);

      // Remove all roles (can't ban bot user or self)
      try {
        await member.roles.set([], `Anti-nuke: Mass banned ${recentBans} users in ${config.time_window_seconds}s`);
        logAntiNukeTrigger(ban.guild.id, executor.id, 'ban', recentBans, 'roles_removed');
      } catch (err) {
        console.error('Failed to remove roles from nuke user:', err);
        logAntiNukeTrigger(ban.guild.id, executor.id, 'ban', recentBans, 'failed_to_action');
      }

      // Alert admins
      const modLogChannelId = getModLogChannelId();
      if (modLogChannelId) {
        const modLogChannel = await ban.guild.channels.fetch(modLogChannelId).catch(() => null) as any;
        if (modLogChannel) {
          await modLogChannel.send({
            content: '@everyone',
            embeds: [{
              color: 0xFF0000,
              title: '🚨 ANTI-NUKE TRIGGERED',
              description: `**User:** <@${executor.id}> (${executor.tag})\n**Action:** Mass Banning\n**Users Banned:** ${recentBans} in ${config.time_window_seconds}s\n**Response:** All roles removed`,
              timestamp: new Date().toISOString()
            }]
          });
        }
      }
    }
  } catch (err) {
    console.error('Anti-nuke ban handler error:', err);
  }
});

process.on("SIGINT", () => {
  console.log("Shutting down gracefully...");
  client.destroy();
  process.exit(0);
});

// Track new member joins for welcome detection
client.on("guildMemberAdd", async (member) => {
  if (member.user.bot) return;
  
  try {
    const db = await import('./services/db').then(m => m.getDB());
    // Store new member join time so we can attribute welcomes
    db.prepare(`
      INSERT OR REPLACE INTO user_interactions (user_id, guild_id, interaction_type, created_at)
      VALUES (?, ?, 'member_joined', ?)
    `).run(member.id, member.guild.id, new Date().toISOString());
  } catch (e) {
    console.error('Failed to track member join:', e);
  }
});

// Voice State Update for Temporary Channels
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const { getTempChannelConfig, registerTempChannel, getTempChannel, removeTempChannel } = await import('./services/tempChannels');
    
    // User joined a channel
    if (!oldState.channelId && newState.channelId) {
      const config = getTempChannelConfig(newState.channelId);
      if (config && config.enabled) {
        const userName = newState.member?.user.username || 'User';
        const channelName = config.name_template.replace('{user}', userName);
        
        try {
          if (config.channel_type === 'voice') {
            const channel = await newState.guild.channels.create({
              name: channelName,
              type: 2, // Voice channel
              parent: config.category_id || undefined,
              userLimit: config.user_limit || 0
            });
            
            registerTempChannel(newState.guild.id, channel.id, newState.member!.id);
            
            // Move user to new channel (only if it's a voice channel)
            if (channel.isVoiceBased()) {
              await newState.member?.voice.setChannel(channel);
            }
          } else if (config.channel_type === 'text') {
            const channel = await newState.guild.channels.create({
              name: channelName,
              type: 0, // Text channel
              parent: config.category_id || undefined,
              permissionOverwrites: [
                {
                  id: newState.guild.id,
                  deny: ['ViewChannel']
                },
                {
                  id: newState.member!.id,
                  allow: ['ViewChannel', 'SendMessages']
                }
              ]
            });
            
            registerTempChannel(newState.guild.id, channel.id, newState.member!.id);
          }
        } catch (err) {
          console.error('Failed to create temp channel:', err);
        }
      }
    }
    
    // Check if a temp channel is now empty and should be deleted
    if (oldState.channelId) {
      const tempChannel = getTempChannel(oldState.channelId);
      if (tempChannel) {
        const channel = await oldState.guild.channels.fetch(oldState.channelId).catch(() => null);
        if (channel && channel.isVoiceBased()) {
          if (channel.members.size === 0) {
            // Channel is empty, delete it
            removeTempChannel(oldState.channelId);
            await channel.delete().catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error('Voice state update error:', err);
  }
});

// Background task: Check reminders every minute
setInterval(async () => {
  try {
    const { getDueReminders, completeReminder } = await import('./services/reminders');
    const reminders = getDueReminders();
    
    for (const reminder of reminders) {
      try {
        if (reminder.channel_id) {
          // Send in channel
          const channel = await client.channels.fetch(reminder.channel_id).catch(() => null);
          if (channel && 'send' in channel) {
            await (channel as any).send(`⏰ <@${reminder.user_id}> Reminder: ${reminder.message}`);
          }
        } else {
          // Send DM
          const user = await client.users.fetch(reminder.user_id).catch(() => null);
          if (user) {
            await user.send(`⏰ Reminder: ${reminder.message}`).catch(() => {});
          }
        }
        
        completeReminder(reminder.id);
      } catch (err) {
        console.error('Failed to send reminder:', err);
      }
    }
  } catch (err) {
    console.error('Reminder check failed:', err);
  }
}, 60000); // Check every minute

// Background task: Update stats channels every 10 minutes
setInterval(async () => {
  try {
    const { getAllEnabledStatsChannels, updateStatsChannelTimestamp } = await import('./services/statsChannels');
    const channels = getAllEnabledStatsChannels();
    
    for (const config of channels) {
      try {
        const guild = await client.guilds.fetch(config.guild_id).catch(() => null);
        if (!guild) continue;
        
        const channel = await guild.channels.fetch(config.channel_id).catch(() => null);
        if (!channel || !('setName' in channel)) continue;
        
        let count = 0;
        switch (config.channel_type) {
          case 'member_count':
            count = guild.memberCount;
            break;
          case 'online_count':
            count = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
            break;
          case 'bot_count':
            count = guild.members.cache.filter(m => m.user.bot).size;
            break;
          case 'role_count':
            count = guild.roles.cache.size;
            break;
          case 'channel_count':
            count = guild.channels.cache.size;
            break;
        }
        
        const newName = config.format.replace('{count}', count.toString());
        if (channel.name !== newName) {
          await (channel as any).setName(newName);
          updateStatsChannelTimestamp(config.channel_id);
        }
      } catch (err) {
        console.error('Failed to update stats channel:', err);
      }
    }
  } catch (err) {
    console.error('Stats channel update failed:', err);
  }
}, 600000); // Update every 10 minutes

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    // Enhanced commands
    if (interaction.commandName === 'whitelist') {
      const { handleWhitelist } = await import('./commands/enhancedCommands');
      await handleWhitelist(interaction);
      return;
    }
    
    // Phase 1 Advanced Ticket Features
    if (interaction.commandName === 'ticketsla') {
      const { handleTicketSLA } = await import('./commands/advancedTickets');
      await handleTicketSLA(interaction);
      return;
    }
    
    if (interaction.commandName === 'tickettag') {
      const { handleTicketTag } = await import('./commands/advancedTickets');
      await handleTicketTag(interaction);
      return;
    }
    
    if (interaction.commandName === 'ticketnote') {
      const { handleTicketNote } = await import('./commands/advancedTickets');
      await handleTicketNote(interaction);
      return;
    }
    
    if (interaction.commandName === 'ticketanalytics') {
      const { handleTicketAnalytics } = await import('./commands/advancedTickets');
      await handleTicketAnalytics(interaction);
      return;
    }
  }
});

client.login(token);

// Global error handlers for debugging
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});
