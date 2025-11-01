import { randomUUID } from 'crypto';
import { Card, makeDeck, draw, handValue, renderHand } from './cards';
import { getTauntMode } from '../../config';

export type BjDifficulty = 'easy' | 'normal' | 'hard';

export interface BjSession {
  id: string;
  userId: string;
  channelId: string;
  difficulty: BjDifficulty;
  deck: Card[];
  player: Card[];
  dealer: Card[]; // dealer[0] is face-down in UI
  finished: boolean;
  outcome?: 'win' | 'lose' | 'push'; // from player's perspective
  messageId?: string;
  createdAt: number;
}

const bjSessions = new Map<string, BjSession>();

export function startBjSession(userId: string, channelId: string, difficulty: BjDifficulty): BjSession {
  const id = randomUUID();
  let deck = makeDeck();
  let player: Card[] = [];
  let dealer: Card[] = [];
  ({ drawn: player, deck } = draw(deck, 2));
  ({ drawn: dealer, deck } = draw(deck, 2));
  const sess: BjSession = { id, userId, channelId, difficulty, deck, player, dealer, finished: false, createdAt: Date.now() };
  bjSessions.set(id, sess);
  return sess;
}

export function getBjSession(id: string) { return bjSessions.get(id); }
export function endBjSession(id: string) { bjSessions.delete(id); }
export function setBjMessageId(id: string, messageId: string) { const s = bjSessions.get(id); if (s) s.messageId = messageId; }

export function hitPlayer(id: string) {
  const s = bjSessions.get(id); if (!s || s.finished) return null;
  const res = draw(s.deck, 1); s.deck = res.deck; s.player.push(...res.drawn);
  const pv = handValue(s.player);
  if (pv.bust) { s.finished = true; s.outcome = 'lose'; }
  return s;
}

export function standAndResolve(id: string) {
  const s = bjSessions.get(id); if (!s || s.finished) return null;
  // Dealer play according to difficulty
  const pv = handValue(s.player);
  dealerPlay(s, pv.total);
  const dv = handValue(s.dealer);
  if (dv.bust) s.outcome = 'win';
  else if (pv.total > dv.total) s.outcome = 'win';
  else if (pv.total < dv.total) s.outcome = 'lose';
  else s.outcome = 'push';
  s.finished = true;
  return s;
}

function dealerPlay(s: BjSession, playerTotal: number) {
  // Difficulty tweaks: 
  // easy  -> dealer stands on soft 17 and occasionally stands early (15-16) to misplay.
  // normal-> dealer hits to 17 (hit soft 17 is off).
  // hard  -> dealer hits on soft 17 and is slightly more conservative about busting when close to 21.
  const mode = s.difficulty;
  let dv = handValue(s.dealer);
  while (true) {
    const soft17 = dv.total === 17 && dv.soft;
    const shouldStandEasy = dv.total >= 17 || (dv.total >= 15 && Math.random() < 0.25);
    const shouldStandNormal = dv.total >= 17 && !soft17; // stand on all 17
    const shouldStandHard = (dv.total > 17) || (dv.total === 17 && !soft17) || (soft17 && Math.random() < 0.2);

    const shouldStand = mode === 'easy' ? shouldStandEasy : mode === 'normal' ? shouldStandNormal : shouldStandHard;
    if (shouldStand) break;

    // Draw a card; on hard, reduce bust risk slightly by redrawing once if immediate bust
    const res = draw(s.deck, 1); s.deck = res.deck; const c = res.drawn[0];
    s.dealer.push(c);
    dv = handValue(s.dealer);
    if (mode === 'hard' && dv.bust && Math.random() < 0.4) {
      // undo this draw and try a different one once
      s.dealer.pop();
      s.deck.unshift(c); // put it back on top; then reshuffle top few cards to avoid loops
      s.deck = s.deck.slice(0, 3).sort(() => Math.random() - 0.5).concat(s.deck.slice(3));
      const res2 = draw(s.deck, 1); s.deck = res2.deck; const c2 = res2.drawn[0]; s.dealer.push(c2);
      dv = handValue(s.dealer);
    }
    if (dv.bust) break;
  }
}

export function bjEmbedFields(s: BjSession, revealDealer = false) {
  const pv = handValue(s.player);
  const dv = revealDealer ? handValue(s.dealer) : handValue([s.dealer[1]]);
  return [
    { name: 'Your Hand', value: `${renderHand(s.player)}\n(${pv.total})`, inline: false },
    { name: 'Dealer', value: `${renderHand(s.dealer, !revealDealer)}\n(${revealDealer ? dv.total : '??'})`, inline: false },
    { name: 'Status', value: s.finished ? (s.outcome === 'win' ? 'You WIN' : s.outcome === 'lose' ? 'You LOSE' : 'PUSH') : 'Playing…', inline: false },
  ];
}

export function bjTalkLine(s: BjSession, phase: 'deal' | 'hit' | 'stand' | 'finish'): string {
  // Use global taunt mode to bias tone similar to RPS.
  const tm = getTauntMode();
  const diff = tm === 'soft' ? 'easy' : tm === 'edgy' ? 'hard' : s.difficulty;
  const pv = handValue(s.player).total;
  const dv = handValue(s.dealer).total;
  const end = s.finished ? s.outcome : undefined;
  const pools: any = {
    easy: {
      deal: ["Let’s keep this friendly.", "Good luck out there."],
      hit: ["Solid draw.", "Nice pick."],
      stand: ["Standing, got it.", "Locking it in."],
      win: ["GG, that was clean.", "Nice win."],
      lose: ["You’ll get the next one.", "Well played nonetheless."],
      push: ["Even trade.", "Tie game."]
    },
    normal: {
      deal: ["Let’s play.", "Cards down."],
      hit: ["Hit noted.", "Drawing."],
      stand: ["Standing confirmed.", "Dealer plays."],
      win: ["You took it.", "Well earned."],
      lose: ["House takes this one.", "I’ll take that round."],
      push: ["Push.", "Even."]
    },
    hard: {
      deal: ["Let’s see your edge.", "Cut the margin."],
      hit: ["Risky. I like it.", "Let’s see if that holds."],
      stand: ["Dealer time.", "You’re locked in."],
      win: ["You got through. Don’t bank on it twice.", "Alright—you snagged it."],
      lose: ["House holds.", "Margin closed on my side."],
      push: ["Neutral. Next one breaks it.", "Dead even."],
    }
  };

  const bucket = pools[diff as 'easy'|'normal'|'hard'];
  if (phase === 'finish' && end) {
    const arr = bucket[end];
    return arr[Math.floor(Math.random() * arr.length)];
  }
  const arr = bucket[phase];
  return arr[Math.floor(Math.random() * arr.length)];
}
