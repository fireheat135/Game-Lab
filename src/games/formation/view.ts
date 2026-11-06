// Canvas rendering for FORMATION HAND (deep-sea theme). Reads Run state; never changes it.
// Layout rule: nothing is drawn over the formation while the player is deciding what to shoot.
import { tinted } from "../../engine/sprites";
import { evaluateHand, type HandResult } from "./hand";
import { frontEnemies } from "./formation";
import { GLOWS, SECTORS, bonusName, handName, stageAt } from "./rules";
import { bestShot, enemyRect, layout, H, LINE_Y, PLAYER_W, PLAYER_Y, W, type Run } from "./run";

export interface Sprites { creatures: Map<number, HTMLImageElement>; sub?: HTMLImageElement }
export interface ViewOptions { touch: boolean } // touch devices get button names instead of key names

const INK = "#e8f1ff", DIM = "#9fb3d3", GOLD = "#ffcf5a", DANGER = "#ff6b6b", OK = "#4fe3a1", LINK = "#9cf";
const MIN_FONT = 14, QUEUE_Y = 588;

export const fmt = (n: number) => (n >= 1e6 ? n.toExponential(2) : Math.round(n).toLocaleString());
const handLabel = (h: HandResult) => handName(h.hand) + (h.bonuses.length ? "＋" + h.bonuses.map(bonusName).join("・") : "");
const formula = (h: HandResult) =>
  `(${h.baseChips}+${h.killChips}${h.bonusChips ? "+" + h.bonusChips : ""}) × ${h.baseMult}${h.bonusMult ? "+" + h.bonusMult : ""}${h.xmult !== 1 ? " × " + h.xmult : ""} = ${fmt(h.score)}`;
export const placeName = (r: Run) => `深度 ${SECTORS[r.sector - 1].depth}m（${r.sector}/${r.p.sectors}）・${stageAt(r.stage).name}`;

export function createView(ctx: CanvasRenderingContext2D, sprites: Sprites, opts: ViewOptions) {
  const key = { confirm: opts.touch ? "「決定」" : "Enter", pause: opts.touch ? "「一時停止」" : "P", cancel: opts.touch ? "" : "（X）" };

  const text = (s: string, x: number, y: number, size = MIN_FONT, color = INK, align: CanvasTextAlign = "left", weight = "") => {
    ctx.fillStyle = color; ctx.font = `${weight} ${Math.max(size, MIN_FONT)}px system-ui, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    ctx.fillText(s, x, y);
  };

  function creature(kind: number, color: number, x: number, y: number, s: number) {
    const glow = GLOWS[color % GLOWS.length];
    const img = sprites.creatures.get(kind);
    if (img) {
      ctx.save(); ctx.shadowColor = glow.hex; ctx.shadowBlur = 10;
      ctx.drawImage(tinted(img, glow.hex), x, y, s, s);
      ctx.restore();
    } else {
      ctx.fillStyle = glow.hex; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.42, 0, Math.PI * 2); ctx.fill();
    }
    // rank badge (bottom-right) and suit mark (top-left): readable without color vision
    const r = Math.max(7, s * 0.22);
    ctx.fillStyle = "rgba(4,10,24,.85)";
    ctx.beginPath(); ctx.arc(x + s - r * 0.6, y + s - r * 0.6, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.5, y + r * 0.5, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.font = `bold ${Math.round(r * 1.5)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = INK; ctx.fillText(String(kind), x + s - r * 0.6, y + s - r * 0.55);
    ctx.font = `${Math.round(r * 1.1)}px system-ui, sans-serif`; ctx.fillStyle = glow.hex; ctx.fillText(glow.mark, x + r * 0.5, y + r * 0.55);
  }

  function background(t: number) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#06203d"); g.addColorStop(1, "#010612");
    ctx.fillStyle = g; ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.fillStyle = "rgba(160,210,255,.18)";
    for (let i = 0; i < 40; i++) { // drifting marine snow, deterministic from time
      const x = (i * 97.3 + Math.sin(t * 0.3 + i) * 12) % W, y = (i * 53.1 + t * (8 + (i % 5) * 3)) % H;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function hud(r: Run) {
    text(placeName(r), 10, 22, 15, INK, "left", "600");
    text("◆".repeat(r.shields) + "◇".repeat(Math.max(0, r.p.shields - r.shields)), W - 10, 22, 16, "#7fd4ff", "right");
    text(`キャンセル ${r.cancels}${key.cancel}`, W - 10, 44, MIN_FONT, DIM, "right");
    const pct = Math.min(1, r.target ? r.score / r.target : 1);
    ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(10, 32, 230, 10);
    ctx.fillStyle = pct >= 1 ? OK : GOLD; ctx.fillRect(10, 32, 230 * pct, 10);
    text(`${fmt(r.score)} / ${fmt(r.target)}`, 10, 62);
    // last hand result: one line above the formation instead of a box over it
    if (r.phase === "play" && r.lastHand && r.lastHandT > 0) {
      ctx.globalAlpha = Math.min(1, r.lastHandT);
      text(`${handLabel(r.lastHand)}  ${formula(r.lastHand)}`, W - 10, 66, MIN_FONT, GOLD, "right", "600");
      ctx.globalAlpha = 1;
    }
  }

  function formation(r: Run, t: number) {
    const g = layout(r.p);
    const front = new Set(frontEnemies(r.enemies).map(e => e.id));
    const warned = new Set(r.warns.map(w => w.id));
    const hint = r.p.hints && r.phase === "play" ? bestShot(r) : null;
    const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 * 3); // 3 Hz: readable, not strobing
    for (const e of r.enemies) {
      if (!e.alive) continue;
      const b = enemyRect(r, e);
      creature(e.kind, e.color, b.x, b.y, g.enemy);
      if (e.hp > 1) { // armor: remaining hits, on a dark chip above the sprite
        ctx.fillStyle = "rgba(4,10,24,.85)"; ctx.fillRect(b.x + b.w - 26, b.y - 14, 28, 16);
        text(`×${e.hp}`, b.x + b.w, b.y, MIN_FONT, INK, "right", "bold");
      }
      if (front.has(e.id)) {
        ctx.strokeStyle = e.id === hint ? GOLD : "rgba(255,255,255,.55)"; ctx.lineWidth = e.id === hint ? 2.5 : 1;
        ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
      }
      if (warned.has(e.id)) { // telegraph: pulsing red frame + aim line, the creature stays visible
        ctx.strokeStyle = `rgba(255,70,70,${pulse})`; ctx.lineWidth = 3; ctx.strokeRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
        ctx.strokeStyle = `rgba(255,90,90,${0.45 * pulse + 0.1})`; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(b.x + b.w / 2, b.y + b.h + 4); ctx.lineTo(b.x + b.w / 2, H); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (const f of r.effects) { // kill burst: expanding glow ring
      const k = 1 - f.t / 0.45;
      ctx.strokeStyle = GLOWS[f.color % GLOWS.length].hex; ctx.globalAlpha = Math.max(0, 1 - k); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, 8 + k * 26, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  function actors(r: Run, t: number) {
    ctx.strokeStyle = "rgba(255,90,90,.6)"; ctx.lineWidth = 1; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(0, LINE_Y); ctx.lineTo(W, LINE_Y); ctx.stroke(); ctx.setLineDash([]);
    if (r.bullet) { ctx.fillStyle = "#bff6ff"; ctx.fillRect(r.bullet.x - 1.5, r.bullet.y - 9, 3, 11); }
    ctx.fillStyle = DANGER;
    for (const b of r.ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); }
    const blinking = r.phase === "play" && r.invuln > 0 && Math.floor(t * 12) % 2 === 0;
    if (blinking) return;
    if (sprites.sub) ctx.drawImage(sprites.sub, r.x - 22, PLAYER_Y - 24, 44, 44);
    else { ctx.fillStyle = GOLD; ctx.fillRect(r.x - PLAYER_W / 2, PLAYER_Y - 10, PLAYER_W, 20); }
  }

  function queuePanel(r: Run) {
    const slot = 36, gap = 6, x0 = 10;
    ctx.fillStyle = "rgba(2,8,20,.92)"; ctx.fillRect(0, QUEUE_Y - 8, W, H - QUEUE_Y + 8);
    for (let i = 0; i < r.p.queue; i++) {
      const x = x0 + i * (slot + gap);
      ctx.strokeStyle = "rgba(142,163,196,.5)"; ctx.lineWidth = 1; ctx.strokeRect(x, QUEUE_Y, slot, slot);
      const k = r.queue[i];
      if (k) creature(k.kind, k.color, x + 3, QUEUE_Y + 3, slot - 6);
    }
    const tx = x0 + r.p.queue * (slot + gap) + 4;
    if (r.queue.length === 0) { text("キュー：撃った順に入る", tx, QUEUE_Y + 23, MIN_FONT, DIM); return; }
    const preview = evaluateHand(r.queue, r.p, { sweep: false });
    text(`いま：${handLabel(preview)}`, tx, QUEUE_Y + 15);
    text(`予想 ${fmt(preview.score)}`, tx, QUEUE_Y + 34, MIN_FONT, GOLD);
  }

  /** Message box in the lower half, so the formation stays visible (judgement needs the full picture). */
  function message(lines: [string, number, string?][]) {
    const h = lines.length * 27 + 24, y0 = 500 - h;
    ctx.fillStyle = "rgba(2,8,20,.88)"; ctx.fillRect(24, y0, W - 48, h);
    lines.forEach(([s, size, c], i) => text(s, W / 2, y0 + 32 + i * 27, size, c ?? INK, "center"));
  }

  function overlays(r: Run, paused: boolean) {
    if (paused) return message([["一時停止中", 22], [`${key.pause} で再開`, MIN_FONT, LINK]]);
    if (r.phase === "preview") return message([
      [placeName(r), 18], [`目標スコア ${fmt(r.target)}`, 18, GOLD],
      ["群れを見て、撃つ順番（＝役）を考えよう", MIN_FONT, DIM], [`${key.confirm} で潜航開始`, 15, LINK],
    ]);
    const last: [string, number, string?][] = r.lastHand ? [[`最後の役：${handLabel(r.lastHand)} ${fmt(r.lastHand.score)}`, MIN_FONT, DIM]] : [];
    if (r.phase === "clear") return message([["突破！", 24, OK], [`スコア ${fmt(r.score)} / ${fmt(r.target)}`, 16], ...last, [`${key.confirm} で次へ`, 15, LINK]]);
    if (r.phase !== "over" && r.phase !== "win") return;
    const top = Object.entries(r.stats.hands).sort((a, b) => b[1]! - a[1]!).slice(0, 3).map(([id, c]) => `${handName(id as never)}×${c}`).join("  ");
    const causes = { shot: "敵弾でシールドが尽きた", line: "群れが防衛線に到達", wiped: "撃てる相手がいなくなった" };
    message(r.phase === "win"
      ? [["最深部に到達！", 24, OK], [`役：${top}`, MIN_FONT], [`${key.confirm} でもう一度`, 15, LINK]]
      : [["ゲームオーバー", 24, DANGER], [`死因：${causes[r.cause!]}`, 16], [`あと ${fmt(Math.max(0, r.target - r.score))} 点`, 16, GOLD],
         [`到達：${placeName(r)}`, MIN_FONT, DIM], [`役：${top || "なし"}`, MIN_FONT, DIM], [`${key.confirm} でもう一度`, 15, LINK]]);
  }

  return {
    render(r: Run, t: number, paused: boolean) {
      // hit feedback: brief shake + red flash (game-feel), only while playing
      const hit = r.phase === "play" ? r.hitT : 0;
      ctx.save();
      if (hit > 0) ctx.translate(Math.sin(t * 90) * 4 * (hit / 0.35), Math.cos(t * 70) * 3 * (hit / 0.35));
      background(t); hud(r); formation(r, t); actors(r, t); queuePanel(r);
      ctx.restore();
      if (hit > 0) { ctx.fillStyle = `rgba(255,40,40,${hit * 0.9})`; ctx.fillRect(0, 0, W, H); }
      overlays(r, paused);
    },
  };
}
