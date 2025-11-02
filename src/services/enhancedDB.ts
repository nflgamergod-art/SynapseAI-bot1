import { getDB } from './db';

/**
 * Enhanced database schema for advanced bot features
 * Extends the existing memory.db with new tables for:
 * - Support routing and analytics
 * - Performance tracking
 * - Rewards system
 * - Voice transcription
 * - Sentiment analysis
 * - Multi-modal content
 */

export function initEnhancedSchema() {
  const db = getDB();
  
  // Drop and recreate achievements table if it has the wrong schema
  try {
    const checkSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='achievements'").get() as any;
    if (checkSchema && !checkSchema.sql.includes('awarded_at')) {
      console.log('⚠️  Migrating achievements table to new schema...');
      db.exec('DROP TABLE IF EXISTS achievements');
    }
  } catch (err) {
    // Table doesn't exist yet, that's fine
  }
  
  // Drop and recreate knowledge_base table if it has the wrong schema
  try {
    const checkSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='knowledge_base'").get() as any;
    if (checkSchema && (!checkSchema.sql.includes('question TEXT') || !checkSchema.sql.includes('answer TEXT'))) {
      console.log('⚠️  Migrating knowledge_base table to new schema...');
      db.exec('DROP TABLE IF EXISTS knowledge_base');
    }
  } catch (err) {
    // Table doesn't exist yet, that's fine
  }
  
  // Drop and recreate scheduled_checkins table if it has the wrong schema
  try {
    const checkSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='scheduled_checkins'").get() as any;
    if (checkSchema && !checkSchema.sql.includes('status TEXT')) {
      console.log('⚠️  Migrating scheduled_checkins table to new schema...');
      db.exec('DROP TABLE IF EXISTS scheduled_checkins');
    }
  } catch (err) {
    // Table doesn't exist yet, that's fine
  }
  
  // Drop and recreate user_patterns table if it has the wrong schema
  try {
    const checkSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='user_patterns'").get() as any;
    if (checkSchema && (!checkSchema.sql.includes('pattern_type TEXT') || !checkSchema.sql.includes('pattern_data TEXT'))) {
      console.log('⚠️  Migrating user_patterns table to new schema...');
      db.exec('DROP TABLE IF EXISTS user_patterns');
    }
  } catch (err) {
    // Table doesn't exist yet, that's fine
  }
  
  // Drop and recreate sentiment_history table if it has the wrong schema
  try {
    const checkSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sentiment_history'").get() as any;
    if (checkSchema && !checkSchema.sql.includes('sentiment TEXT')) {
      console.log('⚠️  Migrating sentiment_history table to new schema...');
      db.exec('DROP TABLE IF EXISTS sentiment_history');
    }
  } catch (err) {
    // Table doesn't exist yet, that's fine
  }

  // Ensure support_interactions has 'question' column (non-destructive migration)
  try {
    const cols = db.prepare("PRAGMA table_info('support_interactions')").all() as Array<{ name: string }>;
    const hasQuestion = cols.some(c => c.name === 'question');
    if (!hasQuestion) {
      console.log("⚠️  Adding 'question' column to support_interactions...");
      db.exec("ALTER TABLE support_interactions ADD COLUMN question TEXT");
    }
  } catch (err) {
    // Table may not exist yet; it will be created below
  }
  
  db.exec(`
    -- User Relationships & Context
    CREATE TABLE IF NOT EXISTS user_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_a_id TEXT NOT NULL,
      user_b_id TEXT NOT NULL,
      guild_id TEXT,
      interaction_count INTEGER DEFAULT 1,
      last_interaction_at TEXT NOT NULL,
      relationship_type TEXT DEFAULT 'acquaintance', -- acquaintance, friend, teammate, rival
      created_at TEXT NOT NULL,
      UNIQUE(user_a_id, user_b_id, guild_id)
    );
    CREATE INDEX IF NOT EXISTS idx_rel_users ON user_relationships(user_a_id, user_b_id);

    -- User Behavioral Patterns (row-based by pattern_type)
    CREATE TABLE IF NOT EXISTS user_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT,
      pattern_type TEXT NOT NULL, -- timezone, active_hours, question_topics, mood_trend
      pattern_data TEXT NOT NULL, -- JSON blob
      confidence REAL DEFAULT 0.5,
      last_updated_at TEXT NOT NULL,
      UNIQUE(user_id, guild_id, pattern_type)
    );
    CREATE INDEX IF NOT EXISTS idx_patterns_user ON user_patterns(user_id);

    -- Support Interactions & Routing
    CREATE TABLE IF NOT EXISTS support_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      support_member_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      question_category TEXT, -- technical, account, feature, other
      started_at TEXT NOT NULL,
      ended_at TEXT,
      resolution_time_seconds INTEGER,
      was_resolved BOOLEAN DEFAULT FALSE,
      escalated BOOLEAN DEFAULT FALSE,
      escalated_to TEXT,
      satisfaction_rating INTEGER, -- 1-5 stars
      feedback_text TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_support_member ON support_interactions(support_member_id);
    CREATE INDEX IF NOT EXISTS idx_support_user ON support_interactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_support_guild ON support_interactions(guild_id);

    -- Support Member Expertise
    CREATE TABLE IF NOT EXISTS support_expertise (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      support_member_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      category TEXT NOT NULL,
      success_count INTEGER DEFAULT 0,
      total_attempts INTEGER DEFAULT 0,
      avg_resolution_time_seconds INTEGER,
      last_updated_at TEXT NOT NULL,
      UNIQUE(support_member_id, guild_id, category)
    );
    CREATE INDEX IF NOT EXISTS idx_expertise_member ON support_expertise(support_member_id);

    -- Performance Metrics
    CREATE TABLE IF NOT EXISTS performance_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      metric_type TEXT NOT NULL, -- response_time, resolution_rate, satisfaction, streak
      metric_value REAL NOT NULL,
      period TEXT NOT NULL, -- daily, weekly, monthly, all_time
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      UNIQUE(user_id, guild_id, metric_type, period_start)
    );
    CREATE INDEX IF NOT EXISTS idx_metrics_user ON performance_metrics(user_id, guild_id);

    -- Achievements & Rewards
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      achievement_name TEXT NOT NULL,
      category TEXT NOT NULL,
      points INTEGER DEFAULT 0,
      context TEXT,
      awarded_at TEXT NOT NULL,
      UNIQUE(user_id, guild_id, achievement_id)
    );
    CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);

    -- Voice Transcriptions
    CREATE TABLE IF NOT EXISTS voice_transcriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      audio_duration_seconds INTEGER,
      transcript_text TEXT NOT NULL,
      confidence REAL,
      language TEXT DEFAULT 'en',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_voice_guild ON voice_transcriptions(guild_id);
    CREATE INDEX IF NOT EXISTS idx_voice_channel ON voice_transcriptions(channel_id);

    -- Meeting Summaries (from voice)
    CREATE TABLE IF NOT EXISTS meeting_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      meeting_title TEXT,
      participants TEXT NOT NULL, -- JSON array of user IDs
      summary_text TEXT NOT NULL,
      action_items TEXT, -- JSON array
      key_decisions TEXT, -- JSON array
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_meetings_guild ON meeting_summaries(guild_id);

    -- Knowledge Base (auto-built from support interactions)
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      category TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      tags TEXT, -- JSON array
      source_message_id TEXT,
      times_helpful INTEGER DEFAULT 0,
      added_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kb_guild ON knowledge_base(guild_id);
    CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);

    -- Multi-Modal Content Analysis
    CREATE TABLE IF NOT EXISTS image_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      guild_id TEXT,
      user_id TEXT NOT NULL,
      image_url TEXT NOT NULL,
      analysis_type TEXT NOT NULL, -- screenshot, code, error, diagram, meme
      extracted_text TEXT, -- OCR result
      detected_entities TEXT, -- JSON array (error codes, variable names, etc)
      suggested_response TEXT,
      confidence REAL,
      created_at TEXT NOT NULL,
      UNIQUE(message_id, image_url)
    );
    CREATE INDEX IF NOT EXISTS idx_image_channel ON image_analysis(channel_id);

    -- Sentiment & Emotional Context
    CREATE TABLE IF NOT EXISTS sentiment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      sentiment TEXT NOT NULL,
      emotional_markers TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sentiment_user ON sentiment_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_sentiment_channel ON sentiment_history(channel_id);

    -- Proactive Check-ins
    CREATE TABLE IF NOT EXISTS scheduled_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      checkin_type TEXT NOT NULL, -- followup, recurring, issue_monitor
      context_data TEXT NOT NULL, -- JSON: what to check in about
      scheduled_for TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      completed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_checkin_schedule ON scheduled_checkins(scheduled_for, status);

    -- Cross-Server Intelligence (anonymized patterns)
    CREATE TABLE IF NOT EXISTS cross_server_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_type TEXT NOT NULL, -- error_solution, common_question, best_practice
      pattern_hash TEXT NOT NULL, -- anonymized identifier
      pattern_data TEXT NOT NULL, -- JSON blob
      occurrence_count INTEGER DEFAULT 1,
      success_rate REAL DEFAULT 1.0,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(pattern_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_cross_pattern ON cross_server_patterns(pattern_type);
  `);
}

// Initialize the enhanced schema on module load
initEnhancedSchema();

export type UserRelationship = {
  id?: number;
  user_a_id: string;
  user_b_id: string;
  guild_id?: string | null;
  interaction_count: number;
  last_interaction_at: string;
  relationship_type: 'acquaintance' | 'friend' | 'teammate' | 'rival';
  created_at: string;
};

export type UserPattern = {
  id?: number;
  user_id: string;
  guild_id?: string | null;
  pattern_type: string;
  pattern_data: string; // JSON
  confidence: number;
  last_updated_at: string;
};

export type SupportInteraction = {
  id?: number;
  user_id: string;
  support_member_id: string;
  guild_id: string;
  channel_id: string;
  question_category?: string | null;
  started_at: string;
  ended_at?: string | null;
  resolution_time_seconds?: number | null;
  was_resolved: boolean;
  escalated: boolean;
  escalated_to?: string | null;
  satisfaction_rating?: number | null;
  feedback_text?: string | null;
};

export type KnowledgeBaseEntry = {
  id?: number;
  guild_id: string;
  category: string;
  question: string;
  answer: string;
  tags?: string | null; // JSON array
  source_message_id?: string | null;
  times_helpful: number;
  added_by: string;
  created_at: string;
  updated_at: string;
};
