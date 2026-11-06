import { describe, expect, it } from "vitest";
import { steerTo } from "../src/engine/touchAim";

describe("engine: touch aim (drag to aim, release to fire)", () => {
  it("steers toward the finger and fires once it arrives after release", () => {
    expect(steerTo(100, 200, false)).toEqual({ dx: 1, fire: false, arrived: false });
    expect(steerTo(300, 200, false)).toEqual({ dx: -1, fire: false, arrived: false });
    expect(steerTo(199, 200, false)).toEqual({ dx: 0, fire: false, arrived: true });
    expect(steerTo(199, 200, true)).toEqual({ dx: 0, fire: true, arrived: true });
    expect(steerTo(100, 200, true).fire).toBe(false); // released early: keeps moving, fires on arrival
    expect(steerTo(100, null, false)).toEqual({ dx: 0, fire: false, arrived: false });
  });
});
