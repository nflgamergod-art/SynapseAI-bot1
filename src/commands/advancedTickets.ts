import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import * as tickets from '../services/tickets';

export const commands = [
  // ==================== SLA COMMANDS ====================
  new SlashCommandBuilder()
    .setName('ticketsla')
    .setDescription('Configure SLA (Service Level Agreement) times for tickets')
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Set SLA response and resolution times')
      .addIntegerOption(opt => opt
        .setName('response_time')
        .setDescription('Minutes for first response (default: 30)')
        .setRequired(true)
        .setMinValue(1))
      .addIntegerOption(opt => opt
        .setName('resolution_time')
        .setDescription('Minutes for ticket resolution (default: 180)')
        .setRequired(true)
        .setMinValue(1))
      .addIntegerOption(opt => opt
        .setName('priority_response')
        .setDescription('Minutes for priority ticket response (default: 5)')
        .setRequired(true)
        .setMinValue(1)))
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current SLA times'))
    .addSubcommand(sub => sub
      .setName('check')
      .setDescription('Check tickets breaching SLA'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // ==================== TAG COMMANDS ====================
  new SlashCommandBuilder()
    .setName('tickettag')
    .setDescription('Manage ticket tags for better organization')
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a new ticket tag')
      .addStringOption(opt => opt
        .setName('name')
        .setDescription('Tag name (e.g., bug, feature, urgent)')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('color')
        .setDescription('Tag color (e.g., red, blue, green, yellow, purple)')
        .setRequired(true)
        .addChoices(
          { name: '🔴 Red', value: 'red' },
          { name: '🔵 Blue', value: 'blue' },
          { name: '🟢 Green', value: 'green' },
          { name: '🟡 Yellow', value: 'yellow' },
          { name: '🟣 Purple', value: 'purple' },
          { name: '🟠 Orange', value: 'orange' }
        ))
      .addStringOption(opt => opt
        .setName('description')
        .setDescription('Tag description')
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Delete a ticket tag')
      .addStringOption(opt => opt
        .setName('name')
        .setDescription('Tag name to delete')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all available ticket tags'))
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a tag to a ticket')
      .addIntegerOption(opt => opt
        .setName('ticket_id')
        .setDescription('Ticket ID')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('tag')
        .setDescription('Tag name')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a tag from a ticket')
      .addIntegerOption(opt => opt
        .setName('ticket_id')
        .setDescription('Ticket ID')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('tag')
        .setDescription('Tag name')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('search')
      .setDescription('Find tickets with a specific tag')
      .addStringOption(opt => opt
        .setName('tag')
        .setDescription('Tag name')
        .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ==================== NOTES COMMANDS ====================
  new SlashCommandBuilder()
    .setName('ticketnote')
    .setDescription('Manage private staff notes on tickets')
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a private note to a ticket')
      .addIntegerOption(opt => opt
        .setName('ticket_id')
        .setDescription('Ticket ID')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('note')
        .setDescription('Private note (only visible to staff)')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View all notes for a ticket')
      .addIntegerOption(opt => opt
        .setName('ticket_id')
        .setDescription('Ticket ID')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Delete a note')
      .addIntegerOption(opt => opt
        .setName('note_id')
        .setDescription('Note ID')
        .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ==================== ANALYTICS COMMAND ====================
  new SlashCommandBuilder()
    .setName('ticketanalytics')
    .setDescription('View comprehensive ticket analytics and statistics')
    .addIntegerOption(opt => opt
      .setName('days')
      .setDescription('Number of days to analyze (default: 30)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(365))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
];

export async function handleTicketSLA(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  
  if (subcommand === 'set') {
    const responseTime = interaction.options.getInteger('response_time', true);
    const resolutionTime = interaction.options.getInteger('resolution_time', true);
    const priorityResponse = interaction.options.getInteger('priority_response', true);
    
    const success = tickets.setSLATimes(guildId, responseTime, resolutionTime, priorityResponse);
    
    if (success) {
      const embed = new EmbedBuilder()
        .setTitle('✅ SLA Times Updated')
        .setColor(0x00FF00)
        .addFields(
          { name: 'First Response Time', value: `${responseTime} minutes`, inline: true },
          { name: 'Resolution Time', value: `${resolutionTime} minutes`, inline: true },
          { name: 'Priority Response Time', value: `${priorityResponse} minutes`, inline: true }
        )
        .setTimestamp();
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
      return interaction.reply({ content: '❌ Failed to update SLA times. Make sure ticket system is configured.', ephemeral: true });
    }
  }
  
  if (subcommand === 'view') {
    const sla = tickets.getSLATimes(guildId);
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Current SLA Times')
      .setColor(0x5865F2)
      .addFields(
        { name: 'First Response Time', value: `${sla.response} minutes`, inline: true },
        { name: 'Resolution Time', value: `${sla.resolution} minutes`, inline: true },
        { name: 'Priority Response Time', value: `${sla.priorityResponse} minutes`, inline: true }
      )
      .setDescription('These are the target response times for your support team.')
      .setTimestamp();
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  
  if (subcommand === 'check') {
    const breaching = tickets.getTicketsBreachingSLA(guildId);
    
    if (breaching.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('✅ All Tickets Within SLA')
        .setColor(0x00FF00)
        .setDescription('No tickets are currently breaching SLA targets.')
        .setTimestamp();
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Tickets Breaching SLA')
      .setColor(0xFF0000)
      .setDescription(`${breaching.length} ticket(s) are breaching SLA targets:`)
      .setTimestamp();
    
    breaching.slice(0, 10).forEach(ticket => {
      const breach = tickets.checkSLABreach(ticket, guildId);
      const waitTime = tickets.getTicketWaitTime(ticket);
      embed.addFields({
        name: `🎫 Ticket #${ticket.id}`,
        value: `Status: ${ticket.status}\nWait Time: ${waitTime} min\nBreach Type: ${breach.type}\nOver by: ${breach.minutesOver} min\nChannel: <#${ticket.channel_id}>`,
        inline: false
      });
    });
    
    if (breaching.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${breaching.length} breaching tickets` });
    }
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

export async function handleTicketTag(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  
  if (subcommand === 'create') {
    const name = interaction.options.getString('name', true).toLowerCase();
    const color = interaction.options.getString('color', true);
    const description = interaction.options.getString('description');
    
    const success = tickets.createTicketTag(guildId, name, color, description || undefined);
    
    if (success) {
      const colorEmojis: { [key: string]: string } = {
        red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡', purple: '🟣', orange: '🟠'
      };
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Tag Created')
        .setColor(0x00FF00)
        .setDescription(`Tag **${colorEmojis[color]} ${name}** has been created.`)
        .setTimestamp();
      
      if (description) {
        embed.addFields({ name: 'Description', value: description });
      }
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
      return interaction.reply({ content: '❌ Failed to create tag.', ephemeral: true });
    }
  }
  
  if (subcommand === 'delete') {
    const name = interaction.options.getString('name', true).toLowerCase();
    
    const success = tickets.deleteTicketTag(guildId, name);
    
    if (success) {
      return interaction.reply({ content: `✅ Tag **${name}** has been deleted.`, ephemeral: true });
    } else {
      return interaction.reply({ content: `❌ Tag **${name}** not found.`, ephemeral: true });
    }
  }
  
  if (subcommand === 'list') {
    const tags = tickets.getTicketTags(guildId);
    
    if (tags.length === 0) {
      return interaction.reply({ content: '❌ No tags have been created yet. Use `/tickettag create` to add some!', ephemeral: true });
    }
    
    const colorEmojis: { [key: string]: string } = {
      red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡', purple: '🟣', orange: '🟠'
    };
    
    const embed = new EmbedBuilder()
      .setTitle('🏷️ Available Ticket Tags')
      .setColor(0x5865F2)
      .setDescription(tags.map(tag => {
        const emoji = colorEmojis[tag.color] || '⚪';
        const desc = tag.description ? ` - ${tag.description}` : '';
        return `${emoji} **${tag.name}**${desc}`;
      }).join('\n'))
      .setTimestamp();
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  
  if (subcommand === 'add') {
    const ticketId = interaction.options.getInteger('ticket_id', true);
    const tag = interaction.options.getString('tag', true).toLowerCase();
    
    // Get ticket before updating to check channel
    const ticketBefore = tickets.getTicketById(ticketId);
    if (!ticketBefore) {
      return interaction.reply({ content: `❌ Ticket #${ticketId} not found.`, ephemeral: true });
    }
    
    const success = tickets.addTagToTicket(ticketId, tag);
    
    if (success) {
      // Get updated ticket after adding tag
      const ticket = tickets.getTicketById(ticketId);
      
      // Try to send a message to the ticket channel
      try {
        if (ticket && interaction.guild) {
          const channel = await interaction.guild.channels.fetch(ticket.channel_id).catch(() => null);
          if (channel && channel.isTextBased()) {
            const tags = ticket.tags ? JSON.parse(ticket.tags) : [];
            const tagsDisplay = tags.map((t: string) => `\`${t}\``).join(', ');
            await (channel as any).send(`🏷️ Tag **${tag}** added by <@${interaction.user.id}>\n**Current tags:** ${tagsDisplay}`);
          }
        }
      } catch (e) {
        console.error('Failed to send tag update to channel:', e);
      }
      return interaction.reply({ content: `✅ Tag **${tag}** added to ticket #${ticketId}.`, ephemeral: true });
    } else {
      return interaction.reply({ content: `❌ This ticket already has the tag **${tag}**.`, ephemeral: true });
    }
  }
  
  if (subcommand === 'remove') {
    const ticketId = interaction.options.getInteger('ticket_id', true);
    const tag = interaction.options.getString('tag', true).toLowerCase();
    
    // Get ticket before updating to check channel
    const ticketBefore = tickets.getTicketById(ticketId);
    if (!ticketBefore) {
      return interaction.reply({ content: `❌ Ticket #${ticketId} not found.`, ephemeral: true });
    }
    
    const success = tickets.removeTagFromTicket(ticketId, tag);
    
    if (success) {
      // Get updated ticket after removing tag
      const ticket = tickets.getTicketById(ticketId);
      
      // Try to send a message to the ticket channel
      try {
        if (ticket && interaction.guild) {
          const channel = await interaction.guild.channels.fetch(ticket.channel_id).catch(() => null);
          if (channel && channel.isTextBased()) {
            const tags = ticket.tags ? JSON.parse(ticket.tags) : [];
            const tagsDisplay = tags.length > 0 ? tags.map((t: string) => `\`${t}\``).join(', ') : 'None';
            await (channel as any).send(`🏷️ Tag **${tag}** removed by <@${interaction.user.id}>\n**Current tags:** ${tagsDisplay}`);
          }
        }
      } catch (e) {
        console.error('Failed to send tag update to channel:', e);
      }
      return interaction.reply({ content: `✅ Tag **${tag}** removed from ticket #${ticketId}.`, ephemeral: true });
    } else {
      return interaction.reply({ content: `❌ This ticket doesn't have the tag **${tag}**.`, ephemeral: true });
    }
  }
  
  if (subcommand === 'search') {
    const tag = interaction.options.getString('tag', true).toLowerCase();
    const results = tickets.getTicketsByTag(guildId, tag);
    
    if (results.length === 0) {
      return interaction.reply({ content: `❌ No tickets found with tag **${tag}**.`, ephemeral: true });
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`🔍 Tickets with Tag: ${tag}`)
      .setColor(0x5865F2)
      .setDescription(`Found ${results.length} ticket(s):`)
      .setTimestamp();
    
    results.slice(0, 10).forEach(ticket => {
      const status = ticket.status === 'open' ? '🟢 Open' : ticket.status === 'claimed' ? '🟡 Claimed' : '🔴 Closed';
      embed.addFields({
        name: `🎫 Ticket #${ticket.id}`,
        value: `Status: ${status}\nCategory: ${ticket.category}\nChannel: <#${ticket.channel_id}>`,
        inline: true
      });
    });
    
    if (results.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${results.length} tickets` });
    }
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

export async function handleTicketNote(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  
  const subcommand = interaction.options.getSubcommand();
  
  if (subcommand === 'add') {
    const ticketId = interaction.options.getInteger('ticket_id', true);
    const note = interaction.options.getString('note', true);
    
    const ticket = tickets.getTicketById(ticketId);
    if (!ticket) {
      return interaction.reply({ content: `❌ Ticket #${ticketId} not found.`, ephemeral: true });
    }
    
    const noteId = tickets.addTicketNote(ticketId, interaction.user.id, note);
    
    const embed = new EmbedBuilder()
      .setTitle('📝 Note Added')
      .setColor(0x00FF00)
      .setDescription(`Private note added to ticket #${ticketId}`)
      .addFields(
        { name: 'Note ID', value: `${noteId}`, inline: true },
        { name: 'Added by', value: `<@${interaction.user.id}>`, inline: true }
      )
      .setTimestamp();
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  
  if (subcommand === 'view') {
    const ticketId = interaction.options.getInteger('ticket_id', true);
    
    const ticket = tickets.getTicketById(ticketId);
    if (!ticket) {
      return interaction.reply({ content: `❌ Ticket #${ticketId} not found.`, ephemeral: true });
    }
    
    const notes = tickets.getTicketNotes(ticketId);
    
    if (notes.length === 0) {
      return interaction.reply({ content: `📝 No notes found for ticket #${ticketId}.`, ephemeral: true });
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`📝 Private Notes - Ticket #${ticketId}`)
      .setColor(0x5865F2)
      .setDescription(`${notes.length} note(s) found:`)
      .setTimestamp();
    
    notes.forEach(note => {
      const timestamp = new Date(note.created_at).toLocaleString();
      embed.addFields({
        name: `Note #${note.id} - <@${note.user_id}>`,
        value: `${note.note}\n*${timestamp}*`,
        inline: false
      });
    });
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  
  if (subcommand === 'delete') {
    const noteId = interaction.options.getInteger('note_id', true);
    
    const success = tickets.deleteTicketNote(noteId);
    
    if (success) {
      return interaction.reply({ content: `✅ Note #${noteId} has been deleted.`, ephemeral: true });
    } else {
      return interaction.reply({ content: `❌ Note #${noteId} not found.`, ephemeral: true });
    }
  }
}

export async function handleTicketAnalytics(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  
  await interaction.deferReply({ ephemeral: true });
  
  const days = interaction.options.getInteger('days') || 30;
  const guildId = interaction.guild.id;
  
  const analytics = tickets.getTicketAnalytics(guildId, days);
  
  const embed = new EmbedBuilder()
    .setTitle(`📊 Ticket Analytics (Last ${days} Days)`)
    .setColor(0x5865F2)
    .addFields(
      { name: '📈 Total Tickets', value: `${analytics.total_tickets}`, inline: true },
      { name: '🟢 Open Tickets', value: `${analytics.open_tickets}`, inline: true },
      { name: '🔴 Closed Tickets', value: `${analytics.closed_tickets}`, inline: true },
      { name: '⏱️ Avg Response Time', value: `${analytics.avg_response_time} min`, inline: true },
      { name: '⏰ Avg Resolution Time', value: `${analytics.avg_resolution_time} min`, inline: true },
      { name: '✅ SLA Compliance', value: `${analytics.sla_compliance_rate}%`, inline: true }
    )
    .setTimestamp();
  
  // Add tickets by category
  if (Object.keys(analytics.tickets_by_category).length > 0) {
    const categoryText = Object.entries(analytics.tickets_by_category)
      .map(([cat, count]) => `**${cat}**: ${count}`)
      .join('\n');
    embed.addFields({ name: '📂 Tickets by Category', value: categoryText, inline: false });
  }
  
  // Add tickets by tag
  if (Object.keys(analytics.tickets_by_tag).length > 0) {
    const tagText = Object.entries(analytics.tickets_by_tag)
      .slice(0, 10)
      .map(([tag, count]) => `**${tag}**: ${count}`)
      .join('\n');
    embed.addFields({ name: '🏷️ Top Tags', value: tagText, inline: false });
  }
  
  // Add top staff
  if (analytics.top_staff.length > 0) {
    const staffText = analytics.top_staff
      .slice(0, 5)
      .map((staff, idx) => `${idx + 1}. <@${staff.user_id}>: ${staff.ticket_count} tickets (⭐ ${staff.avg_rating.toFixed(1)})`)
      .join('\n');
    embed.addFields({ name: '⭐ Top Staff', value: staffText, inline: false });
  }
  
  return interaction.editReply({ embeds: [embed] });
}
