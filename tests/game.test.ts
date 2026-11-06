import { describe, expect, it } from "vitest";
import { createState, movePlayer, step, collides, PLAYER_SIZE } from "../src/game";

describe("game logic", () => {
  it("clamps player inside the field", () => {
    const s = createState(100, 100);
    expect(movePlayer(s, -1000).player.x).toBe(0);
    expect(movePlayer(s, 1000).player.x).toBe(100 - PLAYER_SIZE);
  });
  it("scores when a block leaves the screen", () => {
    const s = { ...createState(100, 100), blocks: [{ x: 0, y: 99, size: 5, speed: 100 }] };
    const n = step(s, 0.1);
    expect(n.blocks).toHaveLength(0);
    expect(n.score).toBe(1);
  });
  it("ends the game on collision", () => {
    const s = createState(100, 100);
    const hit = { x: s.player.x, y: s.player.y, size: 10, speed: 0 };
    expect(collides(s.player, hit)).toBe(true);
    expect(step(s, 0.016, hit).over).toBe(true);
  });
});
