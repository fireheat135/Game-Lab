// ABYSS CHAIN rule tables. Each table has one primary key and atomic columns (1NF / 2NF).
// Principles (constants): every shot matters (each shot sinks the swarm), randomness is shown before
// the decision (next bullets are visible), no one-hit death, chains are the reward.
import type { ParamDef, Params } from "../../engine/params";

// ---- glows (primary key: id). One creature per glow: color AND shape tell the chain group apart.
export const GLOWS: readonly { id: number; name: string; hex: string; sprite: string; creature: string }[] = [
  { id: 0, name: "橙", hex: "#E69F00", sprite: "sea-1", creature: "クラゲ" },
  { id: 1, name: "空", hex: "#56B4E9", sprite: "sea-2", creature: "イカ" },
  { id: 2, name: "翠", hex: "#009E73", sprite: "sea-3", creature: "カニ" },
  { id: 3, name: "桃", hex: "#CC79A7", sprite: "sea-4", creature: "アンコウ" },
  { id: 4, name: "黄", hex: "#F0E442", sprite: "sea-5", creature: "ヒトデ" },
];

// ---- bullets = cards in the deck (primary key: id)
export type BulletId = "shot" | "pierce" | "spread" | "bomb" | "dye";
export const BULLETS: readonly { id: BulletId; name: string; icon: string; rule: string; price: number }[] = [
  { id: "shot", name: "通常弾", icon: "│", rule: "列のいちばん下に当たる", price: 2 },
  { id: "pierce", name: "貫通弾", icon: "⇑", rule: "列の下から3体を貫く", price: 4 },
  { id: "spread", name: "拡散弾", icon: "Ψ", rule: "その列と左右の列の下に当たる", price: 4 },
  { id: "bomb", name: "爆雷", icon: "✸", rule: "当たった周り3×3を巻き込む", price: 6 },
  { id: "dye", name: "染料弾", icon: "◐", rule: "当たった敵の上下左右を同じ色に染めてから弾く", price: 5 },
];

// ---- starting deck (primary key: bullet). count = copies.
export const STARTING_DECK: readonly { bullet: BulletId; count: number }[] = [
  { bullet: "shot", count: 7 }, { bullet: "spread", count: 1 }, { bullet: "pierce", count: 1 }, { bullet: "bomb", count: 1 },
];

// ---- parts = run-long rule modifiers (primary key: id)
export type PartId = "diagonal" | "resonance" | "aftershock" | "ballast" | "vein" | "steady";
export const PARTS: readonly { id: PartId; name: string; rule: string; price: number }[] = [
  { id: "diagonal", name: "斜行神経", rule: "誘爆が斜めにもつながる", price: 8 },
  { id: "resonance", name: "共鳴器", rule: "連鎖の倍率が2倍の速さで伸びる", price: 7 },
  { id: "aftershock", name: "余震核", rule: "連鎖に必要な数が1減る", price: 9 },
  { id: "ballast", name: "浮力材", rule: "山札を切り直しても沈む量が半分", price: 6 },
  { id: "vein", name: "金脈", rule: "連鎖1段ごとに +1 ゴールド", price: 5 },
  { id: "steady", name: "姿勢制御", rule: "1発ごとに沈む量が半分", price: 7 },
];

// ---- depths = run progression (primary key: depth). Each depth has 3 stages.
export const DEPTHS: readonly { depth: number; meters: number; rows: number; armor: number; fire: number }[] = [
  { depth: 1, meters: 300, rows: 5, armor: 0, fire: 0.3 },
  { depth: 2, meters: 1200, rows: 6, armor: 0.1, fire: 0.5 },
  { depth: 3, meters: 3000, rows: 7, armor: 0.2, fire: 0.7 },
  { depth: 4, meters: 6000, rows: 7, armor: 0.3, fire: 0.9 },
];
export const STAGES_PER_DEPTH = 3;

// ---- PARAMS: every tunable, one number per key (URL-editable).
// Sink / cluster / clearRatio defaults come from `npm run sim:abyss` (no shop, 30 runs): mashing one column
// clears ~2.5 of 12 stages, best-column play ~5.8, two-shot lookahead ~7.2; nobody finishes without the shop.
type ScalarKey = "seed" | "cols" | "colors" | "cluster" | "chainMin" | "base" | "clearRatio" | "shotDrop" | "shuffleDropPerCard" | "drift" | "touchMove"
  | "speed" | "warn" | "ebullet" | "shields" | "cd" | "move" | "preview" | "gold" | "hints" | "sound" | "hitstop";
export type ParamKey = ScalarKey | `price.${BulletId}` | `price.${PartId}` | "price.remove" | "price.reroll" | "price.repair"
  | `deck.${BulletId}` | `rows.${number}` | `armor.${number}` | `fire.${number}`;
export type AbyssParams = Params<ParamKey>;

const s = (key: ScalarKey, group: string, label: string, def: number, min: number, max: number, int = false): ParamDef<ParamKey> =>
  ({ key, group, label, def, min, max, int });

export const PARAMS: readonly ParamDef<ParamKey>[] = [
  s("seed", "乱数", "シード（0 = 毎回ランダム）", 0, 0, 2 ** 31, true),
  s("cols", "群れ", "列数", 7, 3, 10, true),
  s("colors", "群れ", "色の数", 4, 2, GLOWS.length, true),
  s("cluster", "群れ", "同じ色が固まる度合い 0〜1", 0.3, 0, 0.95),
  ...DEPTHS.flatMap(d => [
    { key: `rows.${d.depth}` as const, group: "深度", label: `深度${d.depth}の段数`, def: d.rows, min: 1, max: 9, int: true },
    { key: `armor.${d.depth}` as const, group: "深度", label: `深度${d.depth}の硬い個体の割合`, def: d.armor, min: 0, max: 1 },
    { key: `fire.${d.depth}` as const, group: "深度", label: `深度${d.depth}の敵弾（発/秒）`, def: d.fire, min: 0, max: 10 },
  ]),
  s("chainMin", "連鎖", "落下後の連鎖に必要な同色数", 4, 2, 9, true),
  s("base", "連鎖", "1体あたりの基本点", 10, 1, 1e6),
  s("clearRatio", "群れ", "この割合を倒すと残りは逃げて突破 0〜1", 0.85, 0.1, 1),
  s("shotDrop", "沈下", "1発ごとに沈む量（px）", 22, 0, 80),
  // Reshuffle sink = this × deck size, so the average sink per shot is the same for any deck size:
  // buying bullets does not buy extra shots, and thinning the deck is a real choice.
  s("shuffleDropPerCard", "沈下", "切り直しで沈む量（デッキ1枚あたり px）", 5.5, 0, 50),
  s("drift", "沈下", "時間で沈む速さ（px/秒）", 1.5, 0, 50),
  s("speed", "群れ", "横移動の速さ（px/秒）", 22, 0, 300),
  s("warn", "敵弾", "予告時間（秒）", 0.7, 0, 3),
  s("ebullet", "敵弾", "速さ（px/秒）", 180, 20, 1000),
  s("shields", "探査艇", "シールド", 3, 1, 20, true),
  s("cd", "探査艇", "射撃の間隔（秒）", 0.3, 0.05, 2),
  s("move", "探査艇", "移動速度（px/秒）", 280, 50, 1000),
  s("touchMove", "探査艇", "指で狙うときの移動速度（px/秒）", 900, 50, 3000),
  s("preview", "デッキ", "見える次の弾の数", 3, 1, 8, true),
  ...BULLETS.map(b => ({ key: `deck.${b.id}` as const, group: "デッキ", label: `初期デッキの${b.name}`, def: STARTING_DECK.find(d => d.bullet === b.id)?.count ?? 0, min: 0, max: 30, int: true })),
  s("gold", "ショップ", "ステージ突破のゴールド", 4, 0, 1000, true),
  ...BULLETS.map(b => ({ key: `price.${b.id}` as const, group: "ショップ", label: `${b.name}の値段`, def: b.price, min: 0, max: 1000, int: true })),
  ...PARTS.map(p => ({ key: `price.${p.id}` as const, group: "ショップ", label: `${p.name}の値段`, def: p.price, min: 0, max: 1000, int: true })),
  { key: "price.remove", group: "ショップ", label: "弾を1枚抜く値段", def: 3, min: 0, max: 1000, int: true },
  { key: "price.reroll", group: "ショップ", label: "品ぞろえ更新の値段", def: 2, min: 0, max: 1000, int: true },
  { key: "price.repair", group: "ショップ", label: "シールド修理（+1）の値段", def: 5, min: 0, max: 1000, int: true },
  s("hints", "表示", "狙った先で弾ける塊を表示（1 = する）", 1, 0, 1, true),
  s("sound", "表示", "効果音（1 = 鳴らす）", 1, 0, 1, true),
  s("hitstop", "表示", "連鎖のヒットストップ（秒/段）", 0.05, 0, 0.5),
];

export const bulletOf = (id: BulletId) => BULLETS.find(b => b.id === id)!;
export const partOf = (id: PartId) => PARTS.find(p => p.id === id)!;
export const depthOf = (depth: number) => DEPTHS[Math.min(depth, DEPTHS.length) - 1];
