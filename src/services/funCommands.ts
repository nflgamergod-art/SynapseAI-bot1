/**
 * Fun Commands: 8ball, Would You Rather, Story, Bingo, Birthday
 */

import { getDB } from './db';

// ==================== 8-BALL ====================
const EIGHTBALL_RESPONSES = {
  serious: [
    "Yes, definitely.",
    "It is certain.",
    "Without a doubt.",
    "You may rely on it.",
    "As I see it, yes.",
    "Most likely.",
    "Outlook good.",
    "Signs point to yes.",
    "Reply hazy, try again.",
    "Ask again later.",
    "Better not tell you now.",
    "Cannot predict now.",
    "Concentrate and ask again.",
    "Don't count on it.",
    "My reply is no.",
    "My sources say no.",
    "Outlook not so good.",
    "Very doubtful."
  ],
  funny: [
    "Ask your mom.",
    "Not even if pigs fly.",
    "Are you kidding me?",
    "Sure, and I'm the Queen of England.",
    "In your dreams!",
    "Only on Tuesdays.",
    "When hell freezes over.",
    "Consult your local fortune cookie.",
    "My sources say you need better questions.",
    "The answer is... cake.",
    "404: Answer not found.",
    "Have you tried turning it off and on again?",
    "Absolutely... NOT!",
    "Yes, but actually no.",
    "That's classified information.",
    "I'm too tired for this.",
    "Better call Saul.",
    "Touch grass and ask again."
  ],
  sarcastic: [
    "Oh absolutely, because the magic 8-ball knows all.",
    "Sure, why not? What could go wrong?",
    "Yeah, that's definitely going to happen.",
    "Let me consult my crystal ball... nope.",
    "Wow, great question. Really.",
    "I'm shocked you even have to ask.",
    "Obviously. Did you even think about it?",
    "No, but thanks for asking the obvious.",
    "Brilliant question. Next.",
    "Sure thing, champ.",
    "Absolutely, and I'm the tooth fairy.",
    "If by 'yes' you mean 'no', then yes.",
    "I'll get back to you... never.",
    "That's a hard pass from me.",
    "You really want my opinion on that?",
    "I have better things to predict."
  ]
};

export function get8BallResponse(mood: string = 'serious'): string {
  const responses = EIGHTBALL_RESPONSES[mood as keyof typeof EIGHTBALL_RESPONSES] || EIGHTBALL_RESPONSES.serious;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ==================== WOULD YOU RATHER ====================
export interface WouldYouRatherQuestion {
  id: number;
  option_a: string;
  option_b: string;
  votes_a: number;
  votes_b: number;
  created_by: string;
  created_at: string;
}

export function initWouldYouRatherSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS would_you_rather (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      votes_a INTEGER DEFAULT 0,
      votes_b INTEGER DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS wyr_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      choice TEXT NOT NULL,
      voted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(question_id, user_id)
    );
  `);
  console.log('✅ Would You Rather schema initialized');
}

export function createWYRQuestion(guildId: string, optionA: string, optionB: string, userId: string): number {
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO would_you_rather (guild_id, option_a, option_b, created_by)
    VALUES (?, ?, ?, ?)
  `).run(guildId, optionA, optionB, userId);
  return result.lastInsertRowid as number;
}

export function voteWYR(questionId: number, userId: string, choice: 'a' | 'b'): boolean {
  const db = getDB();
  try {
    // Record vote
    db.prepare(`
      INSERT INTO wyr_votes (question_id, user_id, choice)
      VALUES (?, ?, ?)
      ON CONFLICT(question_id, user_id) DO UPDATE SET choice = excluded.choice
    `).run(questionId, userId, choice);
    
    // Update vote counts
    const votes = db.prepare(`
      SELECT 
        SUM(CASE WHEN choice = 'a' THEN 1 ELSE 0 END) as votes_a,
        SUM(CASE WHEN choice = 'b' THEN 1 ELSE 0 END) as votes_b
      FROM wyr_votes WHERE question_id = ?
    `).get(questionId) as any;
    
    db.prepare(`
      UPDATE would_you_rather 
      SET votes_a = ?, votes_b = ?
      WHERE id = ?
    `).run(votes.votes_a, votes.votes_b, questionId);
    
    return true;
  } catch (err) {
    console.error('Error voting on WYR:', err);
    return false;
  }
}

export function getWYRQuestion(questionId: number): WouldYouRatherQuestion | null {
  const db = getDB();
  return db.prepare('SELECT * FROM would_you_rather WHERE id = ?').get(questionId) as WouldYouRatherQuestion | null;
}

export function getRandomWYR(guildId: string): WouldYouRatherQuestion | null {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM would_you_rather 
    WHERE guild_id = ? 
    ORDER BY RANDOM() 
    LIMIT 1
  `).get(guildId) as WouldYouRatherQuestion | null;
}

// ==================== COLLABORATIVE STORY ====================
export interface Story {
  id: number;
  guild_id: string;
  title: string;
  channel_id: string;
  status: 'active' | 'completed';
  created_at: string;
}

export interface StoryLine {
  id: number;
  story_id: number;
  user_id: string;
  line_number: number;
  content: string;
  added_at: string;
}

export function initStorySchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS stories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS story_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      content TEXT NOT NULL,
      added_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_stories_guild ON stories(guild_id);
    CREATE INDEX IF NOT EXISTS idx_story_lines_story ON story_lines(story_id);
  `);
  console.log('✅ Story schema initialized');
}

export function createStory(guildId: string, title: string, channelId: string): number {
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO stories (guild_id, title, channel_id)
    VALUES (?, ?, ?)
  `).run(guildId, title, channelId);
  return result.lastInsertRowid as number;
}

export function addStoryLine(storyId: number, userId: string, content: string): number {
  const db = getDB();
  
  // Get next line number
  const lastLine = db.prepare(`
    SELECT MAX(line_number) as max_line FROM story_lines WHERE story_id = ?
  `).get(storyId) as any;
  
  const lineNumber = (lastLine?.max_line || 0) + 1;
  
  const result = db.prepare(`
    INSERT INTO story_lines (story_id, user_id, line_number, content)
    VALUES (?, ?, ?, ?)
  `).run(storyId, userId, lineNumber, content);
  
  return result.lastInsertRowid as number;
}

export function getStory(storyId: number): { story: Story; lines: StoryLine[] } | null {
  const db = getDB();
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId) as Story | null;
  if (!story) return null;
  
  const lines = db.prepare(`
    SELECT * FROM story_lines 
    WHERE story_id = ? 
    ORDER BY line_number ASC
  `).all(storyId) as StoryLine[];
  
  return { story, lines };
}

export function getActiveStory(guildId: string, channelId: string): Story | null {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM stories 
    WHERE guild_id = ? AND channel_id = ? AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(guildId, channelId) as Story | null;
}

export function completeStory(storyId: number) {
  const db = getDB();
  db.prepare('UPDATE stories SET status = ? WHERE id = ?').run('completed', storyId);
}

// ==================== BINGO ====================
export interface BingoGame {
  id: number;
  guild_id: string;
  channel_id: string;
  host_id: string;
  theme: string;
  status: 'setup' | 'active' | 'completed';
  words: string; // JSON array
  called_words: string; // JSON array
  created_at: string;
}

export interface BingoCard {
  id: number;
  game_id: number;
  user_id: string;
  card_data: string; // JSON grid
  marked: string; // JSON array of marked positions
  created_at: string;
}

export function initBingoSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS bingo_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      theme TEXT NOT NULL,
      status TEXT DEFAULT 'setup',
      words TEXT NOT NULL,
      called_words TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS bingo_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      card_data TEXT NOT NULL,
      marked TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(game_id, user_id)
    );
  `);
  console.log('✅ Bingo schema initialized');
}

export function createBingoGame(guildId: string, channelId: string, hostId: string, theme: string, words: string[]): number {
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO bingo_games (guild_id, channel_id, host_id, theme, words)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, channelId, hostId, theme, JSON.stringify(words));
  return result.lastInsertRowid as number;
}

export function generateBingoCard(gameId: number, words: string[]): string[][] {
  // Shuffle words and create 5x5 grid
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  const grid: string[][] = [];
  
  for (let i = 0; i < 5; i++) {
    const row: string[] = [];
    for (let j = 0; j < 5; j++) {
      const index = i * 5 + j;
      // Center is FREE space
      if (i === 2 && j === 2) {
        row.push('FREE');
      } else {
        row.push(shuffled[index] || '');
      }
    }
    grid.push(row);
  }
  
  return grid;
}

export function createBingoCard(gameId: number, userId: string, cardData: string[][]): number {
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO bingo_cards (game_id, user_id, card_data)
    VALUES (?, ?, ?)
  `).run(gameId, userId, JSON.stringify(cardData));
  return result.lastInsertRowid as number;
}

export function getBingoGame(gameId: number): BingoGame | null {
  const db = getDB();
  return db.prepare('SELECT * FROM bingo_games WHERE id = ?').get(gameId) as BingoGame | null;
}

export function getBingoCard(gameId: number, userId: string): BingoCard | null {
  const db = getDB();
  return db.prepare('SELECT * FROM bingo_cards WHERE game_id = ? AND user_id = ?').get(gameId, userId) as BingoCard | null;
}

export function markBingoSquare(cardId: number, position: string): boolean {
  const db = getDB();
  const card = db.prepare('SELECT marked FROM bingo_cards WHERE id = ?').get(cardId) as any;
  if (!card) return false;
  
  const marked = JSON.parse(card.marked);
  if (!marked.includes(position)) {
    marked.push(position);
    db.prepare('UPDATE bingo_cards SET marked = ? WHERE id = ?').run(JSON.stringify(marked), cardId);
  }
  return true;
}

export function checkBingoWin(cardData: string[][], marked: string[]): boolean {
  // Check rows
  for (let i = 0; i < 5; i++) {
    if (marked.includes(`${i}-0`) && marked.includes(`${i}-1`) && 
        marked.includes(`${i}-2`) && marked.includes(`${i}-3`) && 
        marked.includes(`${i}-4`)) {
      return true;
    }
  }
  
  // Check columns
  for (let j = 0; j < 5; j++) {
    if (marked.includes(`0-${j}`) && marked.includes(`1-${j}`) && 
        marked.includes(`2-${j}`) && marked.includes(`3-${j}`) && 
        marked.includes(`4-${j}`)) {
      return true;
    }
  }
  
  // Check diagonals
  if (marked.includes('0-0') && marked.includes('1-1') && 
      marked.includes('2-2') && marked.includes('3-3') && 
      marked.includes('4-4')) {
    return true;
  }
  if (marked.includes('0-4') && marked.includes('1-3') && 
      marked.includes('2-2') && marked.includes('3-1') && 
      marked.includes('4-0')) {
    return true;
  }
  
  return false;
}

export function callBingoWord(gameId: number, word: string) {
  const db = getDB();
  const game = db.prepare('SELECT called_words FROM bingo_games WHERE id = ?').get(gameId) as any;
  if (!game) return;
  
  const calledWords = JSON.parse(game.called_words || '[]');
  if (!calledWords.includes(word)) {
    calledWords.push(word);
    db.prepare('UPDATE bingo_games SET called_words = ? WHERE id = ?').run(JSON.stringify(calledWords), gameId);
  }
}

// ==================== BIRTHDAY ====================
export interface Birthday {
  user_id: string;
  guild_id: string;
  month: number;
  day: number;
  year: number | null;
  timezone: string;
  created_at: string;
}

export function initBirthdaySchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS birthdays (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      year INTEGER,
      timezone TEXT DEFAULT 'UTC',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, guild_id)
    );
    
    CREATE TABLE IF NOT EXISTS birthday_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT,
      role_id TEXT,
      message_template TEXT DEFAULT 'Happy Birthday {user}! 🎉',
      enabled INTEGER DEFAULT 1
    );
    
    CREATE INDEX IF NOT EXISTS idx_birthdays_date ON birthdays(month, day);
  `);
  console.log('✅ Birthday schema initialized');
}

export function setBirthday(userId: string, guildId: string, month: number, day: number, year: number | null = null, timezone: string = 'UTC') {
  const db = getDB();
  db.prepare(`
    INSERT INTO birthdays (user_id, guild_id, month, day, year, timezone)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      month = excluded.month,
      day = excluded.day,
      year = excluded.year,
      timezone = excluded.timezone
  `).run(userId, guildId, month, day, year, timezone);
}

export function getBirthday(userId: string, guildId: string): Birthday | null {
  const db = getDB();
  return db.prepare('SELECT * FROM birthdays WHERE user_id = ? AND guild_id = ?').get(userId, guildId) as Birthday | null;
}

export function getTodaysBirthdays(guildId: string, month: number, day: number): Birthday[] {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM birthdays 
    WHERE guild_id = ? AND month = ? AND day = ?
  `).all(guildId, month, day) as Birthday[];
}

export function getUpcomingBirthdays(guildId: string, days: number = 7): Birthday[] {
  const db = getDB();
  const today = new Date();
  const birthdays: Birthday[] = [];
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    const dayBirthdays = db.prepare(`
      SELECT * FROM birthdays 
      WHERE guild_id = ? AND month = ? AND day = ?
    `).all(guildId, month, day) as Birthday[];
    
    birthdays.push(...dayBirthdays);
  }
  
  return birthdays;
}

export function setBirthdayChannel(guildId: string, channelId: string) {
  const db = getDB();
  db.prepare(`
    INSERT INTO birthday_config (guild_id, channel_id)
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id
  `).run(guildId, channelId);
}

export function getBirthdayConfig(guildId: string): any {
  const db = getDB();
  return db.prepare('SELECT * FROM birthday_config WHERE guild_id = ?').get(guildId);
}
