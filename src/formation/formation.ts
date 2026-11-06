import type { Params } from "./params";

/** Pure mulberry32 step: returns [value in [0,1), next seed] so state stays serializable. */
export function rnd(seed: number): [number, number] {
  const a = (seed + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

export interface Enemy { id: number; col: number; row: number; color: number; kind: number; hp: number; maxHp: number; alive: boolean }

/**
 * Colors and kinds are rolled per cell, independent of the row (企画書 §3.1: a row must not equal a
 * rank, or sweeping the bottom row would give five of a kind for free). Re-rolls until a flush
 * (≥ queue enemies of one color) and a straight (kinds 1..queue all present) are possible.
 */
export function generateFormation(p: Params, seed: number): { enemies: Enemy[]; seed: number } {
  let s = seed >>> 0, enemies: Enemy[] = [];
  for (let attempt = 0; attempt < 200; attempt++) {
    enemies = [];
    for (let row = 0; row < p.rows; row++) for (let col = 0; col < p.cols; col++) {
      let a: number, b: number, c: number;
      [a, s] = rnd(s); [b, s] = rnd(s); [c, s] = rnd(s);
      const hp = c < p.armor ? p.hp : 1;
      enemies.push({ id: enemies.length, col, row, color: Math.floor(a * p.colors), kind: 1 + Math.floor(b * p.kinds), hp, maxHp: hp, alive: true });
    }
    if (possible(enemies, p)) break;
  }
  return { enemies, seed: s };
}

function possible(enemies: Enemy[], p: Params): boolean {
  if (enemies.length < p.queue) return true; // nothing to guarantee on tiny grids
  const flush = Array.from({ length: p.colors }, (_, c) => enemies.filter(e => e.color === c).length).some(n => n >= p.queue);
  const straightKinds = Math.min(p.queue, p.kinds);
  const straight = p.kinds < p.queue || Array.from({ length: straightKinds }, (_, i) => i + 1).every(k => enemies.some(e => e.kind === k));
  return flush && straight;
}

/** Shootable enemies: the lowest living enemy of each column. */
export function frontEnemies(enemies: Enemy[]): Enemy[] {
  const best = new Map<number, Enemy>();
  for (const e of enemies) if (e.alive && (best.get(e.col)?.row ?? -1) < e.row) best.set(e.col, e);
  return [...best.values()].sort((a, b) => a.col - b.col);
}
