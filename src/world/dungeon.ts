import * as THREE from 'three';
import { toon, addOutline } from '../core/toon';
import { smooth } from '../core/geo';
import { mulberry32, fbm } from '../core/noise';
import { CollisionWorld, Collider } from '../game/collision';
import { buildChest, buildBarricade } from './props';
import type { BuiltScreen } from './screen';
import { sfx } from '../core/sfx';

export type Side = 'north' | 'south' | 'east' | 'west';
/** open: a plain doorway (barred only while a fight is on). key: needs a small key. bigkey: the boss door. */
export type DoorKind = 'open' | 'key' | 'bigkey';

export interface Door {
  side: Side;
  kind: DoorKind;
  closed: boolean;
  /** Where Herman stands when he arrives through this door. */
  entry: THREE.Vector3;
  /** Walking into this area (when the door is open) leaves the room. */
  zone: { minX: number; maxX: number; minZ: number; maxZ: number };
  setClosed: (closed: boolean, instant?: boolean) => void;
  setKind: (kind: DoorKind) => void;
  update: (dt: number) => void;
}

export interface RoomData {
  name: string;
  spawn: { col: number; row: number };
  tiles: string[];
  /** Lock type of each doorway ('D' tiles on that wall). Missing sides default to 'open'. */
  doors?: Partial<Record<Side, DoorKind>>;
  /** The lava bridge stays sunk until a crystal switch is hit. */
  hiddenBridge?: boolean;
  /** The chest only appears later (the boss's reward). */
  hiddenChest?: boolean;
}

/**
 * The Dungeon: a torch-lit stone hall the same size as Greenmeadow (22 x 13 tiles).
 * No way out, no rocks to throw. A lava channel splits the room, with one stone bridge,
 * so it plays like the meadow's river: monsters cross at the bridge, arrows fly over the lava.
 *
 * Legend:
 *   #  stone wall      t  wall with a torch    .  floor        L  lava       =  stone bridge
 *   P  pillar          B  fire brazier         x  rubble/bones C  treasure chest
 */
export const DUNGEON_1 = {
  name: 'The Dungeon',
  spawn: { col: 11.5, row: 10 },
  tiles: [
    '####t####t##t####t####',
    '#...x..............x.#',
    '#..P....B....B....P..#',
    '#......x.......x.....#',
    '#..P..............P..#',
    '#LLLLLLLLLL==LLLLLLLL#',
    '#LLLLLLLLLL==LLLLLLLL#',
    '#..P..............P..#',
    '#......C.......x.....#',
    '#..P.....B...B....P..#',
    '#.x................x.#',
    '#....................#',
    '######################',
  ],
};

const STONE = 0x6c7083;
const STONE_LIGHT = 0x8b90a6;

export function buildDungeon(data: RoomData = DUNGEON_1): BuiltScreen {
  const W = data.tiles[0].length;
  const H = data.tiles.length;
  const halfW = W / 2;
  const halfH = H / 2;
  const group = new THREE.Group();
  const collision = new CollisionWorld();
  collision.bounds = { minX: -halfW, maxX: halfW, minZ: -halfH, maxZ: halfH };
  const rnd = mulberry32(77);
  const center = (c: number, r: number) => ({ x: c - halfW + 0.5, z: r - halfH + 0.5 });
  const at = (c: number, r: number) => (c >= 0 && c < W && r >= 0 && r < H ? data.tiles[r][c] : '#');

  const lavaRows = data.tiles.map((row, i) => (row.includes('L') ? i : -1)).filter((i) => i >= 0);
  const hasLava = lavaRows.length > 0;
  const lavaZMin = hasLava ? Math.min(...lavaRows) - halfH : 0;
  const lavaZMax = hasLava ? Math.max(...lavaRows) + 1 - halfH : 0;
  const bridgeCols: number[] = [];
  if (hasLava) data.tiles[lavaRows[0]].split('').forEach((ch, i) => ch === '=' && bridgeCols.push(i));
  const bridgeX = bridgeCols.reduce((a, c) => a + center(c, 0).x, 0) / Math.max(1, bridgeCols.length);

  /* ----- Floor: flagstones painted into a texture ----- */
  const PX = 32;
  const tw = W * PX;
  const th = H * PX;
  const tex = new Uint8Array(tw * th * 4);
  const col = new THREE.Color();
  const base = new THREE.Color(0x5d5f6e);
  const moss = new THREE.Color(0x4d6a48);
  const tileShade: number[] = [];
  for (let i = 0; i < W * H * 4; i++) tileShade.push(0.86 + rnd() * 0.22);
  for (let j = 0; j < th; j++) {
    for (let i = 0; i < tw; i++) {
      // Flagstones are half-tile offset on alternate rows, two per tile
      const fy = j / (PX / 2);
      const row = Math.floor(fy);
      const fx = i / (PX / 2) + (row % 2) * 0.5;
      const cell = Math.floor(fx);
      const lx = fx - cell;
      const ly = fy - row;
      const grout = Math.min(lx, 1 - lx, ly, 1 - ly);
      const shade = tileShade[(row * W * 2 + cell) % tileShade.length];
      const n = fbm(i / 40, j / 40);
      col.copy(base).multiplyScalar(shade * (0.9 + n * 0.25));
      if (fbm(i / 90 + 9, j / 90) > 0.68) col.lerp(moss, 0.35);
      if (grout < 0.06) col.multiplyScalar(0.45);
      else if (grout < 0.1) col.multiplyScalar(0.8);
      col.convertLinearToSRGB();
      const k = ((th - 1 - j) * tw + i) * 4;
      tex[k] = col.r * 255; tex[k + 1] = col.g * 255; tex[k + 2] = col.b * 255; tex[k + 3] = 255;
    }
  }
  const floorTex = new THREE.DataTexture(tex, tw, th, THREE.RGBAFormat);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.magFilter = THREE.LinearFilter;
  floorTex.minFilter = THREE.LinearMipmapLinearFilter;
  floorTex.generateMipmaps = true;
  floorTex.anisotropy = 8;
  floorTex.needsUpdate = true;
  const floorMat = toon(0xffffff, { map: floorTex });
  const floorPiece = (z0: number, z1: number) => {
    const g = new THREE.PlaneGeometry(W, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, (z0 + z1) / 2);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + halfW) / W, 1 - (pos.getZ(i) + halfH) / H);
    const m = new THREE.Mesh(g, floorMat);
    m.receiveShadow = true;
    group.add(m);
  };
  if (hasLava) {
    floorPiece(-halfH, lavaZMin);
    floorPiece(lavaZMax, halfH);
  } else floorPiece(-halfH, halfH);

  // Dark void around the hall
  const voidMesh = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, H + 40), new THREE.MeshBasicMaterial({ color: 0x07060b }));
  voidMesh.rotation.x = -Math.PI / 2;
  voidMesh.position.y = -0.9;
  group.add(voidMesh);

  /* ----- Lava channel ----- */
  const lavaUniforms = { uTime: { value: 0 } };
  const lavaMat = new THREE.ShaderMaterial({
    uniforms: lavaUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vWorld.xz;
        float n = noise(p * 1.3 + vec2(uTime * 0.25, uTime * 0.1)) * 0.6 + noise(p * 3.1 - vec2(uTime * 0.4, 0.0)) * 0.4;
        float crust = smoothstep(0.52, 0.6, n);
        vec3 hot = vec3(1.7, 0.45, 0.06);
        vec3 glow = vec3(2.6, 1.25, 0.25);
        vec3 dark = vec3(0.28, 0.05, 0.03);
        vec3 col = mix(hot, dark, crust);
        float vein = 1.0 - smoothstep(0.0, 0.05, abs(n - 0.48));
        col = mix(col, glow, vein * (1.0 - crust));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(W, Math.max(0.01, lavaZMax - lavaZMin)), lavaMat);
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(0, -0.42, (lavaZMin + lavaZMax) / 2);
  if (hasLava) group.add(lava);
  // Channel walls so it looks like a trench
  const trenchMat = toon(0x3a3a46);
  for (const z of hasLava ? [lavaZMin, lavaZMax] : []) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(W, 0.45, 0.12), trenchMat);
    wall.position.set(0, -0.22, z + (z === lavaZMin ? 0.06 : -0.06));
    group.add(wall);
    // Glowing edge
    const edge = new THREE.Mesh(new THREE.BoxGeometry(W, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.7, 0.15) }));
    edge.position.set(0, -0.38, z + (z === lavaZMin ? 0.13 : -0.13));
    group.add(edge);
  }

  /* ----- Read the map ----- */
  const wallList: { x: number; z: number; h: number }[] = [];
  const torchSpots: { x: number; z: number }[] = [];
  const pillars: { x: number; z: number }[] = [];
  const braziers: { x: number; z: number }[] = [];
  const rubble: { x: number; z: number }[] = [];
  let chest: ReturnType<typeof buildChest> | null = null;
  const chestPos = new THREE.Vector3(999, 0, 999);
  let chestCollider: Collider | null = null;
  const doorTiles: Record<Side, { x: number; z: number; r: number; c: number }[]> = { north: [], south: [], east: [], west: [] };
  const bridgeLava: Collider[] = [];
  let crystalPos: THREE.Vector3 | null = null;
  let fountainPos: THREE.Vector3 | null = null;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = at(c, r);
      const { x, z } = center(c, r);
      if (ch === '#' || ch === 't') {
        // Walls get lower toward the camera so they never hide Herman
        const h = r === H - 1 ? 0.7 : THREE.MathUtils.lerp(2.5, 1.0, r / (H - 1));
        wallList.push({ x, z, h: h + rnd() * 0.18 });
        collision.addBox(x - 0.5, x + 0.5, z - 0.5, z + 0.5);
        if (ch === 't') torchSpots.push({ x, z: z + 0.5 });
      } else if (ch === 'L') {
        collision.addBox(x - 0.5, x + 0.5, z - 0.5, z + 0.5, true);
      } else if (ch === '=' && data.hiddenBridge) {
        // Sunken bridge: lava until the crystal switch raises it
        bridgeLava.push(collision.addBox(x - 0.5, x + 0.5, z - 0.5, z + 0.5, true));
      } else if (ch === 'D') {
        const side: Side = r === 0 ? 'north' : r === H - 1 ? 'south' : c === 0 ? 'west' : 'east';
        doorTiles[side].push({ x, z, r, c });
      } else if (ch === 'X') {
        crystalPos = new THREE.Vector3(x, 0, z);
        collision.addCircle(x, z, 0.4);
      } else if (ch === 'F') {
        fountainPos = new THREE.Vector3(x, 0, z);
        collision.addCircle(x, z, 0.75);
      } else if (ch === 'w') {
        const b = buildBarricade();
        b.position.set(x, 0, z);
        b.rotation.y = rnd() - 0.5;
        group.add(b);
        collision.addCircle(x, z, 0.45, true);
      } else if (ch === 'P') {
        pillars.push({ x, z });
        collision.addCircle(x, z, 0.45);
      } else if (ch === 'B') {
        braziers.push({ x, z });
        collision.addCircle(x, z, 0.4, true);
      } else if (ch === 'x') {
        rubble.push({ x, z });
      } else if (ch === 'C') {
        chest = buildChest();
        chest.group.position.set(x, 0, z);
        group.add(chest.group);
        chestPos.set(x, 0, z);
        if (data.hiddenChest) chest.group.visible = false;
        else chestCollider = collision.addCircle(x, z, 0.42, true);
      }
    }
  }

  /* ----- Walls: instanced stone blocks with a lighter cap ----- */
  const blockGeo = new THREE.BoxGeometry(1, 1, 1);
  blockGeo.translate(0, 0.5, 0);
  const walls = new THREE.InstancedMesh(blockGeo, toon(0xffffff), wallList.length);
  const caps = new THREE.InstancedMesh(blockGeo, toon(0xffffff), wallList.length);
  const dummy = new THREE.Object3D();
  wallList.forEach((w, i) => {
    dummy.position.set(w.x, 0, w.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1.01, w.h, 1.01);
    dummy.updateMatrix();
    walls.setMatrixAt(i, dummy.matrix);
    walls.setColorAt(i, new THREE.Color(STONE).offsetHSL(0, 0, (rnd() - 0.5) * 0.06));
    dummy.position.set(w.x, w.h, w.z);
    dummy.scale.set(1.06, 0.14, 1.06);
    dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
    caps.setColorAt(i, new THREE.Color(STONE_LIGHT).offsetHSL(0, 0, (rnd() - 0.5) * 0.05));
  });
  for (const m of [walls, caps]) {
    m.castShadow = m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    addOutline(m, 0.02, smooth(blockGeo));
    group.add(m);
  }
  // Mortar lines on the tall back wall
  const mortarMat = new THREE.MeshBasicMaterial({ color: 0x2c2c36 });
  for (const w of wallList) {
    if (w.z > -halfH + 1) continue;
    for (let y = 0.45; y < w.h - 0.1; y += 0.5) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.04), mortarMat);
      line.position.set(w.x, y, w.z + 0.511);
      group.add(line);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.5), mortarMat);
      v.position.set(w.x + ((Math.round(y * 2) % 2) ? 0.25 : -0.25), y + 0.25, w.z + 0.511);
      group.add(v);
    }
  }

  /* ----- Banners between torches on the back wall ----- */
  const bannerMat = toon(0x9a2230, { side: THREE.DoubleSide });
  const trimMat = toon(0xf4c542, { emissive: 0x3a2800 });
  for (let c = 2; c < W - 2; c += 4) {
    if (at(c, 0) === 't') continue;
    const { x } = center(c, 0);
    const z = -halfH + 1.02;
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.1), bannerMat);
    ban.position.set(x, 1.45, z);
    ban.castShadow = true;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.04), trimMat);
    trim.position.set(x, 2.02, z);
    const crest = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), trimMat);
    crest.position.set(x, 1.55, z + 0.01);
    group.add(ban, trim, crest);
  }

  /* ----- Pillars ----- */
  const shaftGeo = new THREE.CylinderGeometry(0.32, 0.36, 2.0, 10);
  shaftGeo.translate(0, 1.15, 0);
  const plinthGeo = new THREE.BoxGeometry(0.9, 0.18, 0.9);
  plinthGeo.translate(0, 0.09, 0);
  const capitalGeo = new THREE.BoxGeometry(0.85, 0.18, 0.85);
  capitalGeo.translate(0, 2.2, 0);
  const pillarMat = toon(STONE_LIGHT);
  for (const p of pillars) {
    const g = new THREE.Group();
    for (const [geo, ol] of [[shaftGeo, 0.025], [plinthGeo, 0.02], [capitalGeo, 0.02]] as const) {
      const m = new THREE.Mesh(geo, pillarMat);
      m.castShadow = m.receiveShadow = true;
      addOutline(m, ol, smooth(geo));
      g.add(m);
    }
    // Pillars toward the camera are shorter so they don't block the view
    if (p.z > 1) g.scale.y = 0.6;
    g.position.set(p.x, 0, p.z);
    group.add(g);
  }

  /* ----- Fire: torches and braziers ----- */
  const flames: { mesh: THREE.Mesh; base: number; seed: number; light?: THREE.PointLight }[] = [];
  const flameGeo = new THREE.ConeGeometry(0.11, 0.32, 8);
  flameGeo.translate(0, 0.16, 0);
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.5, 0.35) });
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 3.0, 1.4) });
  const ironMat = toon(0x2e2c33);
  torchSpots.forEach((t, i) => {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.12), ironMat);
    bracket.position.set(t.x, 1.35, t.z + 0.05);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.07, 0.14, 8), ironMat);
    cup.position.set(t.x, 1.62, t.z + 0.14);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(t.x, 1.68, t.z + 0.14);
    const core = new THREE.Mesh(flameGeo, coreMat);
    core.scale.setScalar(0.5);
    flame.add(core);
    group.add(bracket, cup, flame);
    const light = new THREE.PointLight(0xff9a4a, 6, 9, 1.5);
    light.position.set(t.x, 1.9, t.z + 0.7);
    group.add(light);
    flames.push({ mesh: flame, base: 1, seed: i * 3.1, light });
  });
  const bowlGeo = new THREE.CylinderGeometry(0.34, 0.2, 0.24, 10);
  const standGeo = new THREE.CylinderGeometry(0.1, 0.18, 0.6, 8);
  braziers.forEach((b, i) => {
    const stand = new THREE.Mesh(standGeo, ironMat);
    stand.position.set(b.x, 0.3, b.z);
    const bowl = new THREE.Mesh(bowlGeo, ironMat);
    bowl.position.set(b.x, 0.7, b.z);
    stand.castShadow = bowl.castShadow = true;
    addOutline(bowl, 0.02, smooth(bowlGeo));
    group.add(stand, bowl);
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Mesh(flameGeo, k === 1 ? coreMat : flameMat);
      const a = (k / 3) * Math.PI * 2;
      f.position.set(b.x + Math.cos(a) * 0.1, 0.8, b.z + Math.sin(a) * 0.1);
      f.scale.setScalar(k === 1 ? 1.5 : 1.8);
      group.add(f);
      flames.push({ mesh: f, base: f.scale.x, seed: i * 5.3 + k });
    }
  });
  // One warm light over the lava
  const lavaLight = new THREE.PointLight(0xff6a20, hasLava ? 7 : 0, 12, 1.4);
  lavaLight.position.set(hasLava ? bridgeX : 0, 1.2, (lavaZMin + lavaZMax) / 2);
  if (hasLava) group.add(lavaLight);

  /* ----- Stone bridge over the lava ----- */
  const bridgeGroup = new THREE.Group();
  group.add(bridgeGroup);
  if (bridgeCols.length) {
    const group = bridgeGroup;
    const bw = bridgeCols.length;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.2, 0.3, lavaZMax - lavaZMin + 0.5), toon(STONE_LIGHT));
    slab.position.set(bridgeX, -0.13, (lavaZMin + lavaZMax) / 2);
    slab.castShadow = slab.receiveShadow = true;
    addOutline(slab, 0.02, smooth(slab.geometry));
    group.add(slab);
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, lavaZMax - lavaZMin + 0.5), toon(STONE));
      curb.position.set(bridgeX + side * (bw / 2 + 0.05), 0.12, (lavaZMin + lavaZMax) / 2);
      curb.castShadow = true;
      group.add(curb);
    }
  }

  /* ----- Rubble and bones (just decoration) ----- */
  const chunkGeo = new THREE.DodecahedronGeometry(0.14, 0);
  const boneGeo = new THREE.CapsuleGeometry(0.03, 0.22, 2, 6);
  const rubbleMat = toon(0x7d7f8e);
  const boneMat = toon(0xe8e0cc);
  for (const r of rubble) {
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(chunkGeo, rubbleMat);
      m.position.set(r.x + (rnd() - 0.5) * 0.7, 0.06, r.z + (rnd() - 0.5) * 0.7);
      m.scale.setScalar(0.6 + rnd() * 0.8);
      m.rotation.set(rnd() * 3, rnd() * 3, 0);
      m.castShadow = true;
      group.add(m);
    }
    for (let k = 0; k < 2; k++) {
      const b = new THREE.Mesh(boneGeo, boneMat);
      b.rotation.set(Math.PI / 2, 0, rnd() * 3);
      b.position.set(r.x + (rnd() - 0.5) * 0.6, 0.04, r.z + (rnd() - 0.5) * 0.6);
      group.add(b);
    }
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), boneMat);
    skull.position.set(r.x + 0.2, 0.08, r.z - 0.1);
    group.add(skull);
  }

  /* ----- Sparks drifting up from the lava ----- */
  const sparkGeo = new THREE.OctahedronGeometry(0.04, 0);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.3, 0.3) });
  const sparks = Array.from({ length: hasLava ? 26 : 0 }, () => {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    group.add(m);
    return { m, life: rnd() * 2, speed: 0.5 + rnd() * 0.6 };
  });
  const resetSpark = (s: (typeof sparks)[number]) => {
    s.life = 1.5 + Math.random() * 1.5;
    s.m.position.set((Math.random() - 0.5) * (W - 2), -0.3, lavaZMin + Math.random() * (lavaZMax - lavaZMin));
  };
  sparks.forEach(resetSpark);

  /* ----- Doors ----- */
  const wallH = (r: number) => (r === H - 1 ? 0.7 : THREE.MathUtils.lerp(2.5, 1.0, r / (H - 1)));
  const woodMat = toon(0x7a4b2a);
  const ironDark = toon(0x2b2a31);
  const goldMat = toon(0xf4c542, { emissive: 0x5a3c00 });
  const doors: Door[] = [];
  for (const side of ['north', 'south', 'east', 'west'] as Side[]) {
    const tiles = doorTiles[side];
    if (!tiles.length) continue;
    const cx = tiles.reduce((a, t) => a + t.x, 0) / tiles.length;
    const cz = tiles.reduce((a, t) => a + t.z, 0) / tiles.length;
    const horizontal = side === 'north' || side === 'south';
    const span = tiles.length;
    const h = wallH(tiles[0].r);
    const door = new THREE.Group();
    door.position.set(cx, 0, cz);
    if (!horizontal) door.rotation.y = Math.PI / 2;
    const inner = new THREE.Group();
    door.add(inner);
    group.add(door);
    const build = (kind: DoorKind) => {
      inner.clear();
      if (kind === 'open') {
        // Iron portcullis bars
        for (let i = 0; i < span * 4 + 1; i++) {
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, h, 6), ironDark);
          bar.position.set(-span / 2 + i * (span / (span * 4)), h / 2, 0);
          bar.castShadow = true;
          inner.add(bar);
        }
        for (const y of [h * 0.3, h * 0.75]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(span, 0.07, 0.07), ironDark);
          rail.position.set(0, y, 0);
          inner.add(rail);
        }
      } else {
        const slabGeo = new THREE.BoxGeometry(span, h, 0.3);
        slabGeo.translate(0, h / 2, 0);
        const slab = new THREE.Mesh(slabGeo, kind === 'bigkey' ? toon(0x4a3326) : woodMat);
        slab.castShadow = true;
        addOutline(slab, 0.02, smooth(slabGeo));
        inner.add(slab);
        for (const y of [h * 0.25, h * 0.7]) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(span + 0.02, 0.09, 0.34), ironDark);
          band.position.set(0, y, 0);
          inner.add(band);
        }
        // Lock plate on both faces
        for (const f of [-1, 1]) {
          const plate = new THREE.Mesh(new THREE.BoxGeometry(kind === 'bigkey' ? 0.6 : 0.34, kind === 'bigkey' ? 0.6 : 0.4, 0.04), goldMat);
          plate.position.set(0, Math.min(h * 0.5, 1.0), f * 0.18);
          const hole = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.02), ironDark);
          hole.position.set(0, Math.min(h * 0.5, 1.0) - 0.03, f * 0.205);
          inner.add(plate, hole);
          if (kind === 'bigkey') {
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), toon(0xece3cc));
            skull.position.set(0, Math.min(h * 0.5, 1.0) + 0.42, f * 0.2);
            inner.add(skull);
          }
        }
      }
    };
    let kind: DoorKind = data.doors?.[side] ?? 'open';
    build(kind);
    let closed = false;
    let collider: Collider | null = null;
    let y = 0;
    const halfSpan = span / 2;
    const setCollider = (on: boolean) => {
      if (on && !collider) {
        collider = horizontal
          ? collision.addBox(cx - halfSpan, cx + halfSpan, cz - 0.5, cz + 0.5)
          : collision.addBox(cx - 0.5, cx + 0.5, cz - halfSpan, cz + halfSpan);
      } else if (!on && collider) {
        collision.remove(collider);
        collider = null;
      }
    };
    const inward = side === 'north' ? [0, 1.6] : side === 'south' ? [0, -1.6] : side === 'west' ? [1.6, 0] : [-1.6, 0];
    const zone = horizontal
      ? { minX: cx - halfSpan, maxX: cx + halfSpan, minZ: side === 'north' ? -halfH - 1 : halfH - 0.85, maxZ: side === 'north' ? -halfH + 0.85 : halfH + 1 }
      : { minX: side === 'west' ? -halfW - 1 : halfW - 0.85, maxX: side === 'west' ? -halfW + 0.85 : halfW + 1, minZ: cz - halfSpan, maxZ: cz + halfSpan };
    const d: Door = {
      side,
      get kind() { return kind; },
      get closed() { return closed; },
      entry: new THREE.Vector3(cx + inward[0], 0, cz + inward[1]),
      zone,
      setClosed: (c, instant = false) => {
        if (c !== closed && !instant) sfx[c ? 'doorSlam' : 'door']();
        closed = c;
        setCollider(c);
        if (instant) y = c ? 0 : -h - 0.1;
      },
      setKind: (k) => {
        kind = k;
        build(k);
      },
      update: (dt) => {
        const target = closed ? 0 : -h - 0.1;
        y += (target - y) * (1 - Math.exp(-dt * (closed ? 18 : 6)));
        inner.position.y = y;
        inner.visible = y > -h - 0.05;
      },
    } as Door;
    // Locked doors start shut; plain doorways start open.
    d.setClosed(kind !== 'open', true);
    doors.push(d);
  }

  /* ----- Crystal switch ----- */
  let crystalMesh: THREE.Mesh | null = null;
  let crystalOn = false;
  if (crystalPos) {
    const cp = crystalPos as THREE.Vector3;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.5, 8), toon(STONE_LIGHT));
    ped.position.set(cp.x, 0.25, cp.z);
    ped.castShadow = true;
    addOutline(ped, 0.02, smooth(ped.geometry));
    const cg = new THREE.OctahedronGeometry(0.32, 0);
    cg.scale(0.8, 1.4, 0.8);
    crystalMesh = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 3.0) }));
    crystalMesh.position.set(cp.x, 1.05, cp.z);
    group.add(ped, crystalMesh);
  }

  /* ----- Healing fountain ----- */
  let fountainWater: THREE.Mesh | null = null;
  if (fountainPos) {
    const fp = fountainPos as THREE.Vector3;
    const basinGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.45, 16);
    const basin = new THREE.Mesh(basinGeo, toon(STONE_LIGHT));
    basin.position.set(fp.x, 0.22, fp.z);
    basin.castShadow = true;
    addOutline(basin, 0.02, smooth(basinGeo));
    fountainWater = new THREE.Mesh(new THREE.CircleGeometry(0.72, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.6, 2.6) }));
    fountainWater.rotation.x = -Math.PI / 2;
    fountainWater.position.set(fp.x, 0.43, fp.z);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 8), toon(STONE_LIGHT));
    spout.position.set(fp.x, 0.6, fp.z);
    group.add(basin, fountainWater, spout);
    const glow = new THREE.PointLight(0x7fd0ff, 4, 5, 1.6);
    glow.position.set(fp.x, 1.3, fp.z);
    group.add(glow);
  }

  // A hidden bridge sits sunk in the lava until it is raised
  if (data.hiddenBridge) {
    bridgeGroup.position.y = -1.2;
    bridgeGroup.visible = false;
  }
  let bridgeRising = false;

  const spawnTile = center(data.spawn.col, data.spawn.row);
  const walkable = (x: number, z: number) => {
    if (Math.abs(x) > halfW - 1.5 || Math.abs(z) > halfH - 1.5) return false;
    if (collision.waterAt(x, z)) return false;
    const p = { x, z };
    collision.resolve(p, 0.4);
    return Math.abs(p.x - x) < 0.01 && Math.abs(p.z - z) < 0.01;
  };

  return {
    kind: 'dungeon',
    name: data.name,
    hasSign: false,
    group,
    collision,
    spawn: new THREE.Vector3(spawnTile.x, 0, spawnTile.z),
    exits: [],
    signPos: new THREE.Vector3(999, 0, 999),
    signText: '',
    chestPos,
    chest,
    width: W,
    depth: H,
    walkable,
    river: bridgeCols.length && !data.hiddenBridge ? { zMin: lavaZMin, zMax: lavaZMax, bridgeX } : null,
    doors,
    crystalPos,
    fountainPos,
    hitCrystal() {
      if (crystalOn || !crystalMesh) return false;
      crystalOn = true;
      (crystalMesh.material as THREE.MeshBasicMaterial).color.setRGB(3.2, 2.4, 0.6);
      return true;
    },
    revealBridge() {
      for (const c of bridgeLava) collision.remove(c);
      bridgeLava.length = 0;
      bridgeGroup.visible = true;
      bridgeRising = true;
      (this as BuiltScreen).river = { zMin: lavaZMin, zMax: lavaZMax, bridgeX };
    },
    showChest() {
      if (!chest) return;
      chest.group.visible = true;
      if (!chestCollider) chestCollider = collision.addCircle(chestPos.x, chestPos.z, 0.42, true);
    },
    rockSpots: [],
    setWaterTint: () => {},
    update: (t, dt) => {
      lavaUniforms.uTime.value = t;
      for (const d of doors) d.update(dt);
      if (bridgeRising) {
        bridgeGroup.position.y += (0 - bridgeGroup.position.y) * (1 - Math.exp(-dt * 3));
        if (bridgeGroup.position.y > -0.01) bridgeRising = false;
      }
      if (crystalMesh) {
        crystalMesh.rotation.y = t * (crystalOn ? 3 : 1.2);
        crystalMesh.position.y = 1.05 + Math.sin(t * 2) * 0.08;
      }
      if (fountainWater) fountainWater.scale.setScalar(1 + Math.sin(t * 3) * 0.03);
      chest?.update(t);
      for (const f of flames) {
        const k = 1 + Math.sin(t * 13 + f.seed) * 0.08 + Math.sin(t * 7.3 + f.seed * 2) * 0.08;
        f.mesh.scale.set(f.base * (2 - k), f.base * k, f.base * (2 - k));
        if (f.light) f.light.intensity = 6 * (0.85 + (k - 1) * 1.6);
      }
      lavaLight.intensity = 7 + Math.sin(t * 2) * 1.2;
      for (const s of sparks) {
        s.life -= dt;
        s.m.position.y += s.speed * dt;
        s.m.position.x += Math.sin(t * 2 + s.speed * 10) * dt * 0.2;
        s.m.scale.setScalar(Math.max(0.01, Math.min(1, s.life)));
        if (s.life <= 0) resetSpark(s);
      }
    },
  };
}
