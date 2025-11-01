import * as fs from 'fs';
import * as path from 'path';
import { LEARNING_DIR } from '../config';
import { ensureDirectoryExists } from '../utils';

export type RuleType = 'phrase' | 'emoji' | 'sticker';
export type MatchType = 'contains' | 'equals' | 'regex';

export interface ResponseRule {
  id: string;
  type: RuleType;
  matchType: MatchType;
  trigger: string; // phrase, emoji unicode, or sticker id
  // response can be a single string or language-specific map (ISO 639-1 -> text)
  response?: string;
  responsesPerLang?: Record<string, string>;
  // special value "__IGNORE__" in response or per-lang responses means don't respond
  createdBy?: string;
  createdAt: number;
}

const RULES_FILE = path.join(LEARNING_DIR, 'response_rules.json');

export class ResponseRulesService {
  private rules: ResponseRule[] = [];
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? RULES_FILE;
    this.load();
  }

  private load() {
    try {
      if (!fs.existsSync(this.filePath)) return (this.rules = []);
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.rules = JSON.parse(raw) as ResponseRule[];
    } catch (err) {
      console.error('Failed to load response rules:', err);
      this.rules = [];
    }
  }

  private save() {
    try {
      ensureDirectoryExists();
      fs.writeFileSync(this.filePath, JSON.stringify(this.rules, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save response rules:', err);
    }
  }

  public listRules(): ResponseRule[] {
    return [...this.rules];
  }

  public addRule(r: Omit<ResponseRule,'id'|'createdAt'> & { createdBy?: string }) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
    const rule: ResponseRule = { ...r, id, createdAt: Date.now() };
    this.rules.push(rule);
    this.save();
    return rule;
  }

  public removeRule(id: string) {
    const idx = this.rules.findIndex(r => r.id === id);
    if (idx === -1) return false;
    this.rules.splice(idx, 1);
    this.save();
    return true;
  }

  // emojis: unicode emoji characters detected
  // customEmojiIds: array of numeric ids extracted from <:name:id> tokens
  public findMatchingRule(content: string, emojis: string[], customEmojiIds: string[], stickerIds: string[]): ResponseRule | null {
    const normalized = content.toLowerCase();

    for (const rule of this.rules) {
      try {
        if (rule.type === 'phrase') {
          const trigger = rule.matchType === 'equals' ? rule.trigger.toLowerCase() : rule.trigger;
          if (rule.matchType === 'equals' && normalized === trigger.toLowerCase()) return rule;
          if (rule.matchType === 'contains' && normalized.includes(trigger.toLowerCase())) return rule;
          if (rule.matchType === 'regex') {
            const re = new RegExp(rule.trigger, 'i');
            if (re.test(content)) return rule;
          }
        } else if (rule.type === 'emoji') {
          // emoji triggers: match unicode emoji characters directly
          if (emojis.includes(rule.trigger)) return rule;
          // custom emoji format: <:name:id> or <a:name:id>
          const customMatch = rule.trigger.match(/^<a?:\w+:(\d+)>$/);
          if (customMatch) {
            const id = customMatch[1];
            if (customEmojiIds.includes(id)) return rule;
          }
          // allow matching by just the numeric id or the literal <:name:id> string
          if (customEmojiIds.includes(rule.trigger)) return rule;
          if (emojis.includes(`<:${rule.trigger}>`) || emojis.includes(`<a:${rule.trigger}>`)) return rule;
        } else if (rule.type === 'sticker') {
          if (stickerIds.includes(rule.trigger)) return rule;
        }
      } catch (err) {
        console.warn('Error evaluating rule', rule.id, err);
      }
    }

    return null;
  }
}

export const responseRules = new ResponseRulesService();
