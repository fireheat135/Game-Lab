// Pure game logic (testable without DOM): a player dodges falling blocks.
export interface Vec { x: number; y: number }
export interface Block extends Vec { size: number; speed: number }
export interface State { width: number; height: number; player: Vec; blocks: Block[]; score: number; over: boolean }

export const PLAYER_SIZE = 20;

export function createState(width: number, height: number): State {
  return { width, height, player: { x: width / 2 - PLAYER_SIZE / 2, y: height - PLAYER_SIZE - 8 }, blocks: [], score: 0, over: false };
}

export function movePlayer(s: State, dx: number): State {
  const x = Math.min(Math.max(s.player.x + dx, 0), s.width - PLAYER_SIZE);
  return { ...s, player: { ...s.player, x } };
}

export function collides(p: Vec, b: Block): boolean {
  return p.x < b.x + b.size && p.x + PLAYER_SIZE > b.x && p.y < b.y + b.size && p.y + PLAYER_SIZE > b.y;
}

export function step(s: State, dt: number, spawn?: Block): State {
  if (s.over) return s;
  const moved = s.blocks.map(b => ({ ...b, y: b.y + b.speed * dt }));
  const passed = moved.filter(b => b.y > s.height).length;
  const blocks = moved.filter(b => b.y <= s.height);
  if (spawn) blocks.push(spawn);
  const over = blocks.some(b => collides(s.player, b));
  return { ...s, blocks, score: s.score + passed, over };
}
