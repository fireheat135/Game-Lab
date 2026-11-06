// Seeded RNG as a pure function, so game state stays a plain serializable value.
// rnd(seed) → [value in [0, 1), nextSeed]. Same algorithm as mulberry32.

export function rnd(seed: number): [value: number, nextSeed: number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Integer in [0, n). */
export function rndInt(seed: number, n: number): [value: number, nextSeed: number] {
  const [v, next] = rnd(seed);
  return [Math.floor(v * n), next];
}

export function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 2 ** 31);
}
