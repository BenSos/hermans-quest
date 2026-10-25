import * as THREE from 'three';
import { toon } from '../core/toon';
import { fbm, mulberry32 } from '../core/noise';
import { CollisionWorld } from '../game/collision';
import type { ScreenData } from './greenmeadow';
import { buildGrass, GrassField } from './grass';
import { buildWater } from './water';
import {
  Chest, Placement, buildTrees, buildBushes, buildRocks, buildFlowers,
  buildWindmill, buildSign, buildChest, buildBridge, buildBarricade,
} from './props';
import { addOutline } from '../core/toon';
import { buildHouse, buildNpc, buildDummy, buildWell, buildBarrel, buildBoard, buildAnvil, buildArmorStand, buildSecretButton, Npc, Dummy, SecretButton } from './village';
import { smooth } from '../core/geo';

export const TILE = 1;
const RES = 4; // field samples per tile
const MARGIN = 10; // tiles of scenery drawn outside the playable screen

/** Adventure only: lets a screen see the screens around it, so scenery joins up with no gap. */
export interface ScreenOpts {
  /** Tiles of the meadow screen next door (dx, dy = -1/0/1), or null if there is none. */
  neighbor?: (dx: number, dy: number) => string[] | null;
  /** Where this screen sits in the big map, so ground noise lines up across screens. */
  origin?: { x: number; z: number };
}

export interface ExitZone { side: 'north' | 'south' | 'east' | 'west'; label: string; minX: number; maxX: number; minZ: number; maxZ: number }

export interface BuiltScreen {
  kind: 'meadow' | 'dungeon';
  name: string;
  group: THREE.Group;
  collision: CollisionWorld;
  grass?: GrassField;
  /** Interactive sign (null if there is none). */
  hasSign: boolean;
  spawn: THREE.Vector3;
  exits: ExitZone[];
  signPos: THREE.Vector3;
  signText: string;
  chestPos: THREE.Vector3;
  chest: Chest | null;
  width: number;
  depth: number;
  update: (t: number, dt: number, player: THREE.Vector3) => void;
  /** True if a point is a place a small creature may wander (grass, path, flowers). */
  walkable: (x: number, z: number) => boolean;
  /** River band (z range) and where the bridge crosses it, so monsters can find the way over. */
  river: { zMin: number; zMax: number; bridgeX: number } | null;
  /** Where the liftable rocks start. */
  rockSpots: { x: number; z: number }[];
  /** Dungeon rooms only: */
  doors?: import('./dungeon').Door[];
  crystalPos?: THREE.Vector3 | null;
  fountainPos?: THREE.Vector3 | null;
  hitCrystal?: () => boolean;
  revealBridge?: () => void;
  showChest?: () => void;
  /** Darken the (unlit) river at night. */
  setWaterTint: (c: THREE.Color) => void;
  /** Village: shopkeepers, the training dummy and the Training Yard board. */
  npcs?: Npc[];
  dummy?: Dummy | null;
  dummyPos?: THREE.Vector3 | null;
  boardPos?: THREE.Vector3 | null;
  secret?: SecretButton | null;
  /** Hide tall things along the top edge while this screen sits below the current one (so they don't cover it). */
  setNorthTall?: (visible: boolean) => void;
  secretPos?: THREE.Vector3 | null;
}

const C = (hex: number) => new THREE.Color(hex);
const PALETTE = {
  grassA: C(0x6fbe45),
  grassB: C(0x8fd457),
  grassDark: C(0x5aa83c),
  dirt: C(0xdcb36f),
  dirtDark: C(0xc89a58),
  sand: C(0xead6a0),
  riverbed: C(0x4f8f86),
};

export function buildScreen(data: ScreenData, opts: ScreenOpts = {}): BuiltScreen {
  const W = data.tiles[0].length;
  const H = data.tiles.length;
  const ox = opts.origin?.x ?? 0;
  const oz = opts.origin?.z ?? 0;
  const nb = (dx: number, dy: number) => opts.neighbor?.(dx, dy) ?? null;
  // Scenery margin on each side: none where another screen joins on, a forest everywhere else
  const mN = nb(0, -1) ? 0 : MARGIN;
  const mS = nb(0, 1) ? 0 : MARGIN;
  const mE = nb(1, 0) ? 0 : MARGIN;
  const mW = nb(-1, 0) ? 0 : MARGIN;
  const halfW = W / 2;
  const halfH = H / 2;
  const group = new THREE.Group();
  const collision = new CollisionWorld();
  collision.bounds = { minX: -halfW, maxX: halfW, minZ: -halfH, maxZ: halfH };
  collision.wadeable = true;
  const rnd = mulberry32(2024);

  const tileCenter = (col: number, row: number) => ({ x: col - halfW + 0.5, z: row - halfH + 0.5 });
  const riverRows = data.tiles.map((r, i) => (r[0] === '~' || r[W - 1] === '~' ? i : -1)).filter((i) => i >= 0);
  // Exits are gaps in the edge of the map: path, grass or the keep gate on the outermost row/column.
  const OPEN = new Set(['p', '.', 'f', 'K']);
  const exitCols = (rowStr: string) => [...rowStr].map((c, i) => (OPEN.has(c) ? i : -1)).filter((i) => i >= 0);
  const northCols = exitCols(data.tiles[0]);
  const southCols = exitCols(data.tiles[H - 1]);
  const eastRows = data.tiles.map((r, i) => (OPEN.has(r[W - 1]) ? i : -1)).filter((i) => i >= 0);
  const westRows = data.tiles.map((r, i) => (OPEN.has(r[0]) ? i : -1)).filter((i) => i >= 0);

  /** Tile letter at any tile, including the scenery outside the screen. */
  const typeAt = (col: number, row: number): string => {
    if (col >= 0 && col < W && row >= 0 && row < H) return data.tiles[row][col];
    const dx = col < 0 ? -1 : col >= W ? 1 : 0;
    const dy = row < 0 ? -1 : row >= H ? 1 : 0;
    const other = nb(dx, dy);
    if (other) {
      const r = other[Math.max(0, Math.min(H - 1, row - dy * H))];
      return r[Math.max(0, Math.min(W - 1, col - dx * W))];
    }
    if (riverRows.includes(row)) return '~';
    if (row < 0 && northCols.includes(col)) return 'p';
    if (row >= H && southCols.includes(col)) return 'p';
    if (col >= W && eastRows.includes(row)) return data.tiles[row][W - 1] === 'p' ? 'p' : '.';
    if (col < 0 && westRows.includes(row)) return data.tiles[row][0] === 'p' ? 'p' : '.';
    if (row < 0 && data.tiles[0].includes('X')) return 'X';
    return 'O';
  };

  /* ----- Smooth fields for water and path (so edges are soft curves, not squares) ----- */
  const FW = (W + MARGIN * 2) * RES;
  const FH = (H + MARGIN * 2) * RES;
  const water = new Float32Array(FW * FH);
  const path = new Float32Array(FW * FH);
  for (let j = 0; j < FH; j++) {
    for (let i = 0; i < FW; i++) {
      const col = Math.floor(i / RES) - MARGIN;
      const row = Math.floor(j / RES) - MARGIN;
      const t = typeAt(col, row);
      water[j * FW + i] = t === '~' || t === '=' ? 1 : 0;
      path[j * FW + i] = t === 'p' || t === '=' || t === 'K' || t === 'X' || t === 'H' ? 1 : 0;
    }
  }
  const blur = (f: Float32Array, r: number) => {
    const tmp = new Float32Array(f.length);
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const ii = Math.min(FW - 1, Math.max(0, i + k)); s += f[j * FW + ii]; n++; }
      tmp[j * FW + i] = s / n;
    }
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const jj = Math.min(FH - 1, Math.max(0, j + k)); s += tmp[jj * FW + i]; n++; }
      f[j * FW + i] = s / n;
    }
  };
  blur(water, 3); blur(water, 2);
  blur(path, 2); blur(path, 2);
  const sample = (f: Float32Array, x: number, z: number) => {
    const fx = (x + halfW + MARGIN) * RES - 0.5;
    const fz = (z + halfH + MARGIN) * RES - 0.5;
    const i0 = Math.max(0, Math.min(FW - 2, Math.floor(fx)));
    const j0 = Math.max(0, Math.min(FH - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i0));
    const tz = Math.min(1, Math.max(0, fz - j0));
    const a = f[j0 * FW + i0], b = f[j0 * FW + i0 + 1], c = f[(j0 + 1) * FW + i0], d = f[(j0 + 1) * FW + i0 + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };

  /* ----- Ground ----- */
  const gw = W + mW + mE;
  const gh = H + mN + mS;
  const gcx = (mE - mW) / 2;
  const gcz = (mS - mN) / 2;
  const ground = new THREE.PlaneGeometry(gw, gh, gw * RES, gh * RES);
  ground.rotateX(-Math.PI / 2);
  ground.translate(gcx, 0, gcz);
  const pos = ground.getAttribute('position') as THREE.BufferAttribute;
  const col = new THREE.Color();
  const groundColorAt = (x: number, z: number, out: THREE.Color) => {
    const w = sample(water, x, z);
    const p = sample(path, x, z);
    const n = fbm((x + ox) * 0.3, (z + oz) * 0.3);
    const n2 = fbm((x + ox) * 1.7 + 40, (z + oz) * 1.7);
    out.copy(PALETTE.grassA).lerp(PALETTE.grassB, Math.min(1, Math.max(0, (n - 0.35) * 2.2)));
    if (n2 > 0.66) out.lerp(PALETTE.grassDark, 0.55);
    const pathEdge = p + (n2 - 0.5) * 0.35;
    if (pathEdge > 0.42) out.copy(PALETTE.dirt).lerp(PALETTE.dirtDark, THREE.MathUtils.smoothstep(n2, 0.5, 0.62) * 0.8);
    if (w > 0.08 + (n2 - 0.5) * 0.08) out.copy(PALETTE.sand);
    if (w > 0.55) out.copy(PALETTE.riverbed);
    return out;
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const w = sample(water, x, z);
    const dip = THREE.MathUtils.smoothstep(w, 0.3, 0.75);
    pos.setY(i, -0.55 * dip);
  }
  ground.computeVertexNormals();
  // Paint the ground into a texture (16 pixels per tile) so path and sand edges stay smooth.
  const PX = 24;
  const tw = gw * PX;
  const th = gh * PX;
  const tex = new Uint8Array(tw * th * 4);
  for (let j = 0; j < th; j++) {
    for (let i = 0; i < tw; i++) {
      const x = (i + 0.5) / PX - gw / 2 + gcx;
      const z = (j + 0.5) / PX - gh / 2 + gcz;
      groundColorAt(x, z, col);
      col.convertLinearToSRGB();
      const k = ((th - 1 - j) * tw + i) * 4;
      tex[k] = col.r * 255; tex[k + 1] = col.g * 255; tex[k + 2] = col.b * 255; tex[k + 3] = 255;
    }
  }
  const groundTex = new THREE.DataTexture(tex, tw, th, THREE.RGBAFormat);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.magFilter = THREE.LinearFilter;
  groundTex.minFilter = THREE.LinearMipmapLinearFilter;
  groundTex.generateMipmaps = true;
  groundTex.anisotropy = 8;
  groundTex.needsUpdate = true;
  const groundMesh = new THREE.Mesh(ground, toon(0xffffff, { map: groundTex }));
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  /* ----- River ----- */
  let waterUpdate = (_t: number) => {};
  let waterTint = (_c: THREE.Color) => {};
  if (riverRows.length) {
    const z0 = Math.min(...riverRows) - halfH;
    const z1 = Math.max(...riverRows) + 1 - halfH;
    const wtr = buildWater(gw, z1 - z0 + 1.2, gcx, (z0 + z1) / 2, -0.17);
    group.add(wtr.mesh);
    waterUpdate = wtr.update;
    waterTint = wtr.setTint;
  }

  // A pond (water that doesn't touch the edges) gets its own little water surface
  if (!riverRows.length) {
    const wt: { c: number; r: number }[] = [];
    data.tiles.forEach((rowStr, r) => [...rowStr].forEach((ch, c) => { if (ch === '~') wt.push({ c, r }); }));
    if (wt.length) {
      const c0 = Math.min(...wt.map((w) => w.c)), c1 = Math.max(...wt.map((w) => w.c)) + 1;
      const r0 = Math.min(...wt.map((w) => w.r)), r1 = Math.max(...wt.map((w) => w.r)) + 1;
      const wtr = buildWater(c1 - c0 + 1.2, r1 - r0 + 1.2, (c0 + c1) / 2 - halfW, (r0 + r1) / 2 - halfH, -0.17);
      group.add(wtr.mesh);
      waterUpdate = wtr.update;
      waterTint = wtr.setTint;
    }
  }

  /* ----- Read the tile map: props + colliders ----- */
  const npcs: Npc[] = [];
  let npcIdx = 0;
  let dummy: Dummy | null = null;
  let dummyPos: THREE.Vector3 | null = null;
  let boardPos: THREE.Vector3 | null = null;
  let secret: SecretButton | null = null;
  let secretPos: THREE.Vector3 | null = null;
  const forges: { coals: THREE.Mesh }[] = [];
  const wells: { update: (t: number) => void; setTint: (c: THREE.Color) => void }[] = [];
  const northTall: THREE.Object3D[] = [];
  for (const b of data.buildings ?? []) {
    const house = buildHouse(b.w, b.h, b.roof, b.kind);
    house.position.set(b.col - halfW + b.w / 2, 0, b.row - halfH + b.h / 2);
    group.add(house);
    if (b.row < 5) northTall.push(house);
    if (house.userData.glow) forges.push(house.userData.glow);
  }
  const treeList: Placement[] = [];
  const bushList: Placement[] = [];
  const hedgeList: Placement[] = [];
  const rockList: Placement[] = [];
  const rockSpots: { x: number; z: number }[] = [];
  const flowerList: Placement[] = [];
  const reedList: Placement[] = [];
  let windmill: ReturnType<typeof buildWindmill> | null = null;
  const keepBlocks: { x: number; z: number; row: number }[] = [];
  const gateTiles: { x: number; z: number; row: number }[] = [];
  let chest: ReturnType<typeof buildChest> | null = null;
  const signPos = new THREE.Vector3(999, 0, 999);
  const chestPos = new THREE.Vector3();
  const bridgeTiles: { x: number; z: number }[] = [];
  const leafTints = [0x4fae3f, 0x5cbc46, 0x45a03c, 0x67c24c].map(C);
  const flowerTints = [0xffffff, 0xff8fc7, 0x86b8ff, 0xff6464, 0xffe066, 0xc9a0ff].map(C);
  const jitter = (a: number) => (rnd() - 0.5) * a;
  const addFlowers = (cx: number, cz: number, n: number, spread: number) => {
    for (let k = 0; k < n; k++) {
      flowerList.push({ x: cx + jitter(spread), z: cz + jitter(spread), rot: rnd() * 6, scale: 0.85 + rnd() * 0.4, tint: flowerTints[Math.floor(rnd() * flowerTints.length)] });
    }
  };

  for (let row = 0; row < H; row++) {
    for (let c = 0; c < W; c++) {
      const t = data.tiles[row][c];
      const { x, z } = tileCenter(c, row);
      switch (t) {
        case 'T': {
          const p = { x: x + jitter(0.25), z: z + jitter(0.25), rot: rnd() * 6, scale: 0.95 + rnd() * 0.3, tint: leafTints[Math.floor(rnd() * 4)] };
          treeList.push(p);
          collision.addCircle(p.x, p.z, 0.45);
          break;
        }
        case 'b': {
          const p = { x: x + jitter(0.2), z: z + jitter(0.2), rot: rnd() * 6, scale: 0.95 + rnd() * 0.25, tint: C(0x4aa43c).offsetHSL(jitter(0.03), 0, jitter(0.06)) };
          bushList.push(p);
          collision.addCircle(p.x, p.z, 0.42, true);
          break;
        }
        case 'h': {
          hedgeList.push({ x: x + jitter(0.1), z, rot: rnd() * 6, scale: 1.05 + rnd() * 0.15, tint: C(0x3f9a3a).offsetHSL(0, 0, jitter(0.05)) });
          // Hedges inside the screen can be jumped. Hedges on the outer edge can't (no jumping off the map),
          // unless that edge hides a secret ("full" exit).
          const edgeSide = row === 0 ? 'north' : row === H - 1 ? 'south' : c === 0 ? 'west' : c === W - 1 ? 'east' : null;
          const jumpable = !edgeSide || data.exits.some((e) => e.full && e.side === edgeSide);
          collision.addCircle(x, z, 0.46, jumpable);
          break;
        }
        case 'r': {
          // Liftable rocks are built by the game (src/game/rocks.ts) so Herman can pick them up.
          rockSpots.push({ x: x + jitter(0.2), z: z + jitter(0.2) });
          break;
        }
        case 'f':
          addFlowers(x, z, 9, 0.9);
          break;
        case '~':
          collision.addBox(x - 0.5, x + 0.5, z - 0.5, z + 0.5, true);
          break;
        case '=':
          bridgeTiles.push({ x, z });
          break;
        case 'W': {
          windmill = buildWindmill();
          windmill.group.position.set(x, 0, z);
          group.add(windmill.group);
          collision.addCircle(x, z, 1.15);
          break;
        }
        case 'S': {
          const s = buildSign();
          s.position.set(x, 0, z);
          group.add(s);
          signPos.set(x, 0, z);
          collision.addCircle(x, z, 0.22, true);
          break;
        }
        case 'w': {
          const b = buildBarricade();
          b.position.set(x, 0, z);
          b.rotation.y = jitter(0.6);
          group.add(b);
          collision.addCircle(x, z, 0.45, true);
          break;
        }
        case 'X':
          keepBlocks.push({ x, z, row });
          collision.addBox(x - 0.5, x + 0.5, z - 0.5, z + 0.5);
          break;
        case 'K':
          gateTiles.push({ x, z, row });
          break;
        case 'H':
          collision.addBox(x - 0.5, x + 0.5, z - 0.5, z + 0.5);
          break;
        case 'N': {
          const id = data.npcs?.[npcIdx++] ?? 'bob';
          const n = buildNpc(id);
          n.group.position.set(x, 0, z);
          group.add(n.group);
          npcs.push(n);
          collision.addCircle(x, z, 0.35);
          break;
        }
        case 'Y': {
          dummy = buildDummy();
          dummy.group.position.set(x, 0, z);
          group.add(dummy.group);
          dummyPos = new THREE.Vector3(x, 0, z);
          collision.addCircle(x, z, 0.35, true);
          break;
        }
        case 'Z': {
          secret = buildSecretButton();
          secret.group.position.set(x, 0, z);
          group.add(secret.group);
          secretPos = new THREE.Vector3(x, 0, z);
          collision.addBox(x - 0.3, x + 0.3, z - 0.25, z + 0.25);
          break;
        }
        case 'Q': {
          const b = buildBoard();
          b.position.set(x, 0, z);
          group.add(b);
          boardPos = new THREE.Vector3(x, 0, z);
          collision.addBox(x - 0.7, x + 0.7, z - 0.2, z + 0.2);
          break;
        }
        case 'U': {
          const w = buildWell();
          w.position.set(x, 0, z);
          group.add(w);
          wells.push(w.userData.water);
          // Solid all the way round: nobody walks, jumps or shoots through the well
          collision.addCircle(x, z, 0.72);
          break;
        }
        case 'o': {
          const b = buildBarrel();
          b.position.set(x + jitter(0.2), 0, z + jitter(0.2));
          b.rotation.y = rnd() * 6;
          group.add(b);
          collision.addCircle(x, z, 0.32, true);
          break;
        }
        case 'A': {
          const a = buildAnvil();
          a.position.set(x, 0, z);
          a.rotation.y = 0.3;
          group.add(a);
          collision.addCircle(x, z, 0.38, true);
          break;
        }
        case 'M': {
          const m = buildArmorStand();
          m.position.set(x, 0, z);
          group.add(m);
          collision.addCircle(x, z, 0.3, true);
          break;
        }
        case 'C': {
          chest = buildChest();
          chest.group.position.set(x, 0, z);
          group.add(chest.group);
          chestPos.set(x, 0, z);
          collision.addBox(x - 0.42, x + 0.42, z - 0.3, z + 0.3).low = true;
          break;
        }
      }
    }
  }

  // A sprinkle of extra flowers on open grass inside the screen.
  for (let k = 0; k < 40; k++) {
    const x = (rnd() - 0.5) * (W - 2);
    const z = (rnd() - 0.5) * (H - 2);
    if (sample(water, x, z) < 0.02 && sample(path, x, z) < 0.2) addFlowers(x, z, 1, 0);
  }

  // Reeds along the river banks (kept clear of the bridge).
  const bridgeX = bridgeTiles.length ? bridgeTiles.reduce((a, b) => a + b.x, 0) / bridgeTiles.length : 999;
  for (let k = 0; k < 400 && reedList.length < 46; k++) {
    const x = (rnd() - 0.5) * (W + 6);
    const z = (riverRows.length ? Math.min(...riverRows) - halfH : 0) + rnd() * (riverRows.length + 1) - 0.5;
    const w = sample(water, x, z);
    if (w > 0.22 && w < 0.42 && sample(path, x, z) < 0.15 && Math.abs(x - bridgeX) > 1.7) {
      reedList.push({ x, z, rot: rnd() * 6, scale: 0.8 + rnd() * 0.5, tint: C(0x5f9b3a) });
    }
  }

  /* ----- Scenery outside the screen: forest on the sides and back, low bushes in front ----- */
  const inExitCorridor = (x: number, z: number) => {
    if (z < -halfH && northCols.length && Math.abs(x - (northCols[0] + northCols.length / 2 - halfW)) < 1.8) return true;
    if (z > halfH && southCols.length && Math.abs(x - (southCols[0] + southCols.length / 2 - halfW)) < 1.8) return true;
    if (x > halfW && eastRows.length) {
      const zc = eastRows[0] + eastRows.length / 2 - halfH;
      if (Math.abs(z - zc) < 1.6) return true;
    }
    if (x < -halfW && westRows.length) {
      const zc = westRows[0] + westRows.length / 2 - halfH;
      if (Math.abs(z - zc) < 1.6) return true;
    }
    if (z < -halfH && keepBlocks.length) return true;
    return false;
  };
  for (let z = -halfH - mN + 0.5; z < halfH + mS; z += 1.15) {
    for (let x = -halfW - mW + 0.5; x < halfW + mE; x += 1.2) {
      const px = x + jitter(0.6);
      const pz = z + jitter(0.6);
      const outside = Math.abs(px) > halfW + 0.45 || Math.abs(pz) > halfH + 0.45;
      if (!outside || sample(water, px, pz) > 0.04 || sample(path, px, pz) > 0.15 || inExitCorridor(px, pz)) continue;
      if (pz > halfH) {
        if (rnd() < 0.18) bushList.push({ x: px, z: pz, rot: rnd() * 6, scale: 0.9 + rnd() * 0.4, tint: C(0x4aa43c) });
        else if (rnd() < 0.15) addFlowers(px, pz, 3, 0.6);
        continue;
      }
      if (rnd() < 0.82) treeList.push({ x: px, z: pz, rot: rnd() * 6, scale: 1.0 + rnd() * 0.45, tint: leafTints[Math.floor(rnd() * 4)] });
    }
  }

  if (keepBlocks.length) buildKeepFacade(group, keepBlocks, gateTiles, halfH);
  // Trees along the top edge are kept separate so they can hide when this screen is the one below
  const NORTH_BAND = -halfH + 3.2;
  const treesNorth = buildTrees(treeList.filter((p) => p.z < NORTH_BAND));
  group.add(treesNorth, buildTrees(treeList.filter((p) => p.z >= NORTH_BAND)));
  northTall.push(treesNorth);
  if (windmill && (windmill as { group: THREE.Group }).group.position.z < NORTH_BAND) northTall.push((windmill as { group: THREE.Group }).group);
  group.add(buildBushes(bushList));
  group.add(buildBushes(hedgeList, 0.8));
  group.add(buildRocks(rockList));
  group.add(buildFlowers(flowerList));
  group.add(buildReeds(reedList));

  if (bridgeTiles.length) {
    const xs = bridgeTiles.map((b) => b.x);
    const zs = bridgeTiles.map((b) => b.z);
    group.add(buildBridge(Math.min(...xs) - 0.5, Math.max(...xs) + 0.5, Math.min(...zs) - 1.0, Math.max(...zs) + 1.0));
  }

  /* ----- Grass blades on every grassy spot ----- */
  const grassPts: { x: number; z: number; tint: THREE.Color }[] = [];
  const gcol = new THREE.Color();
  // Grass reaches right up to edges that join another screen, and stops short of the forest edges
  const gx0 = -halfW - (mW ? mW - 2 : 0), gx1 = halfW + (mE ? mE - 2 : 0);
  const gz0 = -halfH - (mN ? mN - 2 : 0), gz1 = halfH + (mS ? mS - 2 : 0);
  const area = (gx1 - gx0) * (gz1 - gz0);
  for (let k = 0; k < area * 9; k++) {
    const x = gx0 + rnd() * (gx1 - gx0);
    const z = gz0 + rnd() * (gz1 - gz0);
    const inside = Math.abs(x) < halfW && Math.abs(z) < halfH;
    if (!inside && rnd() < 0.45) continue;
    if (sample(water, x, z) > 0.06 || sample(path, x, z) > 0.32) continue;
    groundColorAt(x, z, gcol);
    grassPts.push({ x, z, tint: gcol.clone().multiplyScalar(0.92 + rnd() * 0.2) });
  }
  const grass = buildGrass(grassPts);
  group.add(grass.mesh);

  /* ----- Exits ----- */
  const exits: ExitZone[] = [];
  for (const e of data.exits) {
    if (e.full) {
      if (e.side === 'north') exits.push({ side: 'north', label: e.label, minX: -halfW, maxX: halfW, minZ: -halfH - 1, maxZ: -halfH + 0.7 });
      if (e.side === 'south') exits.push({ side: 'south', label: e.label, minX: -halfW, maxX: halfW, minZ: halfH - 0.7, maxZ: halfH + 1 });
      continue;
    }
    if (e.side === 'north' && northCols.length) exits.push({ side: 'north', label: e.label, minX: northCols[0] - halfW, maxX: northCols[northCols.length - 1] + 1 - halfW, minZ: -halfH - 1, maxZ: -halfH + 0.7 });
    if (e.side === 'south' && southCols.length) exits.push({ side: 'south', label: e.label, minX: southCols[0] - halfW, maxX: southCols[southCols.length - 1] + 1 - halfW, minZ: halfH - 0.7, maxZ: halfH + 1 });
    if (e.side === 'east' && eastRows.length) exits.push({ side: 'east', label: e.label, minX: halfW - 0.7, maxX: halfW + 1, minZ: eastRows[0] - halfH, maxZ: eastRows[eastRows.length - 1] + 1 - halfH });
    if (e.side === 'west' && westRows.length) exits.push({ side: 'west', label: e.label, minX: -halfW - 1, maxX: -halfW + 0.7, minZ: westRows[0] - halfH, maxZ: westRows[westRows.length - 1] + 1 - halfH });
  }

  const spawnTile = tileCenter(data.spawn.col, data.spawn.row);
  const walkable = (x: number, z: number) => {
    if (Math.abs(x) > halfW - 0.6 || Math.abs(z) > halfH - 0.6) return false;
    if (sample(water, x, z) > 0.05) return false;
    const p = { x, z };
    collision.resolve(p, 0.4);
    return Math.abs(p.x - x) < 0.01 && Math.abs(p.z - z) < 0.01;
  };

  return {
    kind: 'meadow',
    name: data.name,
    hasSign: signPos.x < 900,
    group,
    collision,
    grass,
    spawn: new THREE.Vector3(spawnTile.x, 0, spawnTile.z),
    exits,
    signPos,
    signText: data.sign,
    chestPos,
    chest,
    width: W,
    depth: H,
    walkable,
    setWaterTint: (c) => waterTint(c),
    rockSpots,
    npcs,
    dummy,
    dummyPos,
    boardPos,
    secret,
    secretPos,
    setNorthTall: (v) => { for (const o of northTall) o.visible = v; },
    river: riverRows.length && bridgeTiles.length
      ? { zMin: Math.min(...riverRows) - halfH, zMax: Math.max(...riverRows) + 1 - halfH, bridgeX }
      : null,
    update: (t, dt, player) => {
      grass.update(t, player);
      waterUpdate(t);
      windmill?.update(dt);
      chest?.update(t);
      for (const n of npcs) n.update(t, player);
      dummy?.update(dt);
      secret?.update(dt);
      for (const w of wells) w.update(t);
      for (const f of forges) {
        const k = 0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.06;
        (f.coals.material as THREE.MeshBasicMaterial).color.setRGB(3.2 * k, 1.2 * k, 0.25);
      }
    },
  };
}

function buildReeds(list: Placement[]): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.CylinderGeometry(0.018, 0.025, 0.6, 4);
  stem.translate(0, 0.3, 0);
  const top = new THREE.CapsuleGeometry(0.04, 0.12, 2, 6);
  top.translate(0, 0.6, 0);
  const dummy = new THREE.Object3D();
  const stems = new THREE.InstancedMesh(stem, toon(0x5f9b3a), list.length * 3);
  const tops = new THREE.InstancedMesh(top, toon(0x7a4a2a), list.length * 3);
  let i = 0;
  for (const p of list) {
    for (let k = 0; k < 3; k++) {
      dummy.position.set(p.x + Math.cos(k * 2.1 + p.rot) * 0.1, -0.12, p.z + Math.sin(k * 2.1 + p.rot) * 0.1);
      dummy.rotation.set(Math.sin(p.rot + k) * 0.12, 0, Math.cos(p.rot * 1.3 + k) * 0.12);
      const s = p.scale * (0.8 + k * 0.12);
      dummy.scale.set(1, s, 1);
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      tops.setMatrixAt(i, dummy.matrix);
      i++;
    }
  }
  stems.castShadow = tops.castShadow = true;
  g.add(stems, tops);
  return g;
}

/** The stone front of Ogre Keep: tall battlements with a dark gate, torches and banners. */
function buildKeepFacade(
  group: THREE.Group,
  blocks: { x: number; z: number; row: number }[],
  gate: { x: number; z: number; row: number }[],
  halfH: number,
) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, toon(0xffffff), blocks.length * 2);
  const d = new THREE.Object3D();
  const rnd = mulberry32(5);
  let i = 0;
  for (const b of blocks) {
    const h = 3.2 - b.row * 0.25 + rnd() * 0.2;
    d.position.set(b.x, 0, b.z);
    d.scale.set(1.01, h, 1.01);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    mesh.setColorAt(i++, new THREE.Color(0x7d7f8f).offsetHSL(0, 0, (rnd() - 0.5) * 0.06));
    // battlement teeth on the front row
    const tooth = b.row === Math.max(...blocks.map((x) => x.row)) && Math.round(b.x + 100) % 2 === 0;
    d.position.set(b.x, h, b.z);
    d.scale.set(tooth ? 0.7 : 0.001, tooth ? 0.45 : 0.001, tooth ? 0.7 : 0.001);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    mesh.setColorAt(i++, new THREE.Color(0x8e91a2));
  }
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  addOutline(mesh, 0.02, smooth(geo));
  group.add(mesh);
  if (!gate.length) return;
  // Dark archway over the gate
  const gx = gate.reduce((a, g) => a + g.x, 0) / gate.length;
  const frontZ = Math.max(...blocks.map((b) => b.z)) + 0.5;
  const arch = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 1.2), toon(0x5f6170));
  arch.position.set(gx, 2.6, frontZ - 0.6);
  arch.castShadow = true;
  group.add(arch);
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.6), new THREE.MeshBasicMaterial({ color: 0x0c0a12 }));
  dark.position.set(gx, 1.3, -halfH + 0.02);
  group.add(dark);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, frontZ + halfH), new THREE.MeshBasicMaterial({ color: 0x1a1720 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(gx, 0.02, (frontZ - halfH) / 2);
  group.add(floor);
  // Torches either side of the gate, and red banners
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.5, 0.35) });
  for (const side of [-1, 1]) {
    const tx = gx + side * 1.5;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 8), flameMat);
    flame.position.set(tx, 1.9, frontZ + 0.15);
    const holder = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.15), toon(0x2e2c33));
    holder.position.set(tx, 1.6, frontZ + 0.05);
    group.add(flame, holder);
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.3), toon(0x9a2230, { side: THREE.DoubleSide }));
    ban.position.set(gx + side * 3.5, 1.8, frontZ + 0.02);
    group.add(ban);
  }
}
