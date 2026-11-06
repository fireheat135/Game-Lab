import type { HandId, Params } from "./params";

export interface Kill { kind: number; color: number; col: number; row: number; corner: boolean }
export type Bonus = "vline" | "hline" | "corner" | "sweep";

export interface HandResult {
  hand: HandId; baseChips: number; killChips: number; bonusChips: number; chips: number;
  baseMult: number; bonusMult: number; mult: number; xmult: number; score: number; bonuses: Bonus[];
}

export const HAND_NAMES: Record<HandId, string> = {
  high: "ハイカード", pair: "ペア", two: "ツーペア", three: "スリーカード", straight: "ストレート",
  flush: "フラッシュ", full: "フルハウス", four: "フォーカード", sf: "ストレートフラッシュ", five: "ファイブカード",
};
export const BONUS_NAMES: Record<Bonus, string> = { vline: "縦ライン", hline: "横ライン", corner: "角取り", sweep: "一掃" };

export function killChips(kind: number, p: Params): number {
  const list = p.kill;
  if (kind <= list.length) return list[kind - 1];
  return list[list.length - 1] + 5 * (kind - list.length);
}

/** Every hand the kills satisfy. Straight / flush need a full queue (企画書 §3.3). */
export function matchingHands(kills: Kill[], p: Params): HandId[] {
  const n = kills.length;
  const full = n === p.queue;
  const counts = [...kills.reduce((m, x) => m.set(x.kind, (m.get(x.kind) ?? 0) + 1), new Map<number, number>()).values()].sort((a, b) => b - a);
  const [c0 = 0, c1 = 0] = counts;
  const kinds = kills.map(x => x.kind).sort((a, b) => a - b);
  const straight = full && n >= 2 && counts.length === n && kinds[n - 1] - kinds[0] === n - 1;
  const flush = full && n >= 2 && kills.every(x => x.color === kills[0].color);
  const out: HandId[] = ["high"];
  if (c0 >= 2) out.push("pair");
  if (c0 >= 2 && c1 >= 2) out.push("two");
  if (c0 >= 3) out.push("three");
  if (straight) out.push("straight");
  if (flush) out.push("flush");
  if (c0 >= 3 && c1 >= 2) out.push("full");
  if (c0 >= 4) out.push("four");
  if (straight && flush) out.push("sf");
  if (c0 >= 5) out.push("five");
  return out;
}

/**
 * ハンド得点 = (役Chips + Σ撃破Chips + 角Chips) × (役Mult + 位置Mult) × 一掃倍率 (企画書 §3.4).
 * When several hands match, the one paying the most base Chips × Mult wins (values are tunable,
 * so ordering by the current numbers keeps "the best hand" consistent with the query).
 */
export function evaluateHand(kills: Kill[], p: Params, opts: { sweep: boolean }): HandResult {
  const hand = matchingHands(kills, p).reduce((best, h) => (p[h][0] * p[h][1] > p[best][0] * p[best][1] ? h : best));
  const n = kills.length, full = n === p.queue && n >= 2;
  const bonuses: Bonus[] = [];
  let bonusMult = 0, bonusChips = 0, xmult = 1;
  if (full && kills.every(x => x.col === kills[0].col)) { bonuses.push("vline"); bonusMult += p.vline; }
  if (full && kills.every(x => x.row === kills[0].row)) { bonuses.push("hline"); bonusMult += p.hline; }
  const corners = kills.filter(x => x.corner).length;
  if (corners > 0) { bonuses.push("corner"); bonusChips += corners * p.corner; }
  if (opts.sweep) { bonuses.push("sweep"); xmult *= p.sweep; }
  const [baseChips, baseMult] = p[hand];
  const kc = kills.reduce((s, x) => s + killChips(x.kind, p), 0);
  const chips = baseChips + kc + bonusChips, mult = baseMult + bonusMult;
  return { hand, baseChips, killChips: kc, bonusChips, chips, baseMult, bonusMult, mult, xmult, score: Math.floor(chips * mult * xmult), bonuses };
}
