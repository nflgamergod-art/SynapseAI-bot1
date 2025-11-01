import * as fs from 'fs';
import * as path from 'path';
import { LEARNING_DIR } from '../config';
import { LanguageHandler, SupportedLanguage } from './languageHandler';

/**
 * Ensure a directory exists. If `dir` is not provided, ensure LEARNING_DIR exists.
 */
function ensureDirectoryExists(dir?: string) {
  const targetDir = dir ?? LEARNING_DIR;
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  } catch (err) {
    console.error('Error ensuring directory exists:', err);
  }
}

interface QuestionHistory {
  question: string;
  lastAskedAt: number;
  askedBy: string;
  response: string;
  language: SupportedLanguage;
}

interface UserQuestions {
  [userId: string]: {
    [question: string]: {
      lastAskedAt: number;
      timesAsked: number;
      language: SupportedLanguage;
    };
  };
}

interface TrackerConfig {
  repeatTimeoutSeconds: number;
}

class ResponseTracker {
  private recentQuestions: QuestionHistory[] = [];
  private userQuestions: UserQuestions = {};
  private config: TrackerConfig;
  private readonly CONFIG_FILE: string;
  private readonly DEFAULT_TIMEOUT = 300; // 5 minutes

  constructor() {
    this.CONFIG_FILE = path.join(LEARNING_DIR, 'tracker_config.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): TrackerConfig {
    try {
      if (!fs.existsSync(this.CONFIG_FILE)) {
        const defaultConfig: TrackerConfig = {
          repeatTimeoutSeconds: this.DEFAULT_TIMEOUT
        };
        fs.writeFileSync(this.CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
      }
      return JSON.parse(fs.readFileSync(this.CONFIG_FILE, 'utf8'));
    } catch (err) {
      console.error('Error loading tracker config:', err);
      return { repeatTimeoutSeconds: this.DEFAULT_TIMEOUT };
    }
  }

  private saveConfig() {
    try {
      ensureDirectoryExists();
      fs.writeFileSync(this.CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error('Error saving tracker config:', err);
    }
  }

  public setRepeatTimeout(seconds: number) {
    if (seconds < 0) throw new Error('Timeout must be positive');
    this.config.repeatTimeoutSeconds = seconds;
    this.saveConfig();
  }

  public getRepeatTimeout(): number {
    return this.config.repeatTimeoutSeconds;
  }
  
  private getRepeatResponse(username: string, timesAsked: number, language: SupportedLanguage): string {
    return LanguageHandler.getRepeatResponse(language, username, timesAsked);
  }

  private getDifferentUserRepeatResponse(lastAskedBy: string, language: SupportedLanguage): string {
    return LanguageHandler.getDifferentUserRepeatResponse(language, lastAskedBy);
  }

  public async trackQuestion(question: string, userId: string, username: string, response: string): Promise<{ 
    shouldRespond: boolean;
    customResponse?: string;
    originalResponse?: string;
  }> {
    const now = Date.now();
    const normalizedQuestion = question.toLowerCase().trim();
    const detectedLanguage = await LanguageHandler.detectLanguage(question);

    // Initialize user's question history if it doesn't exist
    if (!this.userQuestions[userId]) {
      this.userQuestions[userId] = {};
    }

    // Check if this user has asked this question before
    if (this.userQuestions[userId][normalizedQuestion]) {
      const userHistory = this.userQuestions[userId][normalizedQuestion];
      const timeSinceLastAsked = (now - userHistory.lastAskedAt) / 1000;

      // Update tracking
      userHistory.lastAskedAt = now;
      userHistory.timesAsked++;
      userHistory.language = detectedLanguage;

      // If asked within timeout period, return repeat response
      if (timeSinceLastAsked < this.config.repeatTimeoutSeconds) {
        return {
          shouldRespond: false,
          customResponse: this.getRepeatResponse(username, userHistory.timesAsked, detectedLanguage)
        };
      }
    } else {
      // First time this user is asking this question
      this.userQuestions[userId][normalizedQuestion] = {
        lastAskedAt: now,
        timesAsked: 1,
        language: detectedLanguage
      };
    }

    // Check if anyone else recently asked this question
    const recentSimilarQuestion = this.recentQuestions.find(q => 
      q.question === normalizedQuestion && 
      q.askedBy !== username &&
      (now - q.lastAskedAt) / 1000 < this.config.repeatTimeoutSeconds
    );

    if (recentSimilarQuestion) {
      // Someone else recently asked this
      return {
        shouldRespond: true,
        customResponse: this.getDifferentUserRepeatResponse(recentSimilarQuestion.askedBy, detectedLanguage),
        originalResponse: response
      };
    }

    // Track this question
    this.recentQuestions.push({
      question: normalizedQuestion,
      lastAskedAt: now,
      askedBy: username,
      response,
      language: detectedLanguage
    });

    // Keep only recent questions (cleanup old ones)
    this.recentQuestions = this.recentQuestions.filter(q => 
      (now - q.lastAskedAt) / 1000 < this.config.repeatTimeoutSeconds
    );

    return { shouldRespond: true };
  }
}

// Singleton instance
export const responseTracker = new ResponseTracker();