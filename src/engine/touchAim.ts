// Phone controls: drag a finger on the canvas to aim (the ship follows), lift to fire once.
// Deliberate one-shot firing suits games where every shot costs something.

const ARRIVE_PX = 4;

/** Pure steering step: move toward `target`; when released and arrived, fire once. */
export function steerTo(x: number, target: number | null, released: boolean): { dx: number; fire: boolean; arrived: boolean } {
  if (target === null) return { dx: 0, fire: false, arrived: false };
  const diff = target - x;
  if (Math.abs(diff) <= ARRIVE_PX) return { dx: 0, fire: released, arrived: true };
  return { dx: Math.sign(diff), fire: false, arrived: false };
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
