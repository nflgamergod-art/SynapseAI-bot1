/**
 * Command filtering for main bot vs extra bot
 * Main Bot: Core operational features (moderation, tickets, payroll, support)
 * Extra Bot: Secondary features (games, fun, utilities, management tools)
 */

export const MAIN_BOT_COMMANDS = new Set<string>([
  // === CRITICAL CORE COMMANDS ===
  'help', 'ping', 'diagcommands',
  
  // === MODERATION (ESSENTIAL) ===
  'warn', 'warns', 'clearwarn', 'kick', 'ban', 'unban', 'mute', 'unmute',
  'cases', 'automod',
  
  // === TICKET SYSTEM (PRIMARY FEATURE) ===
  'ticket', 'ticketvoice', 'ticketsla', 'tickettag', 'ticketnote',
  'ticketanalytics', 'ticketfeedback', 'ticketrouting', 'ticketcategory',
  
  // === CUSTOMER MANAGEMENT ===
  'customer', 'mymentions',
  
  // === SUPPORT & STATS ===
  'support', 'supportstats', 'supportstart', 'supportend', 'supportrate',
  'supportaddhelper', 'autoresponse', 'staffexpertise',
  
  // === SHIFT & PAYROLL (CRITICAL FOR STAFF) ===
  'clockin', 'clockout', 'forceclockout', 'clearcooldown',
  'shifts', 'shiftstats', 'whosonduty',
  'payroll', 'upt', 'attendance', 'schedule',
  
  // === STAFF MANAGEMENT ===
  'staffactivity', 'promotion', 'violations', 'suspendstaff',
  'cancelsuspension', 'suspensions',
  
  // === APPEALS (USER + STAFF) ===
  'appeal', 'appeals', 'appealhistory',
  
  // === ESSENTIAL CONFIG ===
  'setsupportroles', 'getsupportroles', 'setsupportintercept',
  'getsupportintercept', 'setfounderrole',
  
  // === WELLNESS & LANGUAGE ===
  'wellness', 'language',
  
  // === REMINDERS (STAFF UTILITY) ===
  'remind', 'reminders', 'cancelreminder',
]);

export const EXTRA_BOT_COMMANDS = new Set<string>([
  // === GAMES & FUN ===
  'rpsai', 'blackjack', 'joke',
  
  // === GIVEAWAYS ===
  'giveaway',
  
  // === ACHIEVEMENTS & PERKS ===
  'achievements', 'perks', 'stats', 'leaderboard', 'claimperk',
  'setcolor', 'requestemoji', 'prioritysupport', 'channelsuggestion',
  'voicepriority', 'perkspanel', 'setperkrole', 'givepoints',
  'appealhistory',  // Global command for viewing appeal history
  
  // === KNOWLEDGE BASE ===
  'kb', 'faq',
  
  // === MEMORY SYSTEM ===
  'remember', 'forget', 'memories', 'aliases', 'history', 'revert',
  
  // === ADVANCED CONFIG (OWNER TOOLS) ===
  'manage', 'cmdpermissions', 'abusebypass',
  'addbypass', 'removebypass', 'setresponserule', 'listresponserules',
  'delresponserule',
  
  // === MOD LOG & CONFIG ===
  'setmodlog', 'getmodlog', 'clearmodlog', 'setdefaultmute',
  'getdefaultmute', 'setquestiontimeout', 'getquestiontimeout',
  
  // === OWNER MENTIONS ===
  'setmention', 'getmention',
  
  // === UTILITY COMMANDS ===
  'version', 'diagai', 'announce', 'membercount', 'purge',
  'addrole', 'removerole',
  
  // === BULK ACTIONS ===
  'bulkban', 'bulkkick', 'bulkmute',
  
  // === ANTI-NUKE ===
  'antinuke',
  
  // === TEMP CHANNELS ===
  'tempchannels',
  
  // === STATS CHANNELS ===
  'statschannels',
]);

/**
 * Filter commands for a specific bot based on environment variable
 */
export function filterCommandsForBot(allCommands: any[]): any[] {
  const isSecondaryBot = process.env.IS_SECONDARY_BOT === 'true';
  
  if (isSecondaryBot) {
    // Extra bot: only show commands in EXTRA_BOT_COMMANDS
    const filtered = allCommands.filter(cmd => EXTRA_BOT_COMMANDS.has(cmd.name));
    console.log(`[EXTRA BOT] Filtered to ${filtered.length}/${allCommands.length} commands`);
    console.log(`[EXTRA BOT] Commands:`, filtered.map(c => c.name).sort().join(', '));
    return filtered;
  } else {
    // Main bot: only show commands in MAIN_BOT_COMMANDS
    const filtered = allCommands.filter(cmd => MAIN_BOT_COMMANDS.has(cmd.name));
    console.log(`[MAIN BOT] Filtered to ${filtered.length}/${allCommands.length} commands`);
    console.log(`[MAIN BOT] Commands:`, filtered.map(c => c.name).sort().join(', '));
    return filtered;
  }
}

/**
 * Get summary of command distribution
 */
export function getCommandDistribution(allCommands: any[]): {
  total: number;
  mainBot: number;
  extraBot: number;
  unassigned: number;
  unassignedList: string[];
} {
  const allNames = new Set(allCommands.map(c => c.name));
  const mainBot = allCommands.filter(c => MAIN_BOT_COMMANDS.has(c.name)).length;
  const extraBot = allCommands.filter(c => EXTRA_BOT_COMMANDS.has(c.name)).length;
  
  const unassignedList: string[] = [];
  allNames.forEach(name => {
    if (!MAIN_BOT_COMMANDS.has(name) && !EXTRA_BOT_COMMANDS.has(name)) {
      unassignedList.push(name);
    }
  });
  
  return {
    total: allCommands.length,
    mainBot,
    extraBot,
    unassigned: unassignedList.length,
    unassignedList
  };
}
