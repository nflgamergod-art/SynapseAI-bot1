/**
 * Bot Command Trigger Service
 * Detects user requests and triggers other bot commands automatically
 */

import { Message } from 'discord.js';

// Configuration for bot command triggers
const BOT_COMMANDS = {
  LUARMOR_HWID_RESET: {
    botName: 'Luarmor',
    command: 'Force-resethwid',
    triggers: [
      /\b(reset|change|fix|clear)\s+(my\s+)?(hwid|hardware\s*id|hardware\s*identifier)/i,
      /\bhwid\s+(reset|change|fix|clear)/i,
      /\b(need|want|can\s+you)\s+.*\s*hwid\s+reset/i,
      /\breset.*hwid/i,
      /\bforce.*reset.*hwid/i
    ],
    description: 'Resets HWID using Luarmor bot',
    permission: 'everyone' // or 'staff', 'owner'
  }
};

/**
 * Check if message content matches any trigger patterns
 */
export function detectBotCommandTrigger(message: Message): {
  shouldTrigger: boolean;
  commandKey: string | null;
  botName: string | null;
  command: string | null;
} {
  const content = message.content;

  // Check HWID reset triggers
  for (const trigger of BOT_COMMANDS.LUARMOR_HWID_RESET.triggers) {
    if (trigger.test(content)) {
      return {
        shouldTrigger: true,
        commandKey: 'LUARMOR_HWID_RESET',
        botName: BOT_COMMANDS.LUARMOR_HWID_RESET.botName,
        command: BOT_COMMANDS.LUARMOR_HWID_RESET.command
      };
    }
  }

  return {
    shouldTrigger: false,
    commandKey: null,
    botName: null,
    command: null
  };
}

/**
 * Trigger bot command by sending the command in the channel
 */
export async function triggerBotCommand(
  message: Message,
  botName: string,
  command: string,
  userId?: string
): Promise<boolean> {
  try {
    const targetUser = userId || message.author.id;
    const commandText = `/${command} <@${targetUser}>`;
    
    // Send a message indicating we're triggering the command
    await message.reply(
      `🔄 I'll help you with that! Triggering ${botName} command...\n` +
      `Running: \`${command}\` for <@${targetUser}>`
    );

    // Send the actual command
    // Note: This sends the command as a message. If the bot uses slash commands,
    // we may need to use interaction APIs instead
    if ('send' in message.channel) {
      await message.channel.send(commandText);
    }

    console.log(`[BotCommandTrigger] Triggered ${botName} ${command} for user ${targetUser}`);
    return true;
  } catch (error) {
    console.error('[BotCommandTrigger] Error triggering bot command:', error);
    await message.reply('❌ Sorry, I encountered an error trying to trigger that command. Please try running it manually.');
    return false;
  }
}

/**
 * Check if user has permission to trigger this command
 */
export function hasPermissionToTrigger(
  message: Message,
  commandKey: string
): boolean {
  const config = (BOT_COMMANDS as any)[commandKey];
  if (!config) return false;

  const permission = config.permission;

  // Everyone can trigger
  if (permission === 'everyone') return true;

  // Staff only - check for staff roles
  if (permission === 'staff') {
    // Check if user has any staff/moderator roles
    if (!message.member?.roles) return false;
    const hasStaffRole = message.member.roles.cache.some(role => 
      role.name.toLowerCase().includes('staff') ||
      role.name.toLowerCase().includes('mod') ||
      role.name.toLowerCase().includes('admin')
    );
    return hasStaffRole;
  }

  // Owner only
  if (permission === 'owner') {
    const ownerId = process.env.OWNER_ID;
    return message.author.id === ownerId;
  }

  return false;
}
