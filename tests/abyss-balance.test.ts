// Balance report for ABYSS CHAIN. Skipped in normal runs; `npm run sim:abyss` prints it.
// SIM_QUERY="shotDrop=6&cluster=0.5" measures a variant; SIM_RUNS=60.
import { describe, expect, it } from "vitest";
import { parseParams } from "../src/engine/params";
import { PARAMS } from "../src/games/abyss/rules";
import { simulateRuns, type Policy } from "../src/games/abyss/sim";

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

describe.runIf(env.SIM_REPORT)("abyss balance report", () => {
  it("prints stages cleared per bot policy (no shop)", () => {
    const p = parseParams(PARAMS, "?" + (env.SIM_QUERY ?? ""));
    const runs = Number(env.SIM_RUNS ?? 40);
    const rows = (["spam", "random", "greedy", "lookahead"] as Policy[]).map(policy => {
      const r = simulateRuns(p, runs, policy);
      return `${policy.padEnd(9)} 突破 ${r.stagesCleared.toFixed(2)}面 / 12  最大連鎖 ${r.bestChain.toFixed(1)}  完走 ${r.wins}/${runs}`;
    });
    console.log("\n" + rows.join("\n"));
    expect(rows).toHaveLength(4);
  }, 600_000);
});

describe("abyss sim smoke", () => {
  it("runs deterministically", async () => {
    const { simulateRun } = await import("../src/games/abyss/sim");
    const { defaultParams } = await import("../src/engine/params");
    const p = defaultParams(PARAMS);
    expect(simulateRun(p, 3, "greedy")).toEqual(simulateRun(p, 3, "greedy"));
  });
});
