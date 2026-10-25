import * as THREE from 'three';
import { toon, addOutline } from '../core/toon';
import { smooth } from '../core/geo';
import { rockGeo } from '../world/props';
import type { CollisionWorld, CircleCollider } from './collision';

/**
 * Rocks Herman can lift (with empty hands), aim and throw.
 * A thrown rock smashes everything inside a circle where it lands:
 * regular monsters are knocked out, ogres lose half their health, bosses take 8 damage.
 * The rock stays where it lands so it can be picked up again (rocks that fall in the river roll back home).
 */

export const ROCK_BLAST_RADIUS = 1.6;
const rockOutline = smooth(rockGeo);

export interface Rock {
  mesh: THREE.Mesh;
  home: { x: number; z: number };
  state: 'ground' | 'carried' | 'flying' | 'respawn';
  collider: CircleCollider | null;
  flight?: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; peak: number };
  respawnT?: number;
}

export class Rocks {
  readonly group = new THREE.Group();
  readonly list: Rock[] = [];
  /** Aiming helpers: a gold landing circle and a dotted arc. */
  readonly reticle = new THREE.Group();
  private arcDots: THREE.Mesh[] = [];
  onLand: ((x: number, z: number, inWater: boolean) => void) | null = null;

  constructor(private collision: CollisionWorld, spots: { x: number; z: number }[]) {
    for (const s of spots) {
      const mesh = new THREE.Mesh(rockGeo, toon(0xa9acb8));
      mesh.castShadow = mesh.receiveShadow = true;
      addOutline(mesh, 0.03, rockOutline);
      mesh.scale.setScalar(1.15);
      mesh.rotation.y = Math.random() * 6;
      this.group.add(mesh);
      const rock: Rock = { mesh, home: { ...s }, state: 'ground', collider: null };
      this.place(rock, s.x, s.z);
      this.list.push(rock);
    }

    // Reticle: a glowing gold ring the size of the blast, with a cross in the middle
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.0, 0.5), transparent: true, opacity: 0.9, depthWrite: false });
    const fillMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.3), transparent: true, opacity: 0.18, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(ROCK_BLAST_RADIUS - 0.1, ROCK_BLAST_RADIUS, 48), ringMat);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(ROCK_BLAST_RADIUS - 0.1, 48), fillMat);
    const crossA = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.08), ringMat);
    const crossB = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.6), ringMat);
    for (const m of [ring, fill, crossA, crossB]) {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 4;
      this.reticle.add(m);
    }
    this.reticle.position.y = 0.07;
    this.reticle.visible = false;
    this.group.add(this.reticle);
    const dotGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 1.2) });
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.visible = false;
      this.arcDots.push(d);
      this.group.add(d);
    }
  }

  private place(rock: Rock, x: number, z: number) {
    const p = { x, z };
    this.collision.resolve(p, 0.4);
    rock.mesh.position.set(p.x, 0, p.z);
    rock.state = 'ground';
    rock.collider = this.collision.addCircle(p.x, p.z, 0.38, true);
  }

  /** The closest rock on the ground within reach. */
  nearest(x: number, z: number, reach = 1.1): Rock | null {
    let best: Rock | null = null;
    let bd = reach;
    for (const r of this.list) {
      if (r.state !== 'ground') continue;
      const d = Math.hypot(r.mesh.position.x - x, r.mesh.position.z - z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  pickUp(rock: Rock, holder: THREE.Object3D) {
    if (rock.collider) this.collision.remove(rock.collider);
    rock.collider = null;
    rock.state = 'carried';
    rock.mesh.castShadow = true;
    holder.add(rock.mesh);
    rock.mesh.position.set(0, 0, 0);
    rock.mesh.scale.setScalar(0.85);
  }

  /** Put a carried rock down at Herman's feet (when switching weapons). */
  drop(rock: Rock, x: number, z: number) {
    rock.mesh.removeFromParent();
    rock.mesh.scale.setScalar(1.15);
    this.group.add(rock.mesh);
    this.place(rock, x, z);
  }

  throw(rock: Rock, from: THREE.Vector3, to: THREE.Vector3) {
    const world = new THREE.Vector3();
    rock.mesh.getWorldPosition(world);
    rock.mesh.removeFromParent();
    rock.mesh.scale.setScalar(1.15);
    this.group.add(rock.mesh);
    rock.mesh.position.copy(world);
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    rock.state = 'flying';
    rock.flight = { from: world.clone(), to: to.clone(), t: 0, dur: 0.35 + d * 0.035, peak: 1.5 + d * 0.22 };
  }

  /** Draw the dotted arc and landing circle while aiming. */
  showAim(from: THREE.Vector3 | null, to: THREE.Vector3 | null, t: number) {
    this.reticle.visible = !!(from && to);
    if (!from || !to) {
      for (const d of this.arcDots) d.visible = false;
      return;
    }
    this.reticle.position.set(to.x, 0.07, to.z);
    this.reticle.rotation.y = t * 0.8;
    this.reticle.scale.setScalar(1 + Math.sin(t * 6) * 0.03);
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const peak = 1.5 + dist * 0.22;
    const n = this.arcDots.length;
    this.arcDots.forEach((dot, i) => {
      const k = (i + 1 + ((t * 2) % 1)) / (n + 1);
      dot.visible = k < 1;
      dot.position.set(
        from.x + (to.x - from.x) * k,
        from.y * (1 - k) + Math.sin(k * Math.PI) * peak,
        from.z + (to.z - from.z) * k,
      );
    });
  }

  reset() {
    for (const r of this.list) {
      if (r.collider) this.collision.remove(r.collider);
      r.mesh.removeFromParent();
      r.mesh.scale.setScalar(1.15);
      this.group.add(r.mesh);
      this.place(r, r.home.x, r.home.z);
    }
    this.showAim(null, null, 0);
  }

  update(dt: number) {
    for (const r of this.list) {
      if (r.state === 'flying' && r.flight) {
        const f = r.flight;
        f.t += dt / f.dur;
        const k = Math.min(1, f.t);
        r.mesh.position.lerpVectors(f.from, f.to, k);
        r.mesh.position.y = f.from.y * (1 - k) + Math.sin(k * Math.PI) * f.peak;
        r.mesh.rotation.x += dt * 9;
        r.mesh.rotation.z += dt * 6;
        if (k >= 1) {
          const water = this.collision.waterAt(f.to.x, f.to.z);
          this.onLand?.(f.to.x, f.to.z, water);
          r.flight = undefined;
          r.mesh.rotation.set(0, Math.random() * 6, 0);
          if (water) {
            // Splash! It washes back to where it came from.
            r.state = 'respawn';
            r.respawnT = 3;
            r.mesh.visible = false;
          } else {
            this.place(r, f.to.x, f.to.z);
          }
        }
      } else if (r.state === 'respawn') {
        r.respawnT! -= dt;
        if (r.respawnT! <= 0) {
          r.mesh.visible = true;
          this.place(r, r.home.x, r.home.z);
        }
      }
    }
  }
}
