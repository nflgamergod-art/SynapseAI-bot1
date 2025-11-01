import { randomUUID } from "crypto";

export type RpsMove = "rock" | "paper" | "scissors";
export type RpsDifficulty = "easy" | "normal" | "hard";
export type RpsMode = "bo1" | "bo3";

export interface RpsSession {
  id: string;
  userId: string;
  channelId: string;
  difficulty: RpsDifficulty;
  mode: RpsMode;
  targetWins: number;
  playerWins: number;
  aiWins: number;
  rounds: Array<{
    playerMove: RpsMove;
    aiMove: RpsMove;
    outcome: "win" | "lose" | "draw"; // from player's perspective
  }>;
  messageId?: string; // the message showing buttons/scoreboard
  createdAt: number;
}

const sessions = new Map<string, RpsSession>();

export function startRpsSession(userId: string, channelId: string, difficulty: RpsDifficulty, mode: RpsMode): RpsSession {
  const id = randomUUID();
  const targetWins = mode === "bo3" ? 2 : 1;
  const sess: RpsSession = {
    id,
    userId,
    channelId,
    difficulty,
    mode,
    targetWins,
    playerWins: 0,
    aiWins: 0,
    rounds: [],
    createdAt: Date.now()
  };
  sessions.set(id, sess);
  return sess;
}

export function getRpsSession(id: string) {
  return sessions.get(id);
}

export function endRpsSession(id: string) {
  sessions.delete(id);
}

export function setRpsSessionMessage(id: string, messageId: string) {
  const s = sessions.get(id);
  if (s) s.messageId = messageId;
}

function randomMove(): RpsMove {
  const m: RpsMove[] = ["rock", "paper", "scissors"];
  return m[Math.floor(Math.random() * m.length)];
}

function counterMove(move: RpsMove): RpsMove {
  if (move === "rock") return "paper";
  if (move === "paper") return "scissors";
  return "rock";
}

function losingMove(move: RpsMove): RpsMove {
  if (move === "rock") return "scissors";
  if (move === "paper") return "rock";
  return "paper";
}

function pickAiMove(difficulty: RpsDifficulty, playerMove: RpsMove): RpsMove {
  // We pick after the player clicks.
  if (difficulty === "easy") {
    // 60% chance to pick a losing move (player likely wins), else random
    return Math.random() < 0.6 ? losingMove(playerMove) : randomMove();
  }
  if (difficulty === "hard") {
    // 80% chance to counter the player's move (AI likely wins), else random
    return Math.random() < 0.8 ? counterMove(playerMove) : randomMove();
  }
  // normal -> random
  return randomMove();
}

function decideOutcome(player: RpsMove, ai: RpsMove): "win" | "lose" | "draw" {
  if (player === ai) return "draw";
  if (
    (player === "rock" && ai === "scissors") ||
    (player === "paper" && ai === "rock") ||
    (player === "scissors" && ai === "paper")
  ) return "win";
  return "lose";
}

export function handlePlayerMove(sessionId: string, playerMove: RpsMove) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  const ai = pickAiMove(s.difficulty, playerMove);
  const outcome = decideOutcome(playerMove, ai);
  if (outcome === "win") s.playerWins += 1;
  if (outcome === "lose") s.aiWins += 1;
  s.rounds.push({ playerMove, aiMove: ai, outcome });
  const finished = s.playerWins >= s.targetWins || s.aiWins >= s.targetWins;
  return { session: s, aiMove: ai, outcome, finished };
}

export function rpsEmoji(move: RpsMove) {
  switch (move) {
    case "rock": return "🪨";
    case "paper": return "📄";
    case "scissors": return "✂️";
  }
}

export function scoreLine(s: RpsSession) {
  return `You ${s.playerWins} — ${s.aiWins} SynapseAI`;
}
