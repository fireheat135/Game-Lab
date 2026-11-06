// Balance report (企画書 §11/§12). Skipped in normal runs; `npm run sim` prints it.
// Optional: SIM_QUERY="k=1.5&pair.chips=12" to measure a variant, SIM_RUNS=300.
import { describe, expect, it } from "vitest";
import { parseParams } from "../src/engine/params";
import { HANDS, PARAMS } from "../src/games/formation/rules";
import { simulateRuns, type Policy } from "../src/games/formation/sim";

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

describe.runIf(env.SIM_REPORT)("balance report", () => {
  it("prints hand rates and sector reached per bot policy", () => {
    const p = { ...parseParams(PARAMS, "?" + (env.SIM_QUERY ?? "")) };
    const runs = Number(env.SIM_RUNS ?? 200);
    const rows: string[] = [];
    for (const policy of ["lookahead", "greedy", "row", "column"] as Policy[]) {
      const rep = simulateRuns(p, runs, policy);
      const avg = rep.sectorReached.reduce((s, v) => s + v, 0) / runs;
      const rates = HANDS.map(h => `${h.id}=${((rep.handRate[h.id] ?? 0) * 100).toFixed(1)}%`).join(" ");
      rows.push(`${policy.padEnd(9)} 到達 ${avg.toFixed(2)} クリア ${rep.stagesCleared.toFixed(2)}面 1面平均 ${Math.round(rep.meanStageScore)} | ${rates}`);
    }
    console.log("\n" + rows.join("\n"));
    expect(rows).toHaveLength(4);
  }, 600_000);
});
