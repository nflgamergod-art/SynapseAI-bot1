import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

function ensureDataDir() {
  const dataDir = path.resolve(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

export function getDB() {
  if (db) return db;
  ensureDataDir();
  const file = path.resolve(__dirname, '..', '..', 'data', 'memory.db');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  initSchema();
  return db;
}

function initSchema() {
  const d = getDB();
  d.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      guild_id TEXT,
      type TEXT CHECK(type IN ('fact','preference','note')) NOT NULL DEFAULT 'fact',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source_msg_id TEXT,
      confidence REAL DEFAULT 0.7,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mem_user ON memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_mem_user_key ON memories(user_id, key);

    CREATE TABLE IF NOT EXISTS qa_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      guild_id TEXT,
      question_norm TEXT NOT NULL,
      answer TEXT NOT NULL,
      times_seen INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_qa_user ON qa_pairs(user_id);
    CREATE INDEX IF NOT EXISTS idx_qa_guild ON qa_pairs(guild_id);
    CREATE INDEX IF NOT EXISTS idx_qa_question ON qa_pairs(question_norm);

    CREATE TABLE IF NOT EXISTS memory_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id INTEGER,
      user_id TEXT NOT NULL,
      guild_id TEXT,
      key TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT NOT NULL,
      action TEXT CHECK(action IN ('created','updated','aliased','reverted')) NOT NULL,
      changed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memhist_user ON memory_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_memhist_key ON memory_history(user_id, key);

    CREATE TABLE IF NOT EXISTS recent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recmsg_channel ON recent_messages(channel_id, timestamp);
  `);
}

export type MemoryRow = {
  id?: number;
  user_id: string;
  guild_id?: string | null;
  type: 'fact' | 'preference' | 'note';
  key: string;
  value: string;
  source_msg_id?: string | null;
  confidence?: number;
  created_at?: string;
  updated_at?: string;
};
