import type { RpsDifficulty } from "./rpsAi";
import { getTauntMode } from "../../config";

type Outcome = "win" | "lose" | "draw"; // from player's perspective

// Tone scales with difficulty:
// easy -> friendly/encouraging
// normal -> neutral-competitive
// hard -> edgy but non-toxic (no insults/profanity/hate)
const TALK: Record<RpsDifficulty, Record<Outcome, string[]>> = {
  easy: {
    win: [
      "Nice read! I blinked.",
      "Clean play. Respect.",
      "You got me—GG.",
      "Heat check passed."
    ],
    lose: [
      "Tight timing from me—go again.",
      "Caught your rhythm that time.",
      "Solid attempt—reset.",
      "I found the counter there."
    ],
    draw: [
      "Great minds, same move.",
      "Mirror match.",
      "Tie game—run it back.",
      "Dead even."
    ]
  },
  normal: {
    win: [
      "Well played. I’ll adapt.",
      "You clipped me. Noted.",
      "That was sharp.",
      "You took tempo."
    ],
    lose: [
      "Too slow there.",
      "I read that line.",
      "Countered clean.",
      "I’m up this round."
    ],
    draw: [
      "Stalemate.",
      "Even trade.",
      "Locked step.",
      "No ground gained."
    ]
  },
  hard: {
    win: [
      "Alright, you slipped one through.",
      "Enjoy that—momentum flips fast.",
      "Noted. Don’t get comfy.",
      "You scored. I’m dialing in."
    ],
    lose: [
      "Too readable.",
      "I saw it coming.",
      "Outpaced.",
      "That pattern won’t last."
    ],
    draw: [
      "Neutral. Next one bites.",
      "Deadlock. Break it.",
      "Parry. Advance.",
      "No edge—yet."
    ]
  }
};

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export function getTrashTalk(opts: {
  outcome: Outcome;
  difficulty: RpsDifficulty;
  playerName: string;
  playerMove: string;
  aiMove: string;
}) {
  const { outcome, difficulty, playerName } = opts;
  const mode = getTauntMode();
  const effDifficulty: RpsDifficulty = mode === 'soft' ? 'easy' : mode === 'edgy' ? 'hard' : difficulty;
  const line = pick(TALK[effDifficulty][outcome]);
  // Keep closing prompt to drive the game, but tone comes from difficulty bucket.
  const closer = effDifficulty === "hard"
    ? "Your turn."
    : effDifficulty === "normal"
      ? "Let’s see the next one."
      : "Your move—let’s keep it fun.";
  return `${line} ${closer} ${playerName}.`;
}
