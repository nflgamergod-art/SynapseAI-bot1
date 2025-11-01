// Giveaway system core model and config
import { Snowflake } from "discord.js";

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

// In-memory store (persist to file for production)
let config: GiveawayConfig = { giveaways: [] };

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
  return giveaway;
}

export function getActiveGiveaways(): Giveaway[] {
  return config.giveaways.filter(g => g.status === "active");
}

export function getGiveawayById(id: string): Giveaway | undefined {
  return config.giveaways.find(g => g.id === id);
}

export function endGiveaway(id: string, winners: Snowflake[]) {
  const g = getGiveawayById(id);
  if (!g) return;
  g.status = "ended";
  g.winners = winners;
}

export function cancelGiveaway(id: string) {
  const g = getGiveawayById(id);
  if (!g) return;
  g.status = "cancelled";
}

export function addEntry(id: string, userId: Snowflake) {
  const g = getGiveawayById(id);
  if (!g || g.status !== "active") return false;
  if (!g.entries.includes(userId)) g.entries.push(userId);
  return true;
}

export function removeEntry(id: string, userId: Snowflake) {
  const g = getGiveawayById(id);
  if (!g) return false;
  g.entries = g.entries.filter(e => e !== userId);
  return true;
}

export function setGiveawayMessageId(id: string, messageId: Snowflake) {
  const g = getGiveawayById(id);
  if (!g) return;
  g.messageId = messageId;
}
