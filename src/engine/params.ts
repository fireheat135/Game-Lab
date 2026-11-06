// Tunable parameters as a normalized table: one row per key, one number per key (1NF), and every
// column of a row depends only on its key (2NF). The URL query overrides values (?pair.chips=12),
// which is how designers test variants: copy the URL, change one number, reload.

export interface ParamDef<K extends string = string> {
  key: K;        // primary key, also the query-string name
  group: string; // panel section
  label: string; // shown next to the input
  def: number;   // default value
  min: number;
  max: number;
  int?: boolean;
}

export type Params<K extends string> = Readonly<Record<K, number>>;

export function defaultParams<K extends string>(table: readonly ParamDef<K>[]): Params<K> {
  return Object.fromEntries(table.map(d => [d.key, d.def])) as Params<K>;
}

function clamp(v: number, d: ParamDef): number {
  const c = Math.min(Math.max(v, d.min), d.max);
  return d.int ? Math.round(c) : c;
}

/** Unknown keys and non-numbers are ignored; numbers are clamped into [min, max]. */
export function parseParams<K extends string>(table: readonly ParamDef<K>[], search: string): Params<K> {
  const query = new URLSearchParams(search);
  const out = { ...defaultParams(table) } as Record<K, number>;
  for (const d of table) {
    const raw = query.get(d.key);
    if (raw === null || raw.trim() === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) out[d.key] = clamp(n, d);
  }
  return out;
}

/** Query string containing only values that differ from the defaults (short, shareable URLs). */
export function toQuery<K extends string>(table: readonly ParamDef<K>[], p: Params<K>): string {
  return table.filter(d => p[d.key] !== d.def).map(d => `${d.key}=${p[d.key]}`).join("&");
}
