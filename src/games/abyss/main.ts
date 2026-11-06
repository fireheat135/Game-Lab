// Wiring: URL params → run ← input; render; sounds from run events; HTML shop; param panel; e2e hooks.
import { createInput } from "../../engine/input";
import { mountParamPanel } from "../../engine/panel";
import { parseParams, toQuery } from "../../engine/params";
import { randomSeed } from "../../engine/rng";
import { createSfx } from "../../engine/sfx";
import { loadSprite } from "../../engine/sprites";
import { exposeTestHooks } from "../../engine/testHooks";
import { attachTouchAim, steerTo } from "../../engine/touchAim";
import { allCards } from "./deck";
import { lowestRow } from "./grid";
import { BULLETS, GLOWS, PARAMS, bulletOf, partOf, type AbyssParams, type BulletId } from "./rules";
import { buyBullet, buyPart, createRun, removeCard, repair, reroll, shootColumn, update, PLAYER_W, PLAYER_Y, W, type Run } from "./run";
import { createView, placeName } from "./view";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const urlParams = parseParams(PARAMS, location.search);
const newRunParams = (): AbyssParams => ({ ...urlParams, seed: urlParams.seed || randomSeed() });
let run: Run = createRun(newRunParams());
let paused = false;

const sfx = createSfx(urlParams.sound === 1);
const input = createInput({
  left: ["ArrowLeft", "a"], right: ["ArrowRight", "d"], fire: [" "], cancel: ["x"], confirm: ["Enter"], pause: ["p", "Escape"],
}, document.querySelector("#pad"));
for (const type of ["keydown", "pointerdown"]) addEventListener(type, () => sfx.unlock());
const touch = attachTouchAim(canvas); // phones: drag on the swarm to aim, lift to fire
addEventListener("visibilitychange", () => { if (document.hidden && run.phase === "play") paused = true; });

exposeTestHooks("__abyssTest", {
  shoot: (col: number) => { run = shootColumn(run, col); },
  firstColumn: () => [...Array(run.grid.cols).keys()].find(c => lowestRow(run.grid, c) >= 0) ?? -1,
  calm: () => { run = { ...run, calm: true, warns: [], ebullets: [] }; },
  gold: (n: number) => { run = { ...run, gold: n }; },
  hitPlayer: () => { run = { ...run, invuln: 0, ebullets: [...run.ebullets, { x: run.x, y: PLAYER_Y - 2 }] }; },
  shots: () => run.stats.shots,
  damage: () => { run = { ...run, shields: Math.max(1, run.shields - 1) }; },
});

// ---- sprites: one creature per glow color, tinted
const sprites = new Map<number, HTMLImageElement>();
let subImg: HTMLImageElement | undefined;
Promise.all([
  ...GLOWS.map(g => loadSprite(g.sprite).then(img => sprites.set(g.id, img))),
  loadSprite("sub").then(img => { subImg = img; }),
]).then(() => { canvas.dataset.sprites = "ready"; }, () => { canvas.dataset.sprites = "fallback"; });
// Canvas text must stay ≥ 12 CSS px even when the canvas is shrunk on small phones.
const minFont = () => Math.min(22, Math.max(14, (12 * canvas.width) / Math.max(1, canvas.clientWidth)));
const view = createView(canvas.getContext("2d")!, sprites, () => subImg, { touch: matchMedia("(pointer: coarse)").matches, minFont });

// ---- HTML shop (buttons: keyboard / screen-reader friendly). Rebuilt only when its contents change.
const shopEl = document.querySelector<HTMLElement>("#shop")!;
let shopKey = "";
function button(label: string, sub: string, onClick: () => Run, disabled: boolean, className = ""): HTMLButtonElement {
  const b = Object.assign(document.createElement("button"), { type: "button", disabled, className });
  b.append(Object.assign(document.createElement("strong"), { textContent: label }), Object.assign(document.createElement("span"), { textContent: sub }));
  b.addEventListener("click", () => { run = onClick(); sfx.play("buy"); });
  return b;
}
function section(title: string, ...children: Node[]) {
  const s = document.createElement("section");
  s.append(Object.assign(document.createElement("h3"), { textContent: title }), ...children);
  return s;
}
function renderShop() {
  const key = run.phase === "shop" ? JSON.stringify([run.shop, run.gold, run.shields, run.parts, allCards(run.deck).sort()]) : "";
  if (key === shopKey) return;
  shopKey = key;
  shopEl.hidden = run.phase !== "shop";
  if (run.phase !== "shop" || !run.shop) return shopEl.replaceChildren();
  const p = run.p, cards = allCards(run.deck);
  const bullets = run.shop.bullets.map((id, i) => id
    ? button(`${bulletOf(id).icon} ${bulletOf(id).name}`, `${bulletOf(id).rule}　◎${p[`price.${id}`]}`, () => buyBullet(run, i), run.gold < p[`price.${id}`])
    : Object.assign(document.createElement("div"), { className: "sold", textContent: "購入済み" }));
  const parts = run.shop.parts.map((id, i) => id
    ? button(partOf(id).name, `${partOf(id).rule}　◎${p[`price.${id}`]}`, () => buyPart(run, i), run.gold < p[`price.${id}`])
    : Object.assign(document.createElement("div"), { className: "sold", textContent: "購入済み" }));
  const deck = BULLETS.filter(b => cards.includes(b.id)).map(b => button(`${b.icon} ${b.name} ×${cards.filter(c => c === b.id).length}`, `1枚抜く ◎${p["price.remove"]}`, () => removeCard(run, b.id as BulletId), run.gold < p["price.remove"] || cards.length <= 1, "remove"));
  const owned = run.parts.length ? run.parts.map(id => `${partOf(id).name}：${partOf(id).rule}`).join("／") : "なし";
  const reroll_ = button("品ぞろえを更新", `◎${p["price.reroll"]}`, () => reroll(run), run.gold < p["price.reroll"]);
  const repair_ = button(`シールド修理 ${"◆".repeat(run.shields)}${"◇".repeat(Math.max(0, p.shields - run.shields))}`, `+1　◎${p["price.repair"]}`, () => repair(run), run.gold < p["price.repair"] || run.shields >= p.shields);
  const actions = document.createElement("div"); // sticky bar: the main action stays visible while the dock scrolls
  actions.className = "dock-actions";
  const next = button("次の群れへ潜る", "Enter でも可", () => update(run, { dx: 0, fire: false, cancel: false, advance: true }, 0), false);
  next.classList.add("primary");
  actions.append(reroll_, next);
  shopEl.replaceChildren(
    Object.assign(document.createElement("h2"), { textContent: `補給ドック　◎ ${run.gold}` }),
    section("弾を買う（デッキに入る）", ...bullets),
    section("部品を買う（ラン中ずっと有効）", ...parts),
    section("整備", repair_),
    section(`デッキ（${cards.length}枚）：切り直しで沈む量は枚数に比例。抜くほど強い弾が来やすい`, ...deck),
    Object.assign(document.createElement("p"), { className: "owned", textContent: `所持部品：${owned}` }),
    actions,
  );
}

// ---- param panel + report
mountParamPanel(document.querySelector<HTMLElement>("#params-body")!, PARAMS, urlParams, { keep: ["test"] });
document.querySelector("#fix-seed")!.addEventListener("click", () => {
  const q = new URLSearchParams(location.search); q.set("seed", String(run.p.seed)); location.search = q.toString();
});
function writeReport(r: Run) {
  document.querySelector("#report")!.textContent = JSON.stringify({
    結果: r.phase === "win" ? "最深部に到達" : `ゲームオーバー（${r.cause}）`, 到達: placeName(r), スコア: r.score,
    最大連鎖: r.stats.bestChain, 撃破: r.stats.kills, 発射: r.stats.shots, 突破面数: r.stats.stagesCleared,
    部品: r.parts.map(id => partOf(id).name), デッキ: allCards(r.deck).map(id => bulletOf(id).name),
    シード: r.p.seed, クエリ: toQuery(PARAMS, r.p) || "（初期値）",
  }, null, 1);
  document.querySelector<HTMLDetailsElement>("#report-box")!.open = true;
}

// ---- loop
const ADVANCE_GUARD_MS = 350; // ignore Enter right after a screen change (no accidental skipping)
let last = performance.now(), phaseSince = last, lastPhase = run.phase, reported = false;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (input.pressed("pause") && run.phase === "play") paused = !paused;
  const tapped = touch.takeTap();
  const advance = (input.pressed("confirm") || (tapped && run.phase !== "play")) && now - phaseSince > ADVANCE_GUARD_MS;
  if (advance) paused = false;
  if (advance && (run.phase === "over" || run.phase === "win")) { run = createRun(newRunParams()); reported = false; }
  else if (!paused) {
    const keysDx = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
    const steer = run.phase === "play"
      ? steerTo(run.x, touch.target(), touch.released(), run.p.touchMove * dt, PLAYER_W / 2, W - PLAYER_W / 2)
      : { dx: 0, fire: false, arrived: false };
    const shotsBefore = run.stats.shots;
    // touch steering moves at touchMove (dx is relative to the keyboard speed); Space fires once per press
    const touchDx = steer.dx * (run.p.touchMove / run.p.move);
    run = update(run, { dx: keysDx || touchDx, fire: input.pressed("fire") || steer.fire, cancel: false, advance }, dt);
    // keep a released touch pending until the shot is actually fired (bullet in flight / cooldown / hitstop)
    if (run.phase !== "play" || (steer.fire && run.stats.shots > shotsBefore)) touch.done();
  }
  input.endFrame();
  for (const e of run.events) sfx.play(e.type, "step" in e ? e.step : 0);
  if (run.phase !== lastPhase) { lastPhase = run.phase; phaseSince = now; }
  if ((run.phase === "over" || run.phase === "win") && !reported) { writeReport(run); reported = true; }
  renderShop();
  view.render(run, now / 1000, paused);
  Object.assign(canvas.dataset, {
    phase: run.phase, paused: String(paused), depth: String(run.depth), stage: String(run.stage), gold: String(run.gold),
    score: String(run.score), alive: String(run.grid.cells.filter(Boolean).length), shields: String(run.shields),
    deck: String(allCards(run.deck).length), parts: String(run.parts.length), chain: String(run.stats.bestChain), seed: String(run.p.seed),
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
