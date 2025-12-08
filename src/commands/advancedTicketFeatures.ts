import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import {
  submitTicketFeedback,
  getStaffPerformanceMetrics,
  createAutoResponse,
  getAutoResponses,
  deleteAutoResponse,
  toggleAutoResponse,
  setStaffExpertise,
  getStaffExpertise,
  getAllStaffExpertise,
  getRoutingConfig,
  updateRoutingConfig,
  getAllStaffWorkloads
} from '../services/tickets';

// Handle ticket feedback command
export async function handleTicketFeedback(interaction: ChatInputCommandInteraction): Promise<void> {
  const subCmd = interaction.options.getSubcommand();

  if (subCmd === 'staff-stats') {
    const staffUser = interaction.options.getUser('staff', true);
    const metrics = getStaffPerformanceMetrics(interaction.guild!.id, staffUser.id);

    const embed = new EmbedBuilder()
      .setTitle(`📊 Performance Metrics - ${staffUser.tag}`)
      .setColor('#5865F2')
      .setThumbnail(staffUser.displayAvatarURL())
      .addFields(
        { name: '🎫 Total Tickets', value: metrics.total_tickets.toString(), inline: true },
        { name: '⭐ Average Rating', value: metrics.avg_rating > 0 ? `${metrics.avg_rating.toFixed(2)}/5.0` : 'No ratings yet', inline: true },
        { name: '📝 Total Ratings', value: metrics.rating_count.toString(), inline: true },
        { name: '⚡ Avg Response Time', value: `${metrics.avg_response_time} minutes`, inline: true },
        { name: '✅ Avg Resolution Time', value: `${metrics.avg_resolution_time} minutes`, inline: true },
        { name: '👍 Positive Feedback', value: `${metrics.positive_feedback_count} (${metrics.rating_count > 0 ? ((metrics.positive_feedback_count / metrics.rating_count) * 100).toFixed(1) : 0}%)`, inline: true }
      );

    if (Object.keys(metrics.rating_breakdown).length > 0) {
      const breakdown = Object.entries(metrics.rating_breakdown)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([rating, count]) => `${'⭐'.repeat(Number(rating))}: ${count}`)
        .join('\n');
      embed.addFields({ name: '📊 Rating Breakdown', value: breakdown, inline: false });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// Handle auto-response management
export async function handleAutoResponse(interaction: ChatInputCommandInteraction): Promise<void> {
  const subCmd = interaction.options.getSubcommand();

  if (subCmd === 'create') {
    const keywords = interaction.options.getString('keywords', true).split(',').map(k => k.trim());
    const response = interaction.options.getString('response', true);
    const category = interaction.options.getString('category');

    const id = createAutoResponse(interaction.guild!.id, keywords, response, category || undefined);

    const embed = new EmbedBuilder()
      .setTitle('✅ Auto-Response Created')
      .setColor('#57F287')
      .setDescription(`ID: ${id}`)
      .addFields(
        { name: 'Keywords', value: keywords.join(', '), inline: false },
        { name: 'Response', value: response.length > 1024 ? response.substring(0, 1021) + '...' : response, inline: false }
      );

    if (category) {
      embed.addFields({ name: 'Category', value: category, inline: true });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else if (subCmd === 'list') {
    const responses = getAutoResponses(interaction.guild!.id);

    if (responses.length === 0) {
      await interaction.reply({ content: '📋 No auto-responses configured.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🤖 Auto-Responses')
      .setColor('#5865F2')
      .setDescription(`Total: ${responses.length} responses`);

    responses.slice(0, 10).forEach(resp => {
      const keywords = JSON.parse(resp.trigger_keywords);
      embed.addFields({
        name: `ID ${resp.id} - ${resp.enabled ? '✅' : '❌'} (Used ${resp.use_count}x)`,
        value: `**Keywords:** ${keywords.join(', ')}\n**Response:** ${resp.response_message.substring(0, 100)}${resp.response_message.length > 100 ? '...' : ''}${resp.category ? `\n**Category:** ${resp.category}` : ''}`,
        inline: false
      });
    });

    if (responses.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${responses.length} responses` });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else if (subCmd === 'delete') {
    const id = interaction.options.getInteger('id', true);
    const success = deleteAutoResponse(interaction.guild!.id, id);

    if (success) {
      await interaction.reply({ content: `✅ Deleted auto-response ID ${id}.`, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: `❌ Auto-response ID ${id} not found.`, flags: MessageFlags.Ephemeral });
    }
  } else if (subCmd === 'toggle') {
    const id = interaction.options.getInteger('id', true);
    const enabled = interaction.options.getBoolean('enabled', true);
    const success = toggleAutoResponse(interaction.guild!.id, id, enabled);

    if (success) {
      await interaction.reply({ content: `✅ Auto-response ID ${id} ${enabled ? 'enabled' : 'disabled'}.`, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: `❌ Auto-response ID ${id} not found.`, flags: MessageFlags.Ephemeral });
    }
  }
}

// Handle staff expertise management
export async function handleStaffExpertise(interaction: ChatInputCommandInteraction): Promise<void> {
  const subCmd = interaction.options.getSubcommand();

  if (subCmd === 'set') {
    const staffUser = interaction.options.getUser('staff', true);
    const tags = interaction.options.getString('tags', true).split(',').map(t => t.trim());
    const specialization = interaction.options.getString('specialization');
    const autoAssign = interaction.options.getBoolean('auto_assign') ?? true;

    setStaffExpertise(interaction.guild!.id, staffUser.id, tags, specialization || undefined, autoAssign);

    const embed = new EmbedBuilder()
      .setTitle('✅ Staff Expertise Set')
      .setColor('#57F287')
      .setThumbnail(staffUser.displayAvatarURL())
      .addFields(
        { name: 'Staff Member', value: `<@${staffUser.id}>`, inline: true },
        { name: 'Expertise Tags', value: tags.join(', '), inline: true },
        { name: 'Auto-Assign', value: autoAssign ? 'Enabled' : 'Disabled', inline: true }
      );

    if (specialization) {
      embed.addFields({ name: 'Specialization', value: specialization, inline: false });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else if (subCmd === 'view') {
    const staffUser = interaction.options.getUser('staff', true);
    const expertise = getStaffExpertise(interaction.guild!.id, staffUser.id);

    if (!expertise) {
      await interaction.reply({ content: `❌ ${staffUser.tag} has no expertise configured.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const tags = JSON.parse(expertise.expertise_tags);
    const embed = new EmbedBuilder()
      .setTitle(`📚 Expertise - ${staffUser.tag}`)
      .setColor('#5865F2')
      .setThumbnail(staffUser.displayAvatarURL())
      .addFields(
        { name: 'Expertise Tags', value: tags.join(', '), inline: false },
        { name: 'Auto-Assign', value: expertise.auto_assign ? 'Enabled' : 'Disabled', inline: true }
      );

    if (expertise.specialization) {
      embed.addFields({ name: 'Specialization', value: expertise.specialization, inline: false });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else if (subCmd === 'list') {
    const allExpertise = getAllStaffExpertise(interaction.guild!.id);

    if (allExpertise.length === 0) {
      await interaction.reply({ content: '📋 No staff expertise configured.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📚 Staff Expertise List')
      .setColor('#5865F2')
      .setDescription(`Total: ${allExpertise.length} staff members`);

    allExpertise.slice(0, 10).forEach(exp => {
      const tags = JSON.parse(exp.expertise_tags);
      embed.addFields({
        name: `<@${exp.user_id}>`,
        value: `**Tags:** ${tags.join(', ')}${exp.specialization ? `\n**Specialization:** ${exp.specialization}` : ''}\n**Auto-Assign:** ${exp.auto_assign ? '✅' : '❌'}`,
        inline: false
      });
    });

    if (allExpertise.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${allExpertise.length} staff members` });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// Handle ticket routing configuration
export async function handleTicketRouting(interaction: ChatInputCommandInteraction): Promise<void> {
  const subCmd = interaction.options.getSubcommand();

  if (subCmd === 'config') {
    const mode = interaction.options.getString('mode') as 'round-robin' | 'load-balance' | 'expertise' | 'shift-based' | 'manual' | null;
    const autoAssign = interaction.options.getBoolean('auto_assign');
    const requireOnDuty = interaction.options.getBoolean('require_on_duty');
    const maxTickets = interaction.options.getInteger('max_tickets_per_staff');

    const updates: any = {};
    if (mode) updates.routing_mode = mode;
    if (autoAssign !== null) updates.auto_assign_enabled = autoAssign ? 1 : 0;
    if (requireOnDuty !== null) updates.require_on_duty = requireOnDuty ? 1 : 0;
    if (maxTickets !== null) updates.max_tickets_per_staff = maxTickets;

    updateRoutingConfig(interaction.guild!.id, updates);

    const config = getRoutingConfig(interaction.guild!.id);
    const embed = new EmbedBuilder()
      .setTitle('⚙️ Ticket Routing Configuration')
      .setColor('#5865F2')
      .addFields(
        { name: 'Routing Mode', value: config.routing_mode, inline: true },
        { name: 'Auto-Assign', value: config.auto_assign_enabled ? 'Enabled' : 'Disabled', inline: true },
        { name: 'Require On-Duty', value: config.require_on_duty ? 'Yes' : 'No', inline: true },
        { name: 'Max Tickets/Staff', value: config.max_tickets_per_staff.toString(), inline: true }
      )
      .setDescription(
        '**Routing Modes:**\n' +
        '• `round-robin`: Rotate through staff fairly\n' +
        '• `load-balance`: Assign to least busy staff\n' +
        '• `expertise`: Match ticket tags with staff expertise\n' +
        '• `shift-based`: Only assign to clocked-in staff\n' +
        '• `manual`: Disable auto-assignment'
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else if (subCmd === 'workload') {
    const workloads = getAllStaffWorkloads(interaction.guild!.id);

    if (workloads.length === 0) {
      await interaction.reply({ content: '📊 No staff currently handling tickets.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 Staff Workload Overview')
      .setColor('#5865F2')
      .setDescription('Current open tickets per staff member');

    workloads.sort((a, b) => b.workload - a.workload).forEach(work => {
      embed.addFields({
        name: `<@${work.staff_id}>`,
        value: `${work.workload} open ticket${work.workload !== 1 ? 's' : ''}`,
        inline: true
      });
    });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
