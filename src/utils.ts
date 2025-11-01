import * as fs from 'fs';
import { DATA_DIR, LEARNING_DIR } from './config';

export function ensureDirectoryExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LEARNING_DIR)) {
    fs.mkdirSync(LEARNING_DIR, { recursive: true });
  }
}