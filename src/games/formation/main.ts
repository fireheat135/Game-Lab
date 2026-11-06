// Wiring: URL params → run state ← input; render each frame; e2e hooks; param panel; run report.
import { createInput } from "../../engine/input";
import { mountParamPanel } from "../../engine/panel";
import { parseParams, toQuery } from "../../engine/params";
import { randomSeed } from "../../engine/rng";
import { loadSprite } from "../../engine/sprites";
import { exposeTestHooks } from "../../engine/testHooks";
import { frontEnemies } from "./formation";
import { CREATURES, HANDS, PARAMS, bonusName, handName, type FormationParams } from "./rules";
import { createRun, killEnemy, update, PLAYER_Y, type Run } from "./run";
import { createView, placeName, type Sprites } from "./view";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const urlParams = parseParams(PARAMS, location.search);
const newRunParams = (): FormationParams => ({ ...urlParams, seed: urlParams.seed || randomSeed() });
let run: Run = createRun(newRunParams());
let paused = false;

const input = createInput({
  left: ["ArrowLeft", "a"], right: ["ArrowRight", "d"], fire: [" "], cancel: ["x", "c"], confirm: ["Enter"], pause: ["p", "Escape"],
}, document.querySelector("#pad"));
addEventListener("visibilitychange", () => { if (document.hidden && run.phase === "play") paused = true; });

exposeTestHooks("__formationTest", {
  kill: (col: number) => { const e = frontEnemies(run.enemies).find(x => x.col === col); if (e) run = killEnemy(run, e.id); },
  hitPlayer: () => { run = { ...run, invuln: 0, ebullets: [...run.ebullets, { x: run.x, y: PLAYER_Y - 2 }] }; },
  calm: () => { run = { ...run, calm: true, warns: [], ebullets: [] }; },
});

// ---- sprites (white, tinted per glow color) ----
const sprites: Sprites = { creatures: new Map() };
Promise.all([
  ...CREATURES.filter(c => c.sprite).map(c => loadSprite(c.sprite!).then(img => sprites.creatures.set(c.kind, img))),
  loadSprite("sub").then(img => { sprites.sub = img; }),
]).then(() => { canvas.dataset.sprites = "ready"; }, () => { canvas.dataset.sprites = "fallback"; });
const view = createView(canvas.getContext("2d")!, sprites, { touch: matchMedia("(pointer: coarse)").matches });

// ---- hand table (current values, so players can look things up instead of remembering) ----
function renderHandTable() {
  const rows = HANDS.map(h => ({ name: h.name, chips: urlParams[`${h.id}.chips`], mult: urlParams[`${h.id}.mult`] }))
    .sort((a, b) => b.chips * b.mult - a.chips * a.mult)
    .map(h => { const tr = document.createElement("tr"); for (const v of [h.name, String(h.chips), String(h.mult)]) tr.append(Object.assign(document.createElement("td"), { textContent: v })); return tr; });
  document.querySelector("#hands tbody")!.replaceChildren(...rows);
}
renderHandTable();

// ---- param panel + run report ----
// Panel shows the URL values (seed 0 = random each run); "このシードを固定" pins the current run's seed.
mountParamPanel(document.querySelector<HTMLElement>("#params-body")!, PARAMS, urlParams, { keep: ["test"] });
document.querySelector("#fix-seed")!.addEventListener("click", () => {
  const q = new URLSearchParams(location.search); q.set("seed", String(run.p.seed)); location.search = q.toString();
});

function writeReport(r: Run) {
  const total = Object.values(r.stats.hands).reduce((s, c) => s + c!, 0) || 1;
  const report = {
    結果: r.phase === "win" ? "最深部に到達" : `ゲームオーバー（${r.cause}）`, 到達: placeName(r),
    不足: Math.max(0, r.target - r.score),
    役: Object.fromEntries(Object.entries(r.stats.hands).map(([id, c]) => [handName(id as never), `${c}回（${Math.round((c! / total) * 100)}%）`])),
    位置役: Object.fromEntries(Object.entries(r.stats.bonuses).map(([id, c]) => [bonusName(id as never), c])),
    キャンセル使用: r.stats.cancelsUsed, シード: r.p.seed, クエリ: toQuery(PARAMS, r.p) || "（初期値）",
    ハンド履歴: r.history.map(h => `${h.sector}-${h.stage + 1} ${handName(h.hand)}${h.bonuses.length ? "+" + h.bonuses.map(bonusName).join("・") : ""} ${h.score}`),
  };
  document.querySelector("#report")!.textContent = JSON.stringify(report, null, 1);
  document.querySelector<HTMLDetailsElement>("#report-box")!.open = true;
}

// ---- loop ----
// Advancing (start / next / retry) needs a fresh Enter or 「決定」, never Space, and is ignored for a
// moment after the screen changes — mashing fire must not skip the result or the next target.
const ADVANCE_GUARD_MS = 350;
let last = performance.now(), reported = false, phaseSince = performance.now(), lastPhase = run.phase;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (input.pressed("pause") && run.phase === "play") paused = !paused;
  const advance = input.pressed("confirm") && now - phaseSince > ADVANCE_GUARD_MS;
  if (advance) paused = false;
  if (advance && (run.phase === "over" || run.phase === "win")) { run = createRun(newRunParams()); reported = false; }
  else if (!paused) {
    run = update(run, {
      dx: (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0),
      fire: input.held("fire"), cancel: input.pressed("cancel"), advance,
    }, dt);
  }
  input.endFrame();
  if (run.phase !== lastPhase) { lastPhase = run.phase; phaseSince = now; }
  if ((run.phase === "over" || run.phase === "win") && !reported) { writeReport(run); reported = true; }

  view.render(run, now / 1000, paused);
  Object.assign(canvas.dataset, {
    phase: run.phase, paused: String(paused), score: String(run.score), target: String(run.target), queue: String(run.queue.length),
    shields: String(run.shields), cancels: String(run.cancels), alive: String(run.enemies.filter(e => e.alive).length),
    sector: String(run.sector), stage: String(run.stage), x: run.x.toFixed(1), hand: run.lastHand?.hand ?? "", seed: String(run.p.seed),
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
