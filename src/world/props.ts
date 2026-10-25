import * as THREE from 'three';
import { toon, addOutline } from '../core/toon';
import { blob, at, merge, smooth } from '../core/geo';
import { mulberry32 } from '../core/noise';

/** A placed copy of a prop: position on the ground, turn, size and a color tint. */
export interface Placement { x: number; z: number; rot: number; scale: number; tint: THREE.Color; y?: number }

const dummy = new THREE.Object3D();

function instanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  list: Placement[],
  opts: { outline?: number; outlineGeo?: THREE.BufferGeometry; shadows?: boolean; tint?: boolean; sy?: number } = {},
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(list.length, 1));
  mesh.count = list.length;
  list.forEach((p, i) => {
    dummy.position.set(p.x, p.y ?? 0, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.set(p.scale, p.scale * (opts.sy ?? 1), p.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (opts.tint !== false) mesh.setColorAt(i, p.tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = opts.shadows !== false;
  mesh.receiveShadow = true;
  if (opts.outline) addOutline(mesh, opts.outline, opts.outlineGeo);
  // Skip drawing batches the camera can't see (bounds cover every copy, plus a little for sway)
  if (list.length) {
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 1.5;
    for (const c of mesh.children) {
      if (c instanceof THREE.InstancedMesh) {
        c.boundingSphere = mesh.boundingSphere;
        c.frustumCulled = true;
      }
    }
  } else mesh.frustumCulled = false;
  return mesh;
}

/* ---------- Trees ---------- */

const trunkGeo = (() => {
  const g = new THREE.CylinderGeometry(0.13, 0.2, 1.1, 8);
  g.translate(0, 0.55, 0);
  return g;
})();

const roundCanopy = merge([
  at(blob(0.78, 1), 0, 1.5, 0, 1, 0.88, 1),
  at(blob(0.52, 2), 0.48, 1.22, 0.22),
  at(blob(0.5, 3), -0.46, 1.28, -0.12),
  at(blob(0.44, 4), 0.06, 1.98, -0.04),
]);

const tallCanopy = merge([
  at(blob(0.62, 5), 0, 1.35, 0),
  at(blob(0.52, 6), 0.05, 1.85, 0.02),
  at(blob(0.38, 7), -0.02, 2.3, 0),
]);

/** Trees, grouped into patches about half a screen wide so the camera can skip patches it can't see. */
export function buildTrees(list: Placement[]): THREE.Group {
  const g = new THREE.Group();
  const cells = new Map<string, Placement[]>();
  for (const p of list) {
    const key = `${Math.floor(p.x / 11)},${Math.floor(p.z / 7)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(p);
  }
  for (const patch of cells.values()) g.add(buildTreePatch(patch));
  return g;
}

function buildTreePatch(list: Placement[]): THREE.Group {
  const g = new THREE.Group();
  const trunks = list.map((p) => ({ ...p, tint: new THREE.Color(0xffffff) }));
  g.add(instanced(trunkGeo, toon(0x8a5a33), trunks, { outline: 0.03, outlineGeo: smooth(trunkGeo), tint: false }));
  const rnd = mulberry32(99);
  const round: Placement[] = [];
  const tall: Placement[] = [];
  for (const p of list) (rnd() < 0.72 ? round : tall).push(p);
  const leaf = () => toon(0xffffff);
  g.add(instanced(roundCanopy, leaf(), round, { outline: 0.035 }));
  g.add(instanced(tallCanopy, leaf(), tall, { outline: 0.035 }));
  return g;
}

/* ---------- Bushes and hedges ---------- */

const bushGeo = merge([
  at(blob(0.4, 11), 0, 0.34, 0),
  at(blob(0.3, 12), 0.32, 0.26, 0.08),
  at(blob(0.3, 13), -0.3, 0.27, -0.06),
]);

export function buildBushes(list: Placement[], squash = 1): THREE.InstancedMesh {
  return instanced(bushGeo, toon(0xffffff), list, { outline: 0.03, sy: squash });
}

/* ---------- Rocks ---------- */

export const rockGeo = (() => {
  const g = new THREE.DodecahedronGeometry(0.38, 0);
  g.scale(1, 0.72, 0.9);
  g.translate(0, 0.2, 0);
  return g;
})();

export function buildRocks(list: Placement[]): THREE.InstancedMesh {
  return instanced(rockGeo, toon(0xffffff), list, {
    outline: 0.03,
    outlineGeo: smooth(rockGeo),
  });
}

/* ---------- Flowers ---------- */

/* Flower shapes: daisies, tulips and bluebells, each with a stem and two leaves. */
const flowerStem = (() => { const g = new THREE.CylinderGeometry(0.01, 0.014, 1, 5); g.translate(0, 0.5, 0); return g; })();
const flowerLeaves = (() => {
  const leaf = new THREE.SphereGeometry(0.05, 4, 3);
  leaf.scale(0.35, 1, 0.12);
  const a = leaf.clone(); a.rotateZ(0.7); a.translate(-0.035, 0.05, 0);
  const b = leaf.clone(); b.rotateZ(-0.7); b.rotateY(0.6); b.translate(0.03, 0.04, 0.01);
  return merge([a, b]);
})();
const daisyPetals = (() => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.SphereGeometry(0.03, 4, 2);
    p.scale(1, 0.25, 0.45);
    p.translate(0.042, 0, 0);
    p.rotateZ(0.18);
    p.rotateY((i / 6) * Math.PI * 2);
    parts.push(p);
  }
  return merge(parts);
})();
const daisyCenter = (() => { const g = new THREE.SphereGeometry(0.024, 5, 3); g.scale(1, 0.6, 1); return g; })();
const tulipCup = (() => {
  const pts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.03, 0.006), new THREE.Vector2(0.046, 0.035), new THREE.Vector2(0.044, 0.07), new THREE.Vector2(0.03, 0.095)];
  const g = new THREE.LatheGeometry(pts, 5);
  // Three petal points around the rim
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.09) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      pos.setY(i, y + Math.max(0, Math.cos(a * 3)) * 0.02);
    }
  }
  g.computeVertexNormals();
  return g;
})();
const bellCluster = (() => {
  const parts: THREE.BufferGeometry[] = [];
  const bell = new THREE.ConeGeometry(0.025, 0.04, 5, 1, true);
  bell.rotateX(Math.PI);
  for (const [x, y, z] of [[0.02, -0.02, 0], [-0.015, -0.05, 0.012], [0.012, -0.08, -0.01]]) parts.push(at(bell, x, y, z));
  return merge(parts);
})();
const PETAL_COLORS = [0xffffff, 0xff8fc7, 0xfff4a8, 0xffffff];
const TULIP_COLORS = [0xff4a4a, 0xffd23f, 0xff7ab8, 0xff8a2a];
const BELL_COLORS = [0x7f8cff, 0xa57bff, 0x6fb6ff];

export function buildFlowers(list: Placement[]): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry32(list.length + 7);
  const stems: Placement[] = [];
  const leaves: Placement[] = [];
  const daisies: Placement[] = [];
  const centers: Placement[] = [];
  const tulips: Placement[] = [];
  const bells: Placement[] = [];
  const pick = (arr: number[]) => new THREE.Color(arr[Math.floor(rnd() * arr.length)]);
  for (const p of list) {
    const kind = rnd();
    const hgt = kind < 0.45 ? 0.32 + rnd() * 0.1 : kind < 0.75 ? 0.4 + rnd() * 0.1 : 0.36 + rnd() * 0.08;
    const green = new THREE.Color(0x3f8f2f).offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.06);
    stems.push({ ...p, scale: 1, tint: green, y: 0, ...{ sy: hgt } } as Placement);
    leaves.push({ ...p, scale: 0.9 + rnd() * 0.4, tint: green.clone().offsetHSL(0, 0, -0.04) });
    const top = { ...p, y: hgt, scale: p.scale * 1.45 };
    if (kind < 0.45) {
      daisies.push({ ...top, tint: pick(PETAL_COLORS) });
      centers.push({ ...top, y: hgt + 0.005, tint: new THREE.Color(0xffc93f) });
    } else if (kind < 0.75) tulips.push({ ...top, tint: pick(TULIP_COLORS) });
    else bells.push({ ...top, tint: pick(BELL_COLORS) });
  }
  // Stems: each one stretched to its own height
  const stemMesh = instanced(flowerStem, toon(0xffffff), stems.map((s) => ({ ...s, scale: 1 })), { shadows: false });
  const m4 = new THREE.Matrix4();
  stems.forEach((s, i) => {
    const sy = (s as Placement & { sy: number }).sy;
    m4.compose(new THREE.Vector3(s.x, 0, s.z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.15, s.rot, (rnd() - 0.5) * 0.15)), new THREE.Vector3(1, sy, 1));
    stemMesh.setMatrixAt(i, m4);
  });
  stemMesh.instanceMatrix.needsUpdate = true;
  g.add(stemMesh);
  g.add(instanced(flowerLeaves, toon(0xffffff), leaves, { shadows: false }));
  if (daisies.length) {
    g.add(instanced(daisyPetals, toon(0xffffff, { emissive: 0x111111 }), daisies, { shadows: false }));
    g.add(instanced(daisyCenter, toon(0xffffff, { emissive: 0x221500 }), centers, { shadows: false }));
  }
  if (tulips.length) g.add(instanced(tulipCup, toon(0xffffff, { emissive: 0x150505, side: THREE.DoubleSide }), tulips, { shadows: false }));
  if (bells.length) g.add(instanced(bellCluster, toon(0xffffff, { emissive: 0x0a0a20, side: THREE.DoubleSide }), bells, { shadows: false }));
  return g;
}

/* ---------- Windmill ---------- */

export function buildWindmill(): { group: THREE.Group; update: (dt: number) => void } {
  const group = new THREE.Group();
  const towerGeo = new THREE.CylinderGeometry(0.72, 1.0, 2.7, 12);
  towerGeo.translate(0, 1.35, 0);
  const tower = addOutline(new THREE.Mesh(towerGeo, toon(0xf1e6cc)), 0.035, smooth(towerGeo));
  tower.castShadow = tower.receiveShadow = true;
  group.add(tower);

  // Stone base ring
  const baseGeo = new THREE.CylinderGeometry(1.08, 1.15, 0.35, 12);
  baseGeo.translate(0, 0.17, 0);
  const base = addOutline(new THREE.Mesh(baseGeo, toon(0xa7a39a)), 0.03, smooth(baseGeo));
  base.castShadow = base.receiveShadow = true;
  group.add(base);

  const roofGeo = new THREE.ConeGeometry(0.98, 1.2, 12);
  roofGeo.translate(0, 3.25, 0);
  const roof = addOutline(new THREE.Mesh(roofGeo, toon(0xc0533b)), 0.035, smooth(roofGeo));
  roof.castShadow = true;
  group.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.12), toon(0x6b4226));
  door.position.set(0, 0.55, 0.93);
  door.rotation.x = -0.1;
  group.add(door);
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), toon(0x3a3550));
  win.position.set(0, 1.85, 0.79);
  win.rotation.x = -0.1;
  group.add(win);

  // Blades spin around the hub, facing the camera.
  const hub = new THREE.Group();
  hub.position.set(0, 2.55, 0.92);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), toon(0x6b4226));
  hub.add(cap);
  const arm = new THREE.BoxGeometry(0.07, 1.65, 0.05);
  arm.translate(0, 0.82, 0);
  const sail = new THREE.BoxGeometry(0.36, 1.15, 0.03);
  sail.translate(0.21, 1.0, 0.02);
  const armMat = toon(0x6b4226);
  const sailMat = toon(0xfaf3e3);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Group();
    const a = addOutline(new THREE.Mesh(arm, armMat), 0.02, smooth(arm));
    const s = addOutline(new THREE.Mesh(sail, sailMat), 0.02, smooth(sail));
    a.castShadow = s.castShadow = true;
    blade.add(a, s);
    blade.rotation.z = (i * Math.PI) / 2;
    hub.add(blade);
  }
  group.add(hub);
  return { group, update: (dt) => (hub.rotation.z -= dt * 0.6) };
}

/* ---------- Signpost ---------- */

export function buildSign(): THREE.Group {
  const g = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.9, 6);
  postGeo.translate(0, 0.45, 0);
  const post = addOutline(new THREE.Mesh(postGeo, toon(0x7a4e2d)), 0.025, smooth(postGeo));
  const boardGeo = new THREE.BoxGeometry(0.85, 0.42, 0.08);
  boardGeo.translate(0, 0.78, 0.06);
  const board = addOutline(new THREE.Mesh(boardGeo, toon(0xb88350)), 0.025, smooth(boardGeo));
  post.castShadow = board.castShadow = true;
  g.add(post, board);
  // carved "writing"
  const lineMat = toon(0x5c3a1f);
  for (let i = 0; i < 3; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.55 - i * 0.12, 0.035, 0.01), lineMat);
    line.position.set(-0.04 * i, 0.88 - i * 0.09, 0.105);
    g.add(line);
  }
  return g;
}

/* ---------- Treasure chest (opens with the key a boss drops) ---------- */

export interface Chest { group: THREE.Group; update: (t: number) => void; setOpen: (k: number) => void }

export function buildChest(): Chest {
  const g = new THREE.Group();
  const wood = toon(0xa5652b);
  const gold = toon(0xf4c542, { emissive: 0x6b4a00 });
  const bodyGeo = new THREE.BoxGeometry(0.78, 0.42, 0.52);
  bodyGeo.translate(0, 0.21, 0);
  const body = addOutline(new THREE.Mesh(bodyGeo, wood), 0.03, smooth(bodyGeo));
  // The lid hinges at the back edge.
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.42, -0.26);
  const lidGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.78, 12, 1, false, 0, Math.PI);
  lidGeo.rotateZ(Math.PI / 2);
  lidGeo.scale(1, 0.75, 1);
  lidGeo.translate(0, 0, 0.26);
  const lid = addOutline(new THREE.Mesh(lidGeo, wood), 0.03, smooth(lidGeo));
  body.castShadow = lid.castShadow = true;
  lidPivot.add(lid);
  g.add(body, lidPivot);
  // Glowing treasure inside, seen when the lid opens
  const inner = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 0.42), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.1) }));
  inner.position.y = 0.41;
  g.add(inner);
  const bandTopGeo = new THREE.CylinderGeometry(0.275, 0.275, 0.08, 12, 1, false, 0, Math.PI);
  bandTopGeo.rotateZ(Math.PI / 2);
  bandTopGeo.scale(1, 0.75, 1);
  bandTopGeo.translate(0, 0, 0.26);
  for (const x of [-0.27, 0.27]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.545), gold);
    band.position.set(x, 0.22, 0);
    g.add(band);
    const top = new THREE.Mesh(bandTopGeo, gold);
    top.position.set(x, 0, 0);
    lidPivot.add(top);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.06), gold);
  lock.position.set(0, 0.38, 0.28);
  g.add(lock);

  // Little twinkles so it reads as treasure.
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.4) });
  const sparks: THREE.Mesh[] = [];
  const sparkGeo = new THREE.OctahedronGeometry(0.05, 0);
  sparkGeo.scale(0.5, 1.6, 0.5);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(sparkGeo, sparkMat);
    g.add(s);
    sparks.push(s);
  }
  const update = (t: number) => {
    sparks.forEach((s, i) => {
      const phase = (t * 0.7 + i / 3) % 1;
      const k = Math.sin(phase * Math.PI);
      s.scale.setScalar(k * 1.2 + 0.001);
      s.rotation.y = t * 2 + i;
      const ang = i * 2.1 + Math.floor(t * 0.7 + i / 3) * 1.7;
      s.position.set(Math.cos(ang) * 0.35, 0.55 + phase * 0.35, Math.sin(ang) * 0.25 + 0.1);
    });
  };
  const setOpen = (k: number) => {
    lidPivot.rotation.x = -1.9 * k;
    lock.visible = k < 0.05;
  };
  return { group: g, update, setOpen };
}

/* ---------- Wooden bridge ---------- */

export function buildBridge(minX: number, maxX: number, minZ: number, maxZ: number): THREE.Group {
  const g = new THREE.Group();
  const width = maxX - minX;
  const len = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const rnd = mulberry32(7);
  const plankGeo = new THREE.BoxGeometry(width + 0.3, 0.09, 0.26);
  const plankSmooth = smooth(plankGeo);
  const plankMats = [toon(0xb07a45), toon(0xa06d3c), toon(0xbb8550)];
  const n = Math.floor(len / 0.3);
  for (let i = 0; i < n; i++) {
    const p = addOutline(new THREE.Mesh(plankGeo, plankMats[i % 3]), 0.018, plankSmooth);
    p.position.set(cx + (rnd() - 0.5) * 0.06, 0.03, minZ + 0.15 + i * (len / n));
    p.rotation.y = (rnd() - 0.5) * 0.05;
    p.castShadow = p.receiveShadow = true;
    g.add(p);
  }
  const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.7, 6);
  const postSmooth = smooth(postGeo);
  const railGeo = new THREE.BoxGeometry(0.08, 0.08, len + 0.1);
  const railSmooth = smooth(railGeo);
  const dark = toon(0x7a4e2d);
  for (const side of [-1, 1]) {
    const x = cx + side * (width / 2 + 0.12);
    for (const z of [minZ + 0.05, (minZ + maxZ) / 2, maxZ - 0.05]) {
      const post = addOutline(new THREE.Mesh(postGeo, dark), 0.02, postSmooth);
      post.position.set(x, 0.15, z);
      post.castShadow = true;
      g.add(post);
    }
    const rail = addOutline(new THREE.Mesh(railGeo, dark), 0.02, railSmooth);
    rail.position.set(x, 0.45, (minZ + maxZ) / 2);
    rail.castShadow = true;
    g.add(rail);
  }
  return g;
}

/* ---------- Wooden ogre barricade (crossed spiked logs) ---------- */

export function buildBarricade(): THREE.Group {
  const g = new THREE.Group();
  const logGeo = new THREE.CylinderGeometry(0.08, 0.09, 1.25, 7);
  const tipGeo = new THREE.ConeGeometry(0.085, 0.18, 7);
  const wood = toon(0x8a5a33);
  const logSmooth = smooth(logGeo);
  for (const [rz, x] of [[0.7, 0], [-0.7, 0]] as const) {
    const log = addOutline(new THREE.Mesh(logGeo, wood), 0.02, logSmooth);
    log.rotation.set(0, 0, rz);
    log.position.set(x, 0.42, 0);
    log.castShadow = true;
    const tip1 = new THREE.Mesh(tipGeo, toon(0xc9b28a));
    tip1.position.y = 0.7;
    const tip2 = tip1.clone();
    tip2.position.y = -0.7;
    tip2.rotation.x = Math.PI;
    log.add(tip1, tip2);
    g.add(log);
  }
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 12), toon(0xc9a86a));
  rope.position.y = 0.42;
  g.add(rope);
  return g;
}
