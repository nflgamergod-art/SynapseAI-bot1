/**
 * Channel Suggestions Service
 * Handles channel suggestion submissions and reviews
 */

import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, ChannelType } from 'discord.js';
import { getDB } from './db';

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
    
    // Create table if not exists
    db.prepare(`CREATE TABLE IF NOT EXISTS channel_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        guild_id TEXT,
        suggestion TEXT,
        status TEXT,
        reviewer_id TEXT,
        reviewed_at TEXT,
        created_at TEXT
    )`).run();
    
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
    
    // Send to owner DM
    if (ownerId) {
        try {
            const owner = await interaction.client.users.fetch(ownerId);
            await owner.send({ embeds: [reviewEmbed], components: [buttons] });
        } catch (dmError) {
            console.log('Could not DM owner about channel suggestion:', dmError);
        }
    }
    
    // Send to mod log if configured
    try {
        const modLogRow = db.prepare('SELECT value FROM settings WHERE guild_id = ? AND key = ?')
            .get(guildId, 'modlog_channel') as any;
        
        if (modLogRow?.value) {
            const modLogChannel = await interaction.guild.channels.fetch(modLogRow.value);
            if (modLogChannel?.isTextBased()) {
                await modLogChannel.send({ embeds: [reviewEmbed], components: [buttons] });
            }
        }
    } catch (channelError) {
        console.log('Could not send to mod log:', channelError);
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

    const reason = interaction.fields.getTextInputValue('cs_reason') || '';

    const db = getDB();
    // Ensure decision_reason column exists
    try { db.prepare('ALTER TABLE channel_suggestions ADD COLUMN decision_reason TEXT').run(); } catch {}

    const row = db.prepare('SELECT * FROM channel_suggestions WHERE id = ?').get(suggestionId) as any;
    if (!row) {
        await interaction.reply({ content: `Suggestion #${suggestionId} not found.`, ephemeral: true });
        return true;
    }
    if (row.status !== 'pending') {
        await interaction.reply({ content: `Suggestion #${suggestionId} is already ${row.status}.`, ephemeral: true });
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

    // Update the original review message to show decision
    try {
        const channel = await interaction.client.channels.fetch(channelId);
        if (channel && channel.type === ChannelType.GuildText) {
            const msg = await (channel as any).messages.fetch(messageId);
            await msg.edit({
                content: `${accept ? '✅ **Accepted**' : '❌ **Declined**'} by <@${interaction.user.id}>${reason ? `\nReason: ${reason}` : ''}`,
                components: []
            });
        }
    } catch (editErr) {
        console.log('Could not edit original review message:', editErr);
    }

    await interaction.reply({ content: `Saved decision for suggestion #${suggestionId}.`, ephemeral: true });
    return true;
}
