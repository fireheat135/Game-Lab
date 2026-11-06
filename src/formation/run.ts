// Pure run state for FORMATION HAND: one update(run, input, dt) per frame, no DOM.
import { evaluateHand, type HandResult, type Kill, type Bonus } from "./hand";
import { frontEnemies, generateFormation, rnd, type Enemy } from "./formation";
import type { HandId, Params } from "./params";

export const W = 480, H = 640;
export const CELL_W = 56, CELL_H = 44, ENEMY = 36;
export const TOP_Y = 70, LINE_Y = 520, PLAYER_Y = 560, PLAYER_W = 32;
const BULLET_SPEED = 640, MARGIN = 8;

export type Phase = "preview" | "play" | "clear" | "over" | "win";
export type Cause = "shot" | "line" | "wiped";
export interface Bullet { x: number; y: number }
export interface Warn { id: number; t: number }
export interface Input { dx: number; fire: boolean; cancel: boolean; advance: boolean }
export interface HandLog { sector: number; stage: number; hand: HandId; bonuses: Bonus[]; score: number }

export interface Run {
  p: Params; seed: number; phase: Phase; sector: number; stage: number; target: number; score: number;
  shields: number; cancels: number; enemies: Enemy[]; total: number; fx: number; fy: number; dir: number;
  x: number; bullet: Bullet | null; cd: number; ebullets: Bullet[]; warns: Warn[]; fireT: number; invuln: number;
  queue: Kill[]; lastHand: HandResult | null; lastHandT: number; time: number; calm: boolean;
  cause: Cause | null; history: HandLog[]; stats: { hands: Partial<Record<HandId, number>>; bonuses: Partial<Record<Bonus, number>>; cancelsUsed: number };
}

export function targetFor(p: Params, sector: number, stage: number): number {
  const base = p.ceil[Math.min(sector, p.ceil.length) - 1] ?? 0;
  return Math.round(base * p.k * (p.stagex[stage] ?? 1));
}

function stageState(r: Pick<Run, "p" | "seed" | "sector" | "stage">) {
  const { enemies, seed } = generateFormation(r.p, r.seed);
  const width = r.p.cols * CELL_W;
  return {
    seed, enemies, total: enemies.length, phase: "preview" as Phase,
    target: targetFor(r.p, r.sector, r.stage), score: 0, cancels: r.p.cancels,
    fx: (W - width) / 2, fy: TOP_Y, dir: 1, x: W / 2, bullet: null, cd: 0, ebullets: [], warns: [],
    fireT: r.p.fire > 0 ? 1 / r.p.fire : Infinity, invuln: 0, queue: [], lastHand: null, lastHandT: 0, time: 0,
  };
}

export function createRun(p: Params): Run {
  const base = { p, seed: p.seed, sector: 1, stage: 0 };
  return {
    ...base, ...stageState(base), shields: p.shields, calm: false, cause: null, history: [],
    stats: { hands: {}, bonuses: {}, cancelsUsed: 0 },
  };
}

export function enemyRect(r: Pick<Run, "fx" | "fy">, e: Enemy) {
  return { x: r.fx + e.col * CELL_W + (CELL_W - ENEMY) / 2, y: r.fy + e.row * CELL_H + (CELL_H - ENEMY) / 2, w: ENEMY, h: ENEMY };
}

function scoreQueue(r: Run, sweep: boolean): Run {
  if (r.queue.length === 0) return r;
  const res = evaluateHand(r.queue, r.p, { sweep });
  const hands = { ...r.stats.hands, [res.hand]: (r.stats.hands[res.hand] ?? 0) + 1 };
  const bonuses = { ...r.stats.bonuses };
  for (const b of res.bonuses) bonuses[b] = (bonuses[b] ?? 0) + 1;
  const score = r.score + res.score;
  return {
    ...r, score, queue: [], lastHand: res, lastHandT: 2.5,
    history: [...r.history, { sector: r.sector, stage: r.stage, hand: res.hand, bonuses: res.bonuses, score: res.score }],
    stats: { ...r.stats, hands, bonuses },
    phase: score >= r.target ? "clear" : r.phase,
  };
}

/** Destroys (or damages) one enemy and resolves the hand / stage consequences. */
export function killEnemy(r: Run, id: number): Run {
  const e = r.enemies.find(x => x.id === id);
  if (!e || !e.alive || r.phase !== "play") return r;
  if (e.hp > 1) return { ...r, enemies: r.enemies.map(x => (x.id === id ? { ...x, hp: x.hp - 1 } : x)) };
  const { cols, rows } = r.p;
  const corner = (e.col === 0 || e.col === cols - 1) && (e.row === 0 || e.row === rows - 1);
  const enemies = r.enemies.map(x => (x.id === id ? { ...x, hp: 0, alive: false } : x));
  const alive = enemies.filter(x => x.alive).length;
  let n: Run = { ...r, enemies, queue: [...r.queue, { kind: e.kind, color: e.color, col: e.col, row: e.row, corner }] };
  if (n.queue.length >= n.p.queue || alive === 0) n = scoreQueue(n, alive === 0);
  if (alive === 0 && n.phase === "play") n = { ...n, phase: "over", cause: "wiped" };
  return n;
}

function advance(r: Run): Run {
  if (r.phase === "preview") return { ...r, phase: "play" };
  if (r.phase !== "clear") return r;
  let { sector, stage } = r;
  if (++stage > 2) { stage = 0; sector++; }
  if (sector > r.p.sectors) return { ...r, phase: "win" };
  const next = { ...r, sector, stage };
  return { ...next, ...stageState(next) };
}

export function update(r0: Run, input: Input, dt: number): Run {
  if (input.advance) return advance(r0);
  if (r0.phase !== "play") return r0;
  let r: Run = { ...r0, time: r0.time + dt, invuln: Math.max(0, r0.invuln - dt), lastHandT: Math.max(0, r0.lastHandT - dt), cd: Math.max(0, r0.cd - dt) };

  r.x = Math.min(Math.max(r.x + input.dx * r.p.move * dt, PLAYER_W / 2), W - PLAYER_W / 2);
  if (input.cancel && r.queue.length > 0 && r.cancels > 0) r = { ...r, queue: [], cancels: r.cancels - 1, stats: { ...r.stats, cancelsUsed: r.stats.cancelsUsed + 1 } };
  if (input.fire && !r.bullet && r.cd <= 0) r = { ...r, bullet: { x: r.x, y: PLAYER_Y - 14 }, cd: r.p.cd };

  // Player bullet: swept along its path this frame, hits the lowest enemy it crosses.
  if (r.bullet) {
    const { x, y } = r.bullet, y1 = y - BULLET_SPEED * dt;
    let hit: Enemy | null = null, hitBottom = -Infinity;
    for (const e of r.enemies) {
      if (!e.alive) continue;
      const b = enemyRect(r, e);
      if (x >= b.x && x <= b.x + b.w && b.y <= y && b.y + b.h >= y1 && b.y + b.h > hitBottom) { hit = e; hitBottom = b.y + b.h; }
    }
    if (hit) r = killEnemy({ ...r, bullet: null }, hit.id);
    else r = { ...r, bullet: y1 < 0 ? null : { x, y: y1 } };
    if (r.phase !== "play") return r;
  }

  const living = r.enemies.filter(e => e.alive);
  if (!r.calm && living.length > 0) {
    // March sideways, faster as the formation thins; drop and turn at the edges.
    const speed = r.p.speed * (1 + r.p.accel * (1 - living.length / r.total));
    let fx = r.fx + r.dir * speed * dt, fy = r.fy, dir = r.dir;
    const minCol = Math.min(...living.map(e => e.col)), maxCol = Math.max(...living.map(e => e.col));
    const left = fx + minCol * CELL_W + (CELL_W - ENEMY) / 2, right = fx + maxCol * CELL_W + (CELL_W + ENEMY) / 2;
    if (right > W - MARGIN && dir > 0) { fx -= right - (W - MARGIN); dir = -1; fy += r.p.drop; }
    else if (left < MARGIN && dir < 0) { fx += MARGIN - left; dir = 1; fy += r.p.drop; }
    r = { ...r, fx, fy, dir };

    // Enemy fire: pick a front enemy, telegraph for `warn` seconds, then shoot straight down.
    let { fireT, seed } = r;
    const warns = r.warns.map(w => ({ ...w, t: w.t - dt }));
    fireT -= dt;
    while (fireT <= 0 && r.p.fire > 0) {
      const front = frontEnemies(r.enemies);
      let a: number, b: number;
      [a, seed] = rnd(seed); [b, seed] = rnd(seed);
      warns.push({ id: front[Math.floor(a * front.length)].id, t: r.p.warn });
      fireT += (0.5 + b) / r.p.fire;
    }
    const ebullets = [...r.ebullets];
    for (const w of warns) if (w.t <= 0) {
      const e = r.enemies.find(x => x.id === w.id);
      if (e?.alive) { const b = enemyRect(r, e); ebullets.push({ x: b.x + b.w / 2, y: b.y + b.h }); }
    }
    r = { ...r, fireT, seed, warns: warns.filter(w => w.t > 0), ebullets };
  }
  if (living.some(e => enemyRect(r, e).y + ENEMY >= LINE_Y)) return { ...r, phase: "over", cause: "line" };

  let shields = r.shields, invuln = r.invuln;
  const ebullets: Bullet[] = [];
  for (const b of r.ebullets) {
    const nb = { x: b.x, y: b.y + r.p.ebullet * dt };
    const hits = Math.abs(nb.x - r.x) < PLAYER_W / 2 && nb.y >= PLAYER_Y - 12 && b.y <= PLAYER_Y + 12;
    if (hits && invuln <= 0) { shields--; invuln = 1; continue; }
    if (nb.y < H) ebullets.push(nb);
  }
  r = { ...r, ebullets, shields, invuln };
  if (shields <= 0) return { ...r, phase: "over", cause: "shot" };
  return r;
}
