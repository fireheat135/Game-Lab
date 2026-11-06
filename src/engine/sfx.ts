// Tiny synthesized sound effects (WebAudio): no audio files, nothing fetched, works under a 'self' CSP.
// Browsers only allow audio after a user gesture, so call unlock() from a key/pointer handler.

export type SfxName = "fire" | "pop" | "chain" | "hit" | "shuffle" | "clear" | "over" | "buy";

export function createSfx(enabled: boolean) {
  let ctx: AudioContext | null = null;
  const unlock = () => {
    if (!enabled || ctx) return;
    try { ctx = new AudioContext(); } catch { enabled = false; }
  };

  function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
    if (!ctx) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  /** `step` raises the pitch for chains (each chain step a fourth higher feels like climbing). */
  function play(name: SfxName, step = 0) {
    if (!ctx) return;
    const up = Math.pow(2, (5 * step) / 12);
    switch (name) {
      case "fire": return tone(880, 0, 0.05, "square", 0.04, 440);
      case "pop": return tone(330 * up, 0, 0.12, "triangle", 0.12, 160 * up);
      case "chain": tone(523 * up, 0, 0.12, "square", 0.08); return tone(784 * up, 0.06, 0.18, "triangle", 0.1);
      case "hit": return tone(140, 0, 0.3, "sawtooth", 0.15, 50);
      case "shuffle": return tone(600, 0, 0.35, "sine", 0.08, 120);
      case "clear": [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.2, "triangle", 0.1)); return;
      case "over": [392, 330, 262].forEach((f, i) => tone(f, i * 0.15, 0.3, "sawtooth", 0.08)); return;
      case "buy": return tone(988, 0, 0.1, "square", 0.06, 1319);
    }
  }
  return { unlock, play };
}
