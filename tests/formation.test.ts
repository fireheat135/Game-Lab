import { describe, expect, it } from "vitest";
import { DEFAULTS, parseParams, toQuery } from "../src/formation/params";
import { evaluateHand, type Kill } from "../src/formation/hand";
import { frontEnemies, generateFormation } from "../src/formation/formation";
import { createRun, enemyRect, killEnemy, targetFor, update, LINE_Y, PLAYER_Y, type Input, type Run } from "../src/formation/run";

const P = { ...DEFAULTS, seed: 1 };
// Distinct col/row by default so no line bonus applies unless a test asks for one.
let n = 0;
const k = (kind: number, color = 0, col = n++ % 7, row = n % 3): Kill => ({ kind, color, col, row, corner: false });
const idle: Input = { dx: 0, fire: false, cancel: false, advance: false };

describe("params", () => {
  it("uses defaults and overrides from the query", () => {
    const p = parseParams("?queue=3&k=0.5&kill=1,2,3,4,5&pair=11,3");
    expect(p.queue).toBe(3);
    expect(p.k).toBe(0.5);
    expect(p.kill).toEqual([1, 2, 3, 4, 5]);
    expect(p.pair).toEqual([11, 3]);
    expect(p.cols).toBe(DEFAULTS.cols);
  });
  it("ignores invalid values and clamps to the allowed range", () => {
    const p = parseParams("?queue=abc&cols=99&pair=1&kill=");
    expect(p.queue).toBe(DEFAULTS.queue);
    expect(p.cols).toBe(10);
    expect(p.pair).toEqual(DEFAULTS.pair);
    expect(p.kill).toEqual(DEFAULTS.kill);
  });
  it("serializes only values that differ from defaults", () => {
    expect(toQuery({ ...DEFAULTS, queue: 4, seed: 7 })).toBe("seed=7&queue=4");
    expect(parseParams("?" + toQuery({ ...DEFAULTS, ceil: [1, 2, 3] })).ceil).toEqual([1, 2, 3]);
  });
});

describe("hand evaluation", () => {
  it("scores (chips + kill chips) × mult", () => {
    // pair: 10 chips / 2 mult; kills of kind 1,1,2,3,4 → 10+10+15+20+25 = 80
    const r = evaluateHand([k(1, 0), k(1, 1), k(2, 2), k(3, 3), k(4, 0)], P, { sweep: false });
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
    [[1, 2, 3, 4, 1 + 5], [0, 1, 2, 3, 0], "high"],
  ])("kinds %j colors %j → %s", (kinds, colors, hand) => {
    const kills = kinds.map((kind, i) => k(kind, colors[i]));
    expect(evaluateHand(kills, { ...P, kinds: 6, kill: [10, 15, 20, 25, 30, 35] }, { sweep: false }).hand).toBe(hand);
  });
  it("needs a full queue for straight and flush", () => {
    expect(evaluateHand([k(1, 0), k(2, 0), k(3, 0)], P, { sweep: false }).hand).toBe("high");
    expect(evaluateHand([k(1, 0), k(2, 0), k(3, 0)], { ...P, queue: 3 }, { sweep: false }).hand).toBe("sf");
  });
  it("adds position bonuses: column, row, corners, sweep", () => {
    const col = [0, 1, 2, 3, 4].map(row => ({ ...k(row === 0 ? 1 : 2, row % 4, 2, row) }));
    const v = evaluateHand(col, P, { sweep: false });
    expect(v.bonuses).toContain("vline");
    expect(v.mult).toBe(P.four[1] + P.vline); // 1,2,2,2,2 = four of a kind
    const row = [0, 1, 2, 3, 4].map(c => ({ ...k(c + 1, c % 4, c, 4), corner: c === 0 || c === 4 }));
    const h = evaluateHand(row, P, { sweep: true });
    expect(h.bonuses).toEqual(expect.arrayContaining(["hline", "corner", "sweep"]));
    expect(h.chips).toBe(P.straight[0] + 100 + 2 * P.corner);
    expect(h.score).toBe(Math.floor(h.chips * (P.straight[1] + P.hline) * P.sweep));
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
    const { enemies } = generateFormation({ ...P, armor: 1, hp: 3 }, 1);
    expect(enemies.every(e => e.hp === 3)).toBe(true);
  });
  it("front = lowest living enemy of each column", () => {
    const { enemies } = generateFormation(P, 1);
    const killed = enemies.map(e => (e.col === 0 && e.row === 4 ? { ...e, alive: false } : e));
    const f = frontEnemies(killed);
    expect(f).toHaveLength(5);
    expect(f.find(e => e.col === 0)!.row).toBe(3);
    expect(f.find(e => e.col === 1)!.row).toBe(4);
  });
});

describe("run", () => {
  const play = (p = P): Run => update(createRun(p), { ...idle, advance: true }, 0);
  const killFront = (r: Run, col: number) => {
    const e = frontEnemies(r.enemies).find(x => x.col === col)!;
    return killEnemy(r, e.id);
  };

  it("starts in preview with the sector-1 small target and waits for advance", () => {
    const r = createRun(P);
    expect(r.phase).toBe("preview");
    expect(r.target).toBe(targetFor(P, 1, 0));
    expect(targetFor(P, 1, 0)).toBe(P.ceil[0] * P.k * P.stagex[0]);
    expect(targetFor(P, 2, 2)).toBe(P.ceil[1] * P.k * P.stagex[2]);
    expect(update(r, idle, 1).phase).toBe("preview");
    expect(play().phase).toBe("play");
  });

  it("a fired bullet hits the lowest enemy in that column", () => {
    let r = { ...play(), calm: true };
    const target = frontEnemies(r.enemies).find(e => e.col === 2)!;
    const rect = enemyRect(r, target);
    r = { ...r, x: rect.x + rect.w / 2 };
    r = update(r, { ...idle, fire: true }, 0.016);
    for (let i = 0; i < 120 && r.queue.length === 0; i++) r = update(r, idle, 0.016);
    expect(r.queue).toHaveLength(1);
    expect(r.enemies.find(e => e.id === target.id)!.alive).toBe(false);
  });

  it("scores a hand after queue kills, and cancel discards the queue", () => {
    let r = { ...play({ ...P, k: 1000 }), calm: true };
    for (let i = 0; i < 4; i++) r = killFront(r, i);
    expect(r.queue).toHaveLength(4);
    r = update(r, { ...idle, cancel: true }, 0.016);
    expect(r.queue).toHaveLength(0);
    expect(r.cancels).toBe(P.cancels - 1);
    for (let i = 0; i < 5; i++) r = killFront(r, i);
    expect(r.queue).toHaveLength(0);
    expect(r.score).toBeGreaterThan(0);
    expect(r.lastHand).not.toBeNull();
    expect(r.stats.hands[r.lastHand!.hand]).toBe(1);
  });

  it("clears the stage when the target is reached and advances to the next stage", () => {
    let r = { ...play({ ...P, k: 0.001 }), calm: true };
    for (let i = 0; i < 5; i++) r = killFront(r, i);
    expect(r.phase).toBe("clear");
    r = update(r, { ...idle, advance: true }, 0);
    expect(r.phase).toBe("preview");
    expect(r.stage).toBe(1);
    expect(r.target).toBe(targetFor(r.p, 1, 1));
    expect(r.enemies.every(e => e.alive)).toBe(true);
  });

  it("wins after the last stage of the last sector", () => {
    let r = { ...createRun({ ...P, k: 0.001, sectors: 1 }), stage: 2 };
    r = { ...update(r, { ...idle, advance: true }, 0), calm: true };
    for (let i = 0; i < 5; i++) r = killFront(r, i);
    expect(update(r, { ...idle, advance: true }, 0).phase).toBe("win");
  });

  it("fails when the formation is wiped out below the target", () => {
    let r = { ...play({ ...P, k: 1000 }), calm: true };
    for (let i = 0; i < 25; i++) r = killFront(r, i % 5);
    expect(r.phase).toBe("over");
    expect(r.cause).toBe("wiped");
    expect(r.history).toHaveLength(5);
  });

  it("fails when the formation reaches the defense line", () => {
    let r = play();
    r = { ...r, fy: LINE_Y };
    r = update(r, idle, 0.016);
    expect(r.phase).toBe("over");
    expect(r.cause).toBe("line");
  });

  it("enemy bullets cost a shield, with invulnerability, and end the run at 0", () => {
    let r = { ...play({ ...P, shields: 2 }), calm: true };
    r = { ...r, ebullets: [{ x: r.x, y: PLAYER_Y - 2 }] };
    r = update(r, idle, 0.001);
    expect(r.shields).toBe(1);
    r = { ...r, ebullets: [{ x: r.x, y: PLAYER_Y - 2 }] };
    r = update(r, idle, 0.001);
    expect(r.shields).toBe(1); // invulnerable
    r = { ...r, invuln: 0, ebullets: [{ x: r.x, y: PLAYER_Y - 2 }] };
    r = update(r, idle, 0.001);
    expect(r.shields).toBe(0);
    expect(r.phase).toBe("over");
    expect(r.cause).toBe("shot");
  });

  it("enemies telegraph before firing", () => {
    let r = play({ ...P, fire: 100, warn: 0.5 });
    r = update(r, idle, 0.02);
    expect(r.warns.length).toBeGreaterThan(0);
    expect(r.ebullets).toHaveLength(0);
    for (let i = 0; i < 30; i++) r = update(r, idle, 0.02);
    expect(r.ebullets.length).toBeGreaterThan(0);
  });
});

describe("bot simulation (企画書 §12 段階0)", () => {
  it("is deterministic and plays every enemy of a formation", async () => {
    const { simulateStage } = await import("../src/formation/sim");
    const a = simulateStage(P, 3, "greedy"), b = simulateStage(P, 3, "greedy");
    expect(a).toEqual(b);
    expect(a.hands.reduce((s, h) => s + 1, 0)).toBe(5);
    expect(simulateStage(P, 3, "column").hands.every(h => h.bonuses.includes("vline"))).toBe(true);
  });
  it("reports hand rates and how far a bot gets without parts", async () => {
    const { simulateRuns } = await import("../src/formation/sim");
    const rep = simulateRuns(P, 200, "greedy");
    expect(Object.values(rep.handRate).reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    expect(rep.sectorReached.length).toBe(200);
    if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SIM_REPORT) for (const policy of ["greedy", "column", "row"] as const) console.log(policy, JSON.stringify(simulateRuns(P, 500, policy), null, 1));
  });
});
