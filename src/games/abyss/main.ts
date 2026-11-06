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
import { buyBullet, buyPart, createRun, removeCard, reroll, shootColumn, update, PLAYER_Y, type Run } from "./run";
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
});

// ---- sprites: one creature per glow color, tinted
const sprites = new Map<number, HTMLImageElement>();
let subImg: HTMLImageElement | undefined;
Promise.all([
  ...GLOWS.map(g => loadSprite(g.sprite).then(img => sprites.set(g.id, img))),
  loadSprite("sub").then(img => { subImg = img; }),
]).then(() => { canvas.dataset.sprites = "ready"; }, () => { canvas.dataset.sprites = "fallback"; });
const view = createView(canvas.getContext("2d")!, sprites, () => subImg, { touch: matchMedia("(pointer: coarse)").matches });

// ---- HTML shop (buttons: keyboard / screen-reader friendly). Rebuilt only when its contents change.
const shopEl = document.querySelector<HTMLElement>("#shop")!;
let shopKey = "";
function button(label: string, sub: string, onClick: () => Run, disabled: boolean): HTMLButtonElement {
  const b = Object.assign(document.createElement("button"), { type: "button", disabled });
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
  const key = run.phase === "shop" ? JSON.stringify([run.shop, run.gold, run.parts, allCards(run.deck).sort()]) : "";
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
  const deck = BULLETS.filter(b => cards.includes(b.id)).map(b => button(`${b.icon} ${b.name} ×${cards.filter(c => c === b.id).length}`, `1枚抜く ◎${p["price.remove"]}`, () => removeCard(run, b.id as BulletId), run.gold < p["price.remove"] || cards.length <= 1));
  const owned = run.parts.length ? run.parts.map(id => `${partOf(id).name}：${partOf(id).rule}`).join("／") : "なし";
  const reroll_ = button("品ぞろえを更新", `◎${p["price.reroll"]}`, () => reroll(run), run.gold < p["price.reroll"]);
  const next = button("次の群れへ潜る", "Enter でも可", () => update(run, { dx: 0, fire: false, cancel: false, advance: true }, 0), false);
  next.classList.add("primary");
  shopEl.replaceChildren(
    Object.assign(document.createElement("h2"), { textContent: `補給ドック　◎ ${run.gold}` }),
    section("弾を買う（デッキに入る）", ...bullets),
    section("部品を買う（ラン中ずっと有効）", ...parts),
    section(`デッキ（${cards.length}枚）：薄いほど切り直しが早く、濃いほど強い弾が来にくい`, ...deck),
    Object.assign(document.createElement("p"), { className: "owned", textContent: `所持部品：${owned}` }),
    section("", reroll_, next),
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
    const steer = run.phase === "play" ? steerTo(run.x, touch.target(), touch.released()) : { dx: 0, fire: false, arrived: false };
    if (steer.fire || run.phase !== "play") touch.done();
    run = update(run, { dx: keysDx || steer.dx, fire: input.held("fire") || steer.fire, cancel: false, advance }, dt);
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
