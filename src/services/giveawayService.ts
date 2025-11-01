// Giveaway system core model and config
import { Snowflake } from "discord.js";
import fs from 'fs';
import path from 'path';

export type GiveawayRequirement = {
  minMessages?: number;
  minInvites?: number;
  requiredRoles?: Snowflake[];
};

export type GiveawayStatus = "active" | "ended" | "cancelled";

export interface Giveaway {
  id: string;
  prize: string;
  channelId: Snowflake;
  guildId: Snowflake;
  hostId: Snowflake;
  durationMs: number;
  winnerCount: number;
  requirements: GiveawayRequirement;
  startTime: number;
  endTime: number;
  status: GiveawayStatus;
  entries: Snowflake[];
  winners: Snowflake[];
  messageId?: Snowflake;
}

export interface GiveawayConfig {
  giveaways: Giveaway[];
}

const DATA_PATH = path.join(__dirname, '../../data/giveaways.json');

function loadGiveaways(): GiveawayConfig {
  if (!fs.existsSync(DATA_PATH)) return { giveaways: [] };
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { giveaways: [] };
  }
}

function saveGiveaways(config: GiveawayConfig) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(config, null, 2));
}

// In-memory store (persist to file for production)
let config: GiveawayConfig = loadGiveaways();

export function createGiveaway(params: Omit<Giveaway, "id"|"startTime"|"endTime"|"status"|"entries"|"winners">): Giveaway {
  const id = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
  const startTime = Date.now();
  const endTime = startTime + params.durationMs;
  const giveaway: Giveaway = {
    ...params,
    id,
    startTime,
    endTime,
    status: "active",
    entries: [],
    winners: [],
  };
  config.giveaways.push(giveaway);
  saveGiveaways(config);
  return giveaway;
}

export function getActiveGiveaways(guildId?: Snowflake): Giveaway[] {
  const active = config.giveaways.filter(g => g.status === "active");
  return guildId ? active.filter(g => g.guildId === guildId) : active;
}

export function getGiveawayById(id: string): Giveaway | undefined {
  return config.giveaways.find(g => g.id === id);
}

export function endGiveaway(id: string, winners: Snowflake[]) {
  const g = getGiveawayById(id);
  if (!g) return;
  g.status = "ended";
  g.winners = winners;
  saveGiveaways(config);
}

export function cancelGiveaway(id: string) {
  const g = getGiveawayById(id);
  if (!g) return;
  g.status = "cancelled";
  saveGiveaways(config);
}

export function addEntry(id: string, userId: Snowflake) {
  const g = getGiveawayById(id);
  if (!g || g.status !== "active") return false;
  if (!g.entries.includes(userId)) g.entries.push(userId);
  saveGiveaways(config);
  return true;
}

export function removeEntry(id: string, userId: Snowflake) {
  const g = getGiveawayById(id);
  if (!g) return false;
  g.entries = g.entries.filter(e => e !== userId);
  saveGiveaways(config);
  return true;
}

export function setGiveawayMessageId(id: string, messageId: Snowflake) {
  const g = getGiveawayById(id);
  if (!g) return;
  g.messageId = messageId;
  saveGiveaways(config);
}

export function pickWinners(giveaway: Giveaway): Snowflake[] {
  if (giveaway.entries.length === 0) return [];
  const count = Math.min(giveaway.winnerCount, giveaway.entries.length);
  const shuffled = [...giveaway.entries].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
