// FORMATION HAND rule tables. Each table has one primary key and atomic columns (1NF / 2NF).
// Values that designers tune live in PARAMS (URL-editable); the tables below hold names and defaults.
import type { ParamDef, Params } from "../../engine/params";

// ---- hands (primary key: id). Poker order did not fit this game: from the 5-enemy front, same KIND is
// easy and same GLOW is hard (bot: four-of-a-kind 31%, flush 0.8%). Values are re-ordered by measured
// rarity (`npm run sim`); straight / flush / straight flush now pay the most.
export type HandId = "high" | "pair" | "two" | "three" | "straight" | "flush" | "full" | "four" | "sf" | "five";
export const HANDS: readonly { id: HandId; name: string; chips: number; mult: number }[] = [
  { id: "high", name: "ハイカード", chips: 5, mult: 1 },
  { id: "pair", name: "ペア", chips: 10, mult: 2 },
  { id: "two", name: "ツーペア", chips: 20, mult: 2 },
  { id: "three", name: "スリーカード", chips: 30, mult: 3 },
  { id: "straight", name: "ストレート", chips: 60, mult: 5 },
  { id: "flush", name: "フラッシュ", chips: 100, mult: 8 },
  { id: "full", name: "フルハウス", chips: 40, mult: 4 },
  { id: "four", name: "フォーカード", chips: 35, mult: 4 },
  { id: "sf", name: "ストレートフラッシュ", chips: 150, mult: 12 },
  { id: "five", name: "ファイブカード", chips: 80, mult: 7 },
];

// ---- position bonuses (primary key: id)
export type BonusId = "vline" | "hline" | "corner" | "sweep";
export const BONUSES: readonly { id: BonusId; name: string; effect: "mult" | "chips" | "xmult"; value: number; rule: string }[] = [
  { id: "vline", name: "縦ライン", effect: "mult", value: 1, rule: "1ハンドが同じ列だけ" },
  { id: "hline", name: "横ライン", effect: "mult", value: 1, rule: "1ハンドが同じ段だけ" },
  { id: "corner", name: "角取り", effect: "chips", value: 30, rule: "隊列の四隅1体ごと" },
  { id: "sweep", name: "一掃", effect: "xmult", value: 1.5, rule: "このハンドで隊列が全滅" },
];

// ---- creatures = ranks (primary key: kind). Sprites are white and tinted by GLOWS.
export const CREATURES: readonly { kind: number; name: string; sprite: string | null; killChips: number }[] = [
  { kind: 1, name: "クラゲ", sprite: "sea-1", killChips: 10 },
  { kind: 2, name: "イカ", sprite: "sea-2", killChips: 15 },
  { kind: 3, name: "カニ", sprite: "sea-3", killChips: 20 },
  { kind: 4, name: "チョウチンアンコウ", sprite: "sea-4", killChips: 25 },
  { kind: 5, name: "ヒトデ", sprite: "sea-5", killChips: 30 },
  { kind: 6, name: "ウミウシ", sprite: null, killChips: 35 },
  { kind: 7, name: "タツノオトシゴ", sprite: null, killChips: 40 },
  { kind: 8, name: "オウムガイ", sprite: null, killChips: 45 },
  { kind: 9, name: "リュウグウノツカイ", sprite: null, killChips: 50 },
];

// ---- glows = suits (primary key: id). Okabe–Ito palette + a mark per glow, so suits never rely on color alone.
export const GLOWS: readonly { id: number; name: string; hex: string; mark: string }[] = [
  { id: 0, name: "橙", hex: "#E69F00", mark: "●" },
  { id: 1, name: "空", hex: "#56B4E9", mark: "▲" },
  { id: 2, name: "翠", hex: "#009E73", mark: "■" },
  { id: 3, name: "桃", hex: "#CC79A7", mark: "◆" },
  { id: 4, name: "黄", hex: "#F0E442", mark: "★" },
  { id: 5, name: "朱", hex: "#D55E00", mark: "✚" },
  { id: 6, name: "藍", hex: "#0072B2", mark: "♥" },
];

// ---- stages within a sector (primary key: id)
export type StageId = "small" | "big" | "boss";
export const STAGES: readonly { id: StageId; name: string; mult: number }[] = [
  { id: "small", name: "群れ", mult: 1 },
  { id: "big", name: "大群", mult: 1.5 },
  { id: "boss", name: "ヌシ", mult: 2 },
];

// ---- sectors = depth (primary key: sector). Ceiling base = Balatro White Stake curve.
export const SECTORS: readonly { sector: number; depth: number; ceil: number }[] = [
  { sector: 1, depth: 200, ceil: 300 }, { sector: 2, depth: 500, ceil: 800 },
  { sector: 3, depth: 1000, ceil: 2000 }, { sector: 4, depth: 2000, ceil: 5000 },
  { sector: 5, depth: 3000, ceil: 11000 }, { sector: 6, depth: 4000, ceil: 20000 },
  { sector: 7, depth: 6000, ceil: 35000 }, { sector: 8, depth: 8000, ceil: 50000 },
];

// ---- PARAMS: every tunable, one row per key (rows for hands/bonuses/... are derived from the tables)
type ScalarKey = "seed" | "cols" | "rows" | "colors" | "kinds" | "armor" | "hp" | "queue" | "cancels" | "shields"
  | "cd" | "move" | "speed" | "accel" | "drop" | "fire" | "warn" | "ebullet" | "sectors" | "k" | "hints";
export type ParamKey = ScalarKey | `${HandId}.chips` | `${HandId}.mult` | BonusId | `kill.${number}` | `ceil.${number}` | `stage.${StageId}`;
export type FormationParams = Params<ParamKey>;

const scalar = (key: ScalarKey, group: string, label: string, def: number, min: number, max: number, int = false): ParamDef<ParamKey> =>
  ({ key, group, label, def, min, max, int });

export const PARAMS: readonly ParamDef<ParamKey>[] = [
  scalar("seed", "乱数", "シード（0 = 毎回ランダム）", 0, 0, 2 ** 31, true),
  scalar("cols", "群れ", "列数", 5, 1, 10, true),
  scalar("rows", "群れ", "段数", 5, 1, 8, true),
  scalar("colors", "群れ", "発光色の数（スート）", 4, 1, GLOWS.length, true),
  scalar("kinds", "群れ", "生き物の種類（ランク）", 5, 1, CREATURES.length, true),
  scalar("armor", "群れ", "硬い個体の割合 0〜1", 0, 0, 1),
  scalar("hp", "群れ", "硬い個体が何発で倒れるか", 2, 1, 10, true),
  scalar("queue", "ハンド", "キューの枠数（何体で1ハンド）", 5, 1, 8, true),
  scalar("cancels", "ハンド", "1ステージのキャンセル回数", 3, 0, 20, true),
  scalar("hints", "ハンド", "狙い目ヒント（1 = 表示）", 1, 0, 1, true),
  scalar("shields", "探査艇", "シールド（ラン全体）", 3, 1, 20, true),
  scalar("cd", "探査艇", "射撃の間隔（秒）", 0.25, 0, 2),
  scalar("move", "探査艇", "移動速度（px/秒）", 260, 50, 1000),
  scalar("speed", "群れの動き", "横移動の速さ（px/秒）", 40, 0, 500),
  scalar("accel", "群れの動き", "減るほど速くなる量（全滅直前で 1+accel 倍）", 2, 0, 20),
  scalar("drop", "群れの動き", "端で降りる量（px）", 16, 0, 100),
  scalar("fire", "群れの動き", "敵弾の頻度（発/秒）", 0.5, 0, 20),
  scalar("warn", "群れの動き", "敵弾の予告時間（秒）", 0.7, 0, 3),
  scalar("ebullet", "群れの動き", "敵弾の速さ（px/秒）", 200, 20, 1000),
  scalar("sectors", "天井", "深度の段階数（各3ステージ）", SECTORS.length, 1, SECTORS.length, true),
  scalar("k", "天井", "要求スコアの倍率 k", 2, 0.0001, 1e6),
  ...SECTORS.map(s => ({ key: `ceil.${s.sector}` as const, group: "天井", label: `深度${s.sector}（${s.depth}m）の基礎値`, def: s.ceil, min: 0, max: 1e15 })),
  ...STAGES.map(s => ({ key: `stage.${s.id}` as const, group: "天井", label: `${s.name}の倍率`, def: s.mult, min: 0, max: 1e6 })),
  ...CREATURES.map(c => ({ key: `kill.${c.kind}` as const, group: "撃破Chips", label: `${c.name}（${c.kind}）`, def: c.killChips, min: 0, max: 1e6 })),
  ...BONUSES.map(b => ({ key: b.id, group: "位置役", label: `${b.name}：${b.rule}（${b.effect === "chips" ? "+Chips" : b.effect === "mult" ? "+Mult" : "×"}）`, def: b.value, min: 0, max: 1e6 })),
  ...HANDS.flatMap(h => [
    { key: `${h.id}.chips` as const, group: "役", label: `${h.name} Chips`, def: h.chips, min: 0, max: 1e6 },
    { key: `${h.id}.mult` as const, group: "役", label: `${h.name} Mult`, def: h.mult, min: 0, max: 1e6 },
  ]),
];

export const handName = (id: HandId) => HANDS.find(h => h.id === id)!.name;
export const bonusName = (id: BonusId) => BONUSES.find(b => b.id === id)!.name;
export const stageAt = (index: number) => STAGES[index];
