import * as fs from 'fs';
import * as path from 'path';
import { LEARNING_DIR } from '../config';
import { ensureDirectoryExists } from '../utils';

export type BypassType = 'user' | 'role';

export interface BypassEntry {
  id: string; // user id or role id
  type: BypassType;
  addedBy?: string;
  addedAt: number;
}

const BYPASS_FILE = path.join(LEARNING_DIR, 'bypass.json');

export class BypassService {
  private items: BypassEntry[] = [];
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? BYPASS_FILE;
    this.load();
  }

  private load() {
    try {
      if (!fs.existsSync(this.filePath)) return (this.items = []);
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.items = JSON.parse(raw) as BypassEntry[];
    } catch (err) {
      console.error('Failed to load bypass list:', err);
      this.items = [];
    }
  }

  private save() {
    try {
      ensureDirectoryExists();
      fs.writeFileSync(this.filePath, JSON.stringify(this.items, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save bypass list:', err);
    }
  }

  public list(): BypassEntry[] {
    return [...this.items];
  }

  public add(type: BypassType, id: string, addedBy?: string) {
    // prevent duplicates
    if (this.items.find(i => i.type === type && i.id === id)) return null;
    const entry: BypassEntry = { type, id, addedBy, addedAt: Date.now() };
    this.items.push(entry);
    this.save();
    return entry;
  }

  public remove(type: BypassType, id: string) {
    const idx = this.items.findIndex(i => i.type === type && i.id === id);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    this.save();
    return true;
  }

  public isUserBypassed(userId: string) {
    return this.items.some(i => i.type === 'user' && i.id === userId);
  }

  public isRoleBypassed(roleId: string) {
    return this.items.some(i => i.type === 'role' && i.id === roleId);
  }
}

export const bypass = new BypassService();
