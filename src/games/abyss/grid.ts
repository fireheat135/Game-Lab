// Pure grid logic for ABYSS CHAIN: groups, gravity, chain resolution, bullet hit patterns.
// Coordinates: col 0 = left, row 0 = top; the player shoots up, so a column's "lowest" enemy is hit first.
import { rnd } from "../../engine/rng";
import type { AbyssParams, BulletId } from "./rules";

export interface Cell { id: number; color: number; hp: number }
export interface Grid { cols: number; rows: number; cells: (Cell | null)[] } // row-major
export interface Pop { id: number; color: number; col: number; row: number; killed: boolean }
export interface Step { popped: Pop[]; score: number }
export interface ShotResult { grid: Grid; steps: Step[]; score: number; kills: number }
export interface ChainOptions { diagonal: boolean; chainMin: number; base: number; resonance: boolean }

const idx = (g: Grid, c: number, r: number) => r * g.cols + c;
export const cellAt = (g: Grid, c: number, r: number): Cell | null =>
  c < 0 || c >= g.cols || r < 0 || r >= g.rows ? null : g.cells[idx(g, c, r)];
const clone = (g: Grid): Grid => ({ ...g, cells: g.cells.map(x => (x ? { ...x } : null)) });

/** Test helper: rows of color digits, "." = empty. */
export function fromRows(rows: string[]): Grid {
  const cells = rows.flatMap((line, r) => [...line].map((ch, c) => (ch === "." ? null : { id: r * line.length + c, color: Number(ch), hp: 1 })));
  return { cols: rows[0].length, rows: rows.length, cells };
}
export function toRows(g: Grid): string[] {
  return Array.from({ length: g.rows }, (_, r) => Array.from({ length: g.cols }, (_, c) => cellAt(g, c, r)?.color ?? ".").join(""));
}

export function lowestRow(g: Grid, c: number): number {
  for (let r = g.rows - 1; r >= 0; r--) if (cellAt(g, c, r)) return r;
  return -1;
}

const NEIGHBOURS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const NEIGHBOURS8 = [...NEIGHBOURS4, [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/** Connected same-color cells (flood fill) starting at (c, r). */
export function group(g: Grid, c: number, r: number, diagonal: boolean): [number, number][] {
  const start = cellAt(g, c, r);
  if (!start) return [];
  const seen = new Set([idx(g, c, r)]), out: [number, number][] = [], stack: [number, number][] = [[c, r]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    out.push([x, y]);
    for (const [dx, dy] of diagonal ? NEIGHBOURS8 : NEIGHBOURS4) {
      const n = cellAt(g, x + dx, y + dy);
      if (n && n.color === start.color && !seen.has(idx(g, x + dx, y + dy))) { seen.add(idx(g, x + dx, y + dy)); stack.push([x + dx, y + dy]); }
    }
  }
  return out;
}

/** Every column falls to the bottom. Returns the ids of cells that moved (they can start chains). */
export function gravity(g: Grid): { grid: Grid; moved: Set<number> } {
  const next: Grid = { ...g, cells: new Array(g.cells.length).fill(null) };
  const moved = new Set<number>();
  for (let c = 0; c < g.cols; c++) {
    let target = g.rows - 1;
    for (let r = g.rows - 1; r >= 0; r--) {
      const cell = cellAt(g, c, r);
      if (!cell) continue;
      if (target !== r) moved.add(cell.id);
      next.cells[idx(next, c, target--)] = cell;
    }
  }
  return { grid: next, moved };
}

/** First hit (expands to its group) and extra hits (plain damage) for each bullet type. */
function hitPattern(g: Grid, bullet: BulletId, col: number): { trigger: [number, number] | null; extra: [number, number][] } {
  const low = (c: number): [number, number] | null => { const r = lowestRow(g, c); return r < 0 ? null : [c, r]; };
  const trigger = low(col);
  if (!trigger) return { trigger: null, extra: [] };
  const [tc, tr] = trigger;
  const exists = (p: [number, number] | null): p is [number, number] => p !== null && cellAt(g, p[0], p[1]) !== null;
  switch (bullet) {
    case "pierce": return { trigger, extra: [[tc, tr - 1], [tc, tr - 2]].filter(p => exists(p as [number, number])) as [number, number][] };
    case "spread": return { trigger, extra: [low(col - 1), low(col + 1)].filter(exists) };
    case "bomb": return { trigger, extra: NEIGHBOURS8.map(([dx, dy]) => [tc + dx, tr + dy] as [number, number]).filter(exists) };
    default: return { trigger, extra: [] };
  }
}

/** Damages each listed cell once; returns the pops (with positions before removal). */
function damage(g: Grid, cells: [number, number][]): Pop[] {
  const pops: Pop[] = [], done = new Set<number>();
  for (const [c, r] of cells) {
    const cell = cellAt(g, c, r);
    if (!cell || done.has(cell.id)) continue;
    done.add(cell.id);
    cell.hp -= 1;
    const killed = cell.hp <= 0;
    pops.push({ id: cell.id, color: cell.color, col: c, row: r, killed });
    if (killed) g.cells[idx(g, c, r)] = null;
  }
  return pops;
}

/** Resolves one bullet: initial pop, then gravity + chains until nothing more pops. Pure (input untouched). */
export function resolveShot(input: Grid, bullet: BulletId, col: number, o: ChainOptions): ShotResult {
  let g = clone(input);
  const { trigger, extra } = hitPattern(g, bullet, col);
  if (!trigger) return { grid: g, steps: [], score: 0, kills: 0 };
  if (bullet === "dye") {
    const color = cellAt(g, trigger[0], trigger[1])!.color;
    for (const [dx, dy] of NEIGHBOURS4) { const n = cellAt(g, trigger[0] + dx, trigger[1] + dy); if (n) n.color = color; }
  }
  const multiplier = (step: number) => 1 + step * (o.resonance ? 2 : 1);
  const steps: Step[] = [];
  let popped = damage(g, [...group(g, trigger[0], trigger[1], o.diagonal), ...extra]);
  for (let step = 0; popped.length > 0; step++) {
    steps.push({ popped, score: popped.length * o.base * multiplier(step) });
    const fell = gravity(g);
    g = fell.grid;
    // chains: groups of chainMin+ that include a cell which just fell
    const chainCells: [number, number][] = [], inChain = new Set<number>();
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const cell = cellAt(g, c, r);
      if (!cell || inChain.has(cell.id) || !fell.moved.has(cell.id)) continue;
      const grp = group(g, c, r, o.diagonal);
      if (grp.length < o.chainMin) continue;
      for (const [x, y] of grp) { const id = cellAt(g, x, y)!.id; if (!inChain.has(id)) { inChain.add(id); chainCells.push([x, y]); } }
    }
    popped = damage(g, chainCells);
  }
  return {
    grid: gravity(g).grid, steps,
    score: steps.reduce((s, x) => s + x.score, 0),
    kills: steps.reduce((s, x) => s + x.popped.filter(p => p.killed).length, 0),
  };
}

/** Full grid; `cluster` is the chance a cell copies its left or upper neighbour's color (makes groups). */
export function generateGrid(p: AbyssParams, rows: number, armor: number, seed: number): { grid: Grid; seed: number } {
  let s = seed >>> 0;
  const g: Grid = { cols: p.cols, rows, cells: [] };
  for (let r = 0; r < rows; r++) for (let c = 0; c < p.cols; c++) {
    let a: number, b: number, d: number, e: number;
    [a, s] = rnd(s); [b, s] = rnd(s); [d, s] = rnd(s); [e, s] = rnd(s);
    const left = c > 0 ? g.cells[idx(g, c - 1, r)] : null, up = r > 0 ? g.cells[idx(g, c, r - 1)] : null;
    const copyFrom = d < 0.5 ? left ?? up : up ?? left;
    const color = copyFrom && a < p.cluster ? copyFrom.color : Math.floor(b * p.colors);
    g.cells.push({ id: g.cells.length, color, hp: e < armor ? 2 : 1 });
  }
  return { grid: g, seed: s };
}
