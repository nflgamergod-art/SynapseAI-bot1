import { Message } from "discord.js";

export function helpCommand(message: Message, prefix: string) {
  const helpText = `Here are the available commands:\n
${prefix}help - Show this help message\n
${prefix}ping - Check bot latency\n
${prefix}kick @user [reason] - Kick a member (requires KickMembers permission)\n
${prefix}ban @user [reason] - Ban a member (requires BanMembers permission)\n
${prefix}mute @user [durationSeconds] [reason] - Timeout a member (requires ModerateMembers)\n
${prefix}addrole @user @role - Add a role to a member (requires ManageRoles)\n
${prefix}removerole @user @role - Remove a role from a member (requires ManageRoles)\n
${prefix}joke - Tell a random joke\n
${prefix}dadjoke - Tell a dad joke\n
${prefix}setquestiontimeout <seconds> - Set repeat question timeout (requires Administrator)\n
${prefix}getquestiontimeout - Check current question repeat timeout\n
Also: mention the bot, or say the wake-word (e.g., 'SynapseAI') to get natural replies powered by OpenAI.`;

  message.reply(helpText);
}
