/**
 * Multi-Language Support
 * Auto-detect user language and translate tickets
 */

import { getDB } from './db';

export interface LanguagePreference {
  user_id: string;
  guild_id: string;
  language: string;
  auto_translate: number;
}

export interface TranslationCache {
  id: number;
  original_text: string;
  translated_text: string;
  source_lang: string;
  target_lang: string;
  created_at: string;
}

// Initialize multi-language schema
export function initMultiLanguageSchema() {
  const db = getDB();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_language_preferences (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      auto_translate INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, guild_id)
    );
    
    CREATE TABLE IF NOT EXISTS translation_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_translation_cache_lookup 
    ON translation_cache(original_text, source_lang, target_lang);
  `);
  
  console.log('✅ Multi-Language schema initialized');
}

// Supported languages
export const SUPPORTED_LANGUAGES = {
  en: { name: 'English', flag: '🇺🇸' },
  es: { name: 'Spanish', flag: '🇪🇸' },
  fr: { name: 'French', flag: '🇫🇷' },
  de: { name: 'German', flag: '🇩🇪' },
  it: { name: 'Italian', flag: '🇮🇹' },
  pt: { name: 'Portuguese', flag: '🇧🇷' },
  ru: { name: 'Russian', flag: '🇷🇺' },
  ja: { name: 'Japanese', flag: '🇯🇵' },
  ko: { name: 'Korean', flag: '🇰🇷' },
  zh: { name: 'Chinese', flag: '🇨🇳' },
  ar: { name: 'Arabic', flag: '🇸🇦' },
  hi: { name: 'Hindi', flag: '🇮🇳' },
  nl: { name: 'Dutch', flag: '🇳🇱' },
  pl: { name: 'Polish', flag: '🇵🇱' },
  tr: { name: 'Turkish', flag: '🇹🇷' }
};

// Set user language preference
export function setLanguagePreference(
  userId: string,
  guildId: string,
  language: string,
  autoTranslate: boolean = false
): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO user_language_preferences (user_id, guild_id, language, auto_translate, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      language = excluded.language,
      auto_translate = excluded.auto_translate,
      updated_at = datetime('now')
  `).run(userId, guildId, language, autoTranslate ? 1 : 0);
  
  console.log(`🌍 Language preference set for ${userId}: ${language} (auto-translate: ${autoTranslate})`);
}

// Get user language preference
export function getLanguagePreference(userId: string, guildId: string): LanguagePreference | null {
  const db = getDB();
  const pref = db.prepare(`
    SELECT * FROM user_language_preferences 
    WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId) as LanguagePreference | undefined;
  
  return pref || null;
}

// Detect language from text (simple heuristic-based detection)
export function detectLanguage(text: string): string {
  const lowerText = text.toLowerCase();
  
  // Simple keyword-based detection
  const patterns = {
    es: /(?:hola|gracias|por favor|buenos|días|señor|está)/i,
    fr: /(?:bonjour|merci|s'il vous plaît|monsieur|madame|très)/i,
    de: /(?:hallo|danke|bitte|herr|frau|sehr|gut)/i,
    pt: /(?:olá|obrigado|por favor|senhor|senhora|muito)/i,
    ru: /[\u0400-\u04FF]/,
    ja: /[\u3040-\u309F\u30A0-\u30FF]/,
    ko: /[\uAC00-\uD7AF]/,
    zh: /[\u4E00-\u9FFF]/,
    ar: /[\u0600-\u06FF]/,
  };
  
  for (const [lang, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return lang;
    }
  }
  
  return 'en'; // Default to English
}

// Translate text using Google Translate API (or LibreTranslate as free alternative)
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang?: string
): Promise<{ translated: string; detectedLang: string }> {
  // Check cache first
  const db = getDB();
  const cached = db.prepare(`
    SELECT * FROM translation_cache 
    WHERE original_text = ? AND target_lang = ?
    LIMIT 1
  `).get(text, targetLang) as TranslationCache | undefined;
  
  if (cached) {
    console.log(`🌍 Using cached translation (${cached.source_lang} → ${targetLang})`);
    return { translated: cached.translated_text, detectedLang: cached.source_lang };
  }
  
  try {
    // Use LibreTranslate (free, self-hosted option)
    const libreTranslateUrl = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com/translate';
    
    const detected = sourceLang || detectLanguage(text);
    
    // If already in target language, return as-is
    if (detected === targetLang) {
      console.log(`🌍 Text already in target language (${targetLang})`);
      return { translated: text, detectedLang: detected };
    }
    
    console.log(`🌍 Translating: "${text.substring(0, 50)}..." from ${detected} to ${targetLang}`);
    
    const response = await fetch(libreTranslateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: text,
        source: detected,
        target: targetLang,
        format: 'text'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Translation API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Translation API error: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    console.log(`🌍 Translation API response:`, data);
    
    const translated = data.translatedText || data.translation || text;
    
    // Only cache if translation was successful and different from original
    if (translated && translated !== text) {
      db.prepare(`
        INSERT INTO translation_cache (original_text, translated_text, source_lang, target_lang)
        VALUES (?, ?, ?, ?)
      `).run(text, translated, detected, targetLang);
      
      console.log(`✅ Translation successful: "${text.substring(0, 30)}..." → "${translated.substring(0, 30)}..."`);
    } else {
      console.warn(`⚠️ Translation returned same text or empty`);
    }
    
    return { translated, detectedLang: detected };
  } catch (error) {
    console.error('❌ Translation failed:', error);
    // Return original text with detected language on error
    return { translated: text, detectedLang: sourceLang || detectLanguage(text) };
  }
}

// Get all staff language proficiencies
export function getStaffLanguages(guildId: string): Map<string, string[]> {
  const db = getDB();
  const staffLanguages = new Map<string, string[]>();
  
  // Get all staff with their language preferences
  const prefs = db.prepare(`
    SELECT user_id, language FROM user_language_preferences 
    WHERE guild_id = ?
  `).all(guildId) as LanguagePreference[];
  
  for (const pref of prefs) {
    if (!staffLanguages.has(pref.user_id)) {
      staffLanguages.set(pref.user_id, []);
    }
    staffLanguages.get(pref.user_id)!.push(pref.language);
  }
  
  return staffLanguages;
}

// Find staff who speak a specific language
export function findStaffByLanguage(guildId: string, language: string): string[] {
  const db = getDB();
  const staff = db.prepare(`
    SELECT user_id FROM user_language_preferences 
    WHERE guild_id = ? AND language = ?
  `).all(guildId, language) as LanguagePreference[];
  
  return staff.map(s => s.user_id);
}
