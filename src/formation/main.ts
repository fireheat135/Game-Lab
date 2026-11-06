import { DEFAULTS, DEFS, formatValue, parseParams, toQuery, type Params } from "./params";
import { BONUS_NAMES, HAND_NAMES, evaluateHand } from "./hand";
import { frontEnemies } from "./formation";
import { createRun, enemyRect, killEnemy, update, ENEMY, H, LINE_Y, PLAYER_W, PLAYER_Y, W, type Run } from "./run";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;

// ---- params (URL query) ----
const urlParams = parseParams(location.search);
const randomSeed = () => 1 + Math.floor(Math.random() * 2 ** 31);
const runParams = (): Params => ({ ...urlParams, seed: urlParams.seed || randomSeed() });
let run: Run = createRun(runParams());

// ---- input ----
const keys = new Set<string>();
let pressed = new Set<string>();
const norm = (k: string) => (k.length === 1 ? k.toLowerCase() : k);
const isGameKey = (k: string) => ["ArrowLeft", "ArrowRight", " ", "Enter", "a", "d", "x", "c"].includes(k);
addEventListener("keydown", e => {
  if (e.target instanceof HTMLInputElement) return;
  const k = norm(e.key);
  if (isGameKey(k)) e.preventDefault();
  if (!keys.has(k)) pressed.add(k);
  keys.add(k);
});
addEventListener("keyup", e => keys.delete(norm(e.key)));
addEventListener("blur", () => keys.clear());
for (const b of document.querySelectorAll<HTMLButtonElement>("#pad button")) {
  const k = b.dataset.key!;
  b.addEventListener("pointerdown", e => { e.preventDefault(); if (!keys.has(k)) pressed.add(k); keys.add(k); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => keys.delete(k));
}

// ---- e2e hooks (VITE_E2E build only; stripped from the deployed game) ----
if (import.meta.env.VITE_E2E && new URLSearchParams(location.search).has("test")) {
  (window as unknown as { __formationTest: object }).__formationTest = {
    kill: (col: number) => { const e = frontEnemies(run.enemies).find(x => x.col === col); if (e) run = killEnemy(run, e.id); },
    hitPlayer: () => { run = { ...run, invuln: 0, ebullets: [...run.ebullets, { x: run.x, y: PLAYER_Y - 2 }] }; },
    calm: () => { run = { ...run, calm: true, warns: [], ebullets: [] }; },
  };
}

// ---- drawing ----
const COLORS = ["#ff5c5c", "#4c9bff", "#3ecf7a", "#ffd23f", "#c77dff", "#ff9f43", "#3fe0e0"];
const COLOR_NAMES = ["赤", "青", "緑", "黄", "紫", "橙", "水"];
const STAGE_NAMES = ["小", "大", "母艦"];

function shape(kind: number, x: number, y: number, s: number) {
  const cx = x + s / 2, cy = y + s / 2, r = s / 2;
  ctx.beginPath();
  switch (kind) {
    case 1: ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); break;
    case 2: ctx.moveTo(cx, y + s); ctx.lineTo(x, y + s * 0.15); ctx.lineTo(x + s, y + s * 0.15); break; // points down
    case 3: ctx.rect(x + s * 0.1, y + s * 0.2, s * 0.8, s * 0.7); ctx.rect(x + s * 0.2, y, s * 0.12, s * 0.25); ctx.rect(x + s * 0.68, y, s * 0.12, s * 0.25); break;
    case 4: ctx.moveTo(cx, y); ctx.lineTo(x + s, cy); ctx.lineTo(cx, y + s); ctx.lineTo(x, cy); break;
    case 5: for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } break;
    default: for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  }
  ctx.closePath();
  ctx.fill();
}

function drawEnemy(e: { kind: number; color: number; hp?: number; maxHp?: number }, x: number, y: number, s: number) {
  ctx.fillStyle = COLORS[e.color % COLORS.length];
  shape(e.kind, x, y, s);
  ctx.fillStyle = "#0b0b10";
  ctx.font = `bold ${Math.round(s * 0.42)}px system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(e.kind), x + s / 2, y + s * (e.kind === 2 ? 0.42 : 0.55));
  if (e.hp && e.hp > 1) { ctx.strokeStyle = "#ddd"; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, s + 4, s + 4); ctx.fillStyle = "#ddd"; ctx.font = "10px sans-serif"; ctx.fillText(`×${e.hp}`, x + s - 2, y - 6); }
}

let ship: HTMLImageElement | undefined;
const img = new Image();
img.src = `${import.meta.env.BASE_URL}assets/ship.png`;
img.decode().then(() => { ship = img; canvas.dataset.sprites = "ready"; }, () => { canvas.dataset.sprites = "fallback"; });

const fmt = (n: number) => (n >= 1e6 ? n.toExponential(2) : Math.round(n).toLocaleString());

function text(s: string, x: number, y: number, size = 14, color = "#e8e8ee", align: CanvasTextAlign = "left") {
  ctx.fillStyle = color; ctx.font = `${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.fillText(s, x, y);
}

function render(r: Run, t: number) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);

  // HUD
  text(`セクター ${r.sector}/${r.p.sectors}・${STAGE_NAMES[r.stage]}`, 10, 22, 15);
  text(`シールド ${"◆".repeat(r.shields)}`, W - 10, 22, 15, "#7fd4ff", "right");
  text(`キャンセル ${r.cancels}`, W - 10, 42, 13, "#bbb", "right");
  const pct = Math.min(1, r.target ? r.score / r.target : 1);
  ctx.fillStyle = "#222"; ctx.fillRect(10, 32, 260, 10);
  ctx.fillStyle = pct >= 1 ? "#3ecf7a" : "#f5a524"; ctx.fillRect(10, 32, 260 * pct, 10);
  text(`${fmt(r.score)} / ${fmt(r.target)}`, 10, 58, 13, "#ddd");

  // defense line
  ctx.strokeStyle = "#a33"; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(0, LINE_Y); ctx.lineTo(W, LINE_Y); ctx.stroke(); ctx.setLineDash([]);

  // enemies (front row outlined; telegraphing enemies blink red)
  const front = new Set(frontEnemies(r.enemies).map(e => e.id));
  const warned = new Set(r.warns.map(w => w.id));
  for (const e of r.enemies) {
    if (!e.alive) continue;
    const b = enemyRect(r, e);
    drawEnemy(e, b.x, b.y, ENEMY);
    if (front.has(e.id)) { ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.5; ctx.strokeRect(b.x - 4, b.y - 4, ENEMY + 8, ENEMY + 8); }
    if (warned.has(e.id) && Math.floor(t * 12) % 2 === 0) {
      ctx.fillStyle = "rgba(255,40,40,.55)"; ctx.fillRect(b.x - 4, b.y - 4, ENEMY + 8, ENEMY + 8);
      ctx.fillStyle = "rgba(255,60,60,.25)"; ctx.fillRect(b.x + ENEMY / 2 - 2, b.y + ENEMY, 4, H);
    }
  }

  // bullets
  ctx.fillStyle = "#fff";
  if (r.bullet) ctx.fillRect(r.bullet.x - 1.5, r.bullet.y - 8, 3, 10);
  ctx.fillStyle = "#ff6b6b";
  for (const b of r.ebullets) ctx.fillRect(b.x - 2.5, b.y - 6, 5, 12);

  // player
  if (!(r.invuln > 0 && Math.floor(t * 16) % 2 === 0)) {
    if (ship) ctx.drawImage(ship, r.x - 20, PLAYER_Y - 20, 40, 40);
    else { ctx.fillStyle = "#4cf"; ctx.fillRect(r.x - PLAYER_W / 2, PLAYER_Y - 10, PLAYER_W, 20); }
  }

  // queue (hand) panel
  const qy = 588, slot = 36, gap = 6, qx = 10;
  ctx.fillStyle = "#11141c"; ctx.fillRect(0, qy - 6, W, H - qy + 6);
  for (let i = 0; i < r.p.queue; i++) {
    const x = qx + i * (slot + gap);
    ctx.strokeStyle = "#445"; ctx.lineWidth = 1; ctx.strokeRect(x, qy, slot, slot);
    const k = r.queue[i];
    if (k) drawEnemy(k, x + 4, qy + 4, slot - 8);
  }
  const px = qx + r.p.queue * (slot + gap) + 4;
  if (r.queue.length > 0) {
    const pv = evaluateHand(r.queue, r.p, { sweep: false });
    text(`いま: ${HAND_NAMES[pv.hand]}${pv.bonuses.length ? "＋" + pv.bonuses.map(b => BONUS_NAMES[b]).join("・") : ""}`, px, qy + 15, 13);
    text(`予想 ${fmt(pv.score)}`, px, qy + 33, 13, "#f5a524");
  } else text("キューは空", px, qy + 22, 13, "#777");

  // last hand breakdown
  if (r.lastHand && r.lastHandT > 0) {
    const h = r.lastHand, a = Math.min(1, r.lastHandT);
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(10,12,20,.85)"; ctx.fillRect(40, 250, W - 80, 74);
    text(`${HAND_NAMES[h.hand]}${h.bonuses.length ? "＋" + h.bonuses.map(b => BONUS_NAMES[b]).join("・") : ""}`, W / 2, 274, 18, "#fff", "center");
    const chips = `${h.baseChips}+${h.killChips}${h.bonusChips ? "+" + h.bonusChips : ""}`;
    const mult = `${h.baseMult}${h.bonusMult ? "+" + h.bonusMult : ""}`;
    text(`(${chips}) × ${mult}${h.xmult !== 1 ? " × " + h.xmult : ""} = ${fmt(h.score)}`, W / 2, 302, 16, "#f5a524", "center");
    ctx.globalAlpha = 1;
  }

  // overlays
  const overlay = (lines: [string, number, string?][]) => {
    const h = lines.length * 28 + 30;
    ctx.fillStyle = "rgba(0,0,0,.78)"; ctx.fillRect(30, 340 - h / 2, W - 60, h);
    lines.forEach(([s, size, c], i) => text(s, W / 2, 340 - h / 2 + 38 + i * 28, size, c ?? "#fff", "center"));
  };
  if (r.phase === "preview") overlay([
    [`セクター ${r.sector}・${STAGE_NAMES[r.stage]}`, 22],
    [`目標スコア ${fmt(r.target)}`, 18, "#f5a524"],
    ["隊列を見て狙う順番を決めよう", 14, "#bbb"],
    ["Enter / Space で開始", 14, "#9cf"],
  ]);
  if (r.phase === "clear") overlay([["ステージクリア！", 24, "#3ecf7a"], [`スコア ${fmt(r.score)} / ${fmt(r.target)}`, 16], ["Enter / Space で次へ", 14, "#9cf"]]);
  if (r.phase === "over" || r.phase === "win") {
    const causes = { shot: "敵弾でシールドが尽きた", line: "隊列が防衛線に到達", wiped: "撃てる敵がいなくなった" };
    const top = Object.entries(r.stats.hands).sort((a, b) => b[1]! - a[1]!).slice(0, 4).map(([h, n]) => `${HAND_NAMES[h as keyof typeof HAND_NAMES]}×${n}`).join("  ");
    overlay(r.phase === "win"
      ? [["本編クリア！", 26, "#3ecf7a"], [`役: ${top}`, 13, "#ddd"], ["Enter / Space でもう一度", 14, "#9cf"]]
      : [["ゲームオーバー", 26, "#ff6b6b"], [`死因: ${causes[r.cause!]}`, 15], [`あと ${fmt(Math.max(0, r.target - r.score))} 点足りなかった`, 15, "#f5a524"],
         [`到達: セクター ${r.sector}・${STAGE_NAMES[r.stage]}`, 14, "#ddd"], [`役: ${top || "なし"}`, 13, "#ddd"], ["Enter / Space でもう一度", 14, "#9cf"]]);
  }
}

// ---- run report (§11 metrics, copyable) ----
let reported = false;
function report(r: Run) {
  const counts = Object.values(r.stats.hands).reduce((s, n) => s + n!, 0) || 1;
  const rates = Object.fromEntries(Object.entries(r.stats.hands).map(([h, n]) => [HAND_NAMES[h as keyof typeof HAND_NAMES], `${n}回 (${Math.round((n! / counts) * 100)}%)`]));
  const data = {
    結果: r.phase === "win" ? "本編クリア" : `ゲームオーバー（${r.cause}）`, 到達: `セクター${r.sector}・${STAGE_NAMES[r.stage]}`,
    不足: Math.max(0, r.target - r.score), 役: rates,
    位置役: Object.fromEntries(Object.entries(r.stats.bonuses).map(([b, n]) => [BONUS_NAMES[b as keyof typeof BONUS_NAMES], n])),
    キャンセル使用: r.stats.cancelsUsed, シード: r.p.seed, クエリ: toQuery(r.p) || "(初期値)",
    ハンド履歴: r.history.map(h => `${h.sector}-${STAGE_NAMES[h.stage]} ${HAND_NAMES[h.hand]}${h.bonuses.length ? "+" + h.bonuses.map(b => BONUS_NAMES[b]).join("・") : ""} ${h.score}`),
  };
  document.querySelector("#report")!.textContent = JSON.stringify(data, null, 1);
  (document.querySelector("#report-box") as HTMLDetailsElement).open = true;
}

// ---- param panel: edit the query directly ----
function buildPanel() {
  const table = document.querySelector<HTMLTableElement>("#param-table")!;
  let group = "";
  for (const key of Object.keys(DEFS) as (keyof Params)[]) {
    const d = DEFS[key];
    if (d.group !== group) { group = d.group; table.insertAdjacentHTML("beforeend", `<tr><th colspan="2">${group}</th></tr>`); }
    const tr = document.createElement("tr");
    const shown = key === "seed" ? String(run.p.seed) : formatValue(urlParams[key]);
    tr.innerHTML = `<td title="初期値: ${formatValue(DEFAULTS[key])}">${key}</td><td><input name="${key}" value="${shown}" title="${d.desc}（初期値 ${formatValue(DEFAULTS[key])}）" /><div style="color:#889;font-size:11px">${d.desc}</div></td>`;
    const input = tr.querySelector("input")!;
    input.addEventListener("input", () => input.classList.toggle("changed", input.value !== shown));
    input.addEventListener("keydown", e => { if (e.key === "Enter") apply(); });
    table.append(tr);
  }
  document.querySelector("#query")!.textContent = location.search || "(なし＝初期値)";
  document.querySelector("#apply")!.addEventListener("click", apply);
  document.querySelector("#fix-seed")!.addEventListener("click", () => {
    const q = new URLSearchParams(location.search); q.set("seed", String(run.p.seed)); location.search = q.toString();
  });
}
function apply() {
  const q = new URLSearchParams();
  for (const input of document.querySelectorAll<HTMLInputElement>("#param-table input")) {
    const key = input.name as keyof Params;
    const v = input.value.trim();
    if (key === "seed") { if (urlParams.seed || v !== String(run.p.seed)) q.set("seed", v); continue; }
    if (v !== "" && v !== formatValue(DEFAULTS[key])) q.set(key, v);
  }
  if (new URLSearchParams(location.search).has("test")) q.set("test", "");
  location.search = q.toString();
}
buildPanel();

// ---- loop ----
let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  const advance = pressed.has("Enter") || (pressed.has(" ") && run.phase !== "play");
  const input = {
    dx: (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0),
    fire: keys.has(" ") && !advance, cancel: pressed.has("x") || pressed.has("c"), advance,
  };
  pressed = new Set();
  if (advance && (run.phase === "over" || run.phase === "win")) { run = createRun(runParams()); reported = false; }
  else run = update(run, input, dt);
  if ((run.phase === "over" || run.phase === "win") && !reported) { report(run); reported = true; }

  render(run, now / 1000);
  Object.assign(canvas.dataset, {
    phase: run.phase, score: String(run.score), target: String(run.target), queue: String(run.queue.length),
    shields: String(run.shields), cancels: String(run.cancels), alive: String(run.enemies.filter(e => e.alive).length),
    sector: String(run.sector), stage: String(run.stage), x: run.x.toFixed(1), hand: run.lastHand?.hand ?? "", seed: String(run.p.seed),
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

