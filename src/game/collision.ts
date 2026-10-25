/** Simple top-down collision: circles and axis-aligned boxes on the ground plane (x, z). */

/** low = short enough for Herman to jump over (rocks, bushes, signs, chests). */
export interface CircleCollider { kind: 'circle'; x: number; z: number; r: number; water?: boolean; low?: boolean }
export interface BoxCollider { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number; water?: boolean; low?: boolean }
export type Collider = CircleCollider | BoxCollider;

export class CollisionWorld {
  colliders: Collider[] = [];
  bounds = { minX: -11, maxX: 11, minZ: -6.5, maxZ: 6.5 };
  /** Outdoors the water is a shallow river Herman can wade through. In the keep it is lava. */
  wadeable = false;

  addCircle(x: number, z: number, r: number, low = false): CircleCollider {
    const c: CircleCollider = { kind: 'circle', x, z, r, low };
    this.colliders.push(c);
    return c;
  }

  remove(c: Collider) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  /** water = true: blocks walkers but projectiles fly over it. */
  addBox(minX: number, maxX: number, minZ: number, maxZ: number, water = false): BoxCollider {
    const c: BoxCollider = { kind: 'box', minX, maxX, minZ, maxZ, water };
    this.colliders.push(c);
    return c;
  }

  /** Is there something solid (a tree, rock, wall; not water) touching this circle? */
  solidAt(x: number, z: number, r: number): boolean {
    for (const c of this.colliders) {
      if (c.water) continue;
      if (c.kind === 'circle') {
        const dx = x - c.x, dz = z - c.z, m = r + c.r;
        if (dx * dx + dz * dz < m * m) return true;
      } else {
        const cx = Math.max(c.minX, Math.min(x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  /** Is this point over water? */
  waterAt(x: number, z: number): boolean {
    for (const c of this.colliders) {
      if (!c.water || c.kind !== 'box') continue;
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return true;
    }
    return false;
  }

  /** Pushes a moving circle (radius r) out of anything solid. Mutates and returns pos. */
  resolve(pos: { x: number; z: number }, r: number, opts?: { wade?: boolean; jump?: boolean }): { x: number; z: number } {
    const wade = !!opts?.wade && this.wadeable;
    const jump = !!opts?.jump;
    for (let iter = 0; iter < 3; iter++) {
      for (const c of this.colliders) {
        if ((wade && c.water) || (jump && c.low)) continue;
        if (c.kind === 'circle') {
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const min = r + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min) {
            const d = Math.sqrt(d2) || 0.0001;
            pos.x = c.x + (dx / d) * min;
            pos.z = c.z + (dz / d) * min;
          }
        } else {
          const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
          const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
          const dx = pos.x - cx;
          const dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              pos.x = cx + (dx / d) * r;
              pos.z = cz + (dz / d) * r;
            } else {
              // Center is inside the box: push out the shortest way.
              const left = pos.x - c.minX, right = c.maxX - pos.x;
              const up = pos.z - c.minZ, down = c.maxZ - pos.z;
              const m = Math.min(left, right, up, down);
              if (m === left) pos.x = c.minX - r;
              else if (m === right) pos.x = c.maxX + r;
              else if (m === up) pos.z = c.minZ - r;
              else pos.z = c.maxZ + r;
            }
          }
        }
      }
    }
    const b = this.bounds;
    pos.x = Math.max(b.minX + r, Math.min(b.maxX - r, pos.x));
    pos.z = Math.max(b.minZ + r, Math.min(b.maxZ - r, pos.z));
    return pos;
  }
}
