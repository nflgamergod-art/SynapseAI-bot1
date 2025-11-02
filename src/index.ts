import * as dotenv from "dotenv";
import * as path from "path";
// Ensure .env loads reliably in production: dist/ -> project root
dotenv.config({ path: path.join(__dirname, "../.env") });
import { Client, GatewayIntentBits, Partials, Message, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { isWakeWord, handleConversationalReply } from "./utils/responder";
import { isOwnerId } from "./utils/owner";
import { helpCommand } from "./commands/help";
import { kickCommand, banCommand, muteCommand, addRoleCommand, removeRoleCommand } from "./commands/moderation";
import { getRandomJoke } from "./services/learningService";
import { responseTracker } from "./services/responseTracker";
import { responseRules } from "./services/responseRules";
import { bypass } from "./services/bypass";
import { isWhitelisted, getWhitelist, addWhitelistEntry, removeWhitelistEntry } from "./services/whitelistService";
import { isBlacklisted, getBlacklist, addBlacklistEntry, removeBlacklistEntry } from "./services/blacklistService";
import { createGiveaway, getActiveGiveaways, getGiveawayById, endGiveaway, pickWinners, setGiveawayMessageId, addEntry as addGiveawayEntry } from "./services/giveawayService";
import { warnings } from "./services/warnings";
import { LanguageHandler } from "./services/languageHandler";
import { buildModerationEmbed, sendToModLog } from "./utils/moderationEmbed";
import { setModLogChannelId, getModLogChannelId, clearModLogChannelId } from "./config";
import { handleEnhancedCommands } from "./commands/enhancedCommands";
import { initializeEnhancedFeatures, processMessageWithEnhancedFeatures } from "./services/enhancedIntegration";

const token = (process.env.DISCORD_TOKEN || '').trim();
const prefix = process.env.PREFIX ?? "!";
const wakeWord = process.env.WAKE_WORD ?? "SynapseAI";

if (!token) {
  console.error("DISCORD_TOKEN not set in .env — cannot start bot");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});



client.once("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  
  // Initialize enhanced features
  await initializeEnhancedFeatures();
  
  // Start achievement cron jobs for periodic checks
  const { startAchievementCron } = await import('./services/achievementCron');
  startAchievementCron();
  
  // Register slash commands. If GUILD_ID is set, register for that guild (instant); otherwise register globally.
  const guildId = process.env.GUILD_ID;

  const commands = [
    { name: "help", description: "Show help for bot commands" },
    { name: "ping", description: "Check bot latency" },
    { name: "pong", description: "Alias for ping" },
    { name: "joke", description: "Tell a random joke" },
    { name: "dadjoke", description: "Tell a dad joke" },
    // Owner-only maintenance commands (no SSH required)
    { name: "redeploy", description: "Owner: pull latest code and restart bot (runs deploy.sh)" },
    { name: "setgeminikey", description: "Owner: set Gemini API key and restart bot", options: [
      { name: "key", description: "Gemini API key", type: 3, required: true }
    ] },
    { name: "setopenai", description: "Owner: set OpenAI API key and restart bot", options: [
      { name: "key", description: "OpenAI API key", type: 3, required: true }
    ] },
    { name: "setprovider", description: "Owner: choose AI provider (openai|gemini) and restart", options: [
      { name: "provider", description: "openai or gemini", type: 3, required: true }
    ] },
    { name: "pm2clean", description: "Owner: remove old PM2 process 'synapseai' and save" },
    { name: "version", description: "Owner: show running commit and config" },
    { name: "envcheck", description: "Owner: verify env values on server (masked)", options: [
      { name: "name", description: "Optional env name to check (e.g., OPENAI_API_KEY)", type: 3, required: false }
    ] },
    { name: "setmodel", description: "Owner: set AI model for a provider and restart", options: [
      { name: "provider", description: "openai or gemini", type: 3, required: true },
      { name: "model", description: "Model id (e.g., gpt-4o-mini or gemini-1.5-pro-latest)", type: 3, required: true }
    ] },
    { name: "setmodelpreset", description: "Owner: set AI model by preset (fast|balanced|cheap)", options: [
      { name: "preset", description: "fast | balanced | cheap", type: 3, required: true },
      { name: "provider", description: "openai or gemini (defaults to AI_PROVIDER)", type: 3, required: false }
    ] },
    { name: "settaunt", description: "Owner: set trash talk tone (soft|normal|edgy)", options: [
      { name: "tone", description: "soft | normal | edgy", type: 3, required: true }
    ] },
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
    { name: "addfounder", description: "Owner: add a founder user for this server", options: [
      { name: "user", description: "User to add as founder", type: 6, required: true }
    ] },
    { name: "removefounder", description: "Owner: remove a founder user for this server", options: [
      { name: "user", description: "User to remove from founders", type: 6, required: true }
    ] },
    { name: "getfounders", description: "Owner: show founder config for this server" },
  { name: "registercommands", description: "Owner: re-register slash commands in this server (immediate)" },
    { name: "setmention", description: "Owner: toggle @mentions for PobKC or Joycemember", options: [
      { name: "owner", description: "pobkc or joycemember", type: 3, required: true },
      { name: "enabled", description: "true or false", type: 5, required: true }
    ] },
    { name: "getmention", description: "Owner: show mention preference status for owners" },
    // Owner-only whitelist management
    { name: "addwhitelist", description: "Owner: add a whitelist entry (user or role)", options: [
      { name: "type", description: "user or role", type: 3, required: true },
      { name: "id", description: "User ID or Role ID (or mention)", type: 3, required: true },
      { name: "duration", description: "Optional duration (e.g., 7d, 24h, 3600)", type: 3, required: false },
      { name: "autorole", description: "Optional auto-assign role id", type: 3, required: false }
    ] },
    { name: "removewhitelist", description: "Owner: remove a whitelist entry", options: [
      { name: "type", description: "user or role", type: 3, required: true },
      { name: "id", description: "User ID or Role ID (or mention)", type: 3, required: true }
    ] },
    { name: "listwhitelist", description: "Owner: list whitelist entries" },
    { name: "addblacklist", description: "Owner: add a blacklist entry (user or role)", options: [
      { name: "type", description: "user or role", type: 3, required: true },
      { name: "id", description: "User ID or Role ID (or mention)", type: 3, required: true },
      { name: "reason", description: "Reason for blacklist", type: 3, required: false }
    ] },
    { name: "removeblacklist", description: "Owner: remove a blacklist entry", options: [
      { name: "type", description: "user or role", type: 3, required: true },
      { name: "id", description: "User ID or Role ID (or mention)", type: 3, required: true }
    ] },
    { name: "listblacklist", description: "Owner: list blacklist entries" },
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
  { name: "listbypass", description: "List bypass entries" },
  { name: "setresponserule", description: "Add a rule to customize responses (admin)", options: [ { name: 'type', description: 'Type: phrase|emoji|sticker', type: 3, required: true }, { name: 'trigger', description: 'Trigger text/emoji/sticker id', type: 3, required: true }, { name: 'response', description: 'Response text (use __IGNORE__ to make bot ignore). Can be JSON object for translations.', type: 3, required: true }, { name: 'match', description: 'Match type: contains|equals|regex (phrase only)', type: 3, required: false } ] },
  { name: "listresponserules", description: "List configured response rules (admin)" },
  { name: "delresponserule", description: "Delete a response rule by id (admin)", options: [{ name: 'id', description: 'Rule id', type: 3, required: true }] },
  { name: "setmodlog", description: "Set the moderation log channel (admin)", options: [{ name: 'channel', type: 7, description: 'Channel to receive moderation logs', required: true }] },
  { name: "getmodlog", description: "Show the current moderation log channel (admin)" },
  { name: "clearmodlog", description: "Clear the moderation log channel (admin)" },
    { name: "warn", description: "Warn a user (DM and record)", options: [{ name: 'user', type: 6, description: 'User to warn', required: true }, { name: 'reason', type: 3, description: 'Reason', required: false }] },
    { name: "clearwarn", description: "Clear warnings for a user", options: [{ name: 'user', type: 6, description: 'User', required: true }] },
    { name: "unmute", description: "Remove timeout from a member", options: [{ name: 'user', type: 6, description: 'Member to unmute', required: true }] },
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
    { name: "perks", description: "✨ View your unlocked perks and special abilities" },
  { name: "perkspanel", description: "Owner: post a perks claim panel in this channel" },
  { name: "claimperk", description: "Claim an unlocked perk", options: [ { name: "perk", description: "custom_color | priority_support | custom_emoji | channel_suggest | voice_priority | exclusive_role", type: 3, required: true } ] },
  { name: "setcolor", description: "Set your custom role color (requires custom_color perk)", options: [ { name: "hex", description: "Hex color like #FF8800", type: 3, required: true } ] },
  { name: "requestemoji", description: "Create a custom emoji (requires custom_emoji perk)", options: [ { name: "name", description: "Emoji name (letters, numbers, _)", type: 3, required: true }, { name: "image", description: "Emoji image (PNG/GIF)", type: 11, required: true } ] },
  { name: "setperkrole", description: "Owner: bind a server role to a perk so claims use it", options: [ { name: "perk", description: "custom_color|priority_support|custom_emoji|channel_suggest|voice_priority|exclusive_role", type: 3, required: true }, { name: "role", description: "Role to bind", type: 8, required: true } ] },
    { name: "patterns", description: "📈 Admin: View detected user behavior patterns" },
    { name: "insights", description: "🔮 Admin: Get AI predictions for best posting times" },
    { name: "checkins", description: "📋 Admin: View scheduled proactive user follow-ups" },
    { name: "sentiment", description: "💭 Admin: Real-time emotional analysis of conversations", options: [ { name: "channel", description: "Channel to analyze (defaults to current)", type: 7, required: false } ] },
    { name: "commonissues", description: "🔍 Admin: Detect recurring support issues", options: [ { name: "hours", description: "Hours to analyze (default 24)", type: 4, required: false } ] },
    { name: "faq", description: "❓ Quick access to frequently asked questions", options: [ { name: "category", description: "Filter by category", type: 3, required: false } ] }
  ];

  (async () => {
    try {
      if (!client.application) return;
      if (guildId) {
        await client.application.commands.set(commands, guildId);
        console.log(`Registered ${commands.length} slash commands for guild ${guildId}`);
        // Also clear global commands to avoid duplicates when switching from global to guild registration
        try {
          await client.application.commands.set([] as any);
          console.log('Cleared global slash commands to prevent duplicates.');
        } catch (e) {
          console.warn('Failed to clear global commands:', e);
        }
      } else {
        await client.application.commands.set(commands as any);
        console.log(`Registered ${commands.length} global slash commands`);
      }
    } catch (err) {
      console.error("Failed to register slash commands:", err);
    }
  })();
});

client.on("interactionCreate", async (interaction) => {
  try {
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
          if (perkId === 'priority_support' || perkId === 'channel_suggest' || perkId === 'voice_priority' || perkId === 'exclusive_role') {
            const pref = getPerkRolePreference(perkId as any);
            // Ensure role exists (fallback to name)
            let roleId = pref.roleId;
            if (!roleId) {
              const name = pref.roleName || (perkId === 'priority_support' ? 'Priority Support' : perkId === 'channel_suggest' ? 'Channel Suggest' : perkId === 'voice_priority' ? 'Voice Priority' : 'Exclusive VIP');
              const existing = guild.roles.cache.find(r => r.name === name);
              if (existing) roleId = existing.id;
              else {
                const perms = perkId === 'voice_priority' ? (await import('discord.js')).PermissionsBitField.Flags.PrioritySpeaker : undefined;
                const created = await guild.roles.create({ name, permissions: perms ? new (await import('discord.js')).PermissionsBitField(perms) : undefined, reason: 'Perks panel claim' });
                roleId = created.id;
              }
            }
            await member.roles.add(roleId!).catch(() => {});
            return interaction.reply({ content: `✅ Perk claimed: ${perkId.replace('_',' ')}`, ephemeral: true });
          }
          if (perkId === 'custom_color') {
            return interaction.reply({ content: 'Use /setcolor hex:#RRGGBB to choose your color.', ephemeral: true });
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
      return; // handled button
    }

    if (!interaction.isChatInputCommand()) return;

  const name = interaction.commandName;

    // Blacklist check first (overrides everything except owner)
    const userId = interaction.user.id;
    const member = interaction.member as any;
    
    if (!isOwnerId(userId)) {
      let blacklisted = isBlacklisted(userId, 'user');
      if (!blacklisted && member?.roles) {
        const roles = member.roles.cache ? Array.from(member.roles.cache.keys()) : (member.roles || []);
        for (const r of roles) {
          if (isBlacklisted(String(r), 'role')) {
            blacklisted = true;
            break;
          }
        }
      }
      if (blacklisted) {
        return interaction.reply({ content: "You have been blacklisted from using this bot.", ephemeral: true });
      }
    }

    // Whitelist check: only respond to whitelisted users/roles
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
    if (!whitelisted && !isOwnerId(userId)) {
      return interaction.reply({ content: "My owner hasn't whitelisted you. You can either pay to use my services or buy Synapse script to use my commands and have a conversation for free.", ephemeral: true });
    }
  // Whitelist admin commands (owner only)
  if (isOwnerId(interaction.user.id)) {
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
        removeBlacklistEntry(idRaw, type as any);
        return interaction.reply({ content: `Removed blacklist ${type} ${idRaw}.`, ephemeral: true });
      } catch (err) {
        console.error('Failed to remove blacklist', err);
        return interaction.reply({ content: 'Failed to remove blacklist entry.', ephemeral: true });
      }
    }
    if (interaction.commandName === "listblacklist") {
      try {
        const items = getBlacklist();
        if (!items.length) return interaction.reply({ content: 'No blacklist entries configured.', ephemeral: true });
        const out = items.map(i => `${i.type}:${i.id} reason=${i.reason ?? 'none'}`).join('\n').slice(0, 1900);
        return interaction.reply({ content: `Blacklist entries:\n${out}`, ephemeral: true });
      } catch (err) {
        console.error('Failed to list blacklist', err);
        return interaction.reply({ content: 'Failed to list blacklist entries.', ephemeral: true });
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

  // Try enhanced feature commands first
  const enhancedHandled = await handleEnhancedCommands(interaction as any);
  if (enhancedHandled) return;

  if (name === "help") return interaction.reply({ content: `Use ${prefix}help or mention me to get conversational replies. Use moderation commands with appropriate permissions.`, ephemeral: true });
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
      return interaction.reply({ content: "You are not authorized to use this feature.", ephemeral: true });
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
      return interaction.reply({ content: `Saved (${type}) ${key}: ${value}`, ephemeral: true });
    } catch (e) {
      console.error('remember failed', e);
      return interaction.reply({ content: 'Failed to save memory.', ephemeral: true });
    }
  }
  if (name === "forget") {
    if (!adminOrBypass(interaction.member) && !isOwnerId(interaction.user.id)) {
      return interaction.reply({ content: "You are not authorized to use this feature.", ephemeral: true });
    }
    const { deleteMemoryByKey } = await import('./services/memory');
    const key = interaction.options.getString('key', true).trim();
    try {
      const n = deleteMemoryByKey(interaction.user.id, key, interaction.guild?.id ?? null);
      if (n > 0) return interaction.reply({ content: `Deleted ${n} entr${n === 1 ? 'y' : 'ies'} for key '${key}'.`, ephemeral: true });
      return interaction.reply({ content: `No entries found for key '${key}'.`, ephemeral: true });
    } catch (e) {
      console.error('forget failed', e);
      return interaction.reply({ content: 'Failed to delete memory.', ephemeral: true });
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
  if (name === "aliases") {
    if (!adminOrBypass(interaction.member) && !isOwnerId(interaction.user.id)) {
      return interaction.reply({ content: "You are not authorized to use this feature.", ephemeral: true });
    }
    const { getAliases } = await import('./services/memory');
    try {
      const aliases = getAliases(interaction.user.id, interaction.guild?.id ?? null);
      if (!aliases.length) return interaction.reply({ content: 'No name aliases found.', ephemeral: true });
      return interaction.reply({ content: `Your name aliases: ${aliases.join(', ')}`, ephemeral: true });
    } catch (e) {
      console.error('aliases failed', e);
      return interaction.reply({ content: 'Failed to retrieve aliases.', ephemeral: true });
    }
  }
  if (name === "history") {
    if (!adminOrBypass(interaction.member) && !isOwnerId(interaction.user.id)) {
      return interaction.reply({ content: "You are not authorized to use this feature.", ephemeral: true });
    }
    const { getMemoryHistory } = await import('./services/memory');
    const key = interaction.options.getString('key', true).trim();
    const limit = Math.max(1, Math.min(20, interaction.options.getInteger('limit') ?? 5));
    try {
      const hist = getMemoryHistory(interaction.user.id, key, interaction.guild?.id ?? null, limit);
      if (!hist.length) return interaction.reply({ content: `No history found for key '${key}'.`, ephemeral: true });
      const lines = hist.map((h: any) => `[${new Date(h.changed_at).toLocaleString()}] ${h.action}: ${h.old_value ? `${h.old_value} → ` : ''}${h.new_value}`).join('\n').slice(0, 1900);
      return interaction.reply({ content: `History for '${key}':\n${lines}`, ephemeral: true });
    } catch (e) {
      console.error('history failed', e);
      return interaction.reply({ content: 'Failed to retrieve history.', ephemeral: true });
    }
  }
  if (name === "revert") {
    const { revertMemory } = await import('./services/memory');
    const key = interaction.options.getString('key', true).trim();
    try {
      const event = revertMemory(interaction.user.id, key, interaction.guild?.id ?? null);
      if (!event) return interaction.reply({ content: `No previous value found for key '${key}'.`, ephemeral: true });
      return interaction.reply({ content: `Reverted '${key}' from ${event.oldValue} back to ${event.newValue}.`, ephemeral: true });
    } catch (e) {
      console.error('revert failed', e);
      return interaction.reply({ content: 'Failed to revert memory.', ephemeral: true });
    }
  }
  if (name === "redeploy") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    await interaction.reply({ content: 'Starting deploy... I will pull latest code, rebuild, and restart.', ephemeral: true });
    try {
      const { exec } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        exec('bash /opt/synapseai-bot/deploy.sh', { timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
          if (error) return reject(error);
          resolve();
        });
      });
      await interaction.followUp({ content: 'Deploy finished. If I briefly went offline, that was the restart.', ephemeral: true });
    } catch (err: any) {
      console.error('Redeploy failed:', err);
      await interaction.followUp({ content: `Deploy failed: ${err?.message ?? err}. Try again or use the DigitalOcean console.`, ephemeral: true });
    }
    return;
  }
  if (name === "setgeminikey") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const newKey = interaction.options.getString('key', true).trim();
    if (!newKey || !/^AIza[0-9A-Za-z-_]{30,}$/.test(newKey)) {
      return interaction.reply({ content: 'That does not look like a valid Gemini API key.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
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
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const newKey = interaction.options.getString('key', true).trim();
    if (!newKey || !/^sk-/.test(newKey)) {
      return interaction.reply({ content: 'That does not look like a valid OpenAI API key (expected to start with sk-).', ephemeral: true });
    }
    // Defer and only show the final result (success/failure). Avoid the noisy pre-message.
    await interaction.deferReply({ ephemeral: true });
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
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const provider = (interaction.options.getString('provider', true) || '').toLowerCase();
    if (!['openai','gemini'].includes(provider)) {
      return interaction.reply({ content: 'Provider must be openai or gemini.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
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
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    await interaction.reply({ content: `Deleting old PM2 process 'synapseai' and saving...`, ephemeral: true });
    try {
      const { exec } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        exec("pm2 delete synapseai || true && pm2 save", (error, stdout, stderr) => error ? reject(error) : resolve());
      });
      await interaction.followUp({ content: `PM2 cleanup done. If duplicates remain, run /redeploy once more.`, ephemeral: true });
    } catch (err: any) {
      console.error('pm2clean failed:', err);
      await interaction.followUp({ content: `pm2clean failed: ${err?.message ?? err}`, ephemeral: true });
    }
    return;
  }
  if (name === "version") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
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
      return interaction.reply({ content: lines, ephemeral: true });
    } catch (err: any) {
      console.error('version failed:', err);
      return interaction.reply({ content: `version failed: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "envcheck") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
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
      return interaction.reply({ content: `Env check:\n${lines.join('\n')}`.slice(0, 1900), ephemeral: true });
    } catch (err: any) {
      console.error('envcheck failed:', err);
      return interaction.reply({ content: `envcheck failed: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "setmodel") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const provider = (interaction.options.getString('provider', true) || '').toLowerCase();
    const model = interaction.options.getString('model', true).trim();
    if (!['openai','gemini'].includes(provider)) return interaction.reply({ content: 'Provider must be openai or gemini.', ephemeral: true });
    if (!model) return interaction.reply({ content: 'Model cannot be empty.', ephemeral: true });
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
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
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
      return interaction.reply({ content: `Trash talk tone set to '${now}'.`, ephemeral: true });
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
      return interaction.reply({ content: lines, ephemeral: true });
    } catch (err: any) {
      console.error('setsupportroles failed:', err);
      return interaction.reply({ content: `Failed to set support roles: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "setsupportintercept") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    try {
      const enabled = interaction.options.getBoolean('enabled', true);
      const { setSupportInterceptEnabled, getSupportInterceptStatus } = await import('./services/supportIntercept');
      setSupportInterceptEnabled(interaction.guild.id, !!enabled);
      const status = getSupportInterceptStatus(interaction.guild.id);
      return interaction.reply({ content: `Global support interception is now ${status} for this server.`, ephemeral: true });
    } catch (err: any) {
      console.error('setsupportintercept failed:', err);
      return interaction.reply({ content: `Failed to update setting: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "getsupportintercept") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    try {
      const { getSupportInterceptStatus } = await import('./services/supportIntercept');
      const status = getSupportInterceptStatus(interaction.guild.id);
      return interaction.reply({ content: `Global support interception: ${status}`, ephemeral: true });
    } catch (err: any) {
      console.error('getsupportintercept failed:', err);
      return interaction.reply({ content: `Failed to get setting: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "setfounderrole") {
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
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
      return interaction.reply({ content: lines, ephemeral: true });
    } catch (err: any) {
      console.error('setfounderrole failed:', err);
      return interaction.reply({ content: `Failed to set founder role: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "addfounder") {
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
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
      return interaction.reply({ content: lines, ephemeral: true });
    } catch (err: any) {
      console.error('addfounder failed:', err);
      return interaction.reply({ content: `Failed to add founder: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "removefounder") {
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
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
      return interaction.reply({ content: lines, ephemeral: true });
    } catch (err: any) {
      console.error('removefounder failed:', err);
      return interaction.reply({ content: `Failed to remove founder: ${err?.message ?? err}`, ephemeral: true });
    }
  }
  if (name === "getfounders") {
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
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
        { name: "perks", description: "✨ View your unlocked perks and special abilities" },
        { name: "perkspanel", description: "Owner: post a perks claim panel in this channel" },
        { name: "claimperk", description: "Claim an unlocked perk", options: [ { name: "perk", description: "custom_color | priority_support | custom_emoji | channel_suggest | voice_priority | exclusive_role", type: 3, required: true } ] },
        { name: "setcolor", description: "Set your custom role color (requires custom_color perk)", options: [ { name: "hex", description: "Hex color like #FF8800", type: 3, required: true } ] },
        { name: "requestemoji", description: "Create a custom emoji (requires custom_emoji perk)", options: [ { name: "name", description: "Emoji name (letters, numbers, _)", type: 3, required: true }, { name: "image", description: "Emoji image (PNG/GIF)", type: 11, required: true } ] },
        { name: "setperkrole", description: "Owner: bind a server role to a perk so claims use it", options: [ { name: "perk", description: "custom_color|priority_support|custom_emoji|channel_suggest|voice_priority|exclusive_role", type: 3, required: true }, { name: "role", description: "Role to bind", type: 8, required: true } ] },
        { name: "patterns", description: "📈 Admin: View detected user behavior patterns" },
        { name: "insights", description: "🔮 Admin: Get AI predictions for best posting times" },
        { name: "checkins", description: "📋 Admin: View scheduled proactive user follow-ups" },
        { name: "sentiment", description: "💭 Admin: Real-time emotional analysis of conversations", options: [ { name: "channel", description: "Channel to analyze (defaults to current)", type: 7, required: false } ] },
        { name: "commonissues", description: "🔍 Admin: Detect recurring support issues", options: [ { name: "hours", description: "Hours to analyze (default 24)", type: 4, required: false } ] },
        { name: "faq", description: "❓ Quick access to frequently asked questions", options: [ { name: "category", description: "Filter by category", type: 3, required: false } ] }
      ];
      await client.application!.commands.set(cmds as any, interaction.guild.id);
      return interaction.reply({ content: `Re-registered ${cmds.length} slash commands for this server (${interaction.guild.name}).`, ephemeral: true });
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
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
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
        return interaction.reply({ content: "You are not authorized to use this feature.", ephemeral: true });
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
        return interaction.reply({ content: "You are not authorized to use this feature.", ephemeral: true });
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
        return interaction.reply({ content: "You are not authorized to use this feature.", ephemeral: true });
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
    if (!adminOrBypass(interaction.member)) {
      return interaction.reply({ content: "You are not authorized to use this feature.", ephemeral: true });
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
    if (!adminOrBypass(interaction.member)) {
      return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
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
    if (!adminOrBypass(interaction.member)) {
      return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    }
    const rules = responseRules.listRules();
    if (!rules.length) return interaction.reply({ content: 'No response rules configured.', ephemeral: true });
  const lines = rules.map(r => `${r.id} [${r.type}/${r.matchType}] trigger=${r.trigger} -> ${r.response ?? JSON.stringify(r.responsesPerLang ?? {})}`);
    // If too long, truncate
    const out = lines.join('\n').slice(0, 1900);
    return interaction.reply({ content: `Configured rules:\n${out}`, ephemeral: true });
  }

  if (name === 'delresponserule') {
    if (!adminOrBypass(interaction.member)) {
      return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    }
    const id = interaction.options.getString('id', true)!;
    const ok = responseRules.removeRule(id);
    return interaction.reply({ content: ok ? `Removed rule ${id}` : `Rule ${id} not found`, ephemeral: true });
  }

  if (name === 'setmodlog') {
    if (!adminOrBypass(interaction.member)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
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
    if (!adminOrBypass(interaction.member)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const id = getModLogChannelId();
    return interaction.reply({ content: id ? `Moderation log channel: <#${id}>` : 'Moderation log channel not set.', ephemeral: true });
  }

  if (name === 'clearmodlog') {
    if (!adminOrBypass(interaction.member)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    try { clearModLogChannelId(); return interaction.reply({ content: 'Moderation log channel cleared.', ephemeral: true }); } catch (e) { return interaction.reply({ content: 'Failed to clear moderation log channel.', ephemeral: true }); }
  }

  // New admin commands: warn / clearwarn / unmute / announce / membercount / purge
  if (name === 'warn') {
  if (!adminOrBypass(interaction.member)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') ?? 'No reason provided';
  if (!user) return interaction.reply({ content: 'User not found.', ephemeral: true });
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
    return interaction.reply({ content: `Warned ${user.tag}`, ephemeral: true });
  }

  if (name === 'clearwarn') {
    if (!adminOrBypass(interaction.member)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const user = interaction.options.getUser('user');
  const removed = user ? warnings.clearWarningsFor(user.id) : 0;
  return interaction.reply({ content: `Cleared ${removed} warnings for ${user?.tag ?? 'unknown user'}`, ephemeral: true });
  }

  if (name === 'unmute') {
    if (!adminOrBypass(interaction.member)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
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

  if (name === 'announce') {
    if (!adminOrBypass(interaction.member)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
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
    if (!adminOrBypass(interaction.member)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
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
    if (!adminOrBypass(interaction.member)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const count = interaction.options.getInteger('count', true) ?? 0;
    if (count < 1 || count > 100) return interaction.reply({ content: 'Count must be between 1 and 100.', ephemeral: true });
    try {
      const ch = interaction.channel;
      if (!ch || !('bulkDelete' in ch)) return interaction.reply({ content: 'This command must be used in a text channel.', ephemeral: true });
      // @ts-ignore
      const deleted = await (ch as any).bulkDelete(count, true);
      return interaction.reply({ content: `Deleted ${deleted.size ?? deleted} messages.`, ephemeral: true });
    } catch (err) {
      console.error('Purge failed', err);
      return interaction.reply({ content: 'Failed to purge messages. Messages older than 14 days cannot be bulk-deleted.', ephemeral: true });
    }
  }

    if (name === "setdefaultmute") {
      // admin-only
      if (!adminOrBypass(interaction.member)) {
        return interaction.reply({ content: "You are not authorized to use this feature.", ephemeral: true });
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
      return interaction.reply({ content: `Default mute duration: ${secs} seconds (${human}).`, ephemeral: true });
    }

    // Moderation interactions
    if (name === "kick" || name === "ban" || name === "mute" || name === "addrole" || name === "removerole") {
      // Admin or bypass permission check
      if (!adminOrBypass(interaction.member)) {
        return interaction.reply({ content: "You are not authorized to use this feature.", ephemeral: true });
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
    
    // Check whitelist/blacklist
    if (!isOwnerId(user.id)) {
      if (isBlacklisted(user.id, 'user')) {
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
          if (isBlacklisted(String(r), 'role')) {
            try {
              await user.send("You are blacklisted and cannot enter giveaways.");
            } catch { /* ignore */ }
            await reaction.users.remove(user.id);
            return;
          }
        }
        
        // Check whitelist
        let whitelisted = isWhitelisted(user.id, 'user');
        if (!whitelisted) {
          for (const r of roles) {
            if (isWhitelisted(String(r), 'role')) {
              whitelisted = true;
              break;
            }
          }
        }
        
        if (!whitelisted) {
          try {
            await user.send("My owner hasn't whitelisted you. You can either pay to use my services or buy Synapse script to use my commands and have a conversation for free.");
          } catch { /* ignore */ }
          await reaction.users.remove(user.id);
          return;
        }
        
        // Check requirements
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
  if (message.author.bot) return;

  // Blacklist check first (overrides everything except owner)
  const userId = message.author.id;
  
  if (!isOwnerId(userId)) {
    let blacklisted = isBlacklisted(userId, 'user');
    if (!blacklisted && message.member?.roles) {
      let roles: string[] = [];
      if (message.member.roles.cache) {
        roles = Array.from(message.member.roles.cache.keys());
      } else if (Array.isArray(message.member.roles)) {
        roles = message.member.roles.map((r: any) => typeof r === 'string' ? r : r.id);
      }
      for (const r of roles) {
        if (isBlacklisted(String(r), 'role')) {
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
  // Decide if the message is trying to interact with the bot (prefix, wake word, or direct mention)
  const tryingToUse = message.content.startsWith(prefix)
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
    console.warn('Global support intercept check failed:', (e as any)?.message ?? e);
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
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();

    if (!command) return;

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
      // Admin or bypass permission check
      if (!isAdminOrBypassForMessage(message.member)) {
        return message.reply("You are not authorized to use this feature.");
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
      if (count < 1 || count > 100) return message.reply('Count must be between 1 and 100.');
      try {
        // @ts-ignore
        const deleted = await (message.channel as any).bulkDelete(count, true);
        return message.reply(`Deleted ${deleted.size ?? deleted} messages.`);
      } catch (err) {
        console.error('Purge failed (prefix)', err);
        return message.reply('Failed to purge messages. Messages older than 14 days cannot be bulk-deleted.');
      }
    }

    // Prefix alias: unmute
    if (command === 'unmute') {
      if (!isAdminOrBypassForMessage(message.member) && !isOwnerId(message.author.id)) return message.reply('You are not authorized to use this feature.');
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

    // Prefix alias: warn / clearwarn
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
    if (isWakeWord(message, wakeWord)) {
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
      await handleConversationalReply(message);
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

    // Unrecognized button type
    return;
  } catch (err) {
    console.error('Button interaction error:', err);
    if (interaction.isRepliable()) {
      try { await interaction.reply({ content: 'Something went wrong updating the match.', ephemeral: true }); } catch {}
    }
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

client.login(token);
