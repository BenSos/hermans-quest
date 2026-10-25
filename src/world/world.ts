import { GREENMEADOW_1, ScreenData } from './greenmeadow';
import type { RoomData, Side } from './dungeon';
import type { EnemyKind } from '../game/enemy';

/**
 * The Adventure map: four Greenmeadow screens, then Ogre Keep (6 rooms + Grumbok's throne room).
 *
 *   Overworld (2 x 2)              Ogre Keep
 *   [North Road]-[Keep Gate] -->   [Boss]
 *        |            |              |
 *   [Greenmeadow]-[East Fields]   [R5]-[R6]
 *                                  |
 *                                 [R3]-[R4]
 *                                  |
 *                                 [R1]-[R2]
 *
 * Every area is a 22 x 13 tile screen. Letters work like the Greenmeadow map,
 * plus  X keep wall, K keep gate, w wooden barricade (outdoors)
 * and in rooms:  D doorway, X crystal switch, F healing fountain, C chest.
 */

export type ChestKind = 'wooden' | 'silver' | 'smallkey' | 'bigkey' | 'gold' | 'cheater';

export interface Link {
  to: string;
  /** Doors that start locked. Unlocking is remembered for the whole run. */
  lock?: 'key' | 'bigkey';
  /** Both sides of a doorway share this id, so unlocking one unlocks the other. */
  conn: string;
}

export interface Area {
  id: string;
  title: string;
  region: 'Greenmeadow' | 'Ogre Keep';
  /** Oakhollow: no monsters, shops, heals Herman. */
  village?: boolean;
  /** Hidden spot: not on the mini-map until found, never shown past a screen edge. */
  secret?: boolean;
  kind: 'meadow' | 'room';
  grid: { x: number; y: number };
  links: Partial<Record<Side, Link>>;
  /** Edges that lead somewhere not built yet (shows a message). */
  blocked?: Partial<Record<Side, string>>;
  enemies: EnemyKind[];
  chest?: ChestKind;
  meadow?: ScreenData;
  room?: RoomData;
  boss?: boolean;
}

/* ---------------- Overworld ---------------- */

const NORTH_ROAD: ScreenData = {
  name: 'North Road',
  spawn: { col: 11, row: 10 },
  exits: [{ side: 'south', label: '' }, { side: 'east', label: '' }, { side: 'west', label: '' }],
  sign: '',
  tiles: [
    'TTTTTTTTTTTTTTTTTTTTTT',
    'TTT..f....TT...b...TTT',
    'TT..b...........f...TT',
    'T....r....C.........TT',
    'T..f......pp....b...TT',
    'TT....b...pp.........T',
    'T......f..pp....r....T',
    'T..b......pp.........T',
    'ppppppppppppppppppppp.',
    '.T....f...pp..........',
    'T...r.....pp.....f..TT',
    'Th...b....pp...b...hTT',
    'hhhhhhhhhhpphhhhhhhhhh',
  ],
};

const EAST_FIELDS: ScreenData = {
  name: 'East Fields',
  spawn: { col: 3, row: 9 },
  exits: [{ side: 'west', label: '' }, { side: 'north', label: '' }, { side: 'south', label: '' }],
  sign: '',
  tiles: [
    'TTTTTTTTTTppTTTTTTTTTT',
    'TT..f.....pp....b..TTT',
    'T..b.......p.......r.T',
    'T.....f....pppppp....T',
    'T..r............p..b.T',
    '~~~~~~~~~~~~~~~==~~~~~',
    '~~~~~~~~~~~~~~~==~~~~~',
    'T....f..........pp...T',
    '...b......C......p...T',
    'ppppppppppppppppp..f.T',
    'T..f....r.pp.....b...T',
    'Th.....b..pp.f.....bhT',
    'hhhhhhhhhhpphhhhhhhhhh',
  ],
};

/** Greenmeadow (Adventure copy): a west road to the West Woods and the south road to Oakhollow. */
const MEADOW_ADV: ScreenData = {
  ...GREENMEADOW_1,
  exits: [{ side: 'north', label: '' }, { side: 'east', label: '' }, { side: 'south', label: '' }, { side: 'west', label: '' }],
  sign: 'Greenmeadow',
  tiles: [
    'TTTTTTTTTTppTTTTTTTTTT',
    'TT..f.b...pp...f...bTT',
    'T..........p.......r.T',
    'T...W......p...b.....T',
    'T.b...r..f.pp.....f..T',
    '~~~~~~~~~~~==~~~~~~~~~',
    '~~~~~~~~~~~==~~~~~~~~~',
    'T..f.......pp...r..b.T',
    '..r....C....p..f......',
    'pppppppppppppppppppppp',
    'Tb..S......pp...r..f.T',
    'Th...f.....pp......bhT',
    'hhhhhhhhhhpphhhhhhhhhh',
  ],
};

const WEST_WOODS: ScreenData = {
  name: 'West Woods',
  spawn: { col: 11, row: 9 },
  exits: [{ side: 'east', label: '' }, { side: 'north', label: '' }, { side: 'south', label: '' }],
  sign: '',
  tiles: [
    'TTTTTTTTTTppTTTTTTTTTT',
    'TT.b..T...pp..T..b..TT',
    'T..T....f.pp......T..T',
    'T.....r...pp...b.....T',
    'TT..b.....pp....f..TTT',
    '~~~~~~~~~~==~~~~~~~~~~',
    '~~~~~~~~~~==~~~~~~~~~~',
    'T...f.....pp.....r...T',
    'T..T....C.pp..........',
    'T.....b...pppppppppppp',
    'TT..r.....pp...T..b..T',
    'T...T..f..pp.....f..TT',
    'TTTTTTTTTTppTTTTTTTTTT',
  ],
};

const BRAMBLE_HOLLOW: ScreenData = {
  name: 'Bramble Hollow',
  spawn: { col: 11, row: 6 },
  exits: [{ side: 'north', label: '' }, { side: 'east', label: '' }],
  sign: '',
  tiles: [
    'TTTTTTTTTTppTTTTTTTTTT',
    'TT..b.....pp..b..T..TT',
    'T...bb..r.pp.....bb..T',
    'T.b.......pp..f......T',
    'T....T....pp....b....T',
    'T..f..b...pp.....r..TT',
    'T.........pppppppppppp',
    'TT..b...C.............',
    'T....bb.......b..f...T',
    'T..r.....b.......bb..T',
    'TT....f......r......TT',
    'Th..b......b......f.hT',
    'hhhhhhhhhhhhhhhhhhhhhh',
  ],
};

const OLD_ORCHARD: ScreenData = {
  name: 'Old Orchard',
  spawn: { col: 11, row: 9 },
  exits: [{ side: 'east', label: '' }, { side: 'south', label: '' }],
  sign: '',
  tiles: [
    'TTTTTTTTTTTTTTTTTTTTTT',
    'TT..T...T...T...T...TT',
    'T.........f..........T',
    'T...T...T...T...T....T',
    'T..r.......C.......r.T',
    'T...T...T...T...T....T',
    'T.......f......b.....T',
    'T...T...T...T...T....T',
    'T.........pppppppppppp',
    'T..b......pp..........',
    'T...T...T.pp.T...T...T',
    'TT........pp...f....TT',
    'TTTTTTTTTTppTTTTTTTTTT',
  ],
};

const MILL_POND: ScreenData = {
  name: 'Mill Pond',
  spawn: { col: 11, row: 7 },
  exits: [{ side: 'north', label: '' }, { side: 'west', label: '' }],
  sign: '',
  tiles: [
    'TTTTTTTTTTppTTTTTTTTTT',
    'TT..b.....pp...b...TTT',
    'T....W....pp.........T',
    'T.........pp..~~~~...T',
    'T..f......pp.~~~~~~..T',
    'T....r....pp.~~~~~~..T',
    'pppppppppppp..~~~~...T',
    '.....b...C......f...TT',
    'T..b.........r......bT',
    'TT....f....b.....b...T',
    'T..r.........f......TT',
    'Th....b.........b..hhT',
    'hhhhhhhhhhhhhhhhhhhhhh',
  ],
};

/** Behind Oakhollow's back hedge: a hidden clearing ringed by trees, with one cheeky chest. */
const SECRET_CLEARING: ScreenData = {
  name: 'Secret Clearing',
  spawn: { col: 11, row: 3 },
  exits: [{ side: 'north', label: '', full: true }],
  sign: '',
  tiles: [
    'hhhhhhhhhhhhhhhhhhhhhh',
    'TT..................TT',
    'T..f....b.....b..f...T',
    'T....................T',
    'TT..f.............f.TT',
    'T.........ff.........T',
    'T....b....C.....b....T',
    'T.........ff.........T',
    'TT..f.............f.TT',
    'T....................T',
    'T..b....f.....f...b..T',
    'TT..................TT',
    'TTTTTTTTTTTTTTTTTTTTTT',
  ],
};

/** Oakhollow Village: home. Bob's smithy (left), Jerry's armory (right), the Training Yard (bottom right). */
const OAKHOLLOW: ScreenData = {
  name: 'Oakhollow Village',
  spawn: { col: 11, row: 9 },
  exits: [{ side: 'north', label: '' }, { side: 'west', label: '' }, { side: 'east', label: '' }, { side: 'south', label: '', full: true }],
  sign: 'Oakhollow Village',
  buildings: [
    { col: 3, row: 1, w: 4, h: 3, kind: 'smith', roof: 0xb5543c },
    { col: 16, row: 1, w: 4, h: 3, kind: 'armor', roof: 0x4f7fb8 },
    { col: 2, row: 8, w: 3, h: 3, kind: 'house', roof: 0x5f9b3a },
  ],
  npcs: ['bob', 'jerry'],
  tiles: [
    'hhhhhhhhhhpphhhhhhhhhh',
    'TZ.HHHH...pp....HHHH.T',
    'T..HHHH...pp....HHHH.T',
    'T..HHHH...pp....HHHH.T',
    'T.A..N..o.pp.o...N.M.T',
    'h.........pp.........h',
    'pppppppppppppppppppppp',
    '..........pp..........',
    'T.HHH.....pp..U....Q.T',
    'T.HHH..f..pp.......Y.T',
    'T.HHH.....pp.....o...T',
    'Th...f...Spp.....f..hT',
    'hhhhhhhhhhhhhhhhhhhhhh',
  ],
};

const KEEP_GATE: ScreenData = {
  name: 'Ogre Keep Gate',
  spawn: { col: 11, row: 10 },
  exits: [{ side: 'west', label: '' }, { side: 'south', label: '' }, { side: 'north', label: '' }],
  sign: '',
  tiles: [
    'XXXXXXXXXXKKXXXXXXXXXX',
    'XXXXXXXXXXKKXXXXXXXXXX',
    'XXXXXXXXXXKKXXXXXXXXXX',
    'T....w....pp....w...TT',
    'T..r......pp.......r.T',
    'T...b.....pp...b.....T',
    'T.....f...pp.........T',
    'TT........pp....f...TT',
    '..........pp.........T',
    'pppppppppppp...b.....T',
    'T...f.....pp.....r...T',
    'Th...b....pp.....b..hT',
    'hhhhhhhhhhpphhhhhhhhhh',
  ],
};

/* ---------------- Ogre Keep rooms ---------------- */
// Doorways: north = row 0 cols 10-11, south = row 12 cols 10-11, west/east = rows 5-6.

const R1: RoomData = {
  name: 'Entrance Hall',
  spawn: { col: 11, row: 10 },
  tiles: [
    '####t####tDDt####t####',
    '#....x.............x.#',
    '#..P....B....B....P..#',
    '#....................#',
    '#..w..............w..#',
    '#....................D',
    '#....................D',
    '#..P..............P..#',
    '#......x.............#',
    '#........w...w.......#',
    '#.x..................#',
    '#....................#',
    '##########DD##########',
  ],
};

const R2: RoomData = {
  name: 'Guard Room',
  spawn: { col: 3, row: 6 },
  tiles: [
    '####t####t##t####t####',
    '#...x..........w...x.#',
    '#..P.........C....P..#',
    '#.......w............#',
    '#..............P.....#',
    'D....................#',
    'D.........B..........#',
    '#..P.................#',
    '#.......w.......w....#',
    '#..P..............P..#',
    '#.x................x.#',
    '#....................#',
    '######################',
  ],
};

const R3: RoomData = {
  name: 'Lava Crossing',
  spawn: { col: 11, row: 10 },
  hiddenBridge: true,
  doors: { east: 'key' },
  tiles: [
    '####t####tDDt####t####',
    '#..x............X....#',
    '#..P....B....B....P..#',
    '#LLLLLLLLL==LLLLLLLLL#',
    '#LLLLLLLLL==LLLLLLLLL#',
    '#....................D',
    '#....................D',
    '#..P..............P..#',
    '#......x.......x.....#',
    '#..P.....B...B....P..#',
    '#.x................x.#',
    '#....................#',
    '##########DD##########',
  ],
};

const R4: RoomData = {
  name: 'Ogre Den',
  spawn: { col: 3, row: 6 },
  doors: { west: 'key' },
  tiles: [
    '####t####t##t####t####',
    '#...x.....w.w......x.#',
    '#..P.....C........P..#',
    '#....................#',
    '#..w.............w...#',
    'D....................#',
    'D....................#',
    '#..P..............P..#',
    '#.......x....x.......#',
    '#..w..............w..#',
    '#.x................x.#',
    '#....................#',
    '######################',
  ],
};

const R5: RoomData = {
  name: 'Archer Gallery',
  spawn: { col: 11, row: 10 },
  tiles: [
    '####t####t##t####t####',
    '#..P....P....P....P..#',
    '#....................#',
    '#..w....w....w....w..#',
    '#....................#',
    '#....................D',
    '#....................D',
    '#..P....P....P....P..#',
    '#....................#',
    '#......x......x......#',
    '#.x................x.#',
    '#....................#',
    '##########DD##########',
  ],
};

const R6: RoomData = {
  name: 'Fountain Room',
  spawn: { col: 3, row: 6 },
  doors: { north: 'bigkey' },
  tiles: [
    '####t####tDDt####t####',
    '#..P..............P..#',
    '#....B..........B....#',
    '#....................#',
    '#.........F..........#',
    'D....................#',
    'D....................#',
    '#..P..............P..#',
    '#.........C..........#',
    '#....................#',
    '#.x..B..........B..x.#',
    '#....................#',
    '######################',
  ],
};

const THRONE: RoomData = {
  name: "Grumbok's Throne",
  spawn: { col: 11, row: 10 },
  hiddenChest: true,
  tiles: [
    '####t####t##t####t####',
    '#..P....B....B....P..#',
    '#.........C..........#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#..P..............P..#',
    '#.x................x.#',
    '#....................#',
    '##########DD##########',
  ],
};

export const AREAS: Area[] = [
  {
    id: 'v1', title: 'Oakhollow Village', region: 'Greenmeadow', kind: 'meadow', grid: { x: 0, y: 1 }, village: true,
    meadow: OAKHOLLOW, enemies: [],
    links: { north: { to: 'g1', conn: 'v1-g1' }, west: { to: 'g6', conn: 'g6-v1' }, east: { to: 'g8', conn: 'v1-g8' }, south: { to: 'v2', conn: 'v1-v2' } },
  },
  {
    id: 'v2', title: 'Secret Clearing', region: 'Greenmeadow', kind: 'meadow', grid: { x: 0, y: 2 }, secret: true,
    meadow: SECRET_CLEARING, chest: 'cheater', enemies: [],
    links: { north: { to: 'v1', conn: 'v1-v2' } },
  },
  {
    id: 'g1', title: 'Greenmeadow', region: 'Greenmeadow', kind: 'meadow', grid: { x: 0, y: 0 },
    meadow: MEADOW_ADV, chest: 'wooden', enemies: ['green', 'green', 'green'],
    links: { north: { to: 'g2', conn: 'g1-g2' }, east: { to: 'g3', conn: 'g1-g3' }, south: { to: 'v1', conn: 'v1-g1' }, west: { to: 'g5', conn: 'g5-g1' } },
  },
  {
    id: 'g2', title: 'North Road', region: 'Greenmeadow', kind: 'meadow', grid: { x: 0, y: -1 },
    meadow: NORTH_ROAD, chest: 'wooden', enemies: ['green', 'green', 'blue', 'green'],
    links: { south: { to: 'g1', conn: 'g1-g2' }, east: { to: 'g4', conn: 'g2-g4' }, west: { to: 'g7', conn: 'g7-g2' } },
  },
  {
    id: 'g3', title: 'East Fields', region: 'Greenmeadow', kind: 'meadow', grid: { x: 1, y: 0 },
    meadow: EAST_FIELDS, chest: 'wooden', enemies: ['green', 'blue', 'green', 'skelWarrior'],
    links: { west: { to: 'g1', conn: 'g1-g3' }, north: { to: 'g4', conn: 'g3-g4' }, south: { to: 'g8', conn: 'g3-g8' } },
  },
  {
    id: 'g5', title: 'West Woods', region: 'Greenmeadow', kind: 'meadow', grid: { x: -1, y: 0 },
    meadow: WEST_WOODS, chest: 'wooden', enemies: ['green', 'blue', 'skelWarrior', 'green'],
    links: { east: { to: 'g1', conn: 'g5-g1' }, north: { to: 'g7', conn: 'g7-g5' }, south: { to: 'g6', conn: 'g5-g6' } },
  },
  {
    id: 'g6', title: 'Bramble Hollow', region: 'Greenmeadow', kind: 'meadow', grid: { x: -1, y: 1 },
    meadow: BRAMBLE_HOLLOW, chest: 'wooden', enemies: ['blue', 'blue', 'skelArcher', 'green', 'green'],
    links: { north: { to: 'g5', conn: 'g5-g6' }, east: { to: 'v1', conn: 'g6-v1' } },
  },
  {
    id: 'g7', title: 'Old Orchard', region: 'Greenmeadow', kind: 'meadow', grid: { x: -1, y: -1 },
    meadow: OLD_ORCHARD, chest: 'silver', enemies: ['skelWarrior', 'skelWarrior', 'skelArcher', 'ogre'],
    links: { east: { to: 'g2', conn: 'g7-g2' }, south: { to: 'g5', conn: 'g7-g5' } },
  },
  {
    id: 'g8', title: 'Mill Pond', region: 'Greenmeadow', kind: 'meadow', grid: { x: 1, y: 1 },
    meadow: MILL_POND, chest: 'wooden', enemies: ['green', 'green', 'blue', 'skelArcher', 'skelWarrior'],
    links: { north: { to: 'g3', conn: 'g3-g8' }, west: { to: 'v1', conn: 'v1-g8' } },
  },
  {
    id: 'g4', title: 'Ogre Keep Gate', region: 'Greenmeadow', kind: 'meadow', grid: { x: 1, y: -1 },
    meadow: KEEP_GATE, enemies: ['skelWarrior', 'green', 'green', 'skelArcher'],
    links: { west: { to: 'g2', conn: 'g2-g4' }, south: { to: 'g3', conn: 'g3-g4' }, north: { to: 'r1', conn: 'gate' } },
  },
  {
    id: 'r1', title: 'Entrance Hall', region: 'Ogre Keep', kind: 'room', grid: { x: 0, y: 0 }, room: R1,
    enemies: ['green', 'green', 'green', 'green', 'skelWarrior', 'skelWarrior'],
    links: { south: { to: 'g4', conn: 'gate' }, north: { to: 'r3', conn: 'r1-r3' }, east: { to: 'r2', conn: 'r1-r2' } },
  },
  {
    id: 'r2', title: 'Guard Room', region: 'Ogre Keep', kind: 'room', grid: { x: 1, y: 0 }, room: R2, chest: 'smallkey',
    enemies: ['skelWarrior', 'skelWarrior', 'skelWarrior', 'skelArcher'],
    links: { west: { to: 'r1', conn: 'r1-r2' } },
  },
  {
    id: 'r3', title: 'Lava Crossing', region: 'Ogre Keep', kind: 'room', grid: { x: 0, y: -1 }, room: R3,
    enemies: ['green', 'green', 'green', 'blue', 'blue'],
    links: { south: { to: 'r1', conn: 'r1-r3' }, east: { to: 'r4', conn: 'r3-r4', lock: 'key' }, north: { to: 'r5', conn: 'r3-r5' } },
  },
  {
    id: 'r4', title: 'Ogre Den', region: 'Ogre Keep', kind: 'room', grid: { x: 1, y: -1 }, room: R4, chest: 'bigkey',
    enemies: ['ogre', 'ogre', 'skelArcher', 'skelArcher'],
    links: { west: { to: 'r3', conn: 'r3-r4', lock: 'key' } },
  },
  {
    id: 'r5', title: 'Archer Gallery', region: 'Ogre Keep', kind: 'room', grid: { x: 0, y: -2 }, room: R5,
    enemies: ['skelArcher', 'skelArcher', 'skelArcher', 'skelWarrior', 'skelWarrior', 'skelWarrior'],
    links: { south: { to: 'r3', conn: 'r3-r5' }, east: { to: 'r6', conn: 'r5-r6' } },
  },
  {
    id: 'r6', title: 'Fountain Room', region: 'Ogre Keep', kind: 'room', grid: { x: 1, y: -2 }, room: R6, chest: 'silver',
    enemies: [],
    links: { west: { to: 'r5', conn: 'r5-r6' }, north: { to: 'boss', conn: 'r6-boss', lock: 'bigkey' } },
  },
  {
    id: 'boss', title: "Grumbok's Throne", region: 'Ogre Keep', kind: 'room', grid: { x: 1, y: -3 }, room: THRONE, chest: 'gold', boss: true,
    enemies: ['ogreKing'],
    links: { south: { to: 'r6', conn: 'r6-boss', lock: 'bigkey' } },
  },
];

export const OPPOSITE: Record<Side, Side> = { north: 'south', south: 'north', east: 'west', west: 'east' };

export function area(id: string): Area {
  const a = AREAS.find((x) => x.id === id);
  if (!a) throw new Error(`No area ${id}`);
  return a;
}
