import { getDB } from './db';

export interface Announcement {
  id?: number;
  guild_id: string;
  user_id: string;
  category: string;
  title: string;
  content: string;
  keywords?: string;
  message_id?: string;
  channel_id?: string;
  created_at?: string;
  expires_at?: string | null;
  is_active?: number;
}

/**
 * Save an announcement from the owner
 */
export function saveAnnouncement(announcement: Announcement): number {
  const db = getDB();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    INSERT INTO announcements (guild_id, user_id, category, title, content, keywords, message_id, channel_id, created_at, expires_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    announcement.guild_id,
    announcement.user_id,
    announcement.category,
    announcement.title,
    announcement.content,
    announcement.keywords || null,
    announcement.message_id || null,
    announcement.channel_id || null,
    now,
    announcement.expires_at || null
  );
  
  return result.lastInsertRowid as number;
}

/**
 * Get all active announcements for a guild
 */
export function getActiveAnnouncements(guildId: string): Announcement[] {
  const db = getDB();
  const now = new Date().toISOString();
  
  const rows = db.prepare(`
    SELECT * FROM announcements 
    WHERE guild_id = ? 
      AND is_active = 1 
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at DESC
  `).all(guildId, now) as Announcement[];
  
  return rows;
}

/**
 * Get announcements by category
 */
export function getAnnouncementsByCategory(guildId: string, category: string): Announcement[] {
  const db = getDB();
  const now = new Date().toISOString();
  
  const rows = db.prepare(`
    SELECT * FROM announcements 
    WHERE guild_id = ? 
      AND category = ?
      AND is_active = 1 
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at DESC
  `).all(guildId, category, now) as Announcement[];
  
  return rows;
}

/**
 * Search announcements by keywords
 */
export function searchAnnouncements(guildId: string, query: string, limit: number = 5): Announcement[] {
  const db = getDB();
  const now = new Date().toISOString();
  const searchQuery = query.toLowerCase();
  
  const rows = db.prepare(`
    SELECT * FROM announcements 
    WHERE guild_id = ? 
      AND is_active = 1 
      AND (expires_at IS NULL OR expires_at > ?)
      AND (
        LOWER(title) LIKE ? 
        OR LOWER(content) LIKE ? 
        OR LOWER(keywords) LIKE ?
      )
    ORDER BY created_at DESC
    LIMIT ?
  `).all(guildId, now, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, limit) as Announcement[];
  
  return rows;
}

/**
 * Update announcement
 */
export function updateAnnouncement(id: number, updates: Partial<Announcement>): boolean {
  const db = getDB();
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.keywords !== undefined) {
    fields.push('keywords = ?');
    values.push(updates.keywords);
  }
  if (updates.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.is_active);
  }
  if (updates.expires_at !== undefined) {
    fields.push('expires_at = ?');
    values.push(updates.expires_at);
  }
  
  if (fields.length === 0) return false;
  
  values.push(id);
  const result = db.prepare(`
    UPDATE announcements 
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values);
  
  return result.changes > 0;
}

/**
 * Deactivate an announcement
 */
export function deactivateAnnouncement(id: number): boolean {
  const db = getDB();
  const result = db.prepare(`
    UPDATE announcements 
    SET is_active = 0
    WHERE id = ?
  `).run(id);
  
  return result.changes > 0;
}

/**
 * Delete an announcement
 */
export function deleteAnnouncement(id: number): boolean {
  const db = getDB();
  const result = db.prepare(`
    DELETE FROM announcements 
    WHERE id = ?
  `).run(id);
  
  return result.changes > 0;
}

/**
 * Auto-detect and save announcement from owner's message
 */
export function autoDetectAnnouncement(
  guildId: string, 
  userId: string, 
  content: string, 
  messageId: string, 
  channelId: string
): number | null {
  // Detect announcement patterns
  const lowerContent = content.toLowerCase();
  
  // Birthday/Absence announcements
  if (lowerContent.includes('birthday') && lowerContent.includes('gone')) {
    const title = 'Owner Birthday & Absence';
    const category = 'owner_status';
    const keywords = 'birthday,absent,away,unavailable,contact support';
    
    return saveAnnouncement({
      guild_id: guildId,
      user_id: userId,
      category,
      title,
      content,
      keywords,
      message_id: messageId,
      channel_id: channelId
    });
  }
  
  // UI/Update announcements
  if ((lowerContent.includes('ui') || lowerContent.includes('update')) && 
      (lowerContent.includes('changing') || lowerContent.includes('coming') || lowerContent.includes('new'))) {
    const title = 'Upcoming Update/UI Changes';
    const category = 'updates';
    const keywords = 'ui,update,changes,new,features,script,coming soon';
    
    return saveAnnouncement({
      guild_id: guildId,
      user_id: userId,
      category,
      title,
      content,
      keywords,
      message_id: messageId,
      channel_id: channelId
    });
  }
  
  // Staff guidelines/rules
  if ((lowerContent.includes('staff') || lowerContent.includes('support')) && 
      (lowerContent.includes('feedback') || lowerContent.includes('follow') || lowerContent.includes('rules'))) {
    const title = 'Staff Guidelines & Feedback Policy';
    const category = 'staff_rules';
    const keywords = 'staff,support,feedback,rules,guidelines,demote,blacklist';
    
    return saveAnnouncement({
      guild_id: guildId,
      user_id: userId,
      category,
      title,
      content,
      keywords,
      message_id: messageId,
      channel_id: channelId
    });
  }
  
  return null;
}
