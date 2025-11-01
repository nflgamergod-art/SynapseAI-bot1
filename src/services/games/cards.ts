export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
export type Card = `${Rank}${Suit}`;

const SUITS: Suit[] = ['♠','♥','♦','♣'];
const RANKS: Rank[] = ['A','K','Q','J','10','9','8','7','6','5','4','3','2'];

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) deck.push(`${r}${s}` as Card);
  }
  return shuffle(deck);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function draw(deck: Card[], n = 1): { drawn: Card[]; deck: Card[] } {
  const d = deck.slice();
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    const c = d.shift();
    if (!c) break;
    out.push(c);
  }
  return { drawn: out, deck: d };
}

export function handValue(cards: Card[]): { total: number; soft: boolean; bust: boolean } {
  // Blackjack hand value: A can be 1 or 11
  // Start count with aces as 11, then reduce by 10 while busting
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === 'A') { total += 11; aces++; }
    else if (r === 'K' || r === 'Q' || r === 'J' || r === '10') total += 10;
    else total += Number(r);
  }
  let soft = false;
  while (total > 21 && aces > 0) {
    total -= 10; // count an Ace as 1 instead of 11
    aces--;
  }
  // If any Ace still counted as 11, it's a soft hand
  if (aces > 0 && total <= 21) soft = true;
  return { total, soft, bust: total > 21 };
}

export function rankOf(card: Card): Rank {
  // card like 'A♠' or '10♦'
  return (card.length === 3 ? '10' : card[0]) as Rank;
}

export function renderHand(cards: Card[], hideFirst = false): string {
  if (!hideFirst) return cards.join(' ');
  if (cards.length === 0) return '—';
  const rest = cards.slice(1).join(' ');
  return `🂠 ${rest}`.trim();
}
