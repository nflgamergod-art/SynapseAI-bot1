import { getDB, MemoryRow } from './db';
import { extractMemories } from './openai';

function nowISO() { return new Date().toISOString(); }

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ExtractedMemory = {
  key: string;
  value: string;
  type?: 'fact' | 'preference' | 'note';
  confidence?: number;
};

const UNIQUE_KEYS = new Set([
  'name', 'age', 'birthday', 'location', 'timezone', 'occupation', 'job_title', 'company', 
  'school', 'major', 'email', 'phone', 'favorite_team', 'favorite_game', 'favorite_food',
  'spouse_name', 'pet_name', 'pet_type'
]);

function levenshtein(a: string, b: string): number {
  a = a || '';
  b = b || '';
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export type UpsertAction = 'created' | 'updated' | 'aliased' | 'duplicate';
export type MemoryEvent = { key: string; action: UpsertAction; oldValue?: string; newValue: string };

export function saveMemory(row: MemoryRow) {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT INTO memories (user_id, guild_id, type, key, value, source_msg_id, confidence, created_at, updated_at)
    VALUES (@user_id, @guild_id, @type, @key, @value, @source_msg_id, @confidence, @created_at, @updated_at)
  `);
  const created_at = nowISO();
  const updated_at = created_at;
  stmt.run({
    user_id: row.user_id,
    guild_id: row.guild_id ?? null,
    type: row.type ?? 'fact',
    key: row.key,
    value: row.value,
    source_msg_id: row.source_msg_id ?? null,
    confidence: row.confidence ?? 0.7,
    created_at,
    updated_at
  });
}

export function upsertUniqueMemory(userId: string, guildId: string | null, key: string, value: string): MemoryEvent {
  const db = getDB();
  const existing = db.prepare(`SELECT * FROM memories WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?) AND lower(key) = lower(?) ORDER BY updated_at DESC LIMIT 1`).get(userId, guildId ?? null, key) as MemoryRow | undefined;
  const norm = (s: string) => (s || '').trim().toLowerCase();
  const now = nowISO();
  if (!existing) {
    const res = db.prepare(`INSERT INTO memories (user_id, guild_id, type, key, value, source_msg_id, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
      .run(userId, guildId ?? null, 'fact', key, value, 0.9, now, now);
    const memId = res.lastInsertRowid;
    db.prepare(`INSERT INTO memory_history (memory_id, user_id, guild_id, key, old_value, new_value, action, changed_at) VALUES (?, ?, ?, ?, NULL, ?, 'created', ?)`)
      .run(memId, userId, guildId ?? null, key, value, now);
    return { key, action: 'created', newValue: value };
  }
  if (norm(existing.value) === norm(value)) {
    db.prepare(`UPDATE memories SET updated_at = ? WHERE id = ?`).run(now, (existing as any).id);
    return { key, action: 'duplicate', oldValue: existing.value, newValue: value };
  }
  const dist = levenshtein(existing.value, value);
  if (key.toLowerCase() === 'name' && dist > 0 && dist <= 2) {
    db.prepare(`UPDATE memories SET value = ?, updated_at = ? WHERE id = ?`).run(value, now, (existing as any).id);
    db.prepare(`INSERT INTO memories (user_id, guild_id, type, key, value, source_msg_id, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
      .run(userId, guildId ?? null, 'note', 'name_alias', existing.value, 0.6, now, now);
    db.prepare(`INSERT INTO memory_history (memory_id, user_id, guild_id, key, old_value, new_value, action, changed_at) VALUES (?, ?, ?, ?, ?, ?, 'aliased', ?)`)
      .run((existing as any).id, userId, guildId ?? null, key, existing.value, value, now);
    return { key, action: 'aliased', oldValue: existing.value, newValue: value };
  }
  db.prepare(`UPDATE memories SET value = ?, updated_at = ? WHERE id = ?`).run(value, now, (existing as any).id);
  db.prepare(`INSERT INTO memory_history (memory_id, user_id, guild_id, key, old_value, new_value, action, changed_at) VALUES (?, ?, ?, ?, ?, ?, 'updated', ?)`)
    .run((existing as any).id, userId, guildId ?? null, key, existing.value, value, now);
  return { key, action: 'updated', oldValue: existing.value, newValue: value };
}

export function findRelevantMemories(query: string, userId: string, guildId?: string | null, limit = 5) {
  const db = getDB();
  const all = db.prepare(`SELECT * FROM memories WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?)`)
    .all(userId, guildId ?? null) as MemoryRow[];
  const qTokens = new Set(normalize(query).split(' ').filter(Boolean));
  const scored = all.map(m => {
    const text = `${m.key} ${m.value}`;
    const tTokens = new Set(normalize(text).split(' ').filter(Boolean));
    const inter = [...tTokens].filter(t => qTokens.has(t)).length;
    const denom = Math.max(1, new Set([...tTokens, ...qTokens]).size);
    const score = inter / denom + (m.type === 'preference' ? 0.05 : 0);
    return { m, score };
  }).sort((a,b) => b.score - a.score);
  return scored.filter(s => s.score > 0).slice(0, limit).map(s => s.m);
}

export function upsertQAPair(userId: string, guildId: string | null, question: string, answer: string) {
  const db = getDB();
  const qn = normalize(question);
  const sel = db.prepare(`SELECT * FROM qa_pairs WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?) AND question_norm = ?`)
    .get(userId, guildId ?? null, qn) as any;
  const now = nowISO();
  if (sel) {
    db.prepare(`UPDATE qa_pairs SET answer = @answer, times_seen = times_seen + 1, last_seen_at = @now WHERE id = @id`).run({ id: sel.id, answer, now });
  } else {
    db.prepare(`INSERT INTO qa_pairs (user_id, guild_id, question_norm, answer, times_seen, last_seen_at, created_at)
      VALUES (@user_id, @guild_id, @question_norm, @answer, 1, @now, @now)`)
      .run({ user_id: userId, guild_id: guildId ?? null, question_norm: qn, answer, now });
  }
}

export function findSimilarQA(query: string, userId: string, guildId?: string | null) {
  const db = getDB();
  const rows = db.prepare(`SELECT * FROM qa_pairs WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?)`)
    .all(userId, guildId ?? null) as any[];
  const qTokens = new Set(normalize(query).split(' ').filter(Boolean));
  let best: { row: any, score: number } | null = null;
  for (const row of rows) {
    const tTokens = new Set((row.question_norm as string).split(' ').filter(Boolean));
    const inter = [...tTokens].filter(t => qTokens.has(t)).length;
    const denom = Math.max(1, new Set([...tTokens, ...qTokens]).size);
    const score = inter / denom;
    if (!best || score > best.score) best = { row, score };
  }
  if (best && best.score >= 0.28) return { question: best.row.question_norm as string, answer: best.row.answer as string, score: best.score };
  return null;
}

export async function extractAndSaveFromExchange(opts: {
  userId: string;
  guildId?: string | null;
  sourceMsgId?: string | null;
  userMessage: string;
  assistantMessage?: string;
}): Promise<MemoryEvent[]> {
  const { userId, guildId, sourceMsgId, userMessage, assistantMessage } = opts;
  const events: MemoryEvent[] = [];
  try {
    const items = await extractMemories(userMessage, assistantMessage);
    for (const it of items) {
      if (!it.key || !it.value) continue;
      const k = it.key.slice(0, 128);
      const v = it.value.slice(0, 2000);
      if (UNIQUE_KEYS.has(k.toLowerCase())) {
        const e = upsertUniqueMemory(userId, guildId ?? null, k, v);
        events.push(e);
      } else {
        saveMemory({
          user_id: userId,
          guild_id: guildId ?? null,
          type: it.type ?? 'fact',
          key: k,
          value: v,
          source_msg_id: sourceMsgId ?? null,
          confidence: it.confidence ?? 0.7
        });
        events.push({ key: k, action: 'created', newValue: v });
      }
    }
  } catch (e) {
    return events;
  }
  return events;
}

export function listMemories(userId: string, guildId?: string | null, limit = 20) {
  const db = getDB();
  const rows = db.prepare(
    `SELECT * FROM memories WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?) ORDER BY updated_at DESC LIMIT ?`
  ).all(userId, guildId ?? null, limit) as MemoryRow[];
  return rows;
}

export function deleteMemoryByKey(userId: string, key: string, guildId?: string | null) {
  const db = getDB();
  const stmt = db.prepare(`DELETE FROM memories WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?) AND lower(key) = lower(?)`);
  const res = stmt.run(userId, guildId ?? null, key);
  return res.changes ?? 0;
}

export function trackRecentMessage(userId: string, guildId: string | null, channelId: string, messageId: string, content: string) {
  const db = getDB();
  const now = Date.now();
  db.prepare(`INSERT INTO recent_messages (user_id, guild_id, channel_id, message_id, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(userId, guildId ?? null, channelId, messageId, content, now);
  db.prepare(`DELETE FROM recent_messages WHERE timestamp < ?`).run(now - 60000);
}

export function detectCorrectionContext(channelId: string, currentMsgTimestamp: number): { isCorrectionContext: boolean; callOutMsg?: string; isAddition?: boolean } {
  const db = getDB();
  const window = 15000;
  const rows = db.prepare(`SELECT * FROM recent_messages WHERE channel_id = ? AND timestamp >= ? ORDER BY timestamp DESC`)
    .all(channelId, currentMsgTimestamp - window) as any[];
  const liarRe = /(lying|liar|that's not true|cap|capping|stop capping|caught|called out)/i;
  const additionRe = /(that's correct but|correct but|right but|yes but|also|additionally)/i;
  
  for (const r of rows) {
    if (liarRe.test(r.content)) return { isCorrectionContext: true, callOutMsg: r.content, isAddition: false };
    if (additionRe.test(r.content)) return { isCorrectionContext: true, callOutMsg: r.content, isAddition: true };
  }
  return { isCorrectionContext: false, isAddition: false };
}

export function getMemoryHistory(userId: string, key: string, guildId?: string | null, limit = 10) {
  const db = getDB();
  const rows = db.prepare(`SELECT * FROM memory_history WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?) AND lower(key) = lower(?) ORDER BY changed_at DESC LIMIT ?`)
    .all(userId, guildId ?? null, key, limit) as any[];
  return rows;
}

export function revertMemory(userId: string, key: string, guildId?: string | null): MemoryEvent | null {
  const db = getDB();
  const hist = db.prepare(`SELECT * FROM memory_history WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?) AND lower(key) = lower(?) ORDER BY changed_at DESC LIMIT 2`)
    .all(userId, guildId ?? null, key) as any[];
  if (hist.length < 2) return null;
  const prev = hist[1];
  const now = nowISO();
  const mem = db.prepare(`SELECT * FROM memories WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?) AND lower(key) = lower(?) LIMIT 1`)
    .get(userId, guildId ?? null, key) as any;
  if (!mem) return null;
  db.prepare(`UPDATE memories SET value = ?, updated_at = ? WHERE id = ?`).run(prev.new_value, now, mem.id);
  db.prepare(`INSERT INTO memory_history (memory_id, user_id, guild_id, key, old_value, new_value, action, changed_at) VALUES (?, ?, ?, ?, ?, ?, 'reverted', ?)`)
    .run(mem.id, userId, guildId ?? null, key, mem.value, prev.new_value, now);
  return { key, action: 'updated', oldValue: mem.value, newValue: prev.new_value };
}

export function getAliases(userId: string, guildId?: string | null) {
  const db = getDB();
  const rows = db.prepare(`SELECT * FROM memories WHERE user_id = ? AND (guild_id IS NULL OR guild_id = ?) AND key = 'name_alias' ORDER BY created_at DESC`)
    .all(userId, guildId ?? null) as MemoryRow[];
  return rows.map(r => r.value);
}
