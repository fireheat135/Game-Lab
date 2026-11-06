// Maps keys and on-screen buttons to named actions (input-systems skill: never read raw keys in game code).
// held(a): the action is down now. pressed(a): it went down since the last endFrame().

export type ActionMap<A extends string> = Record<A, readonly string[]>;

export interface Input<A extends string> {
  held(action: A): boolean;
  pressed(action: A): boolean;
  endFrame(): void;
}

/**
 * Pure press/release bookkeeping. Each physical source ("key:a", "pointer:3") is tracked separately,
 * so releasing one of two sources for the same action keeps the action held.
 */
export function createActionState<A extends string>() {
  const sourcesOf = new Map<A, Set<string>>();
  let fresh = new Set<A>();
  const held = (a: A) => (sourcesOf.get(a)?.size ?? 0) > 0;
  return {
    held,
    pressed: (a: A) => fresh.has(a),
    press(a: A, source: string) {
      if (!held(a)) fresh.add(a);
      if (!sourcesOf.has(a)) sourcesOf.set(a, new Set());
      sourcesOf.get(a)!.add(source);
    },
    release(source: string) { for (const set of sourcesOf.values()) set.delete(source); },
    releaseAll() { sourcesOf.clear(); },
    endFrame() { fresh = new Set(); },
  };
}

const normalize = (key: string) => (key.length === 1 ? key.toLowerCase() : key);
const INTERACTIVE = "input, textarea, select, button, a, summary";

/** Buttons with data-action="<action>" inside `pad` act like keys (touch / mouse). */
export function createInput<A extends string>(map: ActionMap<A>, pad?: Element | null): Input<A> {
  const actionOf = new Map<string, A>();
  for (const action of Object.keys(map) as A[]) for (const key of map[action]) actionOf.set(normalize(key), action);
  const state = createActionState<A>();

  addEventListener("keydown", e => {
    // Keys typed into the panel or used to activate a focused control belong to that control.
    if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
    const key = normalize(e.key), action = actionOf.get(key);
    if (action === undefined) return;
    e.preventDefault();
    state.press(action, `key:${key}`);
  });
  addEventListener("keyup", e => state.release(`key:${normalize(e.key)}`));
  addEventListener("blur", () => state.releaseAll());

  for (const button of pad?.querySelectorAll<HTMLElement>("[data-action]") ?? []) {
    const action = button.dataset.action as A;
    button.addEventListener("pointerdown", e => { e.preventDefault(); state.press(action, `pointer:${e.pointerId}`); }); // preventDefault: no focus steal
    for (const type of ["pointerup", "pointerleave", "pointercancel"] as const) {
      button.addEventListener(type, e => state.release(`pointer:${e.pointerId}`));
    }
    // Keyboard / assistive-tech activation (Tab + Enter/Space) fires a click with detail 0. Pointer clicks
    // (detail ≥ 1) were already handled by pointerdown, so they are skipped to avoid a double press.
    button.addEventListener("click", e => {
      if (e.detail !== 0) return;
      state.press(action, "click");
      state.release("click");
    });
  }
  return { held: state.held, pressed: state.pressed, endFrame: state.endFrame };
}
