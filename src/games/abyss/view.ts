// Canvas rendering for ABYSS CHAIN. Reads Run state; never changes it.
// Layout rule: the swarm is never covered while the player decides; messages sit in the lower half.
import { tinted } from "../../engine/sprites";
import { cellAt, lowestRow, resolveShot } from "./grid";
import { GLOWS, STAGES_PER_DEPTH, bulletOf, type BulletId } from "./rules";
import { bottomY, columnAt, depthRow, layout, sinkPreview, H, LINE_Y, PLAYER_W, PLAYER_Y, W, type Run } from "./run";

/** touch: show button names instead of keys. minFont: smallest canvas font (px), raised on small screens. */
export interface ViewOptions { touch: boolean; minFont: () => number }
const INK = "#e8f1ff", DIM = "#9fb3d3", GOLD = "#ffcf5a", DANGER = "#ff6b6b", OK = "#4fe3a1", LINK = "#9cf";
const DECK_Y = 584;

export const fmt = (n: number) => (n >= 1e6 ? n.toExponential(2) : Math.round(n).toLocaleString());
export const placeName = (r: Run) => `深度 ${depthRow(r.depth).meters}m（${r.depth}/4）・${r.stage + 1}/${STAGES_PER_DEPTH}`;

export function createView(ctx: CanvasRenderingContext2D, sprites: Map<number, HTMLImageElement>, sub: () => HTMLImageElement | undefined, opts: ViewOptions) {
  const key = { confirm: opts.touch ? "画面タップ" : "Enter", pause: opts.touch ? "「一時停止」" : "P" };
  let MIN_FONT = 14;
  const text = (s: string, x: number, y: number, size = MIN_FONT, color = INK, align: CanvasTextAlign = "left", weight = "") => {
    ctx.fillStyle = color; ctx.font = `${weight} ${Math.max(size, MIN_FONT)}px system-ui, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = "alphabetic"; ctx.fillText(s, x, y);
  };

  function creature(color: number, x: number, y: number, s: number, armored: boolean) {
    const glow = GLOWS[color % GLOWS.length], img = sprites.get(color);
    ctx.save(); ctx.shadowColor = glow.hex; ctx.shadowBlur = 12;
    if (img) ctx.drawImage(tinted(img, glow.hex), x, y, s, s);
    else { ctx.fillStyle = glow.hex; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.42, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    if (armored) { ctx.strokeStyle = "#dfe8f5"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.52, 0, Math.PI * 2); ctx.stroke(); }
  }

  function bulletIcon(id: BulletId, x: number, y: number, size: number, active: boolean) {
    ctx.fillStyle = active ? "#1d3f6e" : "rgba(20,40,70,.8)"; ctx.strokeStyle = active ? GOLD : "rgba(142,163,196,.5)"; ctx.lineWidth = active ? 2 : 1;
    ctx.fillRect(x, y, size, size); ctx.strokeRect(x, y, size, size);
    ctx.fillStyle = INK; ctx.font = `bold ${Math.round(size * 0.55)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(bulletOf(id).icon, x + size / 2, y + size / 2 + 1);
  }

  function background(t: number, r: Run) {
    const deep = Math.min(1, (r.depth - 1) / 3);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgb(${6 - 4 * deep},${32 - 20 * deep},${61 - 35 * deep})`); g.addColorStop(1, "#010612");
    ctx.fillStyle = g; ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.fillStyle = "rgba(160,210,255,.16)";
    for (let i = 0; i < 40; i++) { const x = (i * 97.3 + Math.sin(t * 0.3 + i) * 12) % W, y = (i * 53.1 + t * (8 + (i % 5) * 3)) % H; ctx.fillRect(x, y, 2, 2); }
  }

  function hud(r: Run) {
    text(placeName(r), 10, 22, 15, INK, "left", "600");
    text("◆".repeat(r.shields) + "◇".repeat(Math.max(0, r.p.shields - r.shields)), W - 10, 22, 16, "#7fd4ff", "right");
    text(`スコア ${fmt(r.score)}`, 10, 46, MIN_FONT, DIM);
    text(`◎ ${r.gold}`, W - 10, 46, 15, GOLD, "right", "600");
    // danger gauge: how close the swarm is to the line
    const left = r.grid.cells.filter(Boolean).length;
    const danger = Math.min(1, Math.max(0, (bottomY(r) - 200) / (LINE_Y - 200)));
    ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(10, 56, 200, 8);
    ctx.fillStyle = danger > 0.75 ? DANGER : danger > 0.5 ? GOLD : OK; ctx.fillRect(10, 56, 200 * danger, 8);
    text(`残り ${left} 体`, 220, 66, MIN_FONT, DIM);
    if (r.lastChain && r.lastChain.t > 0) {
      ctx.globalAlpha = Math.min(1, r.lastChain.t);
      text(`${r.lastChain.steps}連鎖！ +${fmt(r.lastChain.score)}`, W - 10, 70, 18, GOLD, "right", "800");
      ctx.globalAlpha = 1;
    }
  }

  function swarm(r: Run, t: number) {
    const g = layout(r.p, r.grid.rows);
    // aim preview: which cells the NEXT bullet would pop first (recognition over recall, still your call)
    const col = columnAt(r, r.x);
    const next = r.deck.draw[0] ?? r.deck.discard[0];
    const preview = new Set<string>();
    if (r.p.hints && r.phase === "play" && col >= 0 && next && lowestRow(r.grid, col) >= 0) {
      const res = resolveShot(r.grid, next, col, { diagonal: r.parts.includes("diagonal"), chainMin: r.p.chainMin, base: r.p.base, resonance: r.parts.includes("resonance") });
      for (const p of res.steps[0]?.popped ?? []) preview.add(`${p.col},${p.row}`);
      ctx.fillStyle = "rgba(255,255,255,.05)"; ctx.fillRect(r.fx + col * g.cellW, r.fy, g.cellW, r.grid.rows * g.cellH);
    }
    const warned = new Set(r.warns.map(w => w.col));
    const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 6);
    for (let row = 0; row < r.grid.rows; row++) for (let c = 0; c < r.grid.cols; c++) {
      const cell = cellAt(r.grid, c, row);
      if (!cell) continue;
      const x = r.fx + c * g.cellW + (g.cellW - g.enemy) / 2, y = r.fy + row * g.cellH + (g.cellH - g.enemy) / 2;
      creature(cell.color, x, y, g.enemy, cell.hp > 1);
      if (preview.has(`${c},${row}`)) { ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, g.enemy + 4, g.enemy + 4); }
      if (warned.has(c) && lowestRow(r.grid, c) === row) {
        ctx.strokeStyle = `rgba(255,70,70,${pulse})`; ctx.lineWidth = 3; ctx.strokeRect(x - 4, y - 4, g.enemy + 8, g.enemy + 8);
        ctx.strokeStyle = `rgba(255,90,90,${0.45 * pulse + 0.1})`; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(x + g.enemy / 2, y + g.enemy + 4); ctx.lineTo(x + g.enemy / 2, H); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (preview.size) text(`${preview.size}体`, r.fx + (col + 0.5) * g.cellW, r.fy - 6, MIN_FONT, GOLD, "center", "700");
    for (const f of r.effects) { // pop bursts: bigger and brighter with chain step
      const k = 1 - f.t / 0.6, hex = GLOWS[f.color % GLOWS.length].hex;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = hex; ctx.lineWidth = 3 + f.step; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + k * (22 + f.step * 10), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = hex;
      for (let i = 0; i < 6; i++) { const a = i * 1.047 + f.step; ctx.fillRect(f.x + Math.cos(a) * k * 34, f.y + Math.sin(a) * k * 34, 3, 3); }
      ctx.globalAlpha = 1;
    }
    for (const f of r.floaters) { // chain labels where the chain happened (reward where the eyes are)
      ctx.globalAlpha = Math.min(1, f.t * 2);
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(2,8,20,.85)"; ctx.font = `800 ${f.size}px system-ui, sans-serif`; ctx.textAlign = "center";
      ctx.strokeText(f.text, f.x, f.y); text(f.text, f.x, f.y, f.size, GOLD, "center", "800");
      ctx.globalAlpha = 1;
    }
  }

  /** Where the swarm's bottom will be after the next shot: the predictable form of "the 11th shot kills you". */
  function sinkLine(r: Run) {
    if (r.phase !== "play" || !r.grid.cells.some(Boolean)) return;
    const next = sinkPreview(r), lethal = next.y >= LINE_Y, y = Math.min(next.y, LINE_Y);
    const color = lethal ? DANGER : next.reshuffle ? GOLD : "rgba(159,179,211,.6)";
    ctx.strokeStyle = color; ctx.lineWidth = lethal || next.reshuffle ? 2 : 1; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(r.fx, y); ctx.lineTo(r.fx + r.grid.cols * layout(r.p, r.grid.rows).cellW, y); ctx.stroke(); ctx.setLineDash([]);
    if (next.reshuffle || lethal) text(lethal ? "次の1発で防衛線を越える！" : "次は切り直し：ここまで沈む", W / 2, y - 6, MIN_FONT, color, "center", "700");
  }

  function actors(r: Run, t: number) {
    ctx.strokeStyle = "rgba(255,90,90,.6)"; ctx.lineWidth = 1; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(0, LINE_Y); ctx.lineTo(W, LINE_Y); ctx.stroke(); ctx.setLineDash([]);
    if (r.bullet) { text(bulletOf(r.bullet.type).icon, r.bullet.x, r.bullet.y, 18, "#bff6ff", "center", "bold"); }
    ctx.fillStyle = DANGER;
    for (const b of r.ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); }
    if (r.phase === "play" && r.invuln > 0 && Math.floor(t * 12) % 2 === 0) return;
    const img = sub();
    if (img) ctx.drawImage(img, r.x - 22, PLAYER_Y - 24, 44, 44);
    else { ctx.fillStyle = GOLD; ctx.fillRect(r.x - PLAYER_W / 2, PLAYER_Y - 10, PLAYER_W, 20); }
  }

  function deckPanel(r: Run) {
    ctx.fillStyle = "rgba(2,8,20,.92)"; ctx.fillRect(0, DECK_Y - 8, W, H - DECK_Y + 8);
    const upcoming = r.deck.draw.slice(0, r.p.preview);
    upcoming.forEach((id, i) => bulletIcon(id, 10 + i * 46, DECK_Y, i === 0 ? 40 : 34, i === 0));
    const x = 14 + Math.max(1, upcoming.length) * 46;
    if (upcoming[0]) text(`次：${bulletOf(upcoming[0]).name}`, x, DECK_Y + 16, MIN_FONT, INK, "left", "600");
    const left = r.deck.draw.length;
    text(left > 0 ? `あと${left}発で切り直し` : "次の1発で切り直し！", x, DECK_Y + 36, MIN_FONT, left > 1 ? DIM : DANGER, "left", left > 1 ? "" : "700");
  }

  function message(lines: [string, number, string?][]) {
    const h = lines.length * 27 + 24, y0 = 500 - h;
    ctx.fillStyle = "rgba(2,8,20,.88)"; ctx.fillRect(24, y0, W - 48, h);
    lines.forEach(([s, size, c], i) => text(s, W / 2, y0 + 32 + i * 27, size, c ?? INK, "center"));
  }

  function overlays(r: Run, paused: boolean) {
    if (paused) return message([["一時停止中", 22], [`${key.pause} で再開`, MIN_FONT, LINK]]);
    if (r.phase === "preview") return message([
      [placeName(r), 18], ["同じ色はまとめて弾け、落ちて4つそろうと連鎖", MIN_FONT, DIM],
      [opts.touch ? "画面下を左右になぞって狙い、離すと発射" : "撃つたびに群れは沈む。点線＝次の1発後", MIN_FONT, DIM], [`${key.confirm} で潜航開始`, 15, LINK],
    ]);
    if (r.phase === "clear") return message([["殲滅！", 24, OK], [`+${r.p.gold} ◎（連鎖ボーナス込みで ◎ ${r.gold}）`, 16, GOLD], [`${key.confirm} でショップへ`, 15, LINK]]);
    if (r.phase === "shop") return;
    if (r.phase === "over") return message([
      ["ゲームオーバー", 24, DANGER], [r.cause === "line" ? "群れが防衛線に到達" : "敵弾でシールドが尽きた", 16],
      [`到達：${placeName(r)}`, MIN_FONT, DIM], [`最大 ${r.stats.bestChain}連鎖・撃破 ${r.stats.kills}・スコア ${fmt(r.score)}`, MIN_FONT, DIM], [`${key.confirm} でもう一度`, 15, LINK],
    ]);
    if (r.phase === "win") return message([["最深部に到達！", 24, OK], [`スコア ${fmt(r.score)}・最大 ${r.stats.bestChain}連鎖`, 16], [`${key.confirm} でもう一度`, 15, LINK]]);
  }

  return {
    render(r: Run, t: number, paused: boolean) {
      const hit = r.phase === "play" ? r.hitT : 0;
      MIN_FONT = opts.minFont();
      const chainShake = r.lastChain && r.lastChain.t > 1.3 ? (r.lastChain.t - 1.3) * 18 * Math.min(5, r.lastChain.steps) : 0;
      const shake = hit * 11 + chainShake;
      ctx.save();
      if (shake > 0) ctx.translate(Math.sin(t * 90) * shake, Math.cos(t * 70) * shake * 0.7);
      background(t, r); hud(r); swarm(r, t); sinkLine(r); actors(r, t); deckPanel(r);
      ctx.restore();
      if (hit > 0) { ctx.fillStyle = `rgba(255,40,40,${hit * 0.9})`; ctx.fillRect(0, 0, W, H); }
      if (r.freezeT > 0) { ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(0, 0, W, H); }
      overlays(r, paused);
    },
  };
}

