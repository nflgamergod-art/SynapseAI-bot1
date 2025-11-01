import fs from 'fs';
import path from 'path';

interface LearnedPattern {
  pattern: string;
  responses: string[];
  author: string;
  createdAt: string;
}

interface JokeEntry {
  setup?: string;
  punchline: string;
  type: 'one-liner' | 'setup-punchline' | 'dad-joke';
  author: string;
  createdAt: string;
}

const LEARNING_DIR = path.resolve(__dirname, '..', '..', 'data', 'learning');
const PATTERNS_FILE = path.join(LEARNING_DIR, 'learned_patterns.json');
const JOKES_FILE = path.join(LEARNING_DIR, 'jokes.json');

// Initialize with some default jokes
const DEFAULT_JOKES: JokeEntry[] = [
  {
    setup: "Why don't programmers like nature?",
    punchline: "It has too many bugs!",
    type: "setup-punchline",
    author: "system",
    createdAt: new Date().toISOString()
  },
  {
    setup: "What did the robot say after a successful oil change?",
    punchline: "Oil be back!",
    type: "setup-punchline",
    author: "system",
    createdAt: new Date().toISOString()
  },
  {
    punchline: "I don't always test my code, but when I do, I do it in production.",
    type: "one-liner",
    author: "system",
    createdAt: new Date().toISOString()
  },
  {
    setup: "Why did the scarecrow win an award?",
    punchline: "Because he was outstanding in his field!",
    type: "dad-joke",
    author: "system",
    createdAt: new Date().toISOString()
  }
];

function ensureDirectoryExists() {
  if (!fs.existsSync(LEARNING_DIR)) {
    fs.mkdirSync(LEARNING_DIR, { recursive: true });
  }
}

function loadPatterns(): LearnedPattern[] {
  ensureDirectoryExists();
  try {
    if (!fs.existsSync(PATTERNS_FILE)) {
      fs.writeFileSync(PATTERNS_FILE, '[]', 'utf8');
      return [];
    }
    const data = fs.readFileSync(PATTERNS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading patterns:', err);
    return [];
  }
}

function savePatterns(patterns: LearnedPattern[]) {
  ensureDirectoryExists();
  try {
    fs.writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving patterns:', err);
  }
}

function loadJokes(): JokeEntry[] {
  ensureDirectoryExists();
  try {
    if (!fs.existsSync(JOKES_FILE)) {
      // Initialize with default jokes
      fs.writeFileSync(JOKES_FILE, JSON.stringify(DEFAULT_JOKES, null, 2), 'utf8');
      return DEFAULT_JOKES;
    }
    const data = fs.readFileSync(JOKES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading jokes:', err);
    return DEFAULT_JOKES;
  }
}

function saveJokes(jokes: JokeEntry[]) {
  ensureDirectoryExists();
  try {
    fs.writeFileSync(JOKES_FILE, JSON.stringify(jokes, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving jokes:', err);
  }
}

export function learnPattern(pattern: string, response: string, author: string) {
  const patterns = loadPatterns();
  const existing = patterns.find(p => p.pattern.toLowerCase() === pattern.toLowerCase());
  
  if (existing) {
    if (!existing.responses.includes(response)) {
      existing.responses.push(response);
    }
  } else {
    patterns.push({
      pattern,
      responses: [response],
      author,
      createdAt: new Date().toISOString()
    });
  }
  
  savePatterns(patterns);
}

export function findMatchingResponse(input: string): string | undefined {
  const patterns = loadPatterns();
  for (const pattern of patterns) {
    if (input.toLowerCase().includes(pattern.pattern.toLowerCase())) {
      return pattern.responses[Math.floor(Math.random() * pattern.responses.length)];
    }
  }
  return undefined;
}

export function addJoke(joke: Omit<JokeEntry, 'createdAt'>) {
  const jokes = loadJokes();
  const newJoke = {
    ...joke,
    createdAt: new Date().toISOString()
  };
  jokes.push(newJoke);
  saveJokes(jokes);
}

export function getRandomJoke(type?: 'one-liner' | 'setup-punchline' | 'dad-joke'): JokeEntry {
  const jokes = loadJokes();
  const filteredJokes = type ? jokes.filter(j => j.type === type) : jokes;
  return filteredJokes[Math.floor(Math.random() * filteredJokes.length)];
}

// Get all learned patterns for a specific user
export function getUserPatterns(author: string): LearnedPattern[] {
  const patterns = loadPatterns();
  return patterns.filter(p => p.author === author);
}

// Delete a learned pattern
export function deletePattern(pattern: string, author: string): boolean {
  const patterns = loadPatterns();
  const index = patterns.findIndex(p => 
    p.pattern.toLowerCase() === pattern.toLowerCase() && p.author === author
  );
  
  if (index !== -1) {
    patterns.splice(index, 1);
    savePatterns(patterns);
    return true;
  }
  return false;
}