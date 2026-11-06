import { describe, expect, it } from "vitest";
import { defaultParams, parseParams, toQuery } from "../src/engine/params";
import { rnd } from "../src/engine/rng";
import { PARAMS, type FormationParams } from "../src/games/formation/rules";
import { evaluateHand, type Kill } from "../src/games/formation/hand";
import { frontEnemies, generateFormation } from "../src/games/formation/formation";
import { bestShot, createRun, enemyRect, killEnemy, layout, targetFor, update, LINE_Y, PLAYER_Y, type Input, type Run } from "../src/games/formation/run";

const P: FormationParams = { ...defaultParams(PARAMS), seed: 1 };
const withP = (over: Record<string, number>): FormationParams => ({ ...P, ...over }) as FormationParams;
// Distinct col/row by default so no line bonus applies unless a test asks for one.
let n = 0;
const k = (kind: number, color = 0, col = n++ % 7, row = n % 3): Kill => ({ kind, color, col, row, corner: false });
const idle: Input = { dx: 0, fire: false, cancel: false, advance: false };

describe("engine: params table", () => {
  it("overrides defaults from the query, one number per key", () => {
    const p = parseParams(PARAMS, "?queue=3&k=0.5&pair.chips=11&kill.2=99");
    expect(p.queue).toBe(3);
    expect(p.k).toBe(0.5);
    expect(p["pair.chips"]).toBe(11);
    expect(p["kill.2"]).toBe(99);
    expect(p.cols).toBe(P.cols);
  });
  it("ignores non-numbers and unknown keys, clamps to [min, max], rounds integers", () => {
    const p = parseParams(PARAMS, "?queue=abc&cols=99&rows=2.6&evil=<script>&pair.chips=");
    expect(p.queue).toBe(P.queue);
    expect(p.cols).toBe(10);
    expect(p.rows).toBe(3);
    expect(p["pair.chips"]).toBe(P["pair.chips"]);
    expect("evil" in p).toBe(false);
  });
  it("serializes only changed values, and round-trips", () => {
    expect(toQuery(PARAMS, withP({ queue: 4, seed: 7 }))).toBe("seed=7&queue=4");
    const changed = withP({ "ceil.3": 1234 });
    expect(parseParams(PARAMS, "?" + toQuery(PARAMS, changed))).toEqual(changed);
  });
  it("every param key is unique (primary key)", () => {
    const keys = PARAMS.map(d => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("engine: rng", () => {
  it("is pure and deterministic", () => {
    expect(rnd(42)).toEqual(rnd(42));
    const [v, next] = rnd(42);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
    expect(next).not.toBe(42);
  });
});

describe("hand evaluation", () => {
  it("scores (chips + kill chips) × mult", () => {
    // pair 10/2; kinds 1,1,2,3,4 → kill chips 10+10+15+20+25 = 80
    const r = evaluateHand([k(1, 0), k(1, 1), k(2, 2), k(3, 3), k(4, 0)], withP({ "pair.chips": 10, "pair.mult": 2 }), { sweep: false });
    expect(r.hand).toBe("pair");
    expect(r.chips).toBe(90);
    expect(r.mult).toBe(2);
    expect(r.score).toBe(180);
  });
  it.each([
    [[1, 2, 3, 4, 5], [0, 1, 0, 1, 0], "straight"],
    [[1, 1, 3, 4, 5], [2, 2, 2, 2, 2], "flush"],
    [[5, 3, 1, 4, 2], [3, 3, 3, 3, 3], "sf"],
    [[2, 2, 2, 4, 4], [0, 1, 2, 3, 0], "full"],
    [[2, 2, 2, 2, 4], [0, 1, 2, 3, 0], "four"],
    [[3, 3, 3, 3, 3], [0, 1, 2, 3, 0], "five"],
    [[3, 3, 1, 1, 5], [0, 1, 2, 3, 0], "two"],
    [[3, 3, 3, 1, 5], [0, 1, 2, 3, 0], "three"],
    [[1, 2, 3, 4, 6], [0, 1, 2, 3, 0], "high"],
  ])("kinds %j colors %j → %s", (kinds, colors, hand) => {
    const kills = kinds.map((kind, i) => k(kind, colors[i]));
    expect(evaluateHand(kills, withP({ kinds: 6 }), { sweep: false }).hand).toBe(hand);
  });
  it("needs a full queue for straight and flush", () => {
    expect(evaluateHand([k(1, 0), k(2, 0), k(3, 0)], P, { sweep: false }).hand).toBe("high");
    expect(evaluateHand([k(1, 0), k(2, 0), k(3, 0)], withP({ queue: 3 }), { sweep: false }).hand).toBe("sf");
  });
  it("picks the hand with the best FINAL score, kill chips included (Codex review #2)", () => {
    const p = withP({ "pair.chips": 1000, "pair.mult": 1, "high.chips": 5, "high.mult": 100 });
    const r = evaluateHand([1, 1, 2, 3, 4].map((kind, i) => k(kind, i % 4)), p, { sweep: false });
    expect(r.hand).toBe("high");
    expect(r.score).toBe((5 + 80) * 100);
  });
  it("adds position bonuses: column, row, corners, sweep", () => {
    const col = [0, 1, 2, 3, 4].map(row => ({ ...k(row === 0 ? 1 : 2, row % 4, 2, row) }));
    const v = evaluateHand(col, P, { sweep: false });
    expect(v.bonuses).toContain("vline");
    expect(v.mult).toBe(P["four.mult"] + P.vline);
    const row = [0, 1, 2, 3, 4].map(c => ({ ...k(c + 1, c % 4, c, 4), corner: c === 0 || c === 4 }));
    const h = evaluateHand(row, P, { sweep: true });
    expect(h.bonuses).toEqual(expect.arrayContaining(["hline", "corner", "sweep"]));
    expect(h.chips).toBe(P["straight.chips"] + 100 + 2 * P.corner);
    expect(h.score).toBe(Math.floor(h.chips * (P["straight.mult"] + P.hline) * P.sweep));
  });
});

describe("formation", () => {
  it("is deterministic per seed and has cols × rows enemies", () => {
    const a = generateFormation(P, 5), b = generateFormation(P, 5), c = generateFormation(P, 6);
    expect(a.enemies).toHaveLength(25);
    expect(a.enemies).toEqual(b.enemies);
    expect(a.enemies).not.toEqual(c.enemies);
  });
  it("guarantees a flush and a straight are possible", () => {
    for (let seed = 0; seed < 200; seed++) {
      const { enemies } = generateFormation(P, seed);
      const byColor = Array.from({ length: P.colors }, (_, c) => enemies.filter(e => e.color === c).length);
      expect(Math.max(...byColor)).toBeGreaterThanOrEqual(P.queue);
      for (let kind = 1; kind <= 5; kind++) expect(enemies.some(e => e.kind === kind)).toBe(true);
    }
  });
  it("marks armored enemies with extra hp", () => {
    expect(generateFormation(withP({ armor: 1, hp: 3 }), 1).enemies.every(e => e.hp === 3)).toBe(true);
  });
  it("front = lowest living enemy of each column", () => {
    const { enemies } = generateFormation(P, 1);
    const f = frontEnemies(enemies.map(e => (e.col === 0 && e.row === 4 ? { ...e, alive: false } : e)));
    expect(f).toHaveLength(5);
    expect(f.find(e => e.col === 0)!.row).toBe(3);
    expect(f.find(e => e.col === 1)!.row).toBe(4);
  });
});

describe("run", () => {
  const play = (p = P): Run => update(createRun(p), { ...idle, advance: true }, 0);
  const killFront = (r: Run, col: number) => killEnemy(r, frontEnemies(r.enemies).find(x => x.col === col)!.id);

  it("starts in preview with the sector-1 small target and waits for advance", () => {
    const r = createRun(P);
    expect(r.phase).toBe("preview");
    expect(r.target).toBe(targetFor(P, 1, 0));
    expect(targetFor(P, 1, 0)).toBe(P["ceil.1"] * P.k * P["stage.small"]);
    expect(targetFor(P, 2, 2)).toBe(P["ceil.2"] * P.k * P["stage.boss"]);
    expect(update(r, idle, 1).phase).toBe("preview");
    expect(play().phase).toBe("play");
  });

  it.each([1, 3, 5, 8, 9, 10])("cols=%i fits on screen: no instant drop to the line (Codex review #1)", cols => {
    const p = withP({ cols, fire: 0 });
    expect(cols * layout(p).cellW).toBeLessThan(480 - 16);
    let r = play(p);
    for (let i = 0; i < 180; i++) r = update(r, idle, 1 / 60);
    expect(r.phase).toBe("play");
    expect(r.fy).toBeLessThanOrEqual(createRun(p).fy + 2 * p.drop);
  });

  it("a fired bullet hits the lowest enemy in that column", () => {
    let r = { ...play(), calm: true };
    const target = frontEnemies(r.enemies).find(e => e.col === 2)!;
    const rect = enemyRect(r, target);
    r = update({ ...r, x: rect.x + rect.w / 2 }, { ...idle, fire: true }, 0.016);
    for (let i = 0; i < 120 && r.queue.length === 0; i++) r = update(r, idle, 0.016);
    expect(r.queue).toHaveLength(1);
    expect(r.enemies.find(e => e.id === target.id)!.alive).toBe(false);
  });

  it("scores a hand after queue kills, and cancel discards the queue", () => {
    let r = { ...play(withP({ k: 1000 })), calm: true };
    for (let i = 0; i < 4; i++) r = killFront(r, i);
    expect(r.queue).toHaveLength(4);
    r = update(r, { ...idle, cancel: true }, 0.016);
    expect(r.queue).toHaveLength(0);
    expect(r.cancels).toBe(P.cancels - 1);
    for (let i = 0; i < 5; i++) r = killFront(r, i);
    expect(r.queue).toHaveLength(0);
    expect(r.score).toBeGreaterThan(0);
    expect(r.stats.hands[r.lastHand!.hand]).toBe(1);
  });

  it("bestShot points at the front enemy that makes the best hand", () => {
    let r = { ...play(), calm: true };
    r = killFront(killFront(r, 0), 1);
    const id = bestShot(r)!;
    const front = frontEnemies(r.enemies);
    expect(front.map(e => e.id)).toContain(id);
    const score = (eid: number) => evaluateHand([...r.queue, { ...front.find(e => e.id === eid)!, corner: false }], r.p, { sweep: false }).score;
    for (const e of front) expect(score(id)).toBeGreaterThanOrEqual(score(e.id));
  });

  it("clears the stage when the target is reached and advances to the next stage", () => {
    let r = { ...play(withP({ k: 0.001 })), calm: true };
    for (let i = 0; i < 5; i++) r = killFront(r, i);
    expect(r.phase).toBe("clear");
    r = update(r, { ...idle, advance: true }, 0);
    expect(r.phase).toBe("preview");
    expect(r.stage).toBe(1);
    expect(r.target).toBe(targetFor(r.p, 1, 1));
    expect(r.enemies.every(e => e.alive)).toBe(true);
  });

  it("wins after the last stage of the last sector", () => {
    let r = { ...createRun(withP({ k: 0.001, sectors: 1 })), stage: 2 };
    r = { ...update(r, { ...idle, advance: true }, 0), calm: true };
    for (let i = 0; i < 5; i++) r = killFront(r, i);
    expect(update(r, { ...idle, advance: true }, 0).phase).toBe("win");
  });

  it("fails when the formation is wiped out below the target", () => {
    let r = { ...play(withP({ k: 1000 })), calm: true };
    for (let i = 0; i < 25; i++) r = killFront(r, i % 5);
    expect(r.phase).toBe("over");
    expect(r.cause).toBe("wiped");
    expect(r.history).toHaveLength(5);
  });

  it("fails when the formation reaches the defense line", () => {
    const r = update({ ...play(), fy: LINE_Y }, idle, 0.016);
    expect(r.phase).toBe("over");
    expect(r.cause).toBe("line");
  });

  it("enemy bullets cost a shield, with invulnerability, and end the run at 0", () => {
    let r = { ...play(withP({ shields: 2 })), calm: true };
    r = update({ ...r, ebullets: [{ x: r.x, y: PLAYER_Y - 2 }] }, idle, 0.001);
    expect(r.shields).toBe(1);
    r = update({ ...r, ebullets: [{ x: r.x, y: PLAYER_Y - 2 }] }, idle, 0.001);
    expect(r.shields).toBe(1); // invulnerable
    r = update({ ...r, invuln: 0, ebullets: [{ x: r.x, y: PLAYER_Y - 2 }] }, idle, 0.001);
    expect(r.shields).toBe(0);
    expect(r.phase).toBe("over");
    expect(r.cause).toBe("shot");
  });

  it("enemies telegraph before firing", () => {
    let r = update(play(withP({ fire: 100, warn: 0.5 })), idle, 0.02);
    expect(r.warns.length).toBeGreaterThan(0);
    expect(r.ebullets).toHaveLength(0);
    for (let i = 0; i < 30; i++) r = update(r, idle, 0.02);
    expect(r.ebullets.length).toBeGreaterThan(0);
  });
});

describe("bot simulation (企画書 §12 段階0)", () => {
  it("is deterministic and plays every enemy of a formation", async () => {
    const { simulateStage } = await import("../src/games/formation/sim");
    const a = simulateStage(P, 3, "greedy");
    expect(a).toEqual(simulateStage(P, 3, "greedy"));
    expect(a.hands).toHaveLength(5);
    expect(simulateStage(P, 3, "column").hands.every(h => h.bonuses.includes("vline"))).toBe(true);
  });
  it("reports hand rates and how far a bot gets without parts", async () => {
    const { simulateRuns } = await import("../src/games/formation/sim");
    const rep = simulateRuns(P, 100, "greedy");
    expect(Object.values(rep.handRate).reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    expect(rep.sectorReached).toHaveLength(100);
  });
});
