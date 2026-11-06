// Offline bots (no timing, no enemy fire): measure hand rates and how far a part-less run gets.
// Used to tune hand values and the ceiling before playtesting (企画書 §12 段階0).
import { evaluateHand, type HandResult, type Kill } from "./hand";
import { frontEnemies, generateFormation, type Enemy } from "./formation";
import { STAGES, type FormationParams, type HandId } from "./rules";
import { targetFor } from "./run";

/** greedy: best partial hand now. lookahead: searches the rest of the hand. column / row: naive sweeps. */
export type Policy = "greedy" | "lookahead" | "column" | "row";

const toKill = (e: Enemy, p: FormationParams): Kill => ({
  kind: e.kind, color: e.color, col: e.col, row: e.row,
  corner: (e.col === 0 || e.col === p.cols - 1) && (e.row === 0 || e.row === p.rows - 1),
});
const without = (enemies: Enemy[], id: number) => enemies.map(x => (x.id === id ? { ...x, alive: false } : x));

/** Best final score reachable by filling the remaining queue slots from the current front. */
function bestCompletion(enemies: Enemy[], queue: Kill[], p: FormationParams, depth: number): number {
  const front = frontEnemies(enemies);
  if (queue.length >= p.queue || front.length === 0 || depth === 0) return evaluateHand(queue, p, { sweep: false }).score;
  let best = 0;
  for (const e of front) best = Math.max(best, bestCompletion(without(enemies, e.id), [...queue, toKill(e, p)], p, depth - 1));
  return best;
}

function choose(enemies: Enemy[], queue: Kill[], p: FormationParams, policy: Policy): Enemy {
  const front = frontEnemies(enemies);
  if (policy === "column") return front[0];
  if (policy === "row") return front.reduce((a, b) => (b.row > a.row ? b : a));
  const value = (e: Enemy) => policy === "lookahead"
    ? bestCompletion(without(enemies, e.id), [...queue, toKill(e, p)], p, p.queue - queue.length - 1)
    : evaluateHand([...queue, toKill(e, p)], p, { sweep: false }).score;
  return front.map(e => ({ e, v: value(e) })).reduce((a, b) => (b.v > a.v ? b : a)).e;
}

export function simulateStage(p: FormationParams, seed: number, policy: Policy): { hands: HandResult[]; seed: number } {
  const gen = generateFormation(p, seed);
  let enemies = gen.enemies, queue: Kill[] = [];
  const hands: HandResult[] = [];
  while (frontEnemies(enemies).length > 0) {
    const e = choose(enemies, queue, p, policy);
    enemies = without(enemies, e.id);
    queue.push(toKill(e, p));
    const wiped = enemies.every(x => !x.alive);
    if (queue.length >= p.queue || wiped) { hands.push(evaluateHand(queue, p, { sweep: wiped })); queue = []; }
  }
  return { hands, seed: gen.seed };
}

export function simulateRuns(p: FormationParams, runs: number, policy: Policy) {
  const counts: Partial<Record<HandId, number>> = {};
  const sectorReached: number[] = [];
  let handsPlayed = 0, stagesPlayed = 0, stagesCleared = 0, scoreSum = 0;
  for (let i = 0; i < runs; i++) {
    let seed = i + 1, sector = 1;
    run: for (; sector <= p.sectors; sector++) for (let stage = 0; stage < STAGES.length; stage++) {
      const res = simulateStage(p, seed, policy);
      seed = res.seed;
      for (const h of res.hands) { counts[h.hand] = (counts[h.hand] ?? 0) + 1; handsPlayed++; }
      const total = res.hands.reduce((s, h) => s + h.score, 0);
      stagesPlayed++; scoreSum += total;
      if (total < targetFor(p, sector, stage)) break run;
      stagesCleared++;
    }
    sectorReached.push(sector);
  }
  const handRate = Object.fromEntries(Object.entries(counts).map(([id, c]) => [id, c! / handsPlayed]));
  return { handRate, sectorReached, stagesCleared: stagesCleared / runs, meanStageScore: scoreSum / stagesPlayed };
}
