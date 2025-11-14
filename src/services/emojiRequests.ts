import { ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Interaction, Guild, User } from 'discord.js';
import { getDB } from './db';
import { getModLogChannelId } from '../config';

// Ensure schema exists and columns added
function initEmojiRequestSchema() {
  const db = getDB();
  db.exec(`CREATE TABLE IF NOT EXISTS emoji_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    attachment_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewer_id TEXT,
    reviewed_at TEXT,
    decision_reason TEXT,
    dm_message_id TEXT,
    modlog_message_id TEXT,
    modlog_channel_id TEXT,
    final_emoji_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  // Add missing columns for existing deployments
  const columns = ['reviewer_id','reviewed_at','decision_reason','dm_message_id','modlog_message_id','modlog_channel_id','final_emoji_id','error'];
  for (const col of columns) {
    try { db.prepare(`ALTER TABLE emoji_requests ADD COLUMN ${col} TEXT`).run(); } catch {}
  }
}

export async function submitEmojiRequest(interaction: any, name: string, attachmentUrl: string) {
  initEmojiRequestSchema();
  const db = getDB();
  const guildId = interaction.guild?.id;
  if (!guildId) throw new Error('Must be used in a guild.');
  const userId = interaction.user.id;
  const insert = db.prepare(`INSERT INTO emoji_requests (user_id, guild_id, name, attachment_url, status) VALUES (?, ?, ?, ?, 'pending')`);
  const result = insert.run(userId, guildId, name, attachmentUrl);
  const requestId = result.lastInsertRowid as number;

  const ownerId = process.env.OWNER_ID;
  let dmMessageId: string | null = null;
  let modlogMessageId: string | null = null;
  let modlogChannelId: string | null = null;

  const acceptBtn = new ButtonBuilder().setCustomId(`emoji_request_accept_${requestId}`).setLabel('Accept').setStyle(ButtonStyle.Success);
  const declineBtn = new ButtonBuilder().setCustomId(`emoji_request_decline_${requestId}`).setLabel('Decline').setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, declineBtn);

  const requestSummary = `Emoji Name: **${name}**\nRequested by <@${userId}>\nImage: ${attachmentUrl}`;

  // Owner DM
  if (ownerId) {
    try {
      const owner = await interaction.client.users.fetch(ownerId);
      const dm = await owner.createDM();
      const dmMsg = await dm.send({ content: `🆕 Emoji Request #${requestId}\n${requestSummary}`, components: [row] });
      dmMessageId = dmMsg.id;
    } catch (e) {
      console.log('Failed to send owner DM for emoji request:', e);
    }
  }

  // Mod log channel
  try {
    const modLogId = getModLogChannelId();
    if (modLogId) {
      const channel = await interaction.client.channels.fetch(modLogId).catch(() => null);
      if (channel && 'isTextBased' in channel && (channel as any).isTextBased()) {
        const modMsg = await (channel as any).send({ content: `🆕 Emoji Request #${requestId}\n${requestSummary}`, components: [row] });
        modlogMessageId = modMsg.id;
        modlogChannelId = modLogId;
      }
    }
  } catch (e) {
    console.log('Failed to send mod log emoji request message:', e);
  }

  // Store message IDs
  db.prepare(`UPDATE emoji_requests SET dm_message_id = ?, modlog_message_id = ?, modlog_channel_id = ? WHERE id = ?`).run(dmMessageId, modlogMessageId, modlogChannelId, requestId);

  return requestId;
}

export async function handleEmojiRequestButton(interaction: any) {
  const { customId } = interaction;
  if (!customId.startsWith('emoji_request_accept_') && !customId.startsWith('emoji_request_decline_')) return false;
  const accept = customId.startsWith('emoji_request_accept_');
  const idStr = customId.replace(accept ? 'emoji_request_accept_' : 'emoji_request_decline_', '');
  const requestId = parseInt(idStr, 10);
  if (Number.isNaN(requestId)) return false;

  const channelId = interaction.channel?.id;
  const messageId = interaction.message?.id;
  if (!channelId || !messageId) return false;

  const modal = new ModalBuilder()
    .setCustomId(`emoji_modal:${requestId}:${accept ? '1' : '0'}:${channelId}:${messageId}`)
    .setTitle(`${accept ? 'Accept' : 'Decline'} Emoji Request #${requestId}`);
  const reasonInput = new TextInputBuilder()
    .setCustomId('emoji_reason')
    .setLabel('Reason / Notes (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);
  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
  modal.addComponents(row);
  await interaction.showModal(modal);
  return true;
}

export async function handleEmojiRequestModal(interaction: any) {
  if (!interaction.isModalSubmit()) return false;
  if (!interaction.customId.startsWith('emoji_modal:')) return false;
  const parts = interaction.customId.split(':');
  // emoji_modal:{requestId}:{accept}:{channelId}:{messageId}
  const requestId = parseInt(parts[1], 10);
  const accept = parts[2] === '1';
  const channelId = parts[3];
  const messageId = parts[4];
  const reason = interaction.fields.getTextInputValue('emoji_reason') || '';

  const db = getDB();
  const row = db.prepare('SELECT * FROM emoji_requests WHERE id = ?').get(requestId) as any;
  if (!row) {
    await interaction.reply({ content: 'Emoji request not found.', ephemeral: true });
    return true;
  }
  if (row.status !== 'pending') {
    await interaction.reply({ content: 'This emoji request has already been reviewed.', ephemeral: true });
    return true;
  }

  // Attempt emoji creation if accepted
  let finalEmojiId: string | null = null;
  let status = accept ? 'accepted' : 'declined';
  let error: string | null = null;
  if (accept) {
    try {
      const guild: Guild | null = await interaction.client.guilds.fetch(row.guild_id).catch(() => null);
      if (!guild) throw new Error('Guild not found');
      // discord.js v14 create: guild.emojis.create({ attachment: url, name })
      const created = await guild.emojis.create({ attachment: row.attachment_url, name: row.name });
      finalEmojiId = created.id;
    } catch (e: any) {
      status = 'error';
      error = e?.message || String(e);
    }
  }

  db.prepare(`UPDATE emoji_requests SET status = ?, reviewer_id = ?, reviewed_at = ?, decision_reason = ?, final_emoji_id = ?, error = ? WHERE id = ?`)
    .run(status, interaction.user.id, new Date().toISOString(), reason || null, finalEmojiId, error, requestId);

  // Notify requester
  try {
    const requester: User = await interaction.client.users.fetch(row.user_id);
    const note = reason ? `\nReason: ${reason}` : '';
    if (status === 'accepted') {
      await requester.send(`✅ Your emoji request **${row.name}** was approved! ${finalEmojiId ? `<:${row.name}:${finalEmojiId}>` : ''}${note}`)
        .catch(() => {});
    } else if (status === 'declined') {
      await requester.send(`❌ Your emoji request **${row.name}** was declined.${note}`)
        .catch(() => {});
    } else if (status === 'error') {
      await requester.send(`⚠️ Your emoji request **${row.name}** was approved but failed to create. Error: ${error}${note}`)
        .catch(() => {});
    }
  } catch (e) {
    console.log('Failed to DM requester about emoji decision:', e);
  }

  // Update both DM and mod log messages
  const updateContent = `${accept ? (status === 'error' ? '⚠️ Emoji creation failed' : '✅ Accepted') : '❌ Declined'} by <@${interaction.user.id}>${reason ? `\nReason: ${reason}` : ''}${finalEmojiId ? `\nEmoji: <:${row.name}:${finalEmojiId}>` : ''}${error ? `\nError: ${error}` : ''}`;

  // DM message
  if (row.dm_message_id && process.env.OWNER_ID) {
    try {
      const owner = await interaction.client.users.fetch(process.env.OWNER_ID);
      const dm = await owner.createDM();
      const dmMsg = await dm.messages.fetch(row.dm_message_id).catch(() => null);
      if (dmMsg) await dmMsg.edit({ content: updateContent, components: [] }).catch(() => {});
    } catch (e) { console.log('Edit DM emoji request message failed:', e); }
  }
  // Mod log message
  if (row.modlog_message_id && row.modlog_channel_id) {
    try {
      const ch = await interaction.client.channels.fetch(row.modlog_channel_id).catch(() => null);
      if (ch && 'isTextBased' in ch && (ch as any).isTextBased()) {
        const modMsg = await (ch as any).messages.fetch(row.modlog_message_id).catch(() => null);
        if (modMsg) await modMsg.edit({ content: updateContent, components: [] }).catch(() => {});
      }
    } catch (e) { console.log('Edit mod log emoji request message failed:', e); }
  }

  // Acknowledge modal
  await interaction.reply({ content: `Processed emoji request #${requestId} (${status}).`, ephemeral: true });
  return true;
}
