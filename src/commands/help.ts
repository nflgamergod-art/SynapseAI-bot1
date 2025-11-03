import { Message } from "discord.js";

export function helpCommand(message: Message, prefix: string) {
  const helpText = `**📖 SynapseAI Bot Commands Help**
*Prefixes: You can use either \`${prefix}\` or \`.\` before any command*

**🎮 General Commands:**
${prefix}help - Show this help message
${prefix}ping / ${prefix}pong - Check bot response latency
${prefix}joke - Tell a random joke
${prefix}dadjoke - Tell a dad joke

**🔨 Moderation Commands (Admin):**
${prefix}kick @user [reason] - Kick a member (requires Kick Members permission)
${prefix}ban @user [reason] - Ban a member (requires Ban Members permission)
${prefix}mute @user [duration] [reason] - Timeout a member (e.g., 20s, 10m, 1h; requires Moderate Members)
${prefix}addrole @user @role - Add a role to a member (requires Manage Roles)
${prefix}removerole @user @role - Remove a role from a member (requires Manage Roles)
${prefix}setdefaultmute <duration> - Set default mute duration (e.g., 10m, 1h)
${prefix}getdefaultmute - Show current default mute duration

**⚙️ Configuration Commands (Admin):**
${prefix}setquestiontimeout <seconds> - Set how long before same question can be asked again
${prefix}getquestiontimeout - Check current question repeat timeout

**💬 AI Interaction:**
• Mention the bot (@SynapseAI) to get natural AI-powered replies
• Say the wake-word (e.g., "SynapseAI") in your message
• Ask questions naturally - the bot learns and remembers!

**🎯 Slash Commands:**
Use \`/\` for these commands:
• \`/supportstats\` - View support member performance
• \`/leaderboard\` - Support & achievement rankings
• \`/kb search\` - Search knowledge base for answers
• \`/achievements\` - View earned achievements
• \`/perks\` - See your unlocked special abilities
• \`/supportstart\` - Start tracking a support ticket
• \`/supportend\` - End a support ticket
• \`/listopentickets\` - List all open tickets
• \`/remember\` - Save personal preferences for better AI replies
• \`/memories\` - List your saved memories
• \`/forget\` - Delete a saved memory
• \`/rpsai\` - Play Rock-Paper-Scissors vs AI
• \`/blackjack\` - Play Blackjack vs AI
• \`/purge\` - Delete recent messages (1-1000)
• \`/warn\` - Warn a user
• \`/clearwarn\` - Clear user warnings
• \`/unmute\` - Remove timeout from member
• \`/announce\` - Send announcement as bot
• \`/membercount\` - Show member count

**📚 More Info:**
Type \`/kb search\` to find answers to common questions
The bot auto-learns from conversations and saves helpful Q&A!

**🔒 Security Features:**
• Anti-spam protection (3 warnings = auto-blacklist)
• Inappropriate content filtering
• @everyone/@here mention blocking`;

  message.reply(helpText);
}
