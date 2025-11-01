import * as dotenv from "dotenv";
import * as path from "path";
// Ensure .env loads reliably in production: dist/ -> project root
dotenv.config({ path: path.join(__dirname, "../.env") });
import { Client, GatewayIntentBits, Partials, Message, PermissionsBitField } from "discord.js";
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



client.once("ready", () => {
  console.log(`Logged in as ${client.user?.tag}`);
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
    { name: "setmodel", description: "Owner: set AI model for a provider and restart", options: [
      { name: "provider", description: "openai or gemini", type: 3, required: true },
      { name: "model", description: "Model id (e.g., gpt-4o-mini or gemini-1.5-pro-latest)", type: 3, required: true }
    ] },
    { name: "diagai", description: "Owner: AI health check (env + test call)" },
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
    { name: "getdefaultmute", description: "Show the current default mute duration" }
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

  if (name === "help") return interaction.reply({ content: `Use ${prefix}help or mention me to get conversational replies. Use moderation commands with appropriate permissions.`, ephemeral: true });
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
    await interaction.reply({ content: 'Updating GEMINI_API_KEY on server and restarting...', ephemeral: true });
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
      // Restart bot to load new env
      const { exec } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        exec('pm2 restart synapseai-bot --update-env', (error) => {
          if (error) return reject(error);
          resolve();
        });
      });
      await interaction.followUp({ content: 'Gemini key updated and bot restarted. Try a message with the wake word to test.', ephemeral: true });
    } catch (err: any) {
      console.error('setgeminikey failed:', err);
      await interaction.followUp({ content: `Failed to update key: ${err?.message ?? err}`, ephemeral: true });
    }
    return;
  }
  if (name === "setopenai") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const newKey = interaction.options.getString('key', true).trim();
    if (!newKey || !/^sk-/.test(newKey)) {
      return interaction.reply({ content: 'That does not look like a valid OpenAI API key (expected to start with sk-).', ephemeral: true });
    }
    await interaction.reply({ content: 'Updating OPENAI_API_KEY on server and restarting...', ephemeral: true });
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
      const { exec } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        exec('pm2 restart synapseai-bot --update-env', (error) => error ? reject(error) : resolve());
      });
      await interaction.followUp({ content: 'OpenAI key updated and bot restarted.', ephemeral: true });
    } catch (err: any) {
      console.error('setopenai failed:', err);
      await interaction.followUp({ content: `Failed to update key: ${err?.message ?? err}`, ephemeral: true });
    }
    return;
  }
  if (name === "setprovider") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const provider = (interaction.options.getString('provider', true) || '').toLowerCase();
    if (!['openai','gemini'].includes(provider)) {
      return interaction.reply({ content: 'Provider must be openai or gemini.', ephemeral: true });
    }
    await interaction.reply({ content: `Setting AI_PROVIDER=${provider} and restarting...`, ephemeral: true });
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
      const { exec } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        exec('pm2 restart synapseai-bot --update-env', (error) => error ? reject(error) : resolve());
      });
      await interaction.followUp({ content: `Provider set to ${provider} and bot restarted.`, ephemeral: true });
    } catch (err: any) {
      console.error('setprovider failed:', err);
      await interaction.followUp({ content: `Failed to set provider: ${err?.message ?? err}`, ephemeral: true });
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
  if (name === "setmodel") {
    if (!isOwnerId(interaction.user.id)) return interaction.reply({ content: 'You are not authorized to use this feature.', ephemeral: true });
    const provider = (interaction.options.getString('provider', true) || '').toLowerCase();
    const model = interaction.options.getString('model', true).trim();
    if (!['openai','gemini'].includes(provider)) return interaction.reply({ content: 'Provider must be openai or gemini.', ephemeral: true });
    if (!model) return interaction.reply({ content: 'Model cannot be empty.', ephemeral: true });
    await interaction.reply({ content: `Setting ${provider.toUpperCase()} model to ${model} and restarting...`, ephemeral: true });
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
      const { exec } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        exec('pm2 restart synapseai-bot --update-env', (error) => error ? reject(error) : resolve());
      });
      await interaction.followUp({ content: `Model updated. Provider=${provider}, model=${model}`, ephemeral: true });
    } catch (err: any) {
      console.error('setmodel failed:', err);
      await interaction.followUp({ content: `setmodel failed: ${err?.message ?? err}`, ephemeral: true });
    }
    return;
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

process.on("SIGINT", () => {
  console.log("Shutting down gracefully...");
  client.destroy();
  process.exit(0);
});

client.login(token);
