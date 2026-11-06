// Maps keys and on-screen buttons to named actions (input-systems skill: never read raw keys in game code).
// held(a): the action is down now. pressed(a): it went down since the last endFrame().

export type ActionMap<A extends string> = Record<A, readonly string[]>;

export interface Input<A extends string> {
  held(action: A): boolean;
  pressed(action: A): boolean;
  endFrame(): void;
}

const normalize = (key: string) => (key.length === 1 ? key.toLowerCase() : key);

/** Buttons with data-action="<action>" inside `pad` act like keys (touch / mouse). */
export function createInput<A extends string>(map: ActionMap<A>, pad?: Element | null): Input<A> {
  const actionOf = new Map<string, A>();
  for (const action of Object.keys(map) as A[]) for (const key of map[action]) actionOf.set(normalize(key), action);
  const down = new Set<A>();
  let fresh = new Set<A>();
  const press = (a: A) => { if (!down.has(a)) fresh.add(a); down.add(a); };

  addEventListener("keydown", e => {
    if (e.target instanceof HTMLInputElement) return; // typing in the param panel
    const action = actionOf.get(normalize(e.key));
    if (action === undefined) return;
    e.preventDefault();
    press(action);
  });
  addEventListener("keyup", e => { const a = actionOf.get(normalize(e.key)); if (a !== undefined) down.delete(a); });
  addEventListener("blur", () => down.clear());

  for (const button of pad?.querySelectorAll<HTMLElement>("[data-action]") ?? []) {
    const action = button.dataset.action as A;
    button.addEventListener("pointerdown", e => { e.preventDefault(); press(action); });
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(type, () => down.delete(action));
  }

  return {
    held: a => down.has(a),
    pressed: a => fresh.has(a),
    endFrame: () => { fresh = new Set(); },
  };
}
