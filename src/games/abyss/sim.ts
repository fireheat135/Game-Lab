// Offline bots for ABYSS CHAIN (no enemy fire, no drift, no shop): how far does each way of playing get?
// Goal of tuning: thinking (greedy / lookahead) must clearly beat mashing (spam / random).
import { rnd } from "../../engine/rng";
import { resolveShot, lowestRow } from "./grid";
import { createRun, shootColumn, update, type Run } from "./run";
import type { AbyssParams } from "./rules";

export type Policy = "spam" | "random" | "greedy" | "lookahead";

const liveColumns = (r: Run) => [...Array(r.grid.cols).keys()].filter(c => lowestRow(r.grid, c) >= 0);
const nextBullet = (r: Run) => r.deck.draw[0] ?? r.deck.discard[0] ?? "shot";

function value(r: Run, col: number): number {
  const res = resolveShot(r.grid, nextBullet(r), col, { diagonal: r.parts.includes("diagonal"), chainMin: r.p.chainMin, base: r.p.base, resonance: r.parts.includes("resonance") });
  return res.score + res.kills; // kills break ties toward progress
}

function choose(r: Run, policy: Policy, seed: number): number {
  const cols = liveColumns(r);
  if (policy === "spam") return cols[0];
  if (policy === "random") return cols[Math.floor(rnd(seed)[0] * cols.length)];
  if (policy === "greedy") return cols.reduce((a, b) => (value(r, b) > value(r, a) ? b : a));
  // lookahead: best sum of this shot and the best follow-up shot
  let best = cols[0], bestV = -1;
  for (const c of cols) {
    const after = shootColumn({ ...r, events: [] }, c);
    const follow = after.phase === "play" ? Math.max(0, ...liveColumns(after).map(c2 => value(after, c2))) : after.phase === "clear" ? 1e6 : 0;
    const v = value(r, c) + follow * 0.8;
    if (v > bestV) { best = c; bestV = v; }
  }
  return best;
}

/** Plays a run without the shop; returns stages cleared, best chain, and shots per stage. */
export function simulateRun(p: AbyssParams, seed: number, policy: Policy) {
  let r: Run = { ...update(createRun({ ...p, seed }), { dx: 0, fire: false, cancel: false, advance: true }, 0), calm: true };
  let s = seed;
  for (let guard = 0; guard < 5000; guard++) {
    if (r.phase === "play") { [, s] = rnd(s); r = shootColumn(r, choose(r, policy, s)); continue; }
    if (r.phase === "clear" || r.phase === "shop" || r.phase === "preview") { r = { ...update(r, { dx: 0, fire: false, cancel: false, advance: true }, 0), calm: true }; continue; }
    break;
  }
  return { stagesCleared: r.stats.stagesCleared, bestChain: r.stats.bestChain, shots: r.stats.shots, won: r.phase === "win" };
}

export function simulateRuns(p: AbyssParams, runs: number, policy: Policy) {
  const results = Array.from({ length: runs }, (_, i) => simulateRun(p, i + 1, policy));
  const avg = (f: (x: (typeof results)[number]) => number) => results.reduce((s, x) => s + f(x), 0) / runs;
  return { stagesCleared: avg(x => x.stagesCleared), bestChain: avg(x => x.bestChain), wins: results.filter(x => x.won).length };
}
