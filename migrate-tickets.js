#!/usr/bin/env node

/**
 * Migration script to add new columns to tickets tables
 * Run this on the server: node migrate-tickets.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'memory.db');

console.log('🔧 Starting ticket system migration...');
console.log(`Database: ${DB_PATH}`);

try {
  const db = new Database(DB_PATH);
  
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  
  console.log('📋 Checking current schema...');
  
  // Check if columns already exist
  const tableInfo = db.prepare("PRAGMA table_info(tickets)").all();
  const columnNames = tableInfo.map(col => col.name);
  
  console.log('Current columns:', columnNames.join(', '));
  
  // Add support_interaction_id column if missing
  if (!columnNames.includes('support_interaction_id')) {
    console.log('➕ Adding support_interaction_id column...');
    db.prepare('ALTER TABLE tickets ADD COLUMN support_interaction_id INTEGER').run();
    console.log('✅ Added support_interaction_id column');
  } else {
    console.log('✓ support_interaction_id column already exists');
  }
  
  // Add helpers column if missing
  if (!columnNames.includes('helpers')) {
    console.log('➕ Adding helpers column...');
    db.prepare('ALTER TABLE tickets ADD COLUMN helpers TEXT').run();
    console.log('✅ Added helpers column');
  } else {
    console.log('✓ helpers column already exists');
  }
  
  // Check ticket_configs table
  const configTableInfo = db.prepare("PRAGMA table_info(ticket_configs)").all();
  const configColumnNames = configTableInfo.map(col => col.name);
  
  console.log('Current ticket_configs columns:', configColumnNames.join(', '));
  
  // Add vouch_channel_id column if missing
  if (!configColumnNames.includes('vouch_channel_id')) {
    console.log('➕ Adding vouch_channel_id column to ticket_configs...');
    db.prepare('ALTER TABLE ticket_configs ADD COLUMN vouch_channel_id TEXT').run();
    console.log('✅ Added vouch_channel_id column');
  } else {
    console.log('✓ vouch_channel_id column already exists');
  }
  
  console.log('');
  console.log('✅ Migration complete!');
  console.log('');
  console.log('Updated schema:');
  const updatedTableInfo = db.prepare("PRAGMA table_info(tickets)").all();
  updatedTableInfo.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });
  
  db.close();
  
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}
