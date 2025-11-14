/**
 * Channel Suggestions Service
 * Handles channel suggestion submissions and reviews
 */

import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, ChannelType } from 'discord.js';
import { getDB } from './db';
import { getModLogChannelId } from '../config';

/**
 * Submit a channel suggestion and notify owner/modlog
 */
export async function submitChannelSuggestion(
    interaction: ChatInputCommandInteraction,
    suggestion: string
): Promise<void> {
    const guildId = interaction.guild?.id;
    if (!guildId) {
        throw new Error('Guild ID is required');
    }

    const db = getDB();
    
    // Create table if not exists with all columns
    db.prepare(`CREATE TABLE IF NOT EXISTS channel_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        guild_id TEXT,
        suggestion TEXT,
        status TEXT DEFAULT 'pending',
        reviewer_id TEXT,
        reviewed_at TEXT,
        decision_reason TEXT,
        dm_message_id TEXT,
        modlog_message_id TEXT,
        modlog_channel_id TEXT,
        created_at TEXT
    )`).run();
    
    // Add missing columns to existing tables (safe for existing installations)
    try { db.prepare('ALTER TABLE channel_suggestions ADD COLUMN reviewer_id TEXT').run(); } catch {}
    try { db.prepare('ALTER TABLE channel_suggestions ADD COLUMN reviewed_at TEXT').run(); } catch {}
    try { db.prepare('ALTER TABLE channel_suggestions ADD COLUMN decision_reason TEXT').run(); } catch {}
    try { db.prepare('ALTER TABLE channel_suggestions ADD COLUMN dm_message_id TEXT').run(); } catch {}
    try { db.prepare('ALTER TABLE channel_suggestions ADD COLUMN modlog_message_id TEXT').run(); } catch {}
    try { db.prepare('ALTER TABLE channel_suggestions ADD COLUMN modlog_channel_id TEXT').run(); } catch {}
    
    // Insert suggestion
    const result = db.prepare(`INSERT INTO channel_suggestions (user_id, guild_id, suggestion, status, created_at) VALUES (?, ?, ?, 'pending', ?)`)
        .run(interaction.user.id, guildId, suggestion, new Date().toISOString());
    
    const suggestionId = result.lastInsertRowid as number;
    
    // Create review embed
    const reviewEmbed = new EmbedBuilder()
        .setTitle('💡 New Channel Suggestion')
        .setColor(0x5865F2)
        .setDescription(suggestion)
        .addFields(
            { name: 'Suggested By', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
            { name: 'Suggestion ID', value: `#${suggestionId}`, inline: true },
            { name: 'Server', value: interaction.guild.name, inline: true }
        )
        .setTimestamp();
    
    // Create action buttons
    const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`channel_suggestion_accept_${suggestionId}`)
                .setLabel('Accept')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`channel_suggestion_decline_${suggestionId}`)
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );
    
    const ownerId = process.env.OWNER_ID;
    let dmMessageId: string | null = null;
    let modlogMessageId: string | null = null;
    let modlogChannelId: string | null = null;
    
    // Send to owner DM
    if (ownerId) {
        try {
            const owner = await interaction.client.users.fetch(ownerId);
            const dmMsg = await owner.send({ embeds: [reviewEmbed], components: [buttons] });
            dmMessageId = dmMsg.id;
        } catch (dmError) {
            console.log('Could not DM owner about channel suggestion:', dmError);
        }
    }
    
    // Send to mod log if configured
    try {
        const modLogId = getModLogChannelId();
        
        if (modLogId) {
            const modLogChannel = await interaction.guild.channels.fetch(modLogId);
            if (modLogChannel?.isTextBased()) {
                const modMsg = await modLogChannel.send({ embeds: [reviewEmbed], components: [buttons] });
                modlogMessageId = modMsg.id;
                modlogChannelId = modLogId;
            }
        }
    } catch (channelError) {
        console.log('Could not send to mod log:', channelError);
    }
    
    // Update the database with message IDs for later editing
    if (dmMessageId || modlogMessageId) {
        db.prepare('UPDATE channel_suggestions SET dm_message_id = ?, modlog_message_id = ?, modlog_channel_id = ? WHERE id = ?')
            .run(dmMessageId, modlogMessageId, modlogChannelId, suggestionId);
    }
}

/**
 * Handle accept/decline button interaction
 */
export async function handleChannelSuggestionButton(
    interaction: ButtonInteraction
): Promise<boolean> {
    const customId = interaction.customId;
    
    if (!customId.startsWith('channel_suggestion_accept_') && !customId.startsWith('channel_suggestion_decline_')) {
        return false;
    }
    
    // Only owner can review
    const ownerId = process.env.OWNER_ID;
    if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: '❌ Only the bot owner can review channel suggestions.', ephemeral: true });
        return true;
    }
    
    const accept = customId.startsWith('channel_suggestion_accept_');
    const suggestionId = Number(customId.split('_').pop());

    // Build modal for optional reason
    const modal = new ModalBuilder()
        .setCustomId(`cs_modal:${suggestionId}:${accept ? 1 : 0}:${interaction.channelId}:${interaction.message.id}`)
        .setTitle(accept ? 'Accept Channel Suggestion' : 'Decline Channel Suggestion');
    const reason = new TextInputBuilder()
        .setCustomId('cs_reason')
        .setLabel('Reason/Notes (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Why are you accepting/declining?');
    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reason);
    modal.addComponents(row);
    await interaction.showModal(modal);
    return true;
}

/**
 * Handle modal submit for channel suggestion decision
 */
export async function handleChannelSuggestionModal(interaction: ModalSubmitInteraction): Promise<boolean> {
    const id = interaction.customId;
    if (!id.startsWith('cs_modal:')) return false;

    // Only owner can submit decisions
    const ownerId = process.env.OWNER_ID;
    if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: '❌ Only the bot owner can review channel suggestions.', ephemeral: true });
        return true;
    }

    // cs_modal:{suggestionId}:{accept}:{channelId}:{messageId}
    const parts = id.split(':');
    const suggestionId = Number(parts[1]);
    const accept = parts[2] === '1';
    const channelId = parts[3];
    const messageId = parts[4];

    // Defer early to avoid "interaction failed" on long operations
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }
    } catch (e) {
        // Ignore defer errors; we'll try replying/editing below
        console.warn('channelSuggestions: failed to defer modal reply:', e);
    }

    const reason = (() => {
        try {
            return interaction.fields.getTextInputValue('cs_reason') || '';
        } catch {
            return '';
        }
    })();

    const db = getDB();

    const row = db.prepare('SELECT * FROM channel_suggestions WHERE id = ?').get(suggestionId) as any;
    if (!row) {
        const payload = { content: `Suggestion #${suggestionId} not found.` } as const;
        if (interaction.deferred) await interaction.editReply(payload);
        else await interaction.reply({ ...payload, ephemeral: true });
        return true;
    }
    if (row.status !== 'pending') {
        const payload = { content: `Suggestion #${suggestionId} is already ${row.status}.` } as const;
        if (interaction.deferred) await interaction.editReply(payload);
        else await interaction.reply({ ...payload, ephemeral: true });
        return true;
    }

    const newStatus = accept ? 'accepted' : 'declined';
    db.prepare('UPDATE channel_suggestions SET status = ?, reviewer_id = ?, reviewed_at = ?, decision_reason = ? WHERE id = ?')
        .run(newStatus, interaction.user.id, new Date().toISOString(), reason || null, suggestionId);

    // Notify the suggester via DM
    try {
        const user = await interaction.client.users.fetch(row.user_id);
        const notifyEmbed = new EmbedBuilder()
            .setTitle(accept ? '✅ Channel Suggestion Accepted' : '❌ Channel Suggestion Declined')
            .setColor(accept ? 0x57F287 : 0xED4245)
            .setDescription(`**Your Suggestion:**\n${row.suggestion}`)
            .addFields(
                { name: 'Status', value: accept ? 'Your suggestion has been accepted!' : 'Your suggestion has been declined.' },
                ...(reason ? [{ name: 'Reason', value: reason }] as any : [])
            )
            .setTimestamp();
        await user.send({ embeds: [notifyEmbed] });
    } catch (dmError) {
        console.log('Could not DM user about suggestion decision:', dmError);
    }

    // Update BOTH the DM and mod log review messages to show decision
    const updateContent = `${accept ? '✅ **Accepted**' : '❌ **Declined**'} by <@${interaction.user.id}>${reason ? `\nReason: ${reason}` : ''}`;
    
    // Update DM message if it exists
    if (row.dm_message_id && ownerId) {
        try {
            const owner = await interaction.client.users.fetch(ownerId);
            const dmChannel = await owner.createDM();
            const dmMsg = await dmChannel.messages.fetch(row.dm_message_id).catch(() => null);
            if (dmMsg) {
                await dmMsg.edit({
                    content: updateContent,
                    components: []
                }).catch(() => {});
            }
        } catch (editErr) {
            console.log('Could not edit DM review message:', editErr);
        }
    }
    
    // Update mod log message if it exists
    if (row.modlog_message_id && row.modlog_channel_id) {
        try {
            const modChannel = await interaction.client.channels.fetch(row.modlog_channel_id).catch(() => null);
            if (modChannel && 'isTextBased' in modChannel && (modChannel as any).isTextBased()) {
                const modMsg = await (modChannel as any).messages.fetch(row.modlog_message_id).catch(() => null);
                if (modMsg) {
                    await modMsg.edit({
                        content: updateContent,
                        components: []
                    }).catch(() => {});
                }
            }
        } catch (editErr) {
            console.log('Could not edit mod log review message:', editErr);
        }
    }

    const donePayload = { content: `Saved decision for suggestion #${suggestionId}.` } as const;
    if (interaction.deferred) await interaction.editReply(donePayload);
    else await interaction.reply({ ...donePayload, ephemeral: true });
    return true;
}
