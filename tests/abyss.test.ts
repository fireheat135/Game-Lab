import { describe, expect, it } from "vitest";
import { defaultParams, parseParams } from "../src/engine/params";
import { PARAMS, type AbyssParams } from "../src/games/abyss/rules";
import { fromRows, toRows, group, gravity, resolveShot, generateGrid, lowestRow } from "../src/games/abyss/grid";
import { newDeck, draw } from "../src/games/abyss/deck";

const P: AbyssParams = { ...defaultParams(PARAMS), seed: 1 };
const withP = (over: Record<string, number>) => ({ ...P, ...over }) as AbyssParams;
const opts = (over: Partial<Parameters<typeof resolveShot>[3]> = {}) => ({ diagonal: false, chainMin: 4, base: 10, resonance: false, ...over });

// Grids are written as rows of color digits (row 0 = top); "." = empty.
describe("grid basics", () => {
  it("round-trips a text grid", () => {
    const g = fromRows(["01.", "120"]);
    expect(toRows(g)).toEqual(["01.", "120"]);
    expect(lowestRow(g, 2)).toBe(1);
    expect(lowestRow(fromRows(["0.", "1."]), 1)).toBe(-1);
  });
  it("group = connected same color, 4-neighbour unless diagonal", () => {
    const g = fromRows(["00.", ".0.", "..0"]);
    expect(group(g, 0, 0, false)).toHaveLength(3);
    expect(group(g, 0, 0, true)).toHaveLength(4); // the bottom-right 0 joins only through a diagonal
  });
  it("gravity compacts each column to the bottom and reports who moved", () => {
    const g = fromRows(["1.", ".2", "3."]);
    const { grid, moved } = gravity(g);
    expect(toRows(grid)).toEqual(["..", "1.", "32"]);
    expect(moved.size).toBe(2);
  });
});

describe("resolveShot", () => {
  it("a shot pops the whole same-color group of the lowest enemy in the column", () => {
    const g = fromRows(["11", "01", "00"]);
    const r = resolveShot(g, "shot", 0, opts());
    expect(r.kills).toBe(3); // the three 0s
    expect(toRows(r.grid)).toEqual(["..", ".1", "11"]); // remaining 1s fall; only 3 connected < chainMin
  });
  it("falling enemies that form chainMin+ same color pop as a chain step with a higher multiplier", () => {
    // shooting col 0 pops the 2 below; the 1s fall and join 1s in col 1 → 4 connected → chain
    const g = fromRows(["1.", "1.", "21", "21"]);
    const r = resolveShot(g, "shot", 0, opts());
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].popped).toHaveLength(2);
    expect(r.steps[1].popped).toHaveLength(4);
    expect(r.score).toBe(2 * 10 * 1 + 4 * 10 * 2);
    expect(toRows(r.grid).join("")).not.toContain("1");
  });
  it("resonance doubles the chain multiplier growth; chainMin can be lowered", () => {
    const g = fromRows(["1.", "1.", "21", "21"]);
    expect(resolveShot(g, "shot", 0, opts({ resonance: true })).score).toBe(2 * 10 + 4 * 10 * 3);
    const g2 = fromRows(["1.", "21", "21"]); // after the 2s pop, three 1s touch
    expect(resolveShot(g2, "shot", 0, opts()).steps).toHaveLength(1);
    expect(resolveShot(g2, "shot", 0, opts({ chainMin: 3 })).steps).toHaveLength(2);
  });
  it("spread hits the lowest of the column and both neighbours; bomb hits 3×3; pierce goes 3 deep", () => {
    const g = fromRows(["012", "120", "201"]);
    expect(resolveShot(g, "spread", 1, opts()).kills).toBe(3);
    expect(resolveShot(fromRows(["000", "111", "222", "333"]), "pierce", 1, opts()).steps[0].popped.length).toBeGreaterThanOrEqual(3);
    const bomb = resolveShot(fromRows(["012", "120", "201", "012"]), "bomb", 1, opts());
    expect(bomb.steps[0].popped.length).toBeGreaterThanOrEqual(6); // 3×3 around the bottom of column 1 clipped to the grid (2 rows)
  });
  it("dye recolors the target's neighbours to its color before popping", () => {
    const g = fromRows(["010", "121"]);
    const r = resolveShot(g, "dye", 1, opts());
    expect(r.steps[0].popped.length).toBe(4); // target + up + left + right
  });
  it("armored enemies lose 1 hp instead of popping", () => {
    const g = fromRows(["0", "0"]);
    g.cells[1]!.hp = 2;
    const r = resolveShot(g, "shot", 0, opts());
    expect(r.kills).toBe(1);
    expect(r.grid.cells.filter(Boolean)).toHaveLength(1);
  });
  it("hitting an empty column does nothing", () => {
    const r = resolveShot(fromRows(["0.", "0."]), "shot", 1, opts());
    expect(r.kills).toBe(0);
    expect(r.steps).toHaveLength(0);
  });
});

describe("generateGrid", () => {
  it("is deterministic and full; cluster makes same-color neighbours more common", () => {
    const a = generateGrid(P, 5, 0, 7), b = generateGrid(P, 5, 0, 7);
    expect(a.grid).toEqual(b.grid);
    expect(a.grid.cells.every(Boolean)).toBe(true);
    const sameNeighbours = (cluster: number) => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const g = generateGrid(withP({ cluster }), 5, 0, seed).grid;
        for (let r = 0; r < g.rows; r++) for (let c = 1; c < g.cols; c++) if (g.cells[r * g.cols + c]!.color === g.cells[r * g.cols + c - 1]!.color) n++;
      }
      return n;
    };
    expect(sameNeighbours(0.8)).toBeGreaterThan(sameNeighbours(0));
  });
});

describe("deck", () => {
  it("builds the starting deck from params and draws in a seeded order, reshuffling the discard when empty", () => {
    const p = withP({ "deck.shot": 2, "deck.spread": 0, "deck.pierce": 0, "deck.bomb": 1, "deck.dye": 0 });
    let d = newDeck(p, 3);
    expect(d.draw).toHaveLength(3);
    const seen: string[] = [];
    let shuffled = 0;
    for (let i = 0; i < 6; i++) { const r = draw(d); seen.push(r.bullet); if (r.reshuffled) shuffled++; d = r.deck; }
    expect(seen.filter(b => b === "bomb")).toHaveLength(2);
    expect(shuffled).toBe(1);
    expect(draw(newDeck(p, 3)).bullet).toBe(draw(newDeck(p, 3)).bullet);
  });
  it("query can change the starting deck", () => {
    expect(newDeck(parseParams(PARAMS, "?deck.bomb=5"), 1).draw.filter(b => b === "bomb")).toHaveLength(5);
  });
});

import { createRun, update, shootColumn, buyBullet, buyPart, removeCard, reroll, layout, bottomY, LINE_Y, PLAYER_Y, type Run, type Input } from "../src/games/abyss/run";
import { allCards } from "../src/games/abyss/deck";

const idle: Input = { dx: 0, fire: false, cancel: false, advance: false };
const play = (p = P): Run => ({ ...update(createRun(p), { ...idle, advance: true }, 0), calm: true });
/** Clears the grid by shooting columns left to right (test helper; ignores score). */
function clearStage(r: Run): Run {
  for (let i = 0; i < 500 && r.phase === "play"; i++) {
    const col = r.grid.cells.findIndex(Boolean) % r.grid.cols;
    r = shootColumn({ ...r, fy: 82 }, col);
  }
  return r;
}

describe("run", () => {
  it("starts in preview, depth 1 rows from the table", () => {
    const r = createRun(P);
    expect(r.phase).toBe("preview");
    expect(r.grid.rows).toBe(P["rows.1"]);
    expect(update(r, idle, 1).phase).toBe("preview");
    expect(play().phase).toBe("play");
  });
  it("each shot uses the next card and sinks the swarm; reshuffling sinks it more", () => {
    let r = play(withP({ "deck.shot": 2, "deck.spread": 0, "deck.pierce": 0, "deck.bomb": 0 }));
    const fy0 = r.fy;
    r = shootColumn(r, 3);
    expect(r.fy).toBeCloseTo(fy0 + P.shotDrop);
    r = shootColumn(r, 3);
    expect(r.deck.draw).toHaveLength(0);
    const before = r.fy;
    r = shootColumn(r, 3); // empty draw pile → reshuffle
    expect(r.fy).toBeCloseTo(before + P.shotDrop + 2 * P.shuffleDropPerCard); // 2 cards in the deck
    expect(r.shuffles).toBe(1);
  });
  it("a real bullet flies up and resolves on the lowest enemy of the column under the ship", () => {
    let r = play();
    const g = layout(r.p, r.grid.rows);
    r = { ...r, x: r.fx + 2.5 * g.cellW };
    const alive = r.grid.cells.filter(Boolean).length;
    r = update(r, { ...idle, fire: true }, 0.016);
    expect(r.bullet).not.toBeNull();
    for (let i = 0; i < 100 && r.bullet; i++) r = update(r, idle, 0.016);
    expect(r.grid.cells.filter(Boolean).length).toBeLessThan(alive);
  });
  it("chains emit events and freeze the swarm for hitstop × steps", () => {
    let r = play(withP({ hitstop: 0.1 }));
    // force a chain: column 0 = 1,1,2,2 over column 1 = .,.,1,1
    r = { ...r, grid: fromRows(["1......", "1......", "21.....", "21....."].map(s => s.slice(0, r.grid.cols).padEnd(r.grid.cols, "."))) };
    r = shootColumn(r, 0);
    expect(r.events.some(e => e.type === "chain")).toBe(true);
    expect(r.freezeT).toBeCloseTo(0.2);
    const fy = r.fy;
    r = update(r, idle, 0.05);
    expect(r.fy).toBe(fy); // frozen
  });
  it("clearing the swarm → clear (+gold) → shop → next stage keeps the deck", () => {
    let r = clearStage(play());
    expect(r.phase).toBe("clear");
    expect(r.gold).toBeGreaterThanOrEqual(P.gold);
    r = update(r, { ...idle, advance: true }, 0);
    expect(r.phase).toBe("shop");
    expect(r.shop!.bullets.length).toBe(3);
    const cards = allCards(r.deck).length;
    r = { ...r, gold: 100 };
    r = buyBullet(r, 0);
    expect(allCards(r.deck).length).toBe(cards + 1);
    expect(r.shop!.bullets[0]).toBeNull();
    r = buyPart(r, 0);
    expect(r.parts).toHaveLength(1);
    r = removeCard(r, "shot");
    expect(allCards(r.deck).length).toBe(cards);
    const offers = r.shop!.bullets;
    r = reroll(r);
    expect(r.shop!.bullets).not.toEqual(offers);
    r = update(r, { ...idle, advance: true }, 0);
    expect(r.phase).toBe("preview");
    expect(r.stage).toBe(1);
    expect(allCards(r.deck).length).toBe(cards);
  });
  it("cannot buy without gold", () => {
    let r = update(clearStage(play()), { ...idle, advance: true }, 0);
    r = { ...r, gold: 0 };
    expect(buyBullet(r, 0)).toBe(r);
    expect(buyPart(r, 0)).toBe(r);
  });
  it("parts: steady halves the per-shot sink", () => {
    let r: Run = { ...play(), parts: ["steady"] };
    const fy = r.fy;
    r = shootColumn(r, 3);
    expect(r.fy).toBeCloseTo(fy + P.shotDrop / 2);
  });
  it("loses when the swarm reaches the line, or when shields run out", () => {
    let r = play();
    r = update({ ...r, fy: LINE_Y }, idle, 0.016);
    expect(r.phase).toBe("over");
    expect(r.cause).toBe("line");
    let s = play(withP({ shields: 1 }));
    s = update({ ...s, ebullets: [{ x: s.x, y: PLAYER_Y - 2 }] }, idle, 0.001);
    expect(s.phase).toBe("over");
    expect(s.cause).toBe("shot");
  });
  it("bottomY tracks the lowest occupied row", () => {
    const r = play();
    const g = layout(r.p, r.grid.rows);
    expect(bottomY(r)).toBeCloseTo(r.fy + r.grid.rows * g.cellH);
  });
  it("wins after the last stage of the last depth", () => {
    let r = { ...createRun(P), depth: 4, stage: 2 };
    r = { ...update(r, { ...idle, advance: true }, 0), calm: true };
    r = clearStage(r);
    expect(update(r, { ...idle, advance: true }, 0).phase).toBe("win");
  });
});

describe("review fixes", () => {
  it("a bullet that already passed above the swarm never hits later (Codex review #3)", () => {
    let r = play(withP({ speed: 0 }));
    const alive = r.grid.cells.filter(Boolean).length;
    r = { ...r, bullet: { x: r.fx + 10, y: r.fy - 40, type: "shot" } };
    r = update(r, idle, 0.016);
    expect(r.grid.cells.filter(Boolean).length).toBe(alive);
  });
  it("long chains cap the hitstop at 0.3 s", () => {
    let r = play(withP({ hitstop: 0.2 }));
    r = { ...r, grid: fromRows(["1......", "1......", "21.....", "21....."]) };
    r = shootColumn(r, 0);
    expect(r.freezeT).toBeLessThanOrEqual(0.3);
  });
});

describe("playtest round 2 (ABYSS)", () => {
  it("reshuffle sink scales with deck size, so the average sink per shot does not depend on deck size", () => {
    const sinkPerShot = (cards: number) => {
      let r = play(withP({ "deck.shot": cards, "deck.spread": 0, "deck.pierce": 0, "deck.bomb": 0, "cols": 10, "rows.1": 9 }));
      const fy = r.fy;
      for (let i = 0; i < cards * 2 + 1; i++) r = shootColumn({ ...r, phase: "play" }, i % r.grid.cols);
      return (r.fy - fy) / (cards * 2 + 1);
    };
    expect(sinkPerShot(4)).toBeCloseTo(sinkPerShot(12), 0);
  });
  it("killing clearRatio of the swarm clears the stage (no single-enemy mop-up)", () => {
    let r = play(withP({ clearRatio: 0.5 }));
    const total = r.grid.cells.filter(Boolean).length;
    for (let i = 0; i < 200 && r.phase === "play"; i++) r = shootColumn({ ...r, fy: 96 }, r.grid.cells.findIndex(Boolean) % r.grid.cols);
    expect(r.phase).toBe("clear");
    expect(r.stats.kills).toBeGreaterThanOrEqual(Math.ceil(total * 0.5));
    expect(r.grid.cells.every(c => !c)).toBe(true); // the rest flee
  });
  it("sinkPreview predicts where the swarm bottom will be after the next shot, flagging a reshuffle", async () => {
    const { sinkPreview } = await import("../src/games/abyss/run");
    let r = play(withP({ "deck.shot": 1, "deck.spread": 0, "deck.pierce": 0, "deck.bomb": 0 }));
    expect(sinkPreview(r)).toEqual({ y: bottomY(r) + P.shotDrop, reshuffle: false });
    r = shootColumn(r, 3);
    expect(sinkPreview(r)).toEqual({ y: bottomY(r) + P.shotDrop + P.shuffleDropPerCard, reshuffle: true });
  });
  it("shop offers have no duplicate bullets; repair restores one shield up to the max", async () => {
    const { repair } = await import("../src/games/abyss/run");
    for (let seed = 1; seed < 20; seed++) {
      let r = update(clearStage(play(withP({ seed }))), { ...idle, advance: true }, 0);
      const b = r.shop!.bullets;
      expect(new Set(b).size).toBe(b.length);
      r = { ...r, gold: 100, shields: 1 };
      r = repair(r);
      expect(r.shields).toBe(2);
      expect(repair({ ...r, shields: P.shields }).shields).toBe(P.shields);
    }
  });
  it("chains put a floating label at the chain's position", () => {
    let r = play();
    r = { ...r, grid: fromRows(["1......", "1......", "21.....", "21....."]) };
    r = shootColumn(r, 0);
    expect(r.floaters.some(f => f.text.includes("2連鎖"))).toBe(true);
  });
});
