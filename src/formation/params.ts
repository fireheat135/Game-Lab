// Tunable parameters (企画書 §10). Every value can be overridden from the URL query, e.g.
// /formation/?queue=4&k=1.5&pair=12,2 — the in-page panel edits the same query.
export type HandId = "high" | "pair" | "two" | "three" | "straight" | "flush" | "full" | "four" | "sf" | "five";

export interface Params {
  seed: number;
  cols: number; rows: number; colors: number; kinds: number; armor: number; hp: number;
  queue: number; cancels: number;
  shields: number; cd: number; move: number;
  speed: number; accel: number; drop: number; fire: number; warn: number; ebullet: number;
  sectors: number; k: number; ceil: number[]; stagex: number[];
  kill: number[]; vline: number; hline: number; corner: number; sweep: number;
  high: number[]; pair: number[]; two: number[]; three: number[]; straight: number[];
  flush: number[]; full: number[]; four: number[]; sf: number[]; five: number[];
}

interface Def { group: string; desc: string; min: number; max: number; int?: boolean; len?: number }

export const DEFAULTS: Params = {
  seed: 0,
  cols: 5, rows: 5, colors: 4, kinds: 5, armor: 0, hp: 2,
  queue: 5, cancels: 3,
  shields: 3, cd: 0.25, move: 260,
  speed: 40, accel: 2, drop: 16, fire: 0.5, warn: 0.5, ebullet: 200,
  sectors: 8, k: 2, ceil: [300, 800, 2000, 5000, 11000, 20000, 35000, 50000], stagex: [1, 1.5, 2],
  kill: [10, 15, 20, 25, 30], vline: 2, hline: 4, corner: 30, sweep: 1.5,
  high: [5, 1], pair: [10, 2], two: [20, 2], three: [30, 3], straight: [30, 4],
  flush: [35, 4], full: [40, 4], four: [60, 7], sf: [100, 8], five: [120, 12],
};

const hand = (name: string): Def => ({ group: "役（Chips,Mult）", desc: name, min: 0, max: 1e6, len: 2 });
export const DEFS: Record<keyof Params, Def> = {
  seed: { group: "乱数", desc: "シード（0 = 毎回ランダム）", min: 0, max: 2 ** 31, int: true },
  cols: { group: "隊列", desc: "列数", min: 1, max: 10, int: true },
  rows: { group: "隊列", desc: "段数", min: 1, max: 8, int: true },
  colors: { group: "隊列", desc: "色の数（スート）", min: 1, max: 7, int: true },
  kinds: { group: "隊列", desc: "種別の数（ランク）", min: 1, max: 9, int: true },
  armor: { group: "隊列", desc: "装甲付きの割合 0〜1", min: 0, max: 1 },
  hp: { group: "隊列", desc: "装甲付きが何発で倒れるか", min: 1, max: 10, int: true },
  queue: { group: "ハンド", desc: "キューの枠数（何キルで1ハンド）", min: 1, max: 8, int: true },
  cancels: { group: "ハンド", desc: "1ステージのキャンセル回数", min: 0, max: 20, int: true },
  shields: { group: "自機", desc: "シールド（ラン全体）", min: 1, max: 20, int: true },
  cd: { group: "自機", desc: "射撃の間隔（秒）", min: 0, max: 2 },
  move: { group: "自機", desc: "移動速度（px/秒）", min: 50, max: 1000 },
  speed: { group: "敵", desc: "隊列の横移動の速さ（px/秒）", min: 0, max: 500 },
  accel: { group: "敵", desc: "敵が減るほど速くなる量（全滅直前で 1+accel 倍）", min: 0, max: 20 },
  drop: { group: "敵", desc: "端で降りる量（px）", min: 0, max: 100 },
  fire: { group: "敵", desc: "敵弾の頻度（発/秒）", min: 0, max: 20 },
  warn: { group: "敵", desc: "敵弾の予告時間（秒）", min: 0, max: 3 },
  ebullet: { group: "敵", desc: "敵弾の速さ（px/秒）", min: 20, max: 1000 },
  sectors: { group: "天井", desc: "セクター数（各3ステージ）", min: 1, max: 8, int: true },
  k: { group: "天井", desc: "要求スコアの倍率 k", min: 0.0001, max: 1e6 },
  ceil: { group: "天井", desc: "セクターごとの基礎値（カンマ区切り）", min: 0, max: 1e15 },
  stagex: { group: "天井", desc: "小,大,母艦の倍率", min: 0, max: 1e6, len: 3 },
  kill: { group: "スコア", desc: "種別1,2,…の撃破Chips", min: 0, max: 1e6 },
  vline: { group: "スコア", desc: "縦ライン +Mult", min: 0, max: 1e6 },
  hline: { group: "スコア", desc: "横ライン +Mult", min: 0, max: 1e6 },
  corner: { group: "スコア", desc: "角1つにつき +Chips", min: 0, max: 1e6 },
  sweep: { group: "スコア", desc: "一掃 ×倍率", min: 0, max: 1e6 },
  high: hand("ハイカード"), pair: hand("ペア"), two: hand("ツーペア"), three: hand("スリーカード"),
  straight: hand("ストレート"), flush: hand("フラッシュ"), full: hand("フルハウス"),
  four: hand("フォーカード"), sf: hand("ストレートフラッシュ"), five: hand("ファイブカード"),
};

const clamp = (v: number, d: Def) => {
  const c = Math.min(Math.max(v, d.min), d.max);
  return d.int ? Math.round(c) : c;
};

export function parseParams(search: string): Params {
  const q = new URLSearchParams(search);
  const out = structuredClone(DEFAULTS) as unknown as Record<string, number | number[]>;
  for (const key of Object.keys(DEFS) as (keyof Params)[]) {
    const raw = q.get(key);
    if (raw === null || raw.trim() === "") continue;
    const d = DEFS[key];
    if (Array.isArray(DEFAULTS[key])) {
      const list = raw.split(",").map(s => Number(s.trim()));
      if (list.some(n => !Number.isFinite(n)) || (d.len !== undefined && list.length !== d.len)) continue;
      out[key] = list.map(n => clamp(n, d));
    } else {
      const n = Number(raw);
      if (Number.isFinite(n)) out[key] = clamp(n, d);
    }
  }
  return out as unknown as Params;
}

export function formatValue(v: number | number[]): string {
  return Array.isArray(v) ? v.join(",") : String(v);
}

/** Query string with only the values that differ from DEFAULTS (keeps shared URLs short). */
export function toQuery(p: Params): string {
  const parts: string[] = [];
  for (const key of Object.keys(DEFS) as (keyof Params)[]) {
    const v = formatValue(p[key]);
    if (v !== formatValue(DEFAULTS[key])) parts.push(`${key}=${v}`);
  }
  return parts.join("&");
}
