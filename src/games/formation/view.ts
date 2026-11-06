// Canvas rendering for FORMATION HAND (deep-sea theme). Reads Run state; never changes it.
import { tinted } from "../../engine/sprites";
import { evaluateHand, type HandResult } from "./hand";
import { frontEnemies } from "./formation";
import { GLOWS, SECTORS, bonusName, handName, stageAt } from "./rules";
import { bestShot, enemyRect, layout, H, LINE_Y, PLAYER_W, PLAYER_Y, W, type Run } from "./run";

export interface Sprites { creatures: Map<number, HTMLImageElement>; sub?: HTMLImageElement }

const INK = "#e8f1ff", DIM = "#8ea3c4", GOLD = "#ffcf5a", DANGER = "#ff6b6b", OK = "#4fe3a1";
const QUEUE_Y = 588;

export const fmt = (n: number) => (n >= 1e6 ? n.toExponential(2) : Math.round(n).toLocaleString());
const handLabel = (h: HandResult) => handName(h.hand) + (h.bonuses.length ? "＋" + h.bonuses.map(bonusName).join("・") : "");
export const placeName = (r: Run) => `深度 ${SECTORS[r.sector - 1].depth}m（${r.sector}/${r.p.sectors}）・${stageAt(r.stage).name}`;

export function createView(ctx: CanvasRenderingContext2D, sprites: Sprites) {
  const text = (s: string, x: number, y: number, size = 14, color = INK, align: CanvasTextAlign = "left", weight = "") => {
    ctx.fillStyle = color; ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    ctx.fillText(s, x, y);
  };

  function creature(kind: number, color: number, x: number, y: number, s: number, badge = true) {
    const img = sprites.creatures.get(kind);
    const hex = GLOWS[color % GLOWS.length].hex;
    if (img) {
      ctx.save(); ctx.shadowColor = hex; ctx.shadowBlur = 10;
      ctx.drawImage(tinted(img, hex), x, y, s, s);
      ctx.restore();
    } else {
      ctx.fillStyle = hex; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.42, 0, Math.PI * 2); ctx.fill();
    }
    if (badge) { // rank number: recognition over recall, and works without color vision
      const r = Math.max(6, s * 0.2);
      ctx.fillStyle = "rgba(4,10,24,.85)"; ctx.beginPath(); ctx.arc(x + s - r * 0.6, y + s - r * 0.6, r, 0, Math.PI * 2); ctx.fill();
      text(String(kind), x + s - r * 0.6, y + s - r * 0.6 + r * 0.55, Math.round(r * 1.5), INK, "center", "bold");
    }
  }

  function background(t: number) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#06203d"); g.addColorStop(1, "#010612");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(160,210,255,.18)";
    for (let i = 0; i < 40; i++) { // drifting marine snow, deterministic from time
      const x = (i * 97.3 + Math.sin(t * 0.3 + i) * 12) % W, y = (i * 53.1 + t * (8 + (i % 5) * 3)) % H;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function hud(r: Run) {
    text(placeName(r), 10, 22, 15, INK, "left", "600");
    text("シールド " + "◆".repeat(r.shields), W - 10, 22, 15, "#7fd4ff", "right");
    text(`キャンセル ${r.cancels}（X）`, W - 10, 42, 13, DIM, "right");
    const pct = Math.min(1, r.target ? r.score / r.target : 1);
    ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(10, 32, 250, 10);
    ctx.fillStyle = pct >= 1 ? OK : GOLD; ctx.fillRect(10, 32, 250 * pct, 10);
    text(`${fmt(r.score)} / ${fmt(r.target)}`, 10, 62, 13, INK);
  }

  function formation(r: Run, t: number) {
    const g = layout(r.p);
    const front = new Set(frontEnemies(r.enemies).map(e => e.id));
    const warned = new Set(r.warns.map(w => w.id));
    const hint = r.p.hints && r.phase === "play" ? bestShot(r) : null;
    for (const e of r.enemies) {
      if (!e.alive) continue;
      const b = enemyRect(r, e);
      creature(e.kind, e.color, b.x, b.y, g.enemy);
      if (e.hp > 1) text(`×${e.hp}`, b.x + b.w, b.y + 2, 10, INK, "right");
      if (front.has(e.id)) {
        ctx.strokeStyle = e.id === hint ? GOLD : "rgba(255,255,255,.55)"; ctx.lineWidth = e.id === hint ? 2.5 : 1;
        ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
      }
      if (warned.has(e.id) && Math.floor(t * 12) % 2 === 0) { // telegraph: blink + aim line
        ctx.fillStyle = "rgba(255,60,60,.35)"; ctx.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
        ctx.fillStyle = "rgba(255,60,60,.22)"; ctx.fillRect(b.x + b.w / 2 - 2, b.y + b.h, 4, H);
      }
    }
  }

  function actors(r: Run, t: number) {
    ctx.strokeStyle = "rgba(255,90,90,.6)"; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(0, LINE_Y); ctx.lineTo(W, LINE_Y); ctx.stroke(); ctx.setLineDash([]);
    if (r.bullet) { ctx.fillStyle = "#bff6ff"; ctx.fillRect(r.bullet.x - 1.5, r.bullet.y - 9, 3, 11); }
    ctx.fillStyle = DANGER;
    for (const b of r.ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); }
    if (r.invuln > 0 && Math.floor(t * 16) % 2 === 0) return;
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
    if (r.queue.length === 0) { text("キューは空：撃った順に入ります", tx, QUEUE_Y + 22, 12, DIM); return; }
    const preview = evaluateHand(r.queue, r.p, { sweep: false });
    text(`いま：${handLabel(preview)}`, tx, QUEUE_Y + 15, 13);
    text(`予想 ${fmt(preview.score)}`, tx, QUEUE_Y + 33, 13, GOLD);
  }

  function handPopup(r: Run) {
    if (!r.lastHand || r.lastHandT <= 0) return;
    const h = r.lastHand;
    ctx.globalAlpha = Math.min(1, r.lastHandT);
    ctx.fillStyle = "rgba(2,8,20,.88)"; ctx.fillRect(40, 300, W - 80, 74);
    text(handLabel(h), W / 2, 326, 18, INK, "center", "600");
    const chips = `${h.baseChips}+${h.killChips}${h.bonusChips ? "+" + h.bonusChips : ""}`;
    const mult = `${h.baseMult}${h.bonusMult ? "+" + h.bonusMult : ""}`;
    text(`(${chips}) × ${mult}${h.xmult !== 1 ? " × " + h.xmult : ""} = ${fmt(h.score)}`, W / 2, 354, 16, GOLD, "center");
    ctx.globalAlpha = 1;
  }

  /** Message box in the lower half, so the formation stays visible (judgement needs the full picture). */
  function message(lines: [string, number, string?][]) {
    const h = lines.length * 26 + 24, y0 = 470 - h;
    ctx.fillStyle = "rgba(2,8,20,.86)"; ctx.fillRect(30, y0, W - 60, h);
    lines.forEach(([s, size, c], i) => text(s, W / 2, y0 + 32 + i * 26, size, c ?? INK, "center"));
  }

  function overlays(r: Run, paused: boolean) {
    if (paused) return message([["一時停止中", 22], ["P で再開", 14, DIM]]);
    if (r.phase === "preview") return message([
      [placeName(r), 18], [`目標スコア ${fmt(r.target)}`, 18, GOLD],
      ["群れを見て、撃つ順番（＝役）を考えよう", 13, DIM], ["Enter / Space で潜航開始", 14, "#9cf"],
    ]);
    if (r.phase === "clear") return message([["突破！", 24, OK], [`スコア ${fmt(r.score)} / ${fmt(r.target)}`, 16], ["Enter / Space で次へ", 14, "#9cf"]]);
    if (r.phase !== "over" && r.phase !== "win") return;
    const top = Object.entries(r.stats.hands).sort((a, b) => b[1]! - a[1]!).slice(0, 3).map(([id, c]) => `${handName(id as never)}×${c}`).join("  ");
    const causes = { shot: "敵弾でシールドが尽きた", line: "群れが防衛線に到達", wiped: "撃てる相手がいなくなった" };
    message(r.phase === "win"
      ? [["最深部に到達！", 24, OK], [`役：${top}`, 13], ["Enter / Space でもう一度", 14, "#9cf"]]
      : [["ゲームオーバー", 24, DANGER], [`死因：${causes[r.cause!]}`, 15], [`あと ${fmt(Math.max(0, r.target - r.score))} 点`, 15, GOLD],
         [`到達：${placeName(r)}`, 13, DIM], [`役：${top || "なし"}`, 13, DIM], ["Enter / Space でもう一度", 14, "#9cf"]]);
  }

  return {
    render(r: Run, t: number, paused: boolean) {
      background(t); hud(r); formation(r, t); actors(r, t); queuePanel(r); handPopup(r); overlays(r, paused);
    },
  };
}

