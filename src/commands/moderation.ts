import { Message, GuildMember, Role, PermissionsBitField } from "discord.js";
import { getDefaultMuteSeconds } from "../config";
import { bypass } from "../services/bypass";

export function hasPermissionOrBypass(message: Message, flag: bigint) {
  try {
    if (message.member && message.member.permissions && message.member.permissions.has(flag)) return true;
    if (bypass.isUserBypassed(message.author.id)) return true;
    const roles = message.member?.roles?.cache ? Array.from(message.member!.roles.cache.keys()) : [];
    for (const r of roles) {
      if (bypass.isRoleBypassed(String(r))) return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

export async function kickCommand(message: Message, member: GuildMember | null, reason?: string) {
  if (!member) return message.reply("Please mention a user to kick.");
  if (!hasPermissionOrBypass(message, PermissionsBitField.Flags.KickMembers)) return message.reply("You don't have permission to kick members.");
  try {
    await member.kick(reason ?? "No reason provided");
  await message.reply(`${member.user.tag} was kicked. Reason: ${reason ?? 'None'}`);
  } catch (err) {
    console.error(err);
    message.reply("Failed to kick member. Do I have sufficient permissions?");
  }
}

export async function banCommand(message: Message, member: GuildMember | null, reason?: string) {
  if (!member) return message.reply("Please mention a user to ban.");
  if (!hasPermissionOrBypass(message, PermissionsBitField.Flags.BanMembers)) return message.reply("You don't have permission to ban members.");
  try {
    await member.ban({ reason: reason ?? 'No reason provided' });
  await message.reply(`${member.user.tag} was banned. Reason: ${reason ?? 'None'}`);
  } catch (err) {
    console.error(err);
    message.reply("Failed to ban member. Do I have sufficient permissions?");
  }
}

export async function muteCommand(message: Message, member: GuildMember | null, durationSeconds?: number, reason?: string) {
  if (!member) return message.reply("Please mention a user to mute/timeout.");
  if (!hasPermissionOrBypass(message, PermissionsBitField.Flags.ModerateMembers)) return message.reply("You don't have permission to timeout members.");
  try {
      let ms: number;
      if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
        ms = durationSeconds * 1000;
      } else {
        // default to configured default if no duration provided
        ms = getDefaultMuteSeconds() * 1000;
      }

      // Pass reason only if provided so it's truly optional
      await member.timeout(ms, reason ?? undefined);
      await message.reply(`${member.user.tag} was timed out for ${ms / 1000}s.` + (reason ? ` Reason: ${reason}` : ""));
  } catch (err) {
    console.error(err);
    message.reply("Failed to timeout member. Do I have sufficient permissions?");
  }
}

export async function addRoleCommand(message: Message, member: GuildMember | null, role: Role | null) {
  if (!member || !role) return message.reply("Please mention a user and a role to add.");
  if (!hasPermissionOrBypass(message, PermissionsBitField.Flags.ManageRoles)) return message.reply("You don't have permission to manage roles.");
  try {
    await member.roles.add(role);
  message.reply(`${role.name} role added to ${member.user.tag}`);
  } catch (err) {
    console.error(err);
    message.reply("Failed to add role. Do I have sufficient permissions?");
  }
}

export async function removeRoleCommand(message: Message, member: GuildMember | null, role: Role | null) {
  if (!member || !role) return message.reply("Please mention a user and a role to remove.");
  if (!hasPermissionOrBypass(message, PermissionsBitField.Flags.ManageRoles)) return message.reply("You don't have permission to manage roles.");
  try {
    await member.roles.remove(role);
  message.reply(`${role.name} role removed from ${member.user.tag}`);
  } catch (err) {
    console.error(err);
    message.reply("Failed to remove role. Do I have sufficient permissions?");
  }
}
