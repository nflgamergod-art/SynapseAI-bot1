import { getDB } from './db';

/**
 * Anti-Abuse System
 * - Detects spam (repeated messages in short time)
 * - Detects permission bypass attempts
 * - Auto-blacklists abusive users
 * - Logs incidents to mod channel
 */

interface SpamTracker {
  userId: string;
  messages: number[];
  warnings: number;
}

const spamTrackers = new Map<string, SpamTracker>();

// Spam detection thresholds
const SPAM_WINDOW_MS = 10000; // 10 seconds
const SPAM_MESSAGE_THRESHOLD = 5; // 5 messages in 10 seconds = spam
const WARNING_THRESHOLD = 3; // 3 warnings = auto-blacklist

// Track message for spam detection
export function trackMessage(userId: string): boolean {
  const now = Date.now();
  let tracker = spamTrackers.get(userId);
  
  if (!tracker) {
    tracker = { userId, messages: [], warnings: 0 };
    spamTrackers.set(userId, tracker);
  }
  
  // Remove old messages outside the window
  tracker.messages = tracker.messages.filter(ts => now - ts < SPAM_WINDOW_MS);
  
  // Add current message
  tracker.messages.push(now);
  
  // Check if spamming
  if (tracker.messages.length >= SPAM_MESSAGE_THRESHOLD) {
    tracker.warnings++;
    
    // Auto-blacklist after threshold
    if (tracker.warnings >= WARNING_THRESHOLD) {
      return true; // Indicates should blacklist
    }
  }
  
  return false;
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
  
  // Check if already blacklisted
  const existing = db.prepare(
    'SELECT * FROM blacklist WHERE guild_id = ? AND type = ? AND id = ?'
  ).get(guildId, 'user', userId);
  
  if (existing) return false; // Already blacklisted
  
  // Add to blacklist
  db.prepare(`
    INSERT INTO blacklist (guild_id, type, id, reason)
    VALUES (?, ?, ?, ?)
  `).run(guildId, 'user', userId, `[AUTO] ${reason}`);
  
  return true;
}

// Get spam warnings for user
export function getWarnings(userId: string): number {
  const tracker = spamTrackers.get(userId);
  return tracker?.warnings || 0;
}

// Clear spam tracker (e.g., after timeout or manual intervention)
export function clearTracker(userId: string): void {
  spamTrackers.delete(userId);
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
