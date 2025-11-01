import fs from "fs";
import path from "path";

export const DATA_DIR = path.resolve(__dirname, "..", "data");
export const LEARNING_DIR = path.join(DATA_DIR, "learning");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

interface PersistedConfig {
  defaultMuteSeconds?: number;
}

export function getEnvDefaultMuteSeconds(): number {
  const v = process.env.DEFAULT_MUTE_SECONDS;
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 3600; // fallback 1 hour
}

export function readPersistedConfig(): PersistedConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as PersistedConfig;
  } catch (err) {
    console.error("Failed to read persisted config:", err);
    return null;
  }
}

export function writePersistedConfig(cfg: PersistedConfig) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write persisted config:", err);
  }
}

export function getDefaultMuteSeconds(): number {
  const persisted = readPersistedConfig();
  if (persisted && typeof persisted.defaultMuteSeconds === "number" && persisted.defaultMuteSeconds > 0) {
    return persisted.defaultMuteSeconds;
  }
  return getEnvDefaultMuteSeconds();
}

export function setDefaultMuteSeconds(seconds: number) {
  const persisted = readPersistedConfig() || {};
  persisted.defaultMuteSeconds = seconds;
  writePersistedConfig(persisted);
}
