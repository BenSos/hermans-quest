/**
 * Power-ups from treasure chests. Each card rolls a rarity first (Common is likely, Mythic is very rare),
 * then a power-up that comes in that rarity. Higher rarity = bigger version of the same effect.
 * Everything resets when Herman falls.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const RARITIES: { id: Rarity; name: string; color: string; weight: number }[] = [
  { id: 'common', name: 'Common', color: '#e9e4d8', weight: 35 },
  { id: 'uncommon', name: 'Uncommon', color: '#5ccf5a', weight: 28 },
  { id: 'rare', name: 'Rare', color: '#4f9bff', weight: 20 },
  { id: 'epic', name: 'Epic', color: '#b367ff', weight: 10 },
  { id: 'legendary', name: 'Legendary', color: '#ff9f2e', weight: 5 },
  { id: 'mythic', name: 'Mythic', color: '#ff4a5a', weight: 2 },
];

const IDX: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

/** Everything power-ups can change. Weapons, Herman and the HUD read from this. */
export interface PowerState {
  damageMul: number;
  /** Per-weapon damage from the Blacksmith (Adventure). */
  swordMul: number;
  rangMul: number;
  bowMul: number;
  swordSpeed: number;
  rangSpeed: number;
  extraArrows: number;
  swordWave: number; // range in tiles, 0 = none
  swordWavePierce: boolean;
  poison: number;
  fire: number;
  acid: number;
  quiverBonus: number;
  moveMul: number;
  dashMul: number;
  maxHeartsBonus: number; // in half hearts
  bladeStorm: boolean;
  infiniteQuiver: boolean;
  phoenix: boolean;
}

export function basePowerState(): PowerState {
  return {
    damageMul: 1, swordMul: 1, rangMul: 1, bowMul: 1, swordSpeed: 1, rangSpeed: 1, extraArrows: 0, swordWave: 0, swordWavePierce: false,
    poison: 0, fire: 0, acid: 0, quiverBonus: 0, moveMul: 1, dashMul: 1, maxHeartsBonus: 0,
    bladeStorm: false, infiniteQuiver: false, phoenix: false,
  };
}

export type PowerIcon = 'sword' | 'boomerang' | 'bow' | 'heart' | 'boot' | 'dash' | 'poison' | 'fire' | 'acid' | 'star' | 'wave' | 'quiver' | 'feather' | 'dragon';

export interface PowerDef {
  id: string;
  name: string;
  icon: PowerIcon;
  rarities: Rarity[];
  describe: (r: Rarity) => string;
  /** Change the stats. `heal` lets instant effects (Heart Charm) heal Herman when picked. */
  apply: (s: PowerState, r: Rarity) => void;
  heal?: (r: Rarity) => number | 'full';
  once?: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const by = <T,>(r: Rarity, list: T[]) => list[Math.min(IDX[r], list.length - 1)];
const STD: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const POWERS: PowerDef[] = [
  {
    id: 'sharp', name: 'Sharper Steel', icon: 'sword', rarities: STD,
    describe: (r) => `All weapons do ${pct(by(r, [0.1, 0.15, 0.25, 0.35, 0.5]))} more damage.`,
    apply: (s, r) => { s.damageMul *= 1 + by(r, [0.1, 0.15, 0.25, 0.35, 0.5]); },
  },
  {
    id: 'quickblade', name: 'Quick Blade', icon: 'sword', rarities: STD,
    describe: (r) => `Sword swings ${pct(by(r, [0.15, 0.22, 0.35, 0.5, 0.7]))} faster.`,
    apply: (s, r) => { s.swordSpeed *= 1 + by(r, [0.15, 0.22, 0.35, 0.5, 0.7]); },
  },
  {
    id: 'swift', name: 'Swift Return', icon: 'boomerang', rarities: STD,
    describe: (r) => `Boomerang flies ${pct(by(r, [0.2, 0.3, 0.45, 0.65, 0.9]))} faster, out and back.`,
    apply: (s, r) => { s.rangSpeed *= 1 + by(r, [0.2, 0.3, 0.45, 0.65, 0.9]); },
  },
  {
    id: 'multishot', name: 'Multishot', icon: 'bow', rarities: ['rare', 'epic', 'legendary'],
    describe: (r) => (r === 'legendary' ? 'Shoot 3 arrows at once.' : 'Shoot 2 arrows at once. Stacks with more Multishot.'),
    apply: (s, r) => { s.extraArrows = Math.min(4, s.extraArrows + (r === 'legendary' ? 2 : 1)); },
  },
  {
    id: 'swordwave', name: 'Sword Wave', icon: 'wave', rarities: ['rare', 'epic', 'legendary'],
    describe: (r) => (r === 'legendary' ? 'Every swing fires a long energy wave that passes through monsters.' : `Every swing fires a ${r === 'epic' ? 'medium' : 'short'} energy wave.`),
    apply: (s, r) => {
      s.swordWave = Math.max(s.swordWave, by(r, [0, 0, 3, 4.5, 6]));
      if (r === 'legendary') s.swordWavePierce = true;
    },
  },
  {
    id: 'poison', name: 'Poison Touch', icon: 'poison', rarities: STD,
    describe: (r) => `Hits poison monsters (${by(r, ['weak', 'mild', 'medium', 'strong', 'deadly'])}). Poison stacks up to 5 times.`,
    apply: (s, r) => { s.poison += by(r, [1, 1.5, 2, 2.5, 3]); },
  },
  {
    id: 'fire', name: 'Flame Touch', icon: 'fire', rarities: STD,
    describe: (r) => `Hits set monsters on fire (${by(r, ['weak', 'mild', 'medium', 'strong', 'blazing'])}). Fast burst of burn damage.`,
    apply: (s, r) => { s.fire += by(r, [1, 1.5, 2, 2.5, 3]); },
  },
  {
    id: 'acid', name: 'Acid Touch', icon: 'acid', rarities: STD,
    describe: (r) => `Hits melt armor (${by(r, ['weak', 'mild', 'medium', 'strong', 'brutal'])}): melting monsters take extra damage from everything.`,
    apply: (s, r) => { s.acid += by(r, [1, 1.5, 2, 2.5, 3]); },
  },
  {
    id: 'quiver', name: 'Big Quiver', icon: 'quiver', rarities: STD,
    describe: (r) => `+${by(r, [3, 4, 6, 9, 12])} arrows in your quiver.`,
    apply: (s, r) => { s.quiverBonus += by(r, [3, 4, 6, 9, 12]); },
  },
  {
    id: 'fleet', name: 'Fleet Foot', icon: 'boot', rarities: STD,
    describe: (r) => `Walk ${pct(by(r, [0.05, 0.08, 0.12, 0.18, 0.25]))} faster.`,
    apply: (s, r) => { s.moveMul *= 1 + by(r, [0.05, 0.08, 0.12, 0.18, 0.25]); },
  },
  {
    id: 'quickdash', name: 'Quick Dash', icon: 'dash', rarities: STD,
    describe: (r) => `Dash cooldown ${pct(by(r, [0.1, 0.15, 0.25, 0.32, 0.4]))} shorter.`,
    apply: (s, r) => { s.dashMul *= 1 - by(r, [0.1, 0.15, 0.25, 0.32, 0.4]); },
  },
  {
    id: 'heart', name: 'Heart Charm', icon: 'heart', rarities: STD,
    describe: (r) => by(r, ['Heal 1 heart.', 'Heal 2 hearts.', '+1 max heart.', '+1 max heart and heal fully.', '+2 max hearts and heal fully.']),
    apply: (s, r) => { s.maxHeartsBonus += by(r, [0, 0, 2, 2, 4]); },
    heal: (r) => by<number | 'full'>(r, [2, 4, 2, 'full', 'full']),
  },
  // ----- Mythic: one of a kind -----
  {
    id: 'dragon', name: "Dragon's Breath", icon: 'dragon', rarities: ['mythic'], once: true,
    describe: () => 'Every hit poisons, burns AND melts.',
    apply: (s) => { s.poison = Math.max(s.poison, 2); s.fire = Math.max(s.fire, 2); s.acid = Math.max(s.acid, 2); },
  },
  {
    id: 'phoenix', name: 'Phoenix Feather', icon: 'feather', rarities: ['mythic'], once: true,
    describe: () => 'Once this run, when you fall, you rise again with 3 hearts.',
    apply: (s) => { s.phoenix = true; },
  },
  {
    id: 'bladestorm', name: 'Blade Storm', icon: 'star', rarities: ['mythic'], once: true,
    describe: () => 'Three magic swords circle you and cut anything they touch.',
    apply: (s) => { s.bladeStorm = true; },
  },
  {
    id: 'infinite', name: 'Infinite Quiver', icon: 'quiver', rarities: ['mythic'], once: true,
    describe: () => 'Your arrows never run out.',
    apply: (s) => { s.infiniteQuiver = true; },
  },
];

export interface Owned { def: PowerDef; rarity: Rarity }
export interface Offer { def: PowerDef; rarity: Rarity }

function rollRarity(rnd: () => number, weights?: number[]): Rarity {
  const w = weights ?? RARITIES.map((r) => r.weight);
  const total = w.reduce((a, b) => a + b, 0);
  let x = rnd() * total;
  for (let i = 0; i < RARITIES.length; i++) {
    x -= w[i];
    if (x < 0) return RARITIES[i].id;
  }
  return 'common';
}

/** Three different power-ups, each with its own rarity roll. */
/** Odds (in %) for each chest kind, Common to Mythic. */
export const CHEST_ODDS: Record<'wooden' | 'silver' | 'gold' | 'arena', number[]> = {
  wooden: [55, 30, 12, 3, 0, 0],
  silver: [20, 35, 30, 12, 3, 0],
  gold: [0, 10, 35, 35, 17, 3],
  arena: RARITIES.map((r) => r.weight),
};

export function rollOffers(owned: Owned[], rnd: () => number = Math.random, count = 3, weights?: number[]): Offer[] {
  const offers: Offer[] = [];
  let guard = 0;
  while (offers.length < count && guard++ < 200) {
    let rarity = rollRarity(rnd, weights);
    let pool = POWERS.filter((p) =>
      p.rarities.includes(rarity) &&
      !offers.some((o) => o.def.id === p.id) &&
      !(p.once && owned.some((o) => o.def.id === p.id)));
    // If nothing comes in that rarity (e.g. every Mythic owned), step down a rarity.
    while (!pool.length && IDX[rarity] > 0) {
      rarity = RARITIES[IDX[rarity] - 1].id;
      pool = POWERS.filter((p) => p.rarities.includes(rarity) && !offers.some((o) => o.def.id === p.id));
    }
    if (!pool.length) continue;
    offers.push({ def: pool[Math.floor(rnd() * pool.length)], rarity });
  }
  return offers;
}

export function computeState(owned: Owned[]): PowerState {
  const s = basePowerState();
  for (const o of owned) o.def.apply(s, o.rarity);
  return s;
}

export function rarityInfo(r: Rarity) {
  return RARITIES[IDX[r]];
}
