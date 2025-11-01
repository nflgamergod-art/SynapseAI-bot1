import * as fs from 'fs';
import * as path from 'path';
import { LEARNING_DIR } from '../config';
import { ensureDirectoryExists } from '../utils';

export interface WarningEntry {
  id: string;
  userId: string;
  moderatorId: string;
  reason?: string;
  createdAt: number;
}

const WARN_FILE = path.join(LEARNING_DIR, 'warnings.json');

export class WarningsService {
  private warnings: WarningEntry[] = [];
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? WARN_FILE;
    this.load();
  }

  private load() {
    try {
      if (!fs.existsSync(this.filePath)) return (this.warnings = []);
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.warnings = JSON.parse(raw) as WarningEntry[];
    } catch (err) {
      console.error('Failed to load warnings:', err);
      this.warnings = [];
    }
  }

  private save() {
    try {
      ensureDirectoryExists();
      fs.writeFileSync(this.filePath, JSON.stringify(this.warnings, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save warnings:', err);
    }
  }

  public addWarning(userId: string, moderatorId: string, reason?: string) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
    const entry: WarningEntry = { id, userId, moderatorId, reason, createdAt: Date.now() };
    this.warnings.push(entry);
    this.save();
    return entry;
  }

  public clearWarningsFor(userId: string) {
    const before = this.warnings.length;
    this.warnings = this.warnings.filter(w => w.userId !== userId);
    const removed = before - this.warnings.length;
    this.save();
    return removed;
  }

  public listWarningsFor(userId: string) {
    return this.warnings.filter(w => w.userId === userId);
  }
}

export const warnings = new WarningsService();
