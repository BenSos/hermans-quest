import * as THREE from 'three';
import { toon } from '../core/toon';
import type { Collider } from '../game/collision';

/** Little bits of life: butterflies drifting over the meadow and dust puffs under Herman's boots. */

export class Butterflies {
  readonly group = new THREE.Group();
  private flies: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; home: THREE.Vector3; seed: number }[] = [];
  private obstacles: Collider[] = [];

  /** Solid things on this screen (wells, trees, houses). Butterflies flutter around them. */
  setObstacles(list: Collider[]) {
    this.obstacles = list;
  }

  private avoid(p: { x: number; z: number }) {
    const pad = 0.28;
    for (const c of this.obstacles) {
      if (c.kind === 'circle') {
        const dx = p.x - c.x, dz = p.z - c.z, min = c.r + pad;
        const d = Math.hypot(dx, dz);
        if (d < min) {
          const k = (d || 0.001);
          p.x = c.x + (dx / k) * min;
          p.z = c.z + (dz / k) * min;
        }
      } else {
        const minX = c.minX - pad, maxX = c.maxX + pad, minZ = c.minZ - pad, maxZ = c.maxZ + pad;
        if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ) {
          const l = p.x - minX, r = maxX - p.x, u = p.z - minZ, d = maxZ - p.z;
          const m = Math.min(l, r, u, d);
          if (m === l) p.x = minX; else if (m === r) p.x = maxX; else if (m === u) p.z = minZ; else p.z = maxZ;
        }
      }
    }
  }

  constructor(homes: THREE.Vector3[]) {
    const wing = new THREE.CircleGeometry(0.09, 8);
    wing.scale(1, 0.75, 1);
    wing.rotateX(-Math.PI / 2);
    const colors = [0xffe066, 0xffffff, 0xff9ad5, 0x9ad0ff, 0xffa94d];
    homes.forEach((home, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide });
      const g = new THREE.Group();
      const l = new THREE.Mesh(wing, mat);
      const r = new THREE.Mesh(wing, mat);
      l.geometry = wing.clone().translate(-0.09, 0, 0);
      r.geometry = wing.clone().translate(0.09, 0, 0);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.06, 2, 4), new THREE.MeshBasicMaterial({ color: 0x2a2433 }));
      body.rotation.x = Math.PI / 2;
      g.add(l, r, body);
      g.castShadow = true;
      this.group.add(g);
      this.flies.push({ g, l, r, home: home.clone(), seed: i * 13.7 });
    });
  }

  update(t: number) {
    for (const f of this.flies) {
      const s = f.seed;
      const x = f.home.x + Math.sin(t * 0.45 + s) * 1.6 + Math.sin(t * 1.3 + s * 2) * 0.4;
      const z = f.home.z + Math.cos(t * 0.37 + s) * 1.2 + Math.sin(t * 1.1 + s) * 0.3;
      const y = 0.65 + Math.sin(t * 2.3 + s) * 0.2;
      const p = { x, z };
      this.avoid(p);
      // Ease toward the target so going around something looks like a flutter, not a jump
      const k = f.g.position.lengthSq() === 0 ? 1 : 0.25;
      const nx = f.g.position.x + (p.x - f.g.position.x) * k;
      const nz = f.g.position.z + (p.z - f.g.position.z) * k;
      const q = { x: nx, z: nz };
      this.avoid(q);
      const dx = q.x - f.g.position.x;
      const dz = q.z - f.g.position.z;
      f.g.position.set(q.x, y, q.z);
      if (dx || dz) f.g.rotation.y = Math.atan2(dx, dz);
      const flap = Math.sin(t * 22 + s) * 1.1;
      f.l.rotation.z = flap;
      f.r.rotation.z = -flap;
    }
  }
}

export class DustPuffs {
  readonly group = new THREE.Group();
  private puffs: { m: THREE.Mesh; life: number; vx: number; vz: number }[] = [];
  private mat = toon(0xf3e6c8, { transparent: true, opacity: 0.8, depthWrite: false });
  private next = 0;

  constructor() {
    const geo = new THREE.IcosahedronGeometry(0.09, 1);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(geo, this.mat.clone());
      m.visible = false;
      this.group.add(m);
      this.puffs.push({ m, life: 0, vx: 0, vz: 0 });
    }
  }

  emit(x: number, z: number, vx: number, vz: number) {
    const p = this.puffs[this.next];
    this.next = (this.next + 1) % this.puffs.length;
    p.life = 1;
    p.vx = -vx * 0.08 + (Math.random() - 0.5) * 0.4;
    p.vz = -vz * 0.08 + (Math.random() - 0.5) * 0.4;
    p.m.position.set(x + (Math.random() - 0.5) * 0.2, 0.06, z + (Math.random() - 0.5) * 0.2);
    p.m.visible = true;
  }

  update(dt: number) {
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt * 2.2;
      if (p.life <= 0) {
        p.m.visible = false;
        continue;
      }
      p.m.position.x += p.vx * dt;
      p.m.position.z += p.vz * dt;
      p.m.position.y += dt * 0.35;
      const s = 0.6 + (1 - p.life) * 1.4;
      p.m.scale.setScalar(s);
      (p.m.material as THREE.MeshToonMaterial).opacity = p.life * 0.75;
    }
  }
}
