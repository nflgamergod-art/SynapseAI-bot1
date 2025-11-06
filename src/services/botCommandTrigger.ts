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
 * Trigger bot command by guiding the user to run it
 */
export async function triggerBotCommand(
  message: Message,
  botName: string,
  command: string,
  userId?: string
): Promise<boolean> {
  try {
    const targetUser = userId || message.author.id;
    
    // Since Discord doesn't allow bots to trigger other bots' slash commands,
    // we'll provide the user with the command they need to run
    await message.reply(
      `🔄 I can help you reset your HWID!\n\n` +
      `**Please run this command:**\n` +
      `\`/${command}\` and select yourself\n\n` +
      `*Or if you're staff helping someone else:*\n` +
      `\`/${command}\` and select the user who needs their HWID reset\n\n` +
      `✅ This will reset your hardware ID with the ${botName} system.`
    );

    console.log(`[BotCommandTrigger] Guided user to run ${botName} ${command}`);
    return true;
  } catch (error) {
    console.error('[BotCommandTrigger] Error providing command guidance:', error);
    await message.reply('❌ Sorry, I encountered an error. Please try running the HWID reset command manually.');
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
