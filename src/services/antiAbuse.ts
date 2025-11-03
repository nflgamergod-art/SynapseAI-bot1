import { getDB } from './db';
import './enhancedDB'; // Ensure enhanced schema is initialized

/**
 * Anti-Abuse System
 * - Detects spam (repeated messages in short time)
 * - Detects permission bypass attempts
 * - Auto-blacklists abusive users
 * - Logs incidents to mod channel
 * - Persists warnings to database
 */

interface SpamTracker {
  userId: string;
  messages: number[];
}

const spamTrackers = new Map<string, SpamTracker>();

// Spam detection thresholds
const SPAM_WINDOW_MS = 10000; // 10 seconds
const SPAM_MESSAGE_THRESHOLD = 5; // 5 messages in 10 seconds = spam

function nowISO() {
  return new Date().toISOString();
}

// Get warnings from database
export function getWarnings(userId: string, guildId: string): number {
  const db = getDB();
  
  // First check if ANY warnings exist at all
  const allWarnings = db.prepare(`SELECT * FROM user_warnings WHERE user_id = ? AND guild_id = ?`).all(userId, guildId) as any[];
  console.log(`[AntiAbuse] Raw warnings for user ${userId}:`, allWarnings.length > 0 ? allWarnings : 'NONE FOUND');
  
  const row = db.prepare(`
    SELECT SUM(warning_count) as total FROM user_warnings 
    WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId) as { total: number | null } | undefined;
  
  const total = row?.total || 0;
  console.log(`[AntiAbuse] getWarnings for user ${userId} in guild ${guildId}: ${total}`);
  return total;
}

// Save/update warning in database
function saveWarning(userId: string, guildId: string, warningType: 'spam' | 'bypass' | 'other', reason: string): number {
  const db = getDB();
  const now = nowISO();
  
  console.log(`[AntiAbuse] Saving warning for user ${userId} in guild ${guildId}, type: ${warningType}`);
  
  // Check if warning record exists
  const existing = db.prepare(`
    SELECT * FROM user_warnings 
    WHERE user_id = ? AND guild_id = ? AND warning_type = ?
  `).get(userId, guildId, warningType) as any;
  
  if (existing) {
    // Update existing warning
    const newCount = existing.warning_count + 1;
    console.log(`[AntiAbuse] Updating existing warning: ${existing.warning_count} -> ${newCount}`);
    const result = db.prepare(`
      UPDATE user_warnings 
      SET warning_count = ?, reason = ?, last_warning_at = ?
      WHERE id = ?
    `).run(newCount, reason, now, existing.id);
    console.log(`[AntiAbuse] Update result:`, result.changes, 'rows affected');
    return newCount;
  } else {
    // Create new warning record
    console.log(`[AntiAbuse] Creating new warning record`);
    const result = db.prepare(`
      INSERT INTO user_warnings (user_id, guild_id, warning_type, reason, warning_count, last_warning_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(userId, guildId, warningType, reason, now, now);
    console.log(`[AntiAbuse] Insert result: rowId=${result.lastInsertRowid}, changes=${result.changes}`);
    
    // Verify it was saved
    const verify = db.prepare(`SELECT * FROM user_warnings WHERE id = ?`).get(result.lastInsertRowid) as any;
    console.log(`[AntiAbuse] Verification after insert:`, verify ? 'Found record' : 'NOT FOUND!');
    
    return 1;
  }
}

// Track message for spam detection (in-memory for speed)
export function trackMessage(userId: string): boolean {
  const now = Date.now();
  let tracker = spamTrackers.get(userId);
  
  if (!tracker) {
    tracker = { userId, messages: [] };
    spamTrackers.set(userId, tracker);
  }
  
  // Remove old messages outside the window
  tracker.messages = tracker.messages.filter(ts => now - ts < SPAM_WINDOW_MS);
  
  // Add current message
  tracker.messages.push(now);
  
  // Check if spamming
  if (tracker.messages.length >= SPAM_MESSAGE_THRESHOLD) {
    return true; // Indicates spam detected
  }
  
  return false;
}

// Increment warning count for bypass attempts or spam
export function incrementWarning(userId: string, guildId: string, warningType: 'spam' | 'bypass' | 'other', reason: string): number {
  return saveWarning(userId, guildId, warningType, reason);
}

// Check if user is trying to bypass permissions
export function detectBypassAttempt(userId: string, content: string): boolean {
  const lowerContent = content.toLowerCase();
  
  // Patterns that indicate bypass attempts
  const bypassPatterns = [
    /@everyone/i,
    /@here/i,
    /can you @everyone/i,
    /ping everyone/i,
    /mention everyone/i,
    /tag everyone/i
  ];
  
  return bypassPatterns.some(pattern => pattern.test(content));
}

// Auto-blacklist user
export function autoBlacklist(userId: string, guildId: string, reason: string): boolean {
  const db = getDB();
  const now = nowISO();
  
  // Check if already blacklisted
  const existing = db.prepare(
    'SELECT * FROM blacklist WHERE user_id = ? AND guild_id = ?'
  ).get(userId, guildId);
  
  if (existing) return false; // Already blacklisted
  
  // Add to blacklist
  db.prepare(`
    INSERT INTO blacklist (user_id, guild_id, reason, banned_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, guildId, `[AUTO] ${reason}`, 'system', now);
  
  return true;
}

// Clear spam tracker (e.g., after timeout or manual intervention)
export function clearTracker(userId: string): void {
  spamTrackers.delete(userId);
}

// Clear user warnings from database (admin command)
export function clearWarnings(userId: string, guildId: string): boolean {
  const db = getDB();
  
  const result = db.prepare(`
    DELETE FROM user_warnings 
    WHERE user_id = ? AND guild_id = ?
  `).run(userId, guildId);
  
  return result.changes > 0;
}

// Clean up old trackers periodically
setInterval(() => {
  const now = Date.now();
  const CLEANUP_AGE = 60000; // 1 minute
  
  for (const [userId, tracker] of spamTrackers.entries()) {
    if (tracker.messages.length === 0 || now - tracker.messages[tracker.messages.length - 1] > CLEANUP_AGE) {
      spamTrackers.delete(userId);
    }
  }
}, 60000); // Run cleanup every minute

