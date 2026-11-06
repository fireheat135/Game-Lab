// Hand evaluation: ハンド得点 = (役Chips + Σ撃破Chips + 角Chips) × (役Mult + 位置Mult) × 一掃倍率 (企画書 §3.4).
import { HANDS, type BonusId, type FormationParams, type HandId } from "./rules";

export interface Kill { kind: number; color: number; col: number; row: number; corner: boolean }

export interface HandResult {
  hand: HandId; baseChips: number; killChips: number; bonusChips: number; chips: number;
  baseMult: number; bonusMult: number; mult: number; xmult: number; score: number; bonuses: BonusId[];
}

export function killChips(kind: number, p: FormationParams): number {
  return p[`kill.${kind}`] ?? 0;
}

/** Every hand the kills satisfy. Straight / flush need a full queue (企画書 §3.3). */
export function matchingHands(kills: Kill[], p: FormationParams): HandId[] {
  const n = kills.length;
  const isFull = n === p.queue && n >= 2;
  const countByKind = new Map<number, number>();
  for (const x of kills) countByKind.set(x.kind, (countByKind.get(x.kind) ?? 0) + 1);
  const [most = 0, second = 0] = [...countByKind.values()].sort((a, b) => b - a);
  const kinds = kills.map(x => x.kind).sort((a, b) => a - b);
  const straight = isFull && countByKind.size === n && kinds[n - 1] - kinds[0] === n - 1;
  const flush = isFull && kills.every(x => x.color === kills[0].color);

  const matches: Record<HandId, boolean> = {
    high: true, pair: most >= 2, two: most >= 2 && second >= 2, three: most >= 3, straight, flush,
    full: most >= 3 && second >= 2, four: most >= 4, sf: straight && flush, five: most >= 5,
  };
  return HANDS.map(h => h.id).filter(id => matches[id]);
}

function positionBonuses(kills: Kill[], p: FormationParams, sweep: boolean) {
  const isFull = kills.length === p.queue && kills.length >= 2;
  const bonuses: BonusId[] = [];
  let mult = 0, chips = 0, xmult = 1;
  if (isFull && kills.every(x => x.col === kills[0].col)) { bonuses.push("vline"); mult += p.vline; }
  if (isFull && kills.every(x => x.row === kills[0].row)) { bonuses.push("hline"); mult += p.hline; }
  const corners = kills.filter(x => x.corner).length;
  if (corners > 0) { bonuses.push("corner"); chips += corners * p.corner; }
  if (sweep) { bonuses.push("sweep"); xmult *= p.sweep; }
  return { bonuses, mult, chips, xmult };
}

/** Scores every matching hand and keeps the one with the highest FINAL score. */
export function evaluateHand(kills: Kill[], p: FormationParams, opts: { sweep: boolean }): HandResult {
  const bonus = positionBonuses(kills, p, opts.sweep);
  const kc = kills.reduce((sum, x) => sum + killChips(x.kind, p), 0);
  const score = (hand: HandId): HandResult => {
    const baseChips = p[`${hand}.chips`], baseMult = p[`${hand}.mult`];
    const chips = baseChips + kc + bonus.chips, mult = baseMult + bonus.mult;
    return {
      hand, baseChips, killChips: kc, bonusChips: bonus.chips, chips, baseMult, bonusMult: bonus.mult, mult,
      xmult: bonus.xmult, score: Math.floor(chips * mult * bonus.xmult), bonuses: bonus.bonuses,
    };
  };
  return matchingHands(kills, p).map(score).reduce((best, r) => (r.score > best.score ? r : best));
}
