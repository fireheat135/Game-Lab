import { createState, movePlayer, step, mulberry32, PLAYER_SIZE, type Block, type State } from "./game";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;
let state: State = createState(canvas.width, canvas.height);
const keys = new Set<string>();

// URL options: ?seed=N fixes the RNG; ?test exposes deterministic hooks for e2e tests.
const params = new URLSearchParams(location.search);
const seed = params.get("seed");
const rand = seed !== null ? mulberry32(Number(seed)) : Math.random;
let forced: Block | undefined;
let calm = false;
// Test hooks exist only in the e2e build (VITE_E2E=1 is set by playwright.config.ts); Vite strips
// this block from normal builds, so the deployed game has no __gameTest.
if (import.meta.env.VITE_E2E && params.has("test")) {
  (window as unknown as { __gameTest: object }).__gameTest = {
    hitPlayer: () => { forced = { x: state.player.x, y: state.player.y, size: PLAYER_SIZE, speed: 0 }; },
    spawn: (x: number, y: number, speed: number) => { forced = { x, y, size: 20, speed }; },
    calm: () => { calm = true; state = { ...state, blocks: [] }; },
  };
}
addEventListener("keydown", e => { keys.add(e.key); if (state.over && e.key === " ") state = createState(canvas.width, canvas.height); });
addEventListener("keyup", e => keys.delete(e.key));

// Sprites generated with Codex (see tools/sprite.py). Falls back to rectangles until loaded.
function load(name: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}assets/${name}.png`;
  return img.decode().then(() => img);
}
let ship: HTMLImageElement | undefined;
let rock: HTMLImageElement | undefined;
Promise.all([load("ship"), load("rock")]).then(([s, r]) => { ship = s; rock = r; canvas.dataset.sprites = "ready"; });

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  const dx = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
  state = movePlayer(state, dx * 260 * dt);
  const size = 18 + rand() * 18;
  let spawn: Block | undefined = !calm && rand() < dt * 2.5 ? { x: rand() * (canvas.width - size), y: -size, size, speed: 120 + state.score * 4 } : undefined;
  if (forced) { spawn = forced; forced = undefined; }
  state = step(state, dt, spawn);

  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const { x, y } = state.player;
  if (ship) ctx.drawImage(ship, x - 6, y - 6, PLAYER_SIZE + 12, PLAYER_SIZE + 12);
  else { ctx.fillStyle = "#4cf"; ctx.fillRect(x, y, PLAYER_SIZE, PLAYER_SIZE); }
  for (const b of state.blocks) {
    if (rock) ctx.drawImage(rock, b.x, b.y, b.size, b.size);
    else { ctx.fillStyle = "#f64"; ctx.fillRect(b.x, b.y, b.size, b.size); }
  }
  ctx.fillStyle = "#eee"; ctx.font = "16px sans-serif"; ctx.fillText(`Score: ${state.score}`, 8, 20);
  if (state.over) ctx.fillText("GAME OVER - Space でリトライ", canvas.width / 2 - 110, canvas.height / 2);

  // Exposed for e2e tests.
  canvas.dataset.score = String(state.score);
  canvas.dataset.x = x.toFixed(1);
  canvas.dataset.over = String(state.over);
  canvas.dataset.blocks = String(state.blocks.length);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
