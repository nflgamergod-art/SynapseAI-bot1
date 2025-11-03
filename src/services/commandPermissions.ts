/**
 * Command Permissions System
 * Allows fine-grained control over which roles can use which commands
 */

import { getDB } from './db';

export interface CommandPermissionConfig {
  id?: number;
  guild_id: string;
  role_id: string;
  command_name: string;
  created_at?: string;
}

// Initialize the command permissions table
export function initCommandPermissionsDB() {
  const db = getDB();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS command_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, role_id, command_name)
    );
    
    CREATE INDEX IF NOT EXISTS idx_cmd_perms_guild_role 
      ON command_permissions(guild_id, role_id);
    CREATE INDEX IF NOT EXISTS idx_cmd_perms_command 
      ON command_permissions(guild_id, command_name);
  `);
}

// Add a command permission for a role
export function addCommandPermission(guildId: string, roleId: string, commandName: string): boolean {
  const db = getDB();
  try {
    db.prepare(`
      INSERT OR IGNORE INTO command_permissions (guild_id, role_id, command_name)
      VALUES (?, ?, ?)
    `).run(guildId, roleId, commandName);
    return true;
  } catch (err) {
    console.error('Failed to add command permission:', err);
    return false;
  }
}

// Remove a command permission for a role
export function removeCommandPermission(guildId: string, roleId: string, commandName: string): boolean {
  const db = getDB();
  try {
    db.prepare(`
      DELETE FROM command_permissions 
      WHERE guild_id = ? AND role_id = ? AND command_name = ?
    `).run(guildId, roleId, commandName);
    return true;
  } catch (err) {
    console.error('Failed to remove command permission:', err);
    return false;
  }
}

// Remove all command permissions for a role
export function clearRoleCommandPermissions(guildId: string, roleId: string): boolean {
  const db = getDB();
  try {
    db.prepare(`
      DELETE FROM command_permissions 
      WHERE guild_id = ? AND role_id = ?
    `).run(guildId, roleId);
    return true;
  } catch (err) {
    console.error('Failed to clear role command permissions:', err);
    return false;
  }
}

// Get all commands a role has access to
export function getRoleCommands(guildId: string, roleId: string): string[] {
  const db = getDB();
  try {
    const rows = db.prepare(`
      SELECT command_name FROM command_permissions
      WHERE guild_id = ? AND role_id = ?
      ORDER BY command_name
    `).all(guildId, roleId) as any[];
    
    return rows.map(r => r.command_name);
  } catch (err) {
    console.error('Failed to get role commands:', err);
    return [];
  }
}

// Get all roles that have access to a command
export function getCommandRoles(guildId: string, commandName: string): string[] {
  const db = getDB();
  try {
    const rows = db.prepare(`
      SELECT role_id FROM command_permissions
      WHERE guild_id = ? AND command_name = ?
    `).all(guildId, commandName) as any[];
    
    return rows.map(r => r.role_id);
  } catch (err) {
    console.error('Failed to get command roles:', err);
    return [];
  }
}

// Check if a user has permission to use a command based on their roles
export function hasCommandPermission(guildId: string, userRoles: string[], commandName: string): boolean {
  const db = getDB();
  try {
    // Check if any of the user's roles have permission for this command
    const placeholders = userRoles.map(() => '?').join(',');
    const query = `
      SELECT COUNT(*) as count FROM command_permissions
      WHERE guild_id = ? AND command_name = ? AND role_id IN (${placeholders})
    `;
    
    const result = db.prepare(query).get(guildId, commandName, ...userRoles) as any;
    return result.count > 0;
  } catch (err) {
    console.error('Failed to check command permission:', err);
    return false;
  }
}

// Get all command permissions for a guild (for display/management)
export function getAllGuildCommandPermissions(guildId: string): CommandPermissionConfig[] {
  const db = getDB();
  try {
    const rows = db.prepare(`
      SELECT * FROM command_permissions
      WHERE guild_id = ?
      ORDER BY role_id, command_name
    `).all(guildId) as CommandPermissionConfig[];
    
    return rows;
  } catch (err) {
    console.error('Failed to get guild command permissions:', err);
    return [];
  }
}

// Available commands that can be restricted
export const RESTRICTABLE_COMMANDS = [
  // Moderation
  'kick', 'ban', 'unban', 'mute', 'unmute', 'warn', 'clearwarn',
  // Role management
  'addrole', 'removerole',
  // Channel management
  'purge', 'announce',
  // Configuration
  'setdefaultmute', 'getdefaultmute', 'setquestiontimeout', 'getquestiontimeout',
  'setmodlog', 'getmodlog', 'clearmodlog',
  // Support system
  'supportstart', 'supportend', 'supportaddhelper', 'supportrate', 'listopentickets',
  // Response rules
  'setresponserule', 'listresponserules', 'delresponserule',
  // Bypass management
  'addbypass', 'removebypass', 'listbypass',
  // Knowledge base (admin commands)
  'kb-add', 'kb-suggest', 'kb-stats'
];

// Command categories for easier setup
export const COMMAND_PRESETS = {
  'head_support': ['kick', 'ban', 'unban', 'mute', 'unmute', 'warn', 'clearwarn', 'addrole', 'removerole', 'purge', 'supportstart', 'supportend', 'supportaddhelper', 'listopentickets'],
  'support': ['mute', 'unmute', 'warn', 'supportstart', 'supportend', 'supportaddhelper', 'listopentickets'],
  'trial_support': ['mute', 'unmute', 'warn', 'supportstart', 'supportend', 'listopentickets'],
  'moderator': ['kick', 'ban', 'mute', 'unmute', 'warn', 'clearwarn', 'purge'],
  'admin': RESTRICTABLE_COMMANDS // All commands
};

// Initialize on module load
try {
  initCommandPermissionsDB();
} catch (err) {
  console.error('Failed to initialize command permissions DB:', err);
}
