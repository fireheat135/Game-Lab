// Pure run state for FORMATION HAND: update(run, input, dt) once per frame, no DOM.
import { rnd } from "../../engine/rng";
import { evaluateHand, type HandResult, type Kill } from "./hand";
import { frontEnemies, generateFormation, type Enemy } from "./formation";
import { SECTORS, STAGES, type BonusId, type FormationParams, type HandId } from "./rules";

// ---- screen geometry (canvas is W × H)
export const W = 480, H = 640;
export const TOP_Y = 76, LINE_Y = 520, PLAYER_Y = 560, PLAYER_W = 32;
const MARGIN = 8, BULLET_SPEED = 640, INVULN_SECONDS = 1, HAND_POPUP_SECONDS = 2.5;

/** Cell size shrinks with more columns/rows so the formation always fits with room to march. */
export function layout(p: FormationParams) {
  const cellW = Math.min(56, Math.floor((W - 2 * MARGIN) / (p.cols + 1)));
  const cellH = Math.min(44, Math.floor((LINE_Y - TOP_Y - 140) / p.rows));
  const enemy = Math.floor(Math.min(cellW, cellH) * 0.8);
  return { cellW, cellH, enemy };
}

export type Phase = "preview" | "play" | "clear" | "over" | "win";
export type Cause = "shot" | "line" | "wiped";
export interface Bullet { x: number; y: number }
export interface Warn { id: number; t: number }
export interface Input { dx: number; fire: boolean; cancel: boolean; advance: boolean }
export interface HandLog { sector: number; stage: number; hand: HandId; bonuses: BonusId[]; score: number }
export interface RunStats { hands: Partial<Record<HandId, number>>; bonuses: Partial<Record<BonusId, number>>; cancelsUsed: number }

export interface Run {
  p: FormationParams; seed: number; phase: Phase; sector: number; stage: number; target: number; score: number;
  shields: number; cancels: number; enemies: Enemy[]; total: number; fx: number; fy: number; dir: number;
  x: number; bullet: Bullet | null; cd: number; ebullets: Bullet[]; warns: Warn[]; fireT: number; invuln: number;
  queue: Kill[]; lastHand: HandResult | null; lastHandT: number; time: number; calm: boolean;
  cause: Cause | null; history: HandLog[]; stats: RunStats;
}

export function targetFor(p: FormationParams, sector: number, stage: number): number {
  const s = SECTORS[Math.min(sector, SECTORS.length) - 1].sector;
  return Math.round(p[`ceil.${s}`] * p.k * p[`stage.${STAGES[stage].id}`]);
}

function freshStage(r: Pick<Run, "p" | "seed" | "sector" | "stage">) {
  const { enemies, seed } = generateFormation(r.p, r.seed);
  const g = layout(r.p);
  return {
    seed, enemies, total: enemies.length, phase: "preview" as Phase,
    target: targetFor(r.p, r.sector, r.stage), score: 0, cancels: r.p.cancels,
    fx: (W - r.p.cols * g.cellW) / 2, fy: TOP_Y, dir: 1, x: W / 2, bullet: null, cd: 0, ebullets: [], warns: [],
    fireT: r.p.fire > 0 ? 1 / r.p.fire : Infinity, invuln: 0, queue: [], lastHand: null, lastHandT: 0, time: 0,
  };
}

export function createRun(p: FormationParams): Run {
  const start = { p, seed: p.seed, sector: 1, stage: 0 };
  return { ...start, ...freshStage(start), shields: p.shields, calm: false, cause: null, history: [], stats: { hands: {}, bonuses: {}, cancelsUsed: 0 } };
}

export function enemyRect(r: Pick<Run, "p" | "fx" | "fy">, e: Enemy) {
  const g = layout(r.p);
  return { x: r.fx + e.col * g.cellW + (g.cellW - g.enemy) / 2, y: r.fy + e.row * g.cellH + (g.cellH - g.enemy) / 2, w: g.enemy, h: g.enemy };
}

const toKill = (e: Enemy, p: FormationParams): Kill => ({
  kind: e.kind, color: e.color, col: e.col, row: e.row,
  corner: (e.col === 0 || e.col === p.cols - 1) && (e.row === 0 || e.row === p.rows - 1),
});

/** Front enemy that would give the best hand if shot next (the "aim here" hint). */
export function bestShot(r: Run): number | null {
  let best: number | null = null, bestScore = -1;
  for (const e of frontEnemies(r.enemies)) {
    const s = evaluateHand([...r.queue, toKill(e, r.p)], r.p, { sweep: false }).score;
    if (s > bestScore) { best = e.id; bestScore = s; }
  }
  return best;
}

function scoreQueue(r: Run, sweep: boolean): Run {
  if (r.queue.length === 0) return r;
  const res = evaluateHand(r.queue, r.p, { sweep });
  const hands = { ...r.stats.hands, [res.hand]: (r.stats.hands[res.hand] ?? 0) + 1 };
  const bonuses = { ...r.stats.bonuses };
  for (const b of res.bonuses) bonuses[b] = (bonuses[b] ?? 0) + 1;
  const score = r.score + res.score;
  return {
    ...r, score, queue: [], lastHand: res, lastHandT: HAND_POPUP_SECONDS,
    history: [...r.history, { sector: r.sector, stage: r.stage, hand: res.hand, bonuses: res.bonuses, score: res.score }],
    stats: { ...r.stats, hands, bonuses },
    phase: score >= r.target ? "clear" : r.phase,
  };
}

/** Damages one enemy; on a kill, queues it and resolves hand / clear / wipe-out. */
export function killEnemy(r: Run, id: number): Run {
  const e = r.enemies.find(x => x.id === id);
  if (!e || !e.alive || r.phase !== "play") return r;
  if (e.hp > 1) return { ...r, enemies: r.enemies.map(x => (x.id === id ? { ...x, hp: x.hp - 1 } : x)) };
  const enemies = r.enemies.map(x => (x.id === id ? { ...x, hp: 0, alive: false } : x));
  const alive = enemies.filter(x => x.alive).length;
  let next: Run = { ...r, enemies, queue: [...r.queue, toKill(e, r.p)] };
  if (next.queue.length >= next.p.queue || alive === 0) next = scoreQueue(next, alive === 0);
  if (alive === 0 && next.phase === "play") next = { ...next, phase: "over", cause: "wiped" };
  return next;
}

function advance(r: Run): Run {
  if (r.phase === "preview") return { ...r, phase: "play" };
  if (r.phase !== "clear") return r;
  let { sector, stage } = r;
  if (++stage >= STAGES.length) { stage = 0; sector++; }
  if (sector > r.p.sectors) return { ...r, phase: "win" };
  const next = { ...r, sector, stage };
  return { ...next, ...freshStage(next) };
}

function movePlayer(r: Run, input: Input, dt: number): Run {
  const x = Math.min(Math.max(r.x + input.dx * r.p.move * dt, PLAYER_W / 2), W - PLAYER_W / 2);
  let next = { ...r, x };
  if (input.cancel && next.queue.length > 0 && next.cancels > 0) {
    next = { ...next, queue: [], cancels: next.cancels - 1, stats: { ...next.stats, cancelsUsed: next.stats.cancelsUsed + 1 } };
  }
  if (input.fire && !next.bullet && next.cd <= 0) next = { ...next, bullet: { x, y: PLAYER_Y - 14 }, cd: next.p.cd };
  return next;
}

/** The player bullet is swept along its path this frame and hits the lowest enemy it crosses. */
function movePlayerBullet(r: Run, dt: number): Run {
  if (!r.bullet) return r;
  const { x, y } = r.bullet, y1 = y - BULLET_SPEED * dt;
  let hit: Enemy | null = null, hitBottom = -Infinity;
  for (const e of r.enemies) {
    if (!e.alive) continue;
    const b = enemyRect(r, e);
    const crosses = x >= b.x && x <= b.x + b.w && b.y <= y && b.y + b.h >= y1;
    if (crosses && b.y + b.h > hitBottom) { hit = e; hitBottom = b.y + b.h; }
  }
  if (hit) return killEnemy({ ...r, bullet: null }, hit.id);
  return { ...r, bullet: y1 < 0 ? null : { x, y: y1 } };
}

/** March sideways, faster as the formation thins; drop and turn at the edges. */
function marchFormation(r: Run, living: Enemy[], dt: number): Run {
  const g = layout(r.p);
  const speed = r.p.speed * (1 + r.p.accel * (1 - living.length / r.total));
  let fx = r.fx + r.dir * speed * dt, fy = r.fy, dir = r.dir;
  const minCol = Math.min(...living.map(e => e.col)), maxCol = Math.max(...living.map(e => e.col));
  const left = fx + minCol * g.cellW + (g.cellW - g.enemy) / 2;
  const right = fx + maxCol * g.cellW + (g.cellW + g.enemy) / 2;
  if (right > W - MARGIN && dir > 0) { fx -= right - (W - MARGIN); dir = -1; fy += r.p.drop; }
  else if (left < MARGIN && dir < 0) { fx += MARGIN - left; dir = 1; fy += r.p.drop; }
  return { ...r, fx, fy, dir };
}

/** Enemy fire: pick a front enemy, telegraph for `warn` seconds, then shoot straight down. */
function enemyFire(r: Run, dt: number): Run {
  let { fireT, seed } = r;
  const warns = r.warns.map(w => ({ ...w, t: w.t - dt }));
  fireT -= dt;
  while (fireT <= 0 && r.p.fire > 0) {
    const front = frontEnemies(r.enemies);
    let pick: number, jitter: number;
    [pick, seed] = rnd(seed); [jitter, seed] = rnd(seed);
    warns.push({ id: front[Math.floor(pick * front.length)].id, t: r.p.warn });
    fireT += (0.5 + jitter) / r.p.fire;
  }
  const ebullets = [...r.ebullets];
  for (const w of warns) if (w.t <= 0) {
    const e = r.enemies.find(x => x.id === w.id);
    if (e?.alive) { const b = enemyRect(r, e); ebullets.push({ x: b.x + b.w / 2, y: b.y + b.h }); }
  }
  return { ...r, fireT, seed, warns: warns.filter(w => w.t > 0), ebullets };
}

function moveEnemyBullets(r: Run, dt: number): Run {
  let shields = r.shields, invuln = r.invuln;
  const ebullets: Bullet[] = [];
  for (const b of r.ebullets) {
    const nb = { x: b.x, y: b.y + r.p.ebullet * dt };
    const hits = Math.abs(nb.x - r.x) < PLAYER_W / 2 && nb.y >= PLAYER_Y - 12 && b.y <= PLAYER_Y + 12;
    if (hits && invuln <= 0) { shields--; invuln = INVULN_SECONDS; continue; }
    if (nb.y < H) ebullets.push(nb);
  }
  return { ...r, ebullets, shields, invuln };
}

export function update(r0: Run, input: Input, dt: number): Run {
  if (input.advance) return advance(r0);
  if (r0.phase !== "play") return r0;
  let r: Run = { ...r0, time: r0.time + dt, invuln: Math.max(0, r0.invuln - dt), lastHandT: Math.max(0, r0.lastHandT - dt), cd: Math.max(0, r0.cd - dt) };

  r = movePlayerBullet(movePlayer(r, input, dt), dt);
  if (r.phase !== "play") return r;

  const living = r.enemies.filter(e => e.alive);
  if (!r.calm && living.length > 0) r = enemyFire(marchFormation(r, living, dt), dt);
  if (living.some(e => { const b = enemyRect(r, e); return b.y + b.h >= LINE_Y; })) return { ...r, phase: "over", cause: "line" };

  r = moveEnemyBullets(r, dt);
  return r.shields <= 0 ? { ...r, phase: "over", cause: "shot" } : r;
}
