import { createState, movePlayer, step, PLAYER_SIZE, type State } from "./game";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;
let state: State = createState(canvas.width, canvas.height);
const keys = new Set<string>();
addEventListener("keydown", e => { keys.add(e.key); if (state.over && e.key === " ") state = createState(canvas.width, canvas.height); });
addEventListener("keyup", e => keys.delete(e.key));

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  const dx = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
  state = movePlayer(state, dx * 260 * dt);
  const size = 14 + Math.random() * 16;
  const spawn = Math.random() < dt * 2.5 ? { x: Math.random() * (canvas.width - size), y: -size, size, speed: 120 + state.score * 4 } : undefined;
  state = step(state, dt, spawn);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4cf"; ctx.fillRect(state.player.x, state.player.y, PLAYER_SIZE, PLAYER_SIZE);
  ctx.fillStyle = "#f64"; for (const b of state.blocks) ctx.fillRect(b.x, b.y, b.size, b.size);
  ctx.fillStyle = "#eee"; ctx.font = "16px sans-serif"; ctx.fillText(`Score: ${state.score}`, 8, 20);
  if (state.over) ctx.fillText("GAME OVER - Space でリトライ", canvas.width / 2 - 110, canvas.height / 2);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
