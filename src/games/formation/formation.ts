// Formation generation: glow (suit) and creature (rank) are rolled per cell, independent of the row.
// (企画書 §3.1: if row = rank, sweeping the bottom row would give five of a kind for free.)
import { rnd } from "../../engine/rng";
import type { FormationParams } from "./rules";

export interface Enemy { id: number; col: number; row: number; color: number; kind: number; hp: number; maxHp: number; alive: boolean }

const MAX_REROLLS = 200;

/** Re-rolls until a flush (≥ queue of one glow) and a straight (kinds 1..queue present) are possible. */
export function generateFormation(p: FormationParams, seed: number): { enemies: Enemy[]; seed: number } {
  let s = seed >>> 0, enemies: Enemy[] = [];
  for (let attempt = 0; attempt < MAX_REROLLS; attempt++) {
    enemies = [];
    for (let row = 0; row < p.rows; row++) for (let col = 0; col < p.cols; col++) {
      let colorRoll: number, kindRoll: number, armorRoll: number;
      [colorRoll, s] = rnd(s); [kindRoll, s] = rnd(s); [armorRoll, s] = rnd(s);
      const hp = armorRoll < p.armor ? p.hp : 1;
      enemies.push({ id: enemies.length, col, row, color: Math.floor(colorRoll * p.colors), kind: 1 + Math.floor(kindRoll * p.kinds), hp, maxHp: hp, alive: true });
    }
    if (flushAndStraightPossible(enemies, p)) break;
  }
  return { enemies, seed: s };
}

function flushAndStraightPossible(enemies: Enemy[], p: FormationParams): boolean {
  if (enemies.length < p.queue) return true; // nothing to guarantee on tiny grids
  const countOfColor = (c: number) => enemies.filter(e => e.color === c).length;
  const flush = Array.from({ length: p.colors }, (_, c) => countOfColor(c)).some(n => n >= p.queue);
  const straight = p.kinds < p.queue || Array.from({ length: p.queue }, (_, i) => i + 1).every(kind => enemies.some(e => e.kind === kind));
  return flush && straight;
}

/** Shootable enemies: the lowest living enemy of each column. */
export function frontEnemies(enemies: Enemy[]): Enemy[] {
  const lowest = new Map<number, Enemy>();
  for (const e of enemies) if (e.alive && (lowest.get(e.col)?.row ?? -1) < e.row) lowest.set(e.col, e);
  return [...lowest.values()].sort((a, b) => a.col - b.col);
}
