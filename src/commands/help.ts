import { Message, EmbedBuilder } from "discord.js";

export function helpCommand(message: Message, prefix: string) {
  const embed = new EmbedBuilder()
    .setTitle('📖 SynapseAI Bot Commands')
    .setColor(0x3498db)
    .setDescription(`*You can use either \`${prefix}\` or \`.\` as prefix*`)
    .addFields(
      {
        name: '🎮 General',
        value: `\`${prefix}help\` - Show this help
\`${prefix}ping\` - Check latency
\`${prefix}joke\` - Random joke
\`${prefix}dadjoke\` - Dad joke`,
        inline: false
      },
      {
        name: '🔨 Moderation (Admin)',
        value: `\`${prefix}kick @user [reason]\`
\`${prefix}ban @user [reason]\`
\`${prefix}mute @user [duration]\`
\`${prefix}addrole @user @role\`
\`${prefix}removerole @user @role\``,
        inline: false
      },
      {
        name: '🎯 Popular Slash Commands',
        value: '`/supportstats` - View support stats\n`/kb search` - Search knowledge base\n`/achievements` - View achievements\n`/perks` - Unlock special abilities\n`/remember` - Save preferences\n`/rpsai` `/blackjack` - Play games',
        inline: false
      },
      {
        name: '💬 AI Interaction',
        value: '• Mention @SynapseAI for AI replies\n• Say "SynapseAI" in messages\n• Bot learns from conversations!',
        inline: false
      },
      {
        name: '🔒 Security',
        value: '• Anti-spam (3 warnings = blacklist)\n• Content filtering\n• No @everyone/@here abuse',
        inline: false
      }
    )
    .setFooter({ text: 'Type /kb search to find more answers • Bot auto-saves helpful Q&A' });

  message.reply({ embeds: [embed] });
}
