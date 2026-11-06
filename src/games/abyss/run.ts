// Pure run state for ABYSS CHAIN: update(run, input, dt) once per frame, no DOM.
import { rnd } from "../../engine/rng";
import { allCards, draw, newDeck, type Deck } from "./deck";
import { cellAt, generateGrid, lowestRow, resolveShot, type Grid, type Pop } from "./grid";
import { BULLETS, DEPTHS, PARTS, STAGES_PER_DEPTH, type AbyssParams, type BulletId, type PartId } from "./rules";

// ---- screen geometry (canvas is W × H)
export const W = 480, H = 640;
export const TOP_Y = 96, LINE_Y = 520, PLAYER_Y = 560, PLAYER_W = 32;
const MARGIN = 8, BULLET_SPEED = 720, INVULN_SECONDS = 1, HIT_FLASH_SECONDS = 0.35, EFFECT_SECONDS = 0.6;

export function layout(p: AbyssParams, rows: number) {
  const cellW = Math.min(52, Math.floor((W - 2 * MARGIN) / (p.cols + 1)));
  const cellH = Math.min(44, Math.floor((LINE_Y - TOP_Y - 150) / rows));
  return { cellW, cellH, enemy: Math.floor(Math.min(cellW, cellH) * 0.9) };
}

export type Phase = "preview" | "play" | "clear" | "shop" | "over" | "win";
export type Cause = "shot" | "line";
export interface Input { dx: number; fire: boolean; cancel: boolean; advance: boolean }
export interface Bullet { x: number; y: number; type: BulletId }
export interface Effect { x: number; y: number; color: number; step: number; t: number }
export type GameEvent = { type: "fire" | "hit" | "shuffle" | "clear" | "over" } | { type: "pop" | "chain"; step: number; count: number };
export interface Shop { bullets: (BulletId | null)[]; parts: (PartId | null)[] }

export interface Run {
  p: AbyssParams; seed: number; phase: Phase; depth: number; stage: number;
  grid: Grid; fx: number; fy: number; dir: number; x: number; cd: number;
  bullet: Bullet | null; deck: Deck; shuffles: number;
  ebullets: { x: number; y: number }[]; warns: { col: number; t: number }[]; fireT: number;
  shields: number; invuln: number; hitT: number; freezeT: number;
  gold: number; score: number; stageScore: number; parts: PartId[]; shop: Shop | null;
  effects: Effect[]; lastChain: { steps: number; score: number; t: number } | null; events: GameEvent[];
  calm: boolean; cause: Cause | null;
  stats: { shots: number; kills: number; bestChain: number; stagesCleared: number };
}

const has = (r: Run, part: PartId) => r.parts.includes(part);
export const depthRow = (depth: number) => DEPTHS[Math.min(depth, DEPTHS.length) - 1];

function freshStage(r: Pick<Run, "p" | "seed" | "depth">) {
  const d = depthRow(r.depth).depth;
  const { grid, seed } = generateGrid(r.p, r.p[`rows.${d}`], r.p[`armor.${d}`], r.seed);
  const g = layout(r.p, grid.rows);
  const fire = r.p[`fire.${d}`];
  return {
    seed, grid, phase: "preview" as Phase, fx: (W - r.p.cols * g.cellW) / 2, fy: TOP_Y, dir: 1, x: W / 2, cd: 0,
    bullet: null, shuffles: 0, ebullets: [], warns: [], fireT: fire > 0 ? 1.5 / fire : Infinity,
    invuln: 0, hitT: 0, freezeT: 0, stageScore: 0, effects: [], lastChain: null, events: [], shop: null,
  };
}

export function createRun(p: AbyssParams): Run {
  const start = { p, seed: p.seed, depth: 1, stage: 0 };
  const stage = freshStage(start);
  return {
    ...start, ...stage, deck: newDeck(p, stage.seed ^ 0x9e3779b9), shields: p.shields, gold: 0, score: 0, parts: [],
    calm: false, cause: null, stats: { shots: 0, kills: 0, bestChain: 0, stagesCleared: 0 },
  };
}

/** y of the bottom edge of the lowest enemy (what must stay above the line). */
export function bottomY(r: Pick<Run, "p" | "grid" | "fy">): number {
  const g = layout(r.p, r.grid.rows);
  let lowest = -1;
  for (let c = 0; c < r.grid.cols; c++) lowest = Math.max(lowest, lowestRow(r.grid, c));
  return r.fy + (lowest + 1) * g.cellH;
}

export function columnAt(r: Pick<Run, "p" | "grid" | "fx">, x: number): number {
  const c = Math.floor((x - r.fx) / layout(r.p, r.grid.rows).cellW);
  return c >= 0 && c < r.grid.cols ? c : -1;
}

export function cellCenter(r: Pick<Run, "p" | "grid" | "fx" | "fy">, col: number, row: number) {
  const g = layout(r.p, r.grid.rows);
  return { x: r.fx + (col + 0.5) * g.cellW, y: r.fy + (row + 0.5) * g.cellH };
}

/** Applies a bullet that reached column `col`: chain resolution, score, gold, effects, hitstop, clear check. */
export function applyHit(r: Run, type: BulletId, col: number): Run {
  const res = resolveShot(r.grid, type, col, { diagonal: has(r, "diagonal"), chainMin: Math.max(2, r.p.chainMin - (has(r, "aftershock") ? 1 : 0)), base: r.p.base, resonance: has(r, "resonance") });
  if (res.steps.length === 0) return r;
  const chainSteps = res.steps.length - 1;
  const effects: Effect[] = res.steps.flatMap((s, step) => s.popped.map((pop: Pop) => ({ ...cellCenter(r, pop.col, pop.row), color: pop.color, step, t: EFFECT_SECONDS })));
  const events: GameEvent[] = res.steps.map((s, step) => ({ type: step === 0 ? "pop" : "chain", step, count: s.popped.length } as GameEvent));
  const gold = r.gold + chainSteps * (has(r, "vein") ? 2 : 1);
  let next: Run = {
    ...r, grid: res.grid, score: r.score + res.score, stageScore: r.stageScore + res.score, gold,
    effects: [...r.effects, ...effects], events: [...r.events, ...events],
    freezeT: chainSteps > 0 ? r.p.hitstop * res.steps.length : r.freezeT,
    lastChain: chainSteps > 0 ? { steps: res.steps.length, score: res.score, t: 1.6 } : r.lastChain,
    stats: { ...r.stats, kills: r.stats.kills + res.kills, bestChain: Math.max(r.stats.bestChain, res.steps.length) },
  };
  if (next.grid.cells.every(c => !c)) {
    next = { ...next, phase: "clear", gold: next.gold + r.p.gold, bullet: null, ebullets: [], warns: [], events: [...next.events, { type: "clear" }], stats: { ...next.stats, stagesCleared: next.stats.stagesCleared + 1 } };
  }
  return next;
}

/** Draws the next card and sinks the swarm (one shot = one step of pressure). */
function useCard(r: Run): { run: Run; type: BulletId } {
  const d = draw(r.deck);
  const sink = r.p.shotDrop * (has(r, "steady") ? 0.5 : 1) + (d.reshuffled ? r.p.shuffleDrop * (has(r, "ballast") ? 0.5 : 1) : 0);
  const events: GameEvent[] = [...r.events, { type: "fire" }, ...(d.reshuffled ? [{ type: "shuffle" } as GameEvent] : [])];
  return { run: { ...r, deck: d.deck, fy: r.fy + sink, shuffles: r.shuffles + (d.reshuffled ? 1 : 0), events, stats: { ...r.stats, shots: r.stats.shots + 1 } }, type: d.bullet };
}

/** Instant shot at a column (bots, tests): same rules as a real bullet, without the flight. */
export function shootColumn(r: Run, col: number): Run {
  const { run, type } = useCard(r);
  return checkLine(applyHit(run, type, col));
}

function checkLine(r: Run): Run {
  return r.phase === "play" && r.grid.cells.some(Boolean) && bottomY(r) >= LINE_Y ? { ...r, phase: "over", cause: "line", events: [...r.events, { type: "over" }] } : r;
}

// ---- shop (between stages)
function rollShop(r: Run): Run {
  let s = r.seed;
  const pick = <T>(list: readonly T[]): T => { let v: number; [v, s] = rnd(s); return list[Math.floor(v * list.length)]; };
  const buyable = BULLETS.filter(b => b.id !== "shot").map(b => b.id);
  const bullets = [pick(buyable), pick(buyable), pick(buyable)];
  const free = PARTS.map(p => p.id).filter(id => !r.parts.includes(id));
  const parts: PartId[] = [];
  while (parts.length < Math.min(2, free.length)) { const id = pick(free); if (!parts.includes(id)) parts.push(id); }
  return { ...r, seed: s, shop: { bullets, parts } };
}

export function buyBullet(r: Run, slot: number): Run {
  const id = r.shop?.bullets[slot];
  if (!id || r.phase !== "shop" || r.gold < r.p[`price.${id}`]) return r;
  const bullets = r.shop!.bullets.map((b, i) => (i === slot ? null : b));
  return { ...r, gold: r.gold - r.p[`price.${id}`], deck: { ...r.deck, discard: [...r.deck.discard, id] }, shop: { ...r.shop!, bullets } };
}

export function buyPart(r: Run, slot: number): Run {
  const id = r.shop?.parts[slot];
  if (!id || r.phase !== "shop" || r.gold < r.p[`price.${id}`]) return r;
  const parts = r.shop!.parts.map((p, i) => (i === slot ? null : p));
  return { ...r, gold: r.gold - r.p[`price.${id}`], parts: [...r.parts, id], shop: { ...r.shop!, parts } };
}

/** Removes one copy of `id` from the deck (deck thinning). Keeps at least one card. */
export function removeCard(r: Run, id: BulletId): Run {
  const cards = allCards(r.deck), at = cards.indexOf(id);
  if (r.phase !== "shop" || at < 0 || cards.length <= 1 || r.gold < r.p["price.remove"]) return r;
  cards.splice(at, 1);
  return { ...r, gold: r.gold - r.p["price.remove"], deck: { ...r.deck, draw: [], discard: cards } };
}

export function reroll(r: Run): Run {
  if (r.phase !== "shop" || r.gold < r.p["price.reroll"]) return r;
  return rollShop({ ...r, gold: r.gold - r.p["price.reroll"] });
}

function advance(r: Run): Run {
  if (r.phase === "preview") return { ...r, phase: "play" };
  if (r.phase === "clear") {
    const last = r.depth >= DEPTHS.length && r.stage >= STAGES_PER_DEPTH - 1;
    return last ? { ...r, phase: "win" } : rollShop({ ...r, phase: "shop" });
  }
  if (r.phase !== "shop") return r;
  let { depth, stage } = r;
  if (++stage >= STAGES_PER_DEPTH) { stage = 0; depth++; }
  const next = { ...r, depth, stage };
  const fresh = freshStage(next);
  return { ...next, ...fresh, deck: newDeck(r.p, fresh.seed ^ 0x9e3779b9, allCards(r.deck)) };
}

// ---- per-frame update
function moveShip(r: Run, input: Input, dt: number): Run {
  const x = Math.min(Math.max(r.x + input.dx * r.p.move * dt, PLAYER_W / 2), W - PLAYER_W / 2);
  if (!(input.fire && !r.bullet && r.cd <= 0)) return { ...r, x };
  const { run, type } = useCard({ ...r, x });
  return { ...run, bullet: { x, y: PLAYER_Y - 14, type }, cd: r.p.cd };
}

function moveBullet(r: Run, dt: number): Run {
  if (!r.bullet) return r;
  const b = r.bullet, y1 = b.y - BULLET_SPEED * dt;
  const col = columnAt(r, b.x), row = col < 0 ? -1 : lowestRow(r.grid, col);
  if (row >= 0) {
    const hitY = r.fy + (row + 1) * layout(r.p, r.grid.rows).cellH;
    if (y1 <= hitY) return applyHit({ ...r, bullet: null }, b.type, col);
  }
  return { ...r, bullet: y1 < 0 ? null : { ...b, y: y1 } };
}

function march(r: Run, dt: number): Run {
  const g = layout(r.p, r.grid.rows);
  let fx = r.fx + r.dir * r.p.speed * dt, dir = r.dir;
  const used = [...Array(r.grid.cols).keys()].filter(c => lowestRow(r.grid, c) >= 0);
  if (used.length === 0) return r;
  const left = fx + Math.min(...used) * g.cellW, right = fx + (Math.max(...used) + 1) * g.cellW;
  if (right > W - MARGIN && dir > 0) { fx -= right - (W - MARGIN); dir = -1; }
  else if (left < MARGIN && dir < 0) { fx += MARGIN - left; dir = 1; }
  return { ...r, fx, dir, fy: r.fy + r.p.drift * dt };
}

function enemyFire(r: Run, dt: number): Run {
  const rate = r.p[`fire.${depthRow(r.depth).depth}`];
  let { fireT, seed } = r;
  const warns = r.warns.map(w => ({ ...w, t: w.t - dt }));
  fireT -= dt;
  while (fireT <= 0 && rate > 0) {
    const cols = [...Array(r.grid.cols).keys()].filter(c => lowestRow(r.grid, c) >= 0);
    let pick: number, jitter: number;
    [pick, seed] = rnd(seed); [jitter, seed] = rnd(seed);
    if (cols.length) warns.push({ col: cols[Math.floor(pick * cols.length)], t: r.p.warn });
    fireT += (0.5 + jitter) / rate;
  }
  const ebullets = [...r.ebullets];
  for (const w of warns) if (w.t <= 0) {
    const row = lowestRow(r.grid, w.col);
    if (row >= 0) { const c = cellCenter(r, w.col, row); ebullets.push({ x: c.x, y: c.y + 10 }); }
  }
  return { ...r, fireT, seed, warns: warns.filter(w => w.t > 0), ebullets };
}

function moveEnemyBullets(r: Run, dt: number): Run {
  let { shields, invuln, hitT } = r;
  const events = [...r.events];
  const ebullets: { x: number; y: number }[] = [];
  for (const b of r.ebullets) {
    const nb = { x: b.x, y: b.y + r.p.ebullet * dt };
    const hits = Math.abs(nb.x - r.x) < PLAYER_W / 2 && nb.y >= PLAYER_Y - 12 && b.y <= PLAYER_Y + 12;
    if (hits && invuln <= 0) { shields--; invuln = INVULN_SECONDS; hitT = HIT_FLASH_SECONDS; events.push({ type: "hit" }); continue; }
    if (nb.y < H) ebullets.push(nb);
  }
  const over = shields <= 0;
  return { ...r, ebullets, shields, invuln, hitT, events: over ? [...events, { type: "over" }] : events, ...(over ? { phase: "over" as Phase, cause: "shot" as Cause } : {}) };
}

export function update(r0: Run, input: Input, dt: number): Run {
  if (input.advance) return { ...advance(r0), events: [] };
  const fading = {
    effects: r0.effects.map(f => ({ ...f, t: f.t - dt })).filter(f => f.t > 0),
    lastChain: r0.lastChain && r0.lastChain.t > dt ? { ...r0.lastChain, t: r0.lastChain.t - dt } : null,
    hitT: Math.max(0, r0.hitT - dt), events: [] as GameEvent[],
  };
  if (r0.phase !== "play") return { ...r0, ...fading };
  if (r0.freezeT > 0) return { ...r0, ...fading, freezeT: Math.max(0, r0.freezeT - dt) }; // hitstop
  let r: Run = { ...r0, ...fading, invuln: Math.max(0, r0.invuln - dt), cd: Math.max(0, r0.cd - dt) };
  r = moveBullet(moveShip(r, input, dt), dt);
  if (r.phase !== "play") return r;
  if (!r.calm) r = enemyFire(march(r, dt), dt);
  r = checkLine(r);
  return r.phase === "play" ? moveEnemyBullets(r, dt) : r;
}

export const cellIsArmored = (g: Grid, c: number, row: number) => (cellAt(g, c, row)?.hp ?? 0) > 1;
