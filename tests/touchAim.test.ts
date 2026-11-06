import { describe, expect, it } from "vitest";
import { steerTo } from "../src/engine/touchAim";

// steerTo(x, target, released, maxStep, minX, maxX) → dx in [-1, 1] (fraction of a full step this frame)
describe("engine: touch aim (drag to aim, release to fire)", () => {
  it("steers toward the finger and fires once it arrives after release", () => {
    expect(steerTo(100, 200, false, 10, 16, 464)).toEqual({ dx: 1, fire: false, arrived: false });
    expect(steerTo(300, 200, false, 10, 16, 464)).toEqual({ dx: -1, fire: false, arrived: false });
    expect(steerTo(200, 200, true, 10, 16, 464)).toEqual({ dx: 0, fire: true, arrived: true });
    expect(steerTo(100, 200, true, 10, 16, 464).fire).toBe(false); // released early: keeps moving, fires on arrival
    expect(steerTo(100, null, false, 10, 16, 464)).toEqual({ dx: 0, fire: false, arrived: false });
  });
  it("never overshoots: the last step is shortened (Codex review #2)", () => {
    expect(steerTo(240, 247, true, 14, 16, 464).dx).toBeCloseTo(0.5);
    let x = 240;
    for (let i = 0; i < 5; i++) { const s = steerTo(x, 247, true, 14, 16, 464); if (s.fire) break; x += s.dx * 14; }
    expect(x).toBeCloseTo(247);
  });
  it("targets outside the ship's range are clamped, so edge releases still fire", () => {
    let x = 40, fired = false;
    for (let i = 0; i < 20 && !fired; i++) { const s = steerTo(x, 0, true, 10, 16, 464); fired = s.fire; x += s.dx * 10; }
    expect(fired).toBe(true);
    expect(x).toBeCloseTo(16);
  });
});
