import { EmbedBuilder, Colors, Guild, User, TextChannel } from "discord.js";
import { getModLogChannelId } from "../config";

export type ModerationAction = "Warned" | "Kicked" | "Banned" | "Muted";

function humanizeSeconds(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  totalSeconds %= 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  if (seconds && parts.length < 2) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
  return parts.join(', ') || '0 seconds';
}

export function buildModerationEmbed(params: {
  action: ModerationAction,
  guildName: string,
  targetId: string,
  targetTag?: string,
  moderatorId: string,
  moderatorTag?: string,
  reason: string,
  durationSeconds?: number,
}) {
  const { action, guildName, targetId, targetTag, moderatorId, moderatorTag, reason, durationSeconds } = params;
  const color = action === 'Banned' || action === 'Kicked' ? Colors.Red : (action === 'Muted' ? Colors.Orange : Colors.Yellow);

  const embed = new EmbedBuilder()
    .setTitle(`You have been ${action}`)
    .setColor(color)
    .setDescription(
      `<@${targetId}>\n\n` +
      `Reason: ${reason || 'No reason provided'}\n\n` +
      (durationSeconds ? `Duration: ${humanizeSeconds(durationSeconds)}\n\n` : '') +
      `${action} by: <@${moderatorId}>\n\n` +
      `in ${guildName}`
    )
    .setFooter({ text: "SynapseAI created by PobKC and the SynapseTeam" })
    .setTimestamp(new Date());

  if (targetTag) embed.setAuthor({ name: targetTag });
  return embed;
}

export async function sendToModLog(guild: Guild | null | undefined, embed: EmbedBuilder, content?: string) {
  try {
    if (!guild) return;
    const channelId = getModLogChannelId();
    if (!channelId) return;
    const ch = await guild.channels.fetch(channelId);
    if (!ch) return;
    if (ch && ch.isTextBased()) {
      await (ch as TextChannel).send({ content, embeds: [embed] });
    }
  } catch (err) {
    console.error('Failed to send to moderation log channel:', err);
  }
}

export async function tryDm(user: User, embed: EmbedBuilder, content?: string) {
  try {
    await user.send({ content, embeds: [embed] });
    return true;
  } catch (e) {
    return false;
  }
}

export { humanizeSeconds };
