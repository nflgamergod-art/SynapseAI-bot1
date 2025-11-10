import { Guild, GuildMember, TextChannel, EmbedBuilder } from 'discord.js';
import { getDB } from './db';
import { getSupportRoles } from './supportRoles';
import { warnings } from './warnings';

export interface SuspensionRecord {
  id?: number;
  user_id: string;
  guild_id: string;
  reason: string;
  suspended_by: string;
  start_date: string;
  end_date: string;
  original_roles: string; // JSON array of role IDs
  demoted_role: string | null;
  is_active: number;
  is_permanent: number;
  created_at?: string;
  resolved_at?: string | null;
  cancelled_by?: string | null;
}

export type RoleLevel = 'head' | 'support' | 'trial' | 'none';

/**
 * Determine role level based on user's roles
 */
export function getUserRoleLevel(member: GuildMember): RoleLevel {
  const roles = getSupportRoles();
  
  if (roles.head && member.roles.cache.has(roles.head)) return 'head';
  if (roles.support && member.roles.cache.has(roles.support)) return 'support';
  if (roles.trial && member.roles.cache.has(roles.trial)) return 'trial';
  return 'none';
}

/**
 * Get all support roles a member has
 */
export function getUserSupportRoles(member: GuildMember): string[] {
  const roles = getSupportRoles();
  const userRoles: string[] = [];
  
  if (roles.head && member.roles.cache.has(roles.head)) userRoles.push(roles.head);
  if (roles.support && member.roles.cache.has(roles.support)) userRoles.push(roles.support);
  if (roles.trial && member.roles.cache.has(roles.trial)) userRoles.push(roles.trial);
  
  return userRoles;
}

/**
 * Get the demoted role based on current level
 * Head Support -> Support
 * Support -> Trial Support
 * Trial Support -> null (permanent removal)
 */
export function getDemotedRole(currentLevel: RoleLevel): string | null {
  const roles = getSupportRoles();
  
  if (currentLevel === 'head') return roles.support || null;
  if (currentLevel === 'support') return roles.trial || null;
  if (currentLevel === 'trial') return null; // Permanent removal, must appeal
  
  return null;
}

/**
 * Get the highest support role a member has
 */
export function getHighestSupportRole(member: GuildMember): string | null {
  const roles = getSupportRoles();
  
  if (roles.head && member.roles.cache.has(roles.head)) return roles.head;
  if (roles.support && member.roles.cache.has(roles.support)) return roles.support;
  if (roles.trial && member.roles.cache.has(roles.trial)) return roles.trial;
  
  return null;
}

/**
 * Create a suspension record
 */
export function createSuspension(
  userId: string,
  guildId: string,
  reason: string,
  suspendedBy: string,
  durationDays: number,
  originalRoles: string[],
  demotedRole: string | null,
  isPermanent: boolean = false
): SuspensionRecord {
  const db = getDB();
  const now = new Date().toISOString();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + durationDays);
  
  const stmt = db.prepare(`
    INSERT INTO staff_suspensions 
    (user_id, guild_id, reason, suspended_by, start_date, end_date, original_roles, demoted_role, is_active, is_permanent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  
  const result = stmt.run(
    userId,
    guildId,
    reason,
    suspendedBy,
    now,
    endDate.toISOString(),
    JSON.stringify(originalRoles),
    demotedRole,
    isPermanent ? 1 : 0,
    now
  );
  
  return {
    id: result.lastInsertRowid as number,
    user_id: userId,
    guild_id: guildId,
    reason,
    suspended_by: suspendedBy,
    start_date: now,
    end_date: endDate.toISOString(),
    original_roles: JSON.stringify(originalRoles),
    demoted_role: demotedRole,
    is_active: 1,
    is_permanent: isPermanent ? 1 : 0,
    created_at: now
  };
}

/**
 * Get active suspension for a user
 */
export function getActiveSuspension(userId: string, guildId: string): SuspensionRecord | null {
  const db = getDB();
  const stmt = db.prepare(`
    SELECT * FROM staff_suspensions 
    WHERE user_id = ? AND guild_id = ? AND is_active = 1 
    ORDER BY created_at DESC LIMIT 1
  `);
  
  return stmt.get(userId, guildId) as SuspensionRecord | null;
}

/**
 * Get all active suspensions (for checking expiry)
 */
export function getActiveSuspensions(): SuspensionRecord[] {
  const db = getDB();
  const stmt = db.prepare(`
    SELECT * FROM staff_suspensions 
    WHERE is_active = 1 
    ORDER BY end_date ASC
  `);
  
  return stmt.all() as SuspensionRecord[];
}

/**
 * Cancel a suspension
 */
export function cancelSuspension(suspensionId: number, cancelledBy: string) {
  const db = getDB();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    UPDATE staff_suspensions 
    SET is_active = 0, resolved_at = ?, cancelled_by = ? 
    WHERE id = ?
  `);
  
  stmt.run(now, cancelledBy, suspensionId);
}

/**
 * Mark suspension as completed
 */
export function completeSuspension(suspensionId: number) {
  const db = getDB();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    UPDATE staff_suspensions 
    SET is_active = 0, resolved_at = ? 
    WHERE id = ?
  `);
  
  stmt.run(now, suspensionId);
}

/**
 * Suspend a staff member
 */
export async function suspendStaffMember(
  member: GuildMember,
  reason: string,
  suspendedBy: string,
  durationDays: number,
  notifyChannel?: TextChannel
): Promise<{ success: boolean; message: string; suspension?: SuspensionRecord }> {
  try {
    const currentLevel = getUserRoleLevel(member);
    
    if (currentLevel === 'none') {
      return { success: false, message: 'User is not a staff member.' };
    }
    
    // Check if already suspended
    const existing = getActiveSuspension(member.id, member.guild.id);
    if (existing) {
      return { success: false, message: 'User is already suspended.' };
    }
    
    // Get all support roles to remove
    const supportRolesToRemove = getUserSupportRoles(member);
    
    // Determine demoted role
    const demotedRole = getDemotedRole(currentLevel);
    const isPermanent = currentLevel === 'trial'; // Trial support = permanent removal
    
    // Remove support roles
    if (supportRolesToRemove.length > 0) {
      await member.roles.remove(supportRolesToRemove, `Suspended: ${reason}`);
    }
    
    // Create suspension record
    const suspension = createSuspension(
      member.id,
      member.guild.id,
      reason,
      suspendedBy,
      durationDays,
      supportRolesToRemove,
      demotedRole,
      isPermanent
    );
    
    // Notify user
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('🚫 Staff Suspension Notice')
        .setDescription(`You have been suspended from your staff position in **${member.guild.name}**.`)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Duration', value: isPermanent ? '**Permanent** (must appeal)' : `${durationDays} days` },
          { name: 'Current Role', value: currentLevel === 'head' ? 'Head Support' : currentLevel === 'support' ? 'Support' : 'Trial Support' },
          { name: 'After Suspension', value: isPermanent ? 'Removed - Must appeal to be reinstated' : demotedRole ? `Demoted to ${currentLevel === 'head' ? 'Support' : 'Trial Support'}` : 'Removed' }
        )
        .setTimestamp();
      
      await member.send({ embeds: [dmEmbed] });
    } catch (err) {
      console.error('Failed to DM suspended user:', err);
    }
    
    // Notify staff channel
    if (notifyChannel) {
      const staffEmbed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('⚠️ Staff Suspension')
        .setDescription(`**${member.user.tag}** has been suspended from staff duties.`)
        .addFields(
          { name: 'User', value: `<@${member.id}>`, inline: true },
          { name: 'Suspended By', value: `<@${suspendedBy}>`, inline: true },
          { name: 'Duration', value: isPermanent ? '**Permanent**' : `${durationDays} days`, inline: true },
          { name: 'Reason', value: reason },
          { name: 'Previous Role', value: currentLevel === 'head' ? 'Head Support' : currentLevel === 'support' ? 'Support' : 'Trial Support', inline: true },
          { name: 'After Suspension', value: isPermanent ? 'Must Appeal' : demotedRole ? `Demoted to ${currentLevel === 'head' ? 'Support' : 'Trial Support'}` : 'Removed', inline: true }
        )
        .setTimestamp();
      
      await notifyChannel.send({ embeds: [staffEmbed] });
    }
    
    return {
      success: true,
      message: isPermanent
        ? `${member.user.tag} has been permanently removed from staff. They must appeal to be reinstated.`
        : `${member.user.tag} has been suspended for ${durationDays} days and will be demoted to ${currentLevel === 'head' ? 'Support' : 'Trial Support'} when reinstated.`,
      suspension
    };
  } catch (err) {
    console.error('Error suspending staff member:', err);
    return { success: false, message: `Failed to suspend: ${err}` };
  }
}

/**
 * Check warnings and auto-suspend if needed
 */
export async function checkWarningsAndSuspend(
  userId: string,
  guildId: string,
  guild: Guild,
  notifyChannel?: TextChannel
): Promise<{ shouldSuspend: boolean; warningCount: number }> {
  const userWarnings = warnings.listWarningsFor(userId);
  const warningCount = userWarnings.length;
  
  if (warningCount >= 3) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { shouldSuspend: false, warningCount };
    
    const currentLevel = getUserRoleLevel(member);
    if (currentLevel === 'none') return { shouldSuspend: false, warningCount };
    
    // Check if already suspended
    const existing = getActiveSuspension(userId, guildId);
    if (existing) return { shouldSuspend: false, warningCount };
    
    // Random duration between 4-7 days
    const durationDays = Math.floor(Math.random() * 4) + 4; // 4-7 days
    
    await suspendStaffMember(
      member,
      `Automatic suspension: Accumulated ${warningCount} warnings`,
      guild.client.user!.id,
      durationDays,
      notifyChannel
    );
    
    return { shouldSuspend: true, warningCount };
  }
  
  return { shouldSuspend: false, warningCount };
}

/**
 * Cancel a suspension and restore original roles
 */
export async function cancelStaffSuspension(
  suspensionId: number,
  cancelledBy: string,
  guild: Guild,
  notifyChannel?: TextChannel
): Promise<{ success: boolean; message: string }> {
  try {
    const db = getDB();
    const suspension = db.prepare('SELECT * FROM staff_suspensions WHERE id = ? AND is_active = 1').get(suspensionId) as SuspensionRecord | undefined;
    
    if (!suspension) {
      return { success: false, message: 'Suspension not found or already resolved.' };
    }
    
    const member = await guild.members.fetch(suspension.user_id).catch(() => null);
    if (!member) {
      return { success: false, message: 'Member not found in guild.' };
    }
    
    // Restore original roles
    const originalRoles = JSON.parse(suspension.original_roles) as string[];
    if (originalRoles.length > 0) {
      await member.roles.add(originalRoles, `Suspension cancelled by <@${cancelledBy}>`);
    }
    
    // Mark suspension as cancelled
    cancelSuspension(suspensionId, cancelledBy);
    
    // Notify user
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x51CF66)
        .setTitle('✅ Suspension Cancelled')
        .setDescription(`Your staff suspension in **${guild.name}** has been cancelled.`)
        .addFields(
          { name: 'Cancelled By', value: `<@${cancelledBy}>` },
          { name: 'Status', value: 'Your original staff roles have been restored.' }
        )
        .setTimestamp();
      
      await member.send({ embeds: [dmEmbed] });
    } catch (err) {
      console.error('Failed to DM user about cancellation:', err);
    }
    
    // Notify staff channel
    if (notifyChannel) {
      const staffEmbed = new EmbedBuilder()
        .setColor(0x51CF66)
        .setTitle('✅ Suspension Cancelled')
        .setDescription(`**${member.user.tag}**'s suspension has been cancelled.`)
        .addFields(
          { name: 'User', value: `<@${member.id}>`, inline: true },
          { name: 'Cancelled By', value: `<@${cancelledBy}>`, inline: true },
          { name: 'Original Reason', value: suspension.reason }
        )
        .setTimestamp();
      
      await notifyChannel.send({ embeds: [staffEmbed] });
    }
    
    return { success: true, message: `Suspension cancelled. ${member.user.tag}'s original roles have been restored.` };
  } catch (err) {
    console.error('Error cancelling suspension:', err);
    return { success: false, message: `Failed to cancel suspension: ${err}` };
  }
}

/**
 * Process expired suspensions
 */
export async function processExpiredSuspensions(guild: Guild, notifyChannel?: TextChannel) {
  const suspensions = getActiveSuspensions();
  const now = new Date();
  
  for (const suspension of suspensions) {
    const endDate = new Date(suspension.end_date);
    
    if (now >= endDate) {
      try {
        const member = await guild.members.fetch(suspension.user_id).catch(() => null);
        if (!member) {
          completeSuspension(suspension.id!);
          continue;
        }
        
        const isPermanent = suspension.is_permanent === 1;
        
        if (isPermanent) {
          // Permanent removal - user must appeal
          completeSuspension(suspension.id!);
          
          try {
            const dmEmbed = new EmbedBuilder()
              .setColor(0xFF6B6B)
              .setTitle('🚫 Suspension Period Ended')
              .setDescription(`Your suspension period in **${guild.name}** has ended.`)
              .addFields(
                { name: 'Status', value: 'You were permanently removed from staff and must **submit an appeal** to be considered for reinstatement.' },
                { name: 'Next Steps', value: 'Contact server administrators to appeal your removal.' }
              )
              .setTimestamp();
            
            await member.send({ embeds: [dmEmbed] });
          } catch (err) {
            console.error('Failed to DM user about permanent removal:', err);
          }
          
          if (notifyChannel) {
            const embed = new EmbedBuilder()
              .setColor(0xFF6B6B)
              .setTitle('⏰ Suspension Expired (Permanent Removal)')
              .setDescription(`**${member.user.tag}**'s suspension has ended. They were permanently removed and must appeal.`)
              .addFields(
                { name: 'User', value: `<@${member.id}>` },
                { name: 'Original Reason', value: suspension.reason }
              )
              .setTimestamp();
            
            await notifyChannel.send({ embeds: [embed] });
          }
        } else {
          // Restore with demotion
          if (suspension.demoted_role) {
            await member.roles.add(suspension.demoted_role, 'Suspension ended - demoted');
          }
          
          completeSuspension(suspension.id!);
          
          try {
            const dmEmbed = new EmbedBuilder()
              .setColor(0xFAB005)
              .setTitle('⏰ Suspension Ended')
              .setDescription(`Your suspension period in **${guild.name}** has ended.`)
              .addFields(
                { name: 'Status', value: suspension.demoted_role ? 'You have been demoted to a lower staff role.' : 'Your suspension has been lifted.' },
                { name: 'Note', value: 'Further violations may result in permanent removal from staff.' }
              )
              .setTimestamp();
            
            await member.send({ embeds: [dmEmbed] });
          } catch (err) {
            console.error('Failed to DM user about suspension end:', err);
          }
          
          if (notifyChannel) {
            const originalRoles = JSON.parse(suspension.original_roles) as string[];
            const highestRole = originalRoles[0]; // Assuming first is highest
            
            const embed = new EmbedBuilder()
              .setColor(0xFAB005)
              .setTitle('⏰ Suspension Expired (Demoted)')
              .setDescription(`**${member.user.tag}**'s suspension has ended and they have been demoted.`)
              .addFields(
                { name: 'User', value: `<@${member.id}>` },
                { name: 'Demoted Role', value: suspension.demoted_role ? `<@&${suspension.demoted_role}>` : 'None' },
                { name: 'Original Reason', value: suspension.reason }
              )
              .setTimestamp();
            
            await notifyChannel.send({ embeds: [embed] });
          }
        }
      } catch (err) {
        console.error('Error processing expired suspension:', err);
      }
    }
  }
}

/**
 * Get suspension history for a user
 */
export function getSuspensionHistory(userId: string, guildId: string): SuspensionRecord[] {
  const db = getDB();
  const stmt = db.prepare(`
    SELECT * FROM staff_suspensions 
    WHERE user_id = ? AND guild_id = ? 
    ORDER BY created_at DESC
  `);
  
  return stmt.all(userId, guildId) as SuspensionRecord[];
}
