// Offline bot (no timing, no enemy fire): measures hand rates and how far a part-less run gets.
// Used to sanity-check the score formula and ceiling curve before tuning by hand (企画書 §12 段階0).
import { evaluateHand, type HandResult, type Kill } from "./hand";
import { frontEnemies, generateFormation, type Enemy } from "./formation";
import type { HandId, Params } from "./params";
import { targetFor } from "./run";

export type Policy = "greedy" | "column" | "row";

const toKill = (e: Enemy, p: Params): Kill => ({
  kind: e.kind, color: e.color, col: e.col, row: e.row,
  corner: (e.col === 0 || e.col === p.cols - 1) && (e.row === 0 || e.row === p.rows - 1),
});

function choose(front: Enemy[], queue: Kill[], p: Params, policy: Policy): Enemy {
  if (policy === "column") return front[0];
  if (policy === "row") return front.reduce((a, b) => (b.row > a.row ? b : a));
  let best = front[0], bestScore = -1;
  for (const e of front) {
    const s = evaluateHand([...queue, toKill(e, p)], p, { sweep: false }).score;
    if (s > bestScore) { best = e; bestScore = s; }
  }
  return best;
}

export function simulateStage(p: Params, seed: number, policy: Policy): { hands: HandResult[]; seed: number } {
  const gen = generateFormation(p, seed);
  let enemies = gen.enemies, queue: Kill[] = [];
  const hands: HandResult[] = [];
  for (;;) {
    const front = frontEnemies(enemies);
    if (front.length === 0) break;
    const e = choose(front, queue, p, policy);
    enemies = enemies.map(x => (x.id === e.id ? { ...x, alive: false } : x));
    queue.push(toKill(e, p));
    const wiped = enemies.every(x => !x.alive);
    if (queue.length >= p.queue || wiped) { hands.push(evaluateHand(queue, p, { sweep: wiped })); queue = []; }
  }
  return { hands, seed: gen.seed };
}

export function simulateRuns(p: Params, runs: number, policy: Policy) {
  const counts: Partial<Record<HandId, number>> = {};
  const sectorReached: number[] = [];
  let nHands = 0;
  for (let i = 0; i < runs; i++) {
    let seed = i + 1, sector = 1;
    outer: for (; sector <= p.sectors; sector++) for (let stage = 0; stage < 3; stage++) {
      const res = simulateStage(p, seed, policy);
      seed = res.seed;
      for (const h of res.hands) { counts[h.hand] = (counts[h.hand] ?? 0) + 1; nHands++; }
      if (res.hands.reduce((s, h) => s + h.score, 0) < targetFor(p, sector, stage)) break outer;
    }
    sectorReached.push(sector);
  }
  const handRate = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, +(v! / nHands).toFixed(4)]));
  const dist = Object.fromEntries(Array.from({ length: p.sectors + 1 }, (_, s) => [s + 1, sectorReached.filter(x => x === s + 1).length]));
  return { handRate, sectorReached, sectorDist: dist };
}
