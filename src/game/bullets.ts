import * as THREE from 'three';
import type { CollisionWorld } from './collision';

/**
 * Enemy shots: glowing orbs, bone arrows and bone shards. Always bright so they never blend into the grass.
 */

export type BulletKind = 'orb' | 'arrow' | 'shard' | 'goo';

interface Bullet {
  mesh: THREE.Mesh;
  vx: number;
  vz: number;
  radius: number;
  damage: number;
  life: number;
  kind: BulletKind;
}

const geos: Record<BulletKind, THREE.BufferGeometry> = {
  orb: new THREE.IcosahedronGeometry(0.16, 1),
  goo: new THREE.IcosahedronGeometry(0.14, 1),
  arrow: (() => {
    const g = new THREE.CylinderGeometry(0.035, 0.06, 0.55, 5);
    g.rotateX(Math.PI / 2);
    return g;
  })(),
  shard: (() => {
    const g = new THREE.OctahedronGeometry(0.13, 0);
    g.scale(0.6, 0.6, 1.6);
    return g;
  })(),
};
const mats: Record<BulletKind, THREE.Material> = {
  orb: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.6, 2.2) }),
  goo: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.6, 0.6) }),
  arrow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 1.3, 0.4) }),
  shard: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.4, 1.9) }),
};
const shadowGeo = new THREE.CircleGeometry(0.14, 10);
shadowGeo.rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });

export class Bullets {
  readonly group = new THREE.Group();
  private list: Bullet[] = [];

  fire(kind: BulletKind, x: number, z: number, angle: number, speed: number, damage = 1, life = 4) {
    const mesh = new THREE.Mesh(geos[kind], mats[kind]);
    mesh.position.set(x, 0.65, z);
    mesh.rotation.y = angle;
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.y = -0.6;
    mesh.add(shadow);
    this.group.add(mesh);
    this.list.push({
      mesh, vx: Math.sin(angle) * speed, vz: Math.cos(angle) * speed,
      radius: kind === 'arrow' ? 0.14 : 0.16, damage, life, kind,
    });
  }

  clear() {
    for (const b of this.list) this.group.remove(b.mesh);
    this.list = [];
  }

  get count() {
    return this.list.length;
  }

  /** Moves every shot; calls hitPlayer when one touches Herman (it returns true if the hit landed). */
  update(
    dt: number,
    t: number,
    collision: CollisionWorld,
    player: THREE.Vector3,
    playerRadius: number,
    hitPlayer: (damage: number, x: number, z: number) => boolean,
  ) {
    const b0 = collision.bounds;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.life -= dt;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.z += b.vz * dt;
      if (b.kind === 'orb' || b.kind === 'goo') {
        const s = 1 + Math.sin(t * 18 + i) * 0.12;
        b.mesh.scale.setScalar(s);
      } else if (b.kind === 'shard') {
        b.mesh.rotation.z += dt * 14;
      }
      const p = b.mesh.position;
      let dead = b.life <= 0 || p.x < b0.minX - 1 || p.x > b0.maxX + 1 || p.z < b0.minZ - 1 || p.z > b0.maxZ + 1;
      if (!dead && collision.solidAt(p.x, p.z, 0.05)) dead = true;
      if (!dead && Math.hypot(p.x - player.x, p.z - player.z) < b.radius + playerRadius) {
        if (hitPlayer(b.damage, p.x - b.vx * 0.05, p.z - b.vz * 0.05)) dead = true;
      }
      if (dead) {
        this.group.remove(b.mesh);
        this.list.splice(i, 1);
      }
    }
  }
}
