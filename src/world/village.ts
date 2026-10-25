import * as THREE from 'three';
import { toon, addOutline } from '../core/toon';
import { smooth } from '../core/geo';
import { buildWater } from './water';

/**
 * Oakhollow Village props: timber-frame houses, Bob the blacksmith, Jerry the armorer,
 * the training dummy, the training yard board, a well and barrels.
 */

const OL = 0.03;
const part = (geo: THREE.BufferGeometry, mat: THREE.Material, outline = OL, shadow = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (outline > 0) addOutline(m, outline, smooth(geo));
  return m;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

const PLASTER = 0xf3e7cc;
const TIMBER = 0x6b4226;
const DARK = 0x2a2238;

export type HouseKind = 'house' | 'smith' | 'armor';

/** A timber-frame house, w x d tiles, front door facing the camera (south). */
export function buildHouse(w: number, d: number, roofColor: number, kind: HouseKind = 'house'): THREE.Group {
  const g = new THREE.Group();
  const wallH = 1.7;
  const wW = w - 0.2, wD = d - 0.3;
  g.add(part(box(wW, wallH, wD, 0, wallH / 2, 0), toon(PLASTER), 0.035));
  // Stone footing
  g.add(part(box(wW + 0.1, 0.3, wD + 0.1, 0, 0.15, 0), toon(0xa7a39a), 0.025));
  // Timber frame: corner posts, a beam across the middle, and diagonal braces on the front
  const tm = toon(TIMBER);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(part(box(0.16, wallH, 0.16, sx * (wW / 2 - 0.02), wallH / 2, sz * (wD / 2 - 0.02)), tm, 0, false));
  }
  g.add(part(box(wW + 0.04, 0.12, 0.08, 0, wallH * 0.62, wD / 2 + 0.02), tm, 0, false));
  g.add(part(box(wW + 0.04, 0.14, 0.08, 0, wallH - 0.05, wD / 2 + 0.02), tm, 0, false));
  // Door
  const doorX = kind === 'house' ? 0 : -wW * 0.18;
  g.add(part(box(0.62, 1.05, 0.08, doorX, 0.55, wD / 2 + 0.03), toon(0x7a4a2a), 0.02, false));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), toon(0xf4c542));
  knob.position.set(doorX + 0.2, 0.55, wD / 2 + 0.09);
  g.add(knob);
  // Windows with warm glass
  const glass = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 0.92, 0.55) });
  const winXs = kind === 'house' ? [-wW * 0.32, wW * 0.32] : [wW * 0.22];
  for (const wx of winXs) {
    g.add(part(box(0.5, 0.42, 0.06, wx, 1.12, wD / 2 + 0.03), tm, 0, false));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.3), glass);
    pane.position.set(wx, 1.12, wD / 2 + 0.07);
    g.add(pane);
  }
  // Gable roof (ridge runs left to right), with a little overhang
  const rh = 1.25, ov = 0.3;
  const shape = new THREE.Shape();
  shape.moveTo(-(wD / 2 + ov), 0);
  shape.lineTo(0, rh);
  shape.lineTo(wD / 2 + ov, 0);
  shape.lineTo(-(wD / 2 + ov), 0);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: wW + ov * 2, bevelEnabled: false });
  roofGeo.translate(0, 0, -(wW + ov * 2) / 2);
  roofGeo.rotateY(Math.PI / 2);
  roofGeo.translate(0, wallH - 0.02, 0);
  roofGeo.computeVertexNormals();
  const roof = part(roofGeo, toon(roofColor), 0.04);
  g.add(roof);
  // Chimney
  const chimX = kind === 'smith' ? -wW * 0.3 : wW * 0.28;
  g.add(part(box(0.38, 1.0, 0.38, chimX, wallH + rh * 0.55, -wD * 0.12), toon(0x9a8f86), 0.025));

  if (kind === 'smith') {
    // Open forge on the side, glowing orange
    g.add(part(box(0.9, 0.7, 0.8, wW / 2 + 0.35, 0.35, 0.2), toon(0x8a817a), 0.025));
    const coals = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.52), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.2, 0.25) }));
    coals.position.set(wW / 2 + 0.35, 0.72, 0.2);
    g.add(coals);
    g.userData.glow = { coals };
  }
  // Hanging shop sign
  if (kind !== 'house') {
    const bracket = part(box(0.06, 0.06, 0.6, wW / 2 - 0.1, 1.45, wD / 2 + 0.3), tm, 0, false);
    g.add(bracket);
    const plaque = part(box(0.5, 0.42, 0.05, wW / 2 - 0.1, 1.15, wD / 2 + 0.55), toon(0xb88350), 0.02);
    g.add(plaque);
    const icon = kind === 'smith' ? buildAnvilIcon() : buildHelmetIcon();
    icon.position.set(wW / 2 - 0.1, 1.15, wD / 2 + 0.59);
    g.add(icon);
  }
  return g;
}

function buildAnvilIcon() {
  const g = new THREE.Group();
  const m = toon(0x3a3a44);
  g.add(new THREE.Mesh(box(0.28, 0.07, 0.02, 0, 0.05, 0), m), new THREE.Mesh(box(0.1, 0.1, 0.02, 0, -0.03, 0), m), new THREE.Mesh(box(0.22, 0.05, 0.02, 0, -0.1, 0), m));
  return g;
}

function buildHelmetIcon() {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xb8c0cc));
  dome.scale.set(1, 1, 0.2);
  dome.position.y = -0.06;
  g.add(dome);
  return g;
}

/** A blacksmith's anvil on a stump. */
export function buildAnvil(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(0.28, 0.32, 0.45, 10).translate(0, 0.22, 0), toon(0x7a4e2d)));
  const iron = toon(0x45454f);
  g.add(part(box(0.6, 0.16, 0.26, 0.04, 0.72, 0), iron, 0.02));
  g.add(part(box(0.22, 0.24, 0.2, 0, 0.55, 0), iron, 0.02));
  const horn = new THREE.ConeGeometry(0.08, 0.3, 8);
  horn.rotateZ(Math.PI / 2);
  horn.translate(-0.4, 0.72, 0);
  g.add(part(horn, iron, 0.02));
  return g;
}

/** A wooden stand wearing a helmet and breastplate (outside Jerry's shop). */
export function buildArmorStand(): THREE.Group {
  const g = new THREE.Group();
  const wood = toon(0x7a4e2d);
  g.add(part(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6).translate(0, 0.65, 0), wood, 0.02));
  g.add(part(box(0.5, 0.06, 0.06, 0, 1.15, 0), wood, 0.02));
  const steel = toon(0xb8c0cc, { emissive: 0x111418 });
  const chest = new THREE.SphereGeometry(0.27, 14, 10);
  chest.scale(1, 1.15, 0.7);
  chest.translate(0, 0.92, 0);
  g.add(part(chest, steel, 0.025));
  const helm = new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  helm.translate(0, 1.36, 0);
  g.add(part(helm, steel, 0.02));
  const plume = new THREE.SphereGeometry(0.07, 8, 6);
  plume.scale(0.7, 1.6, 1.4);
  plume.translate(0, 1.56, -0.02);
  g.add(part(plume, toon(0xd8363a), 0.015));
  g.add(part(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12).translate(0, 0.03, 0), wood, 0.02));
  return g;
}

export function buildWell(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.CylinderGeometry(0.62, 0.68, 0.7, 14, 1, true);
  ring.translate(0, 0.35, 0);
  const stone = toon(0xa7a39a);
  stone.side = THREE.DoubleSide;
  g.add(part(ring, stone, 0.03));
  // Real moving water, like the river (a bit darker, since a well is deep)
  const water = buildWater(1.16, 1.16, 0, 0, 0.45, true);
  water.setTint(new THREE.Color(0.72, 0.8, 0.9));
  g.add(water.mesh);
  g.userData.water = water;
  // A dark inner wall so the water looks like it sits down inside the well
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.585, 0.585, 0.3, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x3a3a44, side: THREE.BackSide }));
  inner.position.y = 0.55;
  g.add(inner);
  const wood = toon(0x7a4e2d);
  for (const sx of [-1, 1]) g.add(part(box(0.1, 1.3, 0.1, sx * 0.55, 0.95, 0), wood, 0.02));
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.55, 0); roofShape.lineTo(0, 0.45); roofShape.lineTo(0.55, 0); roofShape.lineTo(-0.55, 0);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1.4, bevelEnabled: false });
  roofGeo.translate(0, 0, -0.7);
  roofGeo.rotateY(Math.PI / 2);
  roofGeo.translate(0, 1.55, 0);
  roofGeo.computeVertexNormals();
  g.add(part(roofGeo, toon(0xc0533b), 0.03));
  const bucket = new THREE.CylinderGeometry(0.12, 0.1, 0.18, 10);
  bucket.translate(0, 1.0, 0);
  g.add(part(bucket, toon(0x8a5530), 0.015));
  return g;
}

export function buildBarrel(): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.28, 0.28, 0.7, 12);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + 0.14 * (1 - (y / 0.35) ** 2);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  geo.translate(0, 0.35, 0);
  g.add(part(geo, toon(0x9a6236), 0.025));
  const band = toon(0x45454f);
  for (const y of [0.15, 0.55]) {
    const b = new THREE.TorusGeometry(0.31, 0.022, 6, 16);
    b.rotateX(Math.PI / 2);
    b.translate(0, y, 0);
    g.add(new THREE.Mesh(b, band));
  }
  return g;
}

/** The Training Yard notice board. */
export function buildBoard(): THREE.Group {
  const g = new THREE.Group();
  const wood = toon(0x7a4e2d);
  for (const sx of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.06, 0.07, 1.5, 6).translate(sx * 0.55, 0.75, 0), wood, 0.02));
  g.add(part(box(1.35, 0.85, 0.08, 0, 1.05, 0.04), toon(0xb88350), 0.025));
  const paper = toon(0xf6efdc);
  const notes: [number, number, number][] = [[-0.35, 1.18, -0.08], [0.05, 1.05, 0.06], [0.38, 1.2, 0.1], [-0.25, 0.88, 0.04]];
  for (const [x, y, r] of notes) {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.26), paper);
    n.position.set(x, y, 0.09);
    n.rotation.z = r;
    g.add(n);
  }
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.8, 0); roofShape.lineTo(0, 0.28); roofShape.lineTo(0.8, 0); roofShape.lineTo(-0.8, 0);
  const rg = new THREE.ExtrudeGeometry(roofShape, { depth: 0.4, bevelEnabled: false });
  rg.translate(0, 1.5, -0.15);
  rg.computeVertexNormals();
  g.add(part(rg, toon(0x4f7fb8), 0.02));
  return g;
}

export interface Dummy { group: THREE.Group; hit: (dirX: number, dirZ: number) => void; update: (dt: number) => void }

/** A straw training dummy that wobbles when you hit it. */
export function buildDummy(): Dummy {
  const g = new THREE.Group();
  const wood = toon(0x7a4e2d);
  g.add(part(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 6).translate(0, 0.7, 0), wood, 0.02));
  const body = new THREE.Group();
  g.add(body);
  const straw = toon(0xe0c068);
  const sack = new THREE.CylinderGeometry(0.28, 0.32, 0.75, 12);
  sack.translate(0, 1.05, 0);
  body.add(part(sack, straw, 0.025));
  const head = new THREE.SphereGeometry(0.22, 12, 10);
  head.translate(0, 1.65, 0);
  body.add(part(head, straw, 0.025));
  body.add(part(box(1.1, 0.08, 0.08, 0, 1.25, 0), wood, 0.02));
  const rope = toon(0x8a5530);
  for (const y of [0.85, 1.25]) {
    const r = new THREE.TorusGeometry(0.31, 0.025, 6, 16);
    r.rotateX(Math.PI / 2);
    r.translate(0, y, 0);
    body.add(new THREE.Mesh(r, rope));
  }
  // A painted target face
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), toon(0xd8363a));
  face.position.set(0, 1.07, 0.31);
  body.add(face);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), toon(0xffffff));
  inner.position.set(0, 1.07, 0.315);
  body.add(inner);
  let ax = 0, az = 0, vx = 0, vz = 0;
  return {
    group: g,
    hit: (dx, dz) => {
      vx += dz * 5;
      vz -= dx * 5;
    },
    update: (dt) => {
      vx += -ax * 60 * dt - vx * 5 * dt;
      vz += -az * 60 * dt - vz * 5 * dt;
      ax += vx * dt;
      az += vz * dt;
      body.rotation.set(ax, 0, az);
    },
  };
}

export interface SecretButton { group: THREE.Group; press: () => void; update: (dt: number) => void }

/** Ben and Cole's secret: a little stone block with a red button and a brass plaque. */
export function buildSecretButton(): SecretButton {
  const g = new THREE.Group();
  g.add(part(box(0.56, 0.32, 0.46, 0, 0.16, 0), toon(0xa7a39a), 0.025));
  const btnGeo = new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  btnGeo.scale(1, 0.7, 1);
  const btn = part(btnGeo, toon(0xe0343a, { emissive: 0x3a0406 }), 0.015);
  btn.position.y = 0.32;
  g.add(btn);
  const plaque = part(box(0.36, 0.14, 0.02, 0, 0.17, 0.24), toon(0xd8a640, { emissive: 0x2a1a00 }), 0.01);
  g.add(plaque);
  const lineMat = toon(0x5c3a1f);
  for (let i = 0; i < 2; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.26 - i * 0.08, 0.018, 0.01), lineMat);
    line.position.set(0, 0.2 - i * 0.05, 0.252);
    g.add(line);
  }
  let down = 0;
  return {
    group: g,
    press: () => { down = 1; },
    update: (dt) => {
      down = Math.max(0, down - dt * 2.5);
      btn.position.y = 0.32 - Math.min(1, down * 2) * 0.07;
    },
  };
}

export type NpcId = 'bob' | 'jerry';

export interface Npc { id: NpcId; group: THREE.Group; update: (t: number, player: THREE.Vector3) => void }

/** A villager. Bob: big beard, leather apron and a hammer. Jerry: red tunic, steel cap and a big mustache. */
export function buildNpc(id: NpcId): Npc {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  const skin = toon(0xf1c49e);
  const bob = id === 'bob';
  const shirt = toon(bob ? 0x5a7fa8 : 0xc04a3a);
  const legs = toon(bob ? 0x4a3a2a : 0x3c3a5a);
  for (const sx of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 8).translate(sx * 0.1, 0.21, 0), legs, 0.02));
  const torso = new THREE.CapsuleGeometry(0.25, 0.32, 4, 12);
  torso.scale(1, 1, 0.8);
  torso.translate(0, 0.72, 0);
  g.add(part(torso, shirt, 0.025));
  if (bob) {
    const apron = new THREE.BoxGeometry(0.36, 0.5, 0.04);
    apron.translate(0, 0.66, 0.2);
    g.add(part(apron, toon(0x6b4226), 0.015));
  } else {
    const belt = new THREE.TorusGeometry(0.24, 0.035, 6, 16);
    belt.rotateX(Math.PI / 2);
    belt.scale(1, 1, 0.82);
    belt.translate(0, 0.6, 0);
    g.add(new THREE.Mesh(belt, toon(0x5c3a1f)));
  }
  // Arms
  for (const sx of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.07, 0.3, 4, 8);
    arm.translate(sx * 0.31, 0.72, 0.02);
    g.add(part(arm, shirt, 0.02));
  }
  const head = new THREE.Group();
  head.position.y = 1.18;
  g.add(head);
  head.add(part(new THREE.SphereGeometry(0.22, 14, 12), skin, 0.025));
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1b1a24 });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeM);
    e.position.set(sx * 0.075, 0.03, 0.2);
    head.add(e);
  }
  if (bob) {
    const beard = new THREE.SphereGeometry(0.17, 12, 10);
    beard.scale(1.1, 1.1, 0.7);
    beard.translate(0, -0.13, 0.12);
    head.add(part(beard, toon(0x8a4a22), 0.02));
    const brows = new THREE.Mesh(box(0.22, 0.04, 0.03, 0, 0.09, 0.2), toon(0x8a4a22));
    head.add(brows);
    // Hammer in the right hand
    const hammer = new THREE.Group();
    hammer.add(part(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), toon(0x7a4e2d), 0.015));
    hammer.add(part(box(0.2, 0.1, 0.1, 0, 0.22, 0), toon(0x45454f), 0.015));
    hammer.position.set(0.36, 0.5, 0.08);
    hammer.rotation.x = 0.3;
    g.add(hammer);
  } else {
    // Jerry: steel cap, big ginger mustache
    const cap = new THREE.SphereGeometry(0.23, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45);
    head.add(part(cap, toon(0xb8c0cc), 0.02));
    const rim = new THREE.TorusGeometry(0.225, 0.03, 6, 18);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, 0.04, 0);
    head.add(new THREE.Mesh(rim, toon(0x8a929e)));
    const stache = toon(0xc0662a);
    for (const sx of [-1, 1]) {
      const m = new THREE.CapsuleGeometry(0.035, 0.1, 4, 8);
      m.rotateZ(sx * 1.25);
      m.translate(sx * 0.06, -0.05, 0.2);
      head.add(part(m, stache, 0.012));
    }
  }
  root.scale.setScalar(1.15);
  let face = 0;
  return {
    id,
    group: root,
    update: (t, player) => {
      g.position.y = Math.abs(Math.sin(t * 2.2)) * 0.02;
      const dx = player.x - root.position.x, dz = player.z - root.position.z;
      const want = Math.hypot(dx, dz) < 4 ? Math.atan2(dx, dz) : 0;
      let d = want - face;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      face += d * 0.08;
      g.rotation.y = face;
    },
  };
}
