// Phone controls: drag a finger on the canvas to aim (the ship follows), lift to fire once.
// Deliberate one-shot firing suits games where every shot costs something.

/**
 * Pure steering step toward `target` (clamped to [minX, maxX], the ship's range). dx is a fraction of a full
 * step (`maxStep` px this frame), shortened on the last step so the ship never overshoots. When released
 * and arrived, fire.
 */
export function steerTo(x: number, target: number | null, released: boolean, maxStep: number, minX: number, maxX: number): { dx: number; fire: boolean; arrived: boolean } {
  if (target === null) return { dx: 0, fire: false, arrived: false };
  const diff = Math.min(Math.max(target, minX), maxX) - x;
  if (Math.abs(diff) <= 0.5) return { dx: 0, fire: released, arrived: true };
  return { dx: maxStep > 0 ? Math.max(-1, Math.min(1, diff / maxStep)) : 0, fire: false, arrived: false };
}

export interface TouchAim {
  /** Canvas-space x of the finger (or the last release point while the shot is pending); null when idle. */
  target(): number | null;
  released(): boolean;
  /** True once per tap/release (also used to advance screens on phones). */
  takeTap(): boolean;
  /** Call after the shot was fired. */
  done(): void;
}

export function attachTouchAim(canvas: HTMLCanvasElement): TouchAim {
  let target: number | null = null, released = false, tapped = false;
  const toCanvasX = (clientX: number) => {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * canvas.width;
  };
  canvas.addEventListener("pointerdown", e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); target = toCanvasX(e.clientX); released = false; });
  canvas.addEventListener("pointermove", e => { if (target !== null && !released) target = toCanvasX(e.clientX); });
  canvas.addEventListener("pointerup", e => { if (target === null) return; target = toCanvasX(e.clientX); released = true; tapped = true; });
  canvas.addEventListener("pointercancel", () => { target = null; released = false; });
  canvas.addEventListener("contextmenu", e => e.preventDefault()); // no long-press menu
  return {
    target: () => target,
    released: () => released,
    takeTap: () => { const t = tapped; tapped = false; return t; },
    done: () => { target = null; released = false; },
  };
}
