// Bullet deck: draw pile + discard. Seeded shuffles keep runs reproducible with ?seed=N.
import { rnd } from "../../engine/rng";
import { BULLETS, type AbyssParams, type BulletId } from "./rules";

export interface Deck { draw: BulletId[]; discard: BulletId[]; seed: number }

function shuffle(cards: BulletId[], seed: number): { cards: BulletId[]; seed: number } {
  const out = [...cards];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    let v: number;
    [v, s] = rnd(s);
    const j = Math.floor(v * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { cards: out, seed: s };
}

export function newDeck(p: AbyssParams, seed: number, cards?: BulletId[]): Deck {
  const list = cards ?? BULLETS.flatMap(b => Array<BulletId>(p[`deck.${b.id}`]).fill(b.id));
  const sh = shuffle(list.length ? list : ["shot"], seed);
  return { draw: sh.cards, discard: [], seed: sh.seed };
}

/** Takes the top card. If the draw pile is empty, the discard is shuffled back first (reshuffled = true). */
export function draw(d: Deck): { deck: Deck; bullet: BulletId; reshuffled: boolean } {
  let deck = d, reshuffled = false;
  if (deck.draw.length === 0) {
    const sh = shuffle(deck.discard, deck.seed);
    deck = { draw: sh.cards, discard: [], seed: sh.seed };
    reshuffled = true;
  }
  const [bullet, ...rest] = deck.draw;
  return { deck: { ...deck, draw: rest, discard: [...deck.discard, bullet] }, bullet, reshuffled };
}

/** Every card the player owns (draw + discard), e.g. for the shop. */
export const allCards = (d: Deck): BulletId[] => [...d.draw, ...d.discard];
