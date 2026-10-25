/**
 * Progress that lasts between runs (Adventure only): gold, shop upgrades and gear.
 * Saved in the browser, so closing the game keeps everything. Power-ups from chests still reset each run.
 */
import type { PowerState } from './powerups';

export type UpgradeId = 'sword' | 'rang' | 'bow' | 'vitality' | 'swiftness' | 'quiver' | 'lucky';
export type GearSlot = 'helmet' | 'armor' | 'boots' | 'charm';
export type GearTier = 'common' | 'rare' | 'legendary';

export interface UpgradeDef {
  id: UpgradeId;
  shop: 'smith' | 'yard';
  name: string;
  icon: 'sword' | 'boomerang' | 'bow' | 'heart' | 'dash' | 'quiver' | 'star';
  max: number;
  base: number;
  /** What one level gives, for the shop card. */
  per: string;
  /** Total effect at a level, for "now / next". */
  total: (lvl: number) => string;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'sword', shop: 'smith', name: 'Sword Mastery', icon: 'sword', max: 10, base: 40, per: '+5% sword damage', total: (l) => `+${l * 5}% sword damage` },
  { id: 'rang', shop: 'smith', name: 'Boomerang Mastery', icon: 'boomerang', max: 10, base: 40, per: '+5% boomerang damage', total: (l) => `+${l * 5}% boomerang damage` },
  { id: 'bow', shop: 'smith', name: 'Archery Mastery', icon: 'bow', max: 10, base: 40, per: '+5% arrow damage', total: (l) => `+${l * 5}% arrow damage` },
  { id: 'vitality', shop: 'yard', name: 'Vitality', icon: 'heart', max: 3, base: 150, per: '+1 starting heart', total: (l) => `${5 + l} hearts` },
  { id: 'swiftness', shop: 'yard', name: 'Swiftness', icon: 'dash', max: 5, base: 80, per: '5% shorter dash cooldown', total: (l) => `${l * 5}% shorter dash cooldown` },
  { id: 'quiver', shop: 'yard', name: 'Bigger Quiver', icon: 'quiver', max: 5, base: 60, per: '+2 arrows', total: (l) => `${12 + l * 2} arrows` },
  { id: 'lucky', shop: 'yard', name: 'Lucky Find', icon: 'star', max: 5, base: 120, per: 'Better chest rarity odds', total: (l) => (l ? `Rare and better ${Math.round(l * 12)}% more likely` : 'Normal chest odds') },
];

export interface GearDef {
  id: string;
  slot: GearSlot;
  tier: GearTier;
  name: string;
  cost: number;
  desc: string;
  apply: (g: GearEffects) => void;
}

/** What gear changes. Read by the game when a run starts. */
export interface GearEffects {
  hearts: number; // whole hearts
  block: number; // 0..1 chance a hit does nothing
  move: number; // extra walk speed, 0.15 = 15%
  dashDist: number; // extra dash distance multiplier
  goldMul: number;
  startPower: 'none' | 'flame' | 'randomRare';
}

export const GEAR: GearDef[] = [
  { id: 'cap', slot: 'helmet', tier: 'common', name: 'Leather Cap', cost: 60, desc: '+1 heart', apply: (g) => { g.hearts += 1; } },
  { id: 'helm', slot: 'helmet', tier: 'rare', name: 'Iron Helm', cost: 220, desc: '+2 hearts', apply: (g) => { g.hearts += 2; } },
  { id: 'knighthelm', slot: 'helmet', tier: 'legendary', name: "Knight's Helm", cost: 550, desc: '+3 hearts', apply: (g) => { g.hearts += 3; } },
  { id: 'vest', slot: 'armor', tier: 'common', name: 'Padded Vest', cost: 60, desc: '10% chance to block a hit', apply: (g) => { g.block += 0.1; } },
  { id: 'chain', slot: 'armor', tier: 'rare', name: 'Chain Mail', cost: 220, desc: '20% chance to block a hit', apply: (g) => { g.block += 0.2; } },
  { id: 'plate', slot: 'armor', tier: 'legendary', name: 'Plate Armor', cost: 550, desc: '30% chance to block a hit', apply: (g) => { g.block += 0.3; } },
  { id: 'softboots', slot: 'boots', tier: 'common', name: 'Soft Boots', cost: 50, desc: 'Walk 8% faster', apply: (g) => { g.move += 0.08; } },
  { id: 'swiftboots', slot: 'boots', tier: 'rare', name: 'Swift Boots', cost: 200, desc: 'Walk 15% faster', apply: (g) => { g.move += 0.15; } },
  { id: 'windboots', slot: 'boots', tier: 'legendary', name: 'Wind Boots', cost: 500, desc: 'Walk 22% faster, dash farther', apply: (g) => { g.move += 0.22; g.dashDist += 0.3; } },
  { id: 'coin', slot: 'charm', tier: 'common', name: 'Lucky Coin', cost: 100, desc: 'Monsters drop 30% more gold', apply: (g) => { g.goldMul += 0.3; } },
  { id: 'ember', slot: 'charm', tier: 'rare', name: 'Ember Charm', cost: 250, desc: 'Start every run with Flame Touch', apply: (g) => { g.startPower = 'flame'; } },
  { id: 'star', slot: 'charm', tier: 'legendary', name: 'Star Charm', cost: 500, desc: 'Start every run with a random Rare power-up', apply: (g) => { g.startPower = 'randomRare'; } },
];

export const GEAR_SLOTS: { slot: GearSlot; name: string }[] = [
  { slot: 'helmet', name: 'Helmet' },
  { slot: 'armor', name: 'Armor' },
  { slot: 'boots', name: 'Boots' },
  { slot: 'charm', name: 'Charm' },
];

export const TIER_COLOR: Record<GearTier, string> = { common: '#e9e4d8', rare: '#4f9bff', legendary: '#ff9f2e' };
export const TIER_NAME: Record<GearTier, string> = { common: 'Common', rare: 'Rare', legendary: 'Legendary' };

export interface SaveData {
  version: 1;
  gold: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  gearOwned: string[];
  equipped: Partial<Record<GearSlot, string>>;
  runs: number;
  deaths: number;
  grumbokBeaten: number;
  totalGold: number;
  /** Found Ben and Cole's secret button in Oakhollow. */
  secretFound: boolean;
}

const KEY = 'hermans-quest.save';

function fresh(): SaveData {
  return { version: 1, gold: 0, upgrades: {}, gearOwned: [], equipped: {}, runs: 0, deaths: 0, grumbokBeaten: 0, totalGold: 0, secretFound: false };
}

export const save: SaveData = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) } as SaveData;
  } catch { /* storage unavailable */ }
  return fresh();
})();

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ }
}

export function eraseSave() {
  Object.assign(save, fresh());
  persist();
}

export const level = (id: UpgradeId) => save.upgrades[id] ?? 0;

/** Each level costs about 1.5x the one before. */
export function upgradeCost(id: UpgradeId): number | null {
  const def = UPGRADES.find((u) => u.id === id)!;
  const l = level(id);
  if (l >= def.max) return null;
  return Math.round(def.base * Math.pow(1.5, l) / 5) * 5;
}

export function buyUpgrade(id: UpgradeId): boolean {
  const cost = upgradeCost(id);
  if (cost === null || save.gold < cost) return false;
  save.gold -= cost;
  save.upgrades[id] = level(id) + 1;
  persist();
  return true;
}

export function buyGear(id: string): boolean {
  const g = GEAR.find((x) => x.id === id);
  if (!g || save.gearOwned.includes(id) || save.gold < g.cost) return false;
  save.gold -= g.cost;
  save.gearOwned.push(id);
  save.equipped[g.slot] = id;
  persist();
  return true;
}

export function equipGear(id: string | null, slot: GearSlot) {
  if (id && !save.gearOwned.includes(id)) return;
  if (id) save.equipped[slot] = id;
  else delete save.equipped[slot];
  persist();
}

export function addGold(n: number) {
  save.gold += n;
  save.totalGold += n;
  persist();
}

export function gearEffects(): GearEffects {
  const g: GearEffects = { hearts: 0, block: 0, move: 0, dashDist: 0, goldMul: 1, startPower: 'none' };
  for (const id of Object.values(save.equipped)) GEAR.find((x) => x.id === id)?.apply(g);
  return g;
}

/** Fold shop upgrades and gear into the run's power-up state. */
export function applyProgression(s: PowerState) {
  s.swordMul *= 1 + level('sword') * 0.05;
  s.rangMul *= 1 + level('rang') * 0.05;
  s.bowMul *= 1 + level('bow') * 0.05;
  s.dashMul *= 1 - level('swiftness') * 0.05;
  s.quiverBonus += level('quiver') * 2;
  const g = gearEffects();
  s.moveMul *= 1 + g.move;
}

/** Extra max half-hearts from Vitality and the helmet. */
export function progressionHearts() {
  return (level('vitality') + gearEffects().hearts) * 2;
}

/** Lucky Find: shift chest odds toward Rare and better. */
export function luckyWeights(base: number[]): number[] {
  const l = level('lucky');
  if (!l) return base;
  const w = base.map((v, i) => (i >= 2 ? v * (1 + l * 0.12) : v));
  const total = w.reduce((a, b) => a + b, 0);
  const scale = base.reduce((a, b) => a + b, 0) / total;
  return w.map((v) => Math.round(v * scale * 10) / 10);
}

/** Gold each monster drops. */
export const GOLD_VALUE: Record<string, number> = {
  green: 1, mini: 1, blue: 2, skelWarrior: 3, skelArcher: 3, ogre: 8,
  kingSlime: 30, skelKing: 40, ogreKing: 60,
};
