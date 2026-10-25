import * as THREE from 'three';
import { toon, addOutline } from '../core/toon';
import { smooth } from '../core/geo';
import { Herman, WeaponId, buildBoomerang } from '../entities/herman';
import type { Enemy } from './enemy';
import type { CollisionWorld } from './collision';
import type { Effects } from '../fx/effects';
import { PowerState, basePowerState } from './powerups';
import { sfx } from '../core/sfx';

/**
 * Herman's three weapons.
 *  Sword: short range, swings on its own at anything close, even while walking.
 *  Boomerang: medium range, thrown when standing still, hits on the way out and on the way back.
 *  Bow: long range, fires when standing still, arrows land on the ground and must be picked up.
 */

export const WEAPON_ORDER: WeaponId[] = ['sword', 'boomerang', 'bow', 'hands'];

export const WEAPON_STATS = {
  sword: { range: 1.35, damage: 3, cooldown: 0.4, arc: 1.3, knock: 6 },
  boomerang: { range: 6, damage: 2, cooldown: 0.15, speedOut: 11, speedBack: 13, knock: 3 },
  bow: { range: 12, damage: 2, cooldown: 0.5, speed: 19, knock: 2.5 },
};

const STOP_DELAY = 0.15;
const SWITCH_TIME = 0.3;

export interface HitEvent { enemy: Enemy; damage: number; killed: boolean; x: number; y: number; z: number }

interface FlyingArrow { mesh: THREE.Group; dir: THREE.Vector3; traveled: number; magic: boolean }
interface SwordWave { mesh: THREE.Mesh; dir: THREE.Vector3; traveled: number; range: number; hit: Set<Enemy>; pierce: boolean }
interface GroundArrow { mesh: THREE.Group; ring: THREE.Mesh; returning: boolean; t: number; from: THREE.Vector3; floating: boolean }

const shaftGeo = (() => {
  const g = new THREE.CylinderGeometry(0.014, 0.014, 0.62, 5);
  g.rotateX(Math.PI / 2);
  return g;
})();
const headGeo = (() => {
  const g = new THREE.ConeGeometry(0.038, 0.11, 6);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, 0.36);
  return g;
})();
const fletchGeo = (() => {
  const g = new THREE.BoxGeometry(0.006, 0.07, 0.12);
  g.translate(0, 0, -0.27);
  return g;
})();
const glowRingGeo = (() => {
  const g = new THREE.RingGeometry(0.16, 0.24, 20);
  g.rotateX(-Math.PI / 2);
  return g;
})();

function buildArrow(): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(shaftGeo, toon(0xa8743f));
  addOutline(shaft, 0.012, smooth(shaftGeo));
  const head = new THREE.Mesh(headGeo, toon(0xdfe6ee, { emissive: 0x20252c }));
  const red = toon(0xd13b33);
  const f1 = new THREE.Mesh(fletchGeo, red);
  const f2 = new THREE.Mesh(fletchGeo, red);
  f2.rotation.z = Math.PI / 2;
  shaft.castShadow = true;
  g.add(shaft, head, f1, f2);
  return g;
}

export class Weapons {
  readonly group = new THREE.Group();
  current: WeaponId = 'sword';
  arrows = 12;
  private baseQuiver = 12;
  power: PowerState = basePowerState();
  private waves: SwordWave[] = [];
  private blades = new THREE.Group();
  private bladeHit = new Map<Enemy, number>();

  private switchT = 0;
  private stillT = 0;
  private swordCd = 0;
  private rangedCd = 0;
  private flying: FlyingArrow[] = [];
  private ground: GroundArrow[] = [];
  private rang: {
    mesh: THREE.Group; phase: 'out' | 'back'; dir: THREE.Vector3; traveled: number; maxDist: number;
    hitOut: Set<Enemy>; hitBack: Set<Enemy>;
  } | null = null;
  private rangMesh = buildBoomerang();
  private ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 0.8), transparent: true, opacity: 0.8, depthWrite: false });
  /** The enemy Herman is currently aiming at (for the target ring). */
  target: Enemy | null = null;
  onHit: ((e: HitEvent) => void) | null = null;
  onArrowsPicked: ((n: number) => void) | null = null;
  onOutOfArrows: (() => void) | null = null;
  /** Lets the game react when a shot passes a special spot (like a crystal switch). Return true to stop the shot there. */
  onProjectile: ((x: number, z: number) => boolean) | null = null;
  private warnedEmpty = false;

  constructor(private herman: Herman, private collision: CollisionWorld, private fx: Effects) {
    this.rangMesh.scale.setScalar(1.6);
    this.rangMesh.visible = false;
    this.group.add(this.rangMesh);
    // Blade Storm: three glowing swords that circle Herman
    const bladeGeo = new THREE.BoxGeometry(0.08, 0.04, 0.7);
    const bladeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.2, 3.0) });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(bladeGeo, bladeMat);
      this.blades.add(b);
    }
    this.blades.visible = false;
    this.group.add(this.blades);
  }

  /** Moving to another map: arrows and the boomerang now bounce off its walls. */
  setCollision(c: CollisionWorld) {
    this.collision = c;
  }

  get quiverMax() {
    return this.baseQuiver + this.power.quiverBonus;
  }

  /** New power-ups picked: refresh stats (and top up arrows if the quiver grew). */
  setPower(p: PowerState) {
    const grow = p.quiverBonus - this.power.quiverBonus;
    this.power = p;
    if (grow > 0) this.arrows += grow;
    this.arrows = Math.min(this.arrows, this.quiverMax);
    this.blades.visible = p.bladeStorm;
  }

  select(w: WeaponId) {
    if (w === this.current) return;
    this.current = w;
    this.switchT = SWITCH_TIME;
    this.herman.setWeapon(w);
    if (w === 'boomerang') this.herman.setRangInHand(!this.rang);
    this.warnedEmpty = false;
  }

  cycle() {
    const i = WEAPON_ORDER.indexOf(this.current);
    this.select(WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length]);
  }

  get groundArrowCount() {
    return this.ground.length + this.flying.length;
  }

  reset() {
    for (const a of this.flying) this.group.remove(a.mesh);
    for (const a of this.ground) this.group.remove(a.mesh, a.ring);
    this.flying = [];
    this.ground = [];
    for (const w of this.waves) this.group.remove(w.mesh);
    this.waves = [];
    this.power = basePowerState();
    this.blades.visible = false;
    this.arrows = this.quiverMax;
    this.rang = null;
    this.rangMesh.visible = false;
    this.herman.setRangInHand(true);
  }

  /** Leaving a screen: every arrow (and the boomerang) comes straight back to the quiver. */
  collectAll() {
    for (const a of this.flying) this.group.remove(a.mesh);
    for (const a of this.ground) this.group.remove(a.mesh, a.ring);
    const back = this.flying.filter((a) => !a.magic).length + this.ground.length;
    this.flying = [];
    this.ground = [];
    this.arrows = Math.min(this.quiverMax, this.arrows + back);
    for (const w of this.waves) this.group.remove(w.mesh);
    this.waves = [];
    this.rang = null;
    this.rangMesh.visible = false;
    this.herman.setRangInHand(true);
  }

  /** Room cleared: every arrow on the ground flies home. */
  recallArrows() {
    for (const a of this.ground) {
      if (!a.returning) {
        a.returning = true;
        a.t = 0;
        a.from.copy(a.mesh.position);
      }
    }
  }

  update(dt: number, t: number, moving: boolean, enemies: Enemy[]) {
    const h = this.herman;
    this.switchT -= dt;
    this.swordCd -= dt;
    this.rangedCd -= dt;
    this.stillT = moving || h.dashing ? 0 : this.stillT + dt;
    const ready = h.alive && this.switchT <= 0 && !h.dashing;
    const hp = h.position;

    this.target = null;
    const nearest = (range: number) => {
      let best: Enemy | null = null;
      let bd = Infinity;
      for (const e of enemies) {
        if (!e.targetable()) continue;
        const d = Math.hypot(e.root.position.x - hp.x, e.root.position.z - hp.z) - e.radius;
        if (d < range && d < bd) {
          bd = d;
          best = e;
        }
      }
      return best;
    };

    if (this.current === 'sword') {
      const st = WEAPON_STATS.sword;
      const e = nearest(st.range);
      if (e) this.target = e;
      if (ready && e && this.swordCd <= 0) {
        const ang = Math.atan2(e.root.position.x - hp.x, e.root.position.z - hp.z);
        h.swing(ang);
        sfx.swing();
        this.fx.slash(hp.x, hp.z, ang);
        this.swordCd = st.cooldown / this.power.swordSpeed;
        if (this.power.swordWave > 0) this.fireWave(ang);
        for (const o of enemies) {
          if (!o.targetable()) continue;
          const dx = o.root.position.x - hp.x;
          const dz = o.root.position.z - hp.z;
          const d = Math.hypot(dx, dz);
          if (d - o.radius > st.range + 0.1) continue;
          let da = Math.atan2(dx, dz) - ang;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) > st.arc && d > o.radius + 0.4) continue;
          this.damage(o, st.damage, dx / (d || 1), dz / (d || 1), st.knock);
        }
      }
    } else if (this.current === 'boomerang') {
      const st = WEAPON_STATS.boomerang;
      const e = nearest(st.range);
      if (e && this.stillT >= STOP_DELAY) this.target = e;
      if (ready && e && !this.rang && this.rangedCd <= 0 && this.stillT >= STOP_DELAY) {
        const dx = e.root.position.x - hp.x;
        const dz = e.root.position.z - hp.z;
        const d = Math.hypot(dx, dz);
        const ang = Math.atan2(dx, dz);
        h.throwAt(ang);
        sfx.rangThrow();
        this.rang = {
          mesh: this.rangMesh,
          phase: 'out',
          dir: new THREE.Vector3(dx / d, 0, dz / d),
          traveled: 0,
          maxDist: Math.min(st.range, d + 1.5),
          hitOut: new Set(),
          hitBack: new Set(),
        };
        this.rangMesh.position.set(hp.x + (dx / d) * 0.4, 0.7, hp.z + (dz / d) * 0.4);
        this.rangMesh.visible = true;
        h.setRangInHand(false);
      }
    } else if (this.current === 'hands') {
      // Empty hands: no automatic attacks. Pick up rocks and throw them instead.
      h.aimAt(null);
    } else {
      const st = WEAPON_STATS.bow;
      const e = nearest(st.range);
      const canAim = e && this.stillT >= STOP_DELAY && h.alive;
      if (canAim) this.target = e;
      if (canAim && this.arrows > 0) {
        h.aimAt(Math.atan2(e.root.position.x - hp.x, e.root.position.z - hp.z));
      } else h.aimAt(null);
      if (canAim && this.arrows <= 0 && !this.warnedEmpty) {
        this.warnedEmpty = true;
        this.onOutOfArrows?.();
      }
      if (ready && canAim && this.arrows > 0 && this.rangedCd <= 0) {
        const dx = e.root.position.x - hp.x;
        const dz = e.root.position.z - hp.z;
        const base = Math.atan2(dx, dz);
        const extra = this.power.extraArrows;
        const spread = extra >= 2 ? 0.22 : 0.17;
        for (let k = 0; k <= extra; k++) {
          const off = (k - extra / 2) * spread;
          const ang = base + off;
          const arrow = buildArrow();
          arrow.position.set(hp.x + Math.sin(ang) * 0.45, 0.72, hp.z + Math.cos(ang) * 0.45);
          arrow.rotation.y = ang;
          this.group.add(arrow);
          // Only the middle arrow is real; extra (and infinite) arrows are magic and vanish when they land.
          const magic = this.power.infiniteQuiver || Math.abs(off) > 0.01;
          this.flying.push({ mesh: arrow, dir: new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), traveled: 0, magic });
        }
        sfx.bow();
        if (!this.power.infiniteQuiver) this.arrows--;
        this.rangedCd = st.cooldown;
        if (this.arrows > 0) this.warnedEmpty = false;
      }
    }

    this.updateBoomerang(dt, enemies);
    this.updateArrows(dt, t, enemies);
    this.updateWaves(dt, enemies);
    this.updateBlades(dt, t, enemies);
  }

  private damage(e: Enemy, dmg: number, dx: number, dz: number, knock: number, kind: 'sword' | 'rang' | 'bow' = 'sword') {
    const pw = this.power;
    const wMul = kind === 'sword' ? pw.swordMul : kind === 'rang' ? pw.rangMul : pw.bowMul;
    const dealt = e.hit(dmg * pw.damageMul * wMul, dx, dz, knock);
    if (pw.poison > 0) e.applyStatus('poison', pw.poison);
    if (pw.fire > 0) e.applyStatus('fire', pw.fire);
    if (pw.acid > 0) e.applyStatus('acid', pw.acid);
    const p = e.root.position;
    this.fx.sparks(p.x, 0.45, p.z, 6);
    this.onHit?.({ enemy: e, damage: dealt, killed: e.state === 'dead', x: p.x, y: 0.9 + (e.isBoss ? 1.5 : 0), z: p.z });
  }

  /** Sword Wave power-up: a crescent of light flies out from each swing. */
  private fireWave(ang: number) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.2, 1.9, 3.0), vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.fx.slashGeometry, mat);
    const hp = this.herman.position;
    mesh.position.set(hp.x, 0.6, hp.z);
    mesh.rotation.y = ang;
    mesh.scale.setScalar(0.6);
    this.group.add(mesh);
    this.waves.push({
      mesh, dir: new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), traveled: 0,
      range: this.power.swordWave, hit: new Set(), pierce: this.power.swordWavePierce,
    });
  }

  private updateWaves(dt: number, enemies: Enemy[]) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      const step = 12 * dt;
      w.mesh.position.addScaledVector(w.dir, step);
      w.traveled += step;
      const k = w.traveled / w.range;
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k * 0.7);
      let done = w.traveled >= w.range || this.collision.solidAt(w.mesh.position.x, w.mesh.position.z, 0.1)
        || (this.onProjectile?.(w.mesh.position.x + w.dir.x * 0.7, w.mesh.position.z + w.dir.z * 0.7) ?? false);
      // The wave's bright edge sits about 1.2 tiles ahead of its center
      const fx = w.mesh.position.x + w.dir.x * 0.7;
      const fz = w.mesh.position.z + w.dir.z * 0.7;
      for (const e of enemies) {
        if (done || !e.targetable() || w.hit.has(e)) continue;
        if (Math.hypot(e.root.position.x - fx, e.root.position.z - fz) < e.radius + 0.6) {
          w.hit.add(e);
          this.damage(e, WEAPON_STATS.sword.damage * 0.6, w.dir.x, w.dir.z, 2);
          if (!w.pierce) done = true;
        }
      }
      if (done) {
        this.group.remove(w.mesh);
        (w.mesh.material as THREE.Material).dispose();
        this.waves.splice(i, 1);
      }
    }
  }

  /** Blade Storm mythic: swords orbit Herman and cut what they touch. */
  private updateBlades(dt: number, t: number, enemies: Enemy[]) {
    if (!this.power.bladeStorm) return;
    const hp = this.herman.position;
    this.blades.position.set(hp.x, 0.65, hp.z);
    const spin = t * 3.2;
    this.blades.children.forEach((b, i) => {
      const a = spin + (i / 3) * Math.PI * 2;
      b.position.set(Math.sin(a) * 1.45, Math.sin(t * 4 + i) * 0.08, Math.cos(a) * 1.45);
      b.rotation.y = a + Math.PI / 2;
    });
    for (const [e, cd] of this.bladeHit) this.bladeHit.set(e, cd - dt);
    if (!this.herman.alive) return;
    for (const e of enemies) {
      if (!e.targetable() || (this.bladeHit.get(e) ?? 0) > 0) continue;
      for (const b of this.blades.children) {
        const bx = hp.x + b.position.x;
        const bz = hp.z + b.position.z;
        if (Math.hypot(e.root.position.x - bx, e.root.position.z - bz) < e.radius + 0.35) {
          const dx = e.root.position.x - hp.x, dz = e.root.position.z - hp.z, d = Math.hypot(dx, dz) || 1;
          this.damage(e, 2, dx / d, dz / d, 2);
          this.bladeHit.set(e, 0.5);
          break;
        }
      }
    }
  }

  private updateBoomerang(dt: number, enemies: Enemy[]) {
    const r = this.rang;
    if (!r) return;
    const st = WEAPON_STATS.boomerang;
    const sp = this.power.rangSpeed;
    const m = r.mesh;
    m.rotation.y += dt * 22;
    const hp = this.herman.position;
    if (r.phase === 'out') {
      const step = st.speedOut * sp * dt;
      m.position.x += r.dir.x * step;
      m.position.z += r.dir.z * step;
      r.traveled += step;
      const b = this.collision.bounds;
      const outOfBounds = m.position.x < b.minX || m.position.x > b.maxX || m.position.z < b.minZ || m.position.z > b.maxZ;
      const special = this.onProjectile?.(m.position.x, m.position.z) ?? false;
      if (special || r.traveled >= r.maxDist || this.collision.solidAt(m.position.x, m.position.z, 0.15) || outOfBounds) {
        r.phase = 'back';
        if (this.collision.solidAt(m.position.x, m.position.z, 0.15)) this.fx.sparks(m.position.x, 0.7, m.position.z, 4);
      }
    } else {
      const dx = hp.x - m.position.x;
      const dz = hp.z - m.position.z;
      const d = Math.hypot(dx, dz);
      const step = st.speedBack * sp * dt;
      if (d <= step + 0.35) {
        this.rang = null;
        m.visible = false;
        sfx.rangCatch();
        this.herman.setRangInHand(true);
        this.rangedCd = st.cooldown;
        return;
      }
      m.position.x += (dx / d) * step;
      m.position.z += (dz / d) * step;
      // Scoop up arrows on the way home
      for (const a of this.ground) {
        if (!a.returning && Math.hypot(a.mesh.position.x - m.position.x, a.mesh.position.z - m.position.z) < 0.6) {
          a.returning = true;
          a.t = 0;
          a.from.copy(a.mesh.position);
        }
      }
    }
    const hitSet = r.phase === 'out' ? r.hitOut : r.hitBack;
    for (const e of enemies) {
      if (!e.targetable() || hitSet.has(e)) continue;
      const dx = e.root.position.x - m.position.x;
      const dz = e.root.position.z - m.position.z;
      if (Math.hypot(dx, dz) < e.radius + 0.35) {
        hitSet.add(e);
        const kd = r.phase === 'out' ? r.dir : new THREE.Vector3(-dx, 0, -dz).normalize().negate();
        this.damage(e, st.damage, kd.x, kd.z, st.knock, 'rang');
      }
    }
  }

  private updateArrows(dt: number, t: number, enemies: Enemy[]) {
    const st = WEAPON_STATS.bow;
    const hp = this.herman.position;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const a = this.flying[i];
      const step = st.speed * dt;
      // Sub-step so fast arrows don't skip through small slimes
      let landed = false;
      const n = Math.ceil(step / 0.25);
      for (let k = 0; k < n && !landed; k++) {
        a.mesh.position.x += a.dir.x * (step / n);
        a.mesh.position.z += a.dir.z * (step / n);
        a.traveled += step / n;
        const p = a.mesh.position;
        for (const e of enemies) {
          if (!e.targetable()) continue;
          if (Math.hypot(e.root.position.x - p.x, e.root.position.z - p.z) < e.radius + 0.12) {
            this.damage(e, st.damage, a.dir.x, a.dir.z, st.knock, 'bow');
            this.land(a, p.x - a.dir.x * 0.2, p.z - a.dir.z * 0.2, false);
            landed = true;
            break;
          }
        }
        if (landed) break;
        if (this.onProjectile?.(p.x, p.z)) {
          this.land(a, p.x - a.dir.x * 0.4, p.z - a.dir.z * 0.4, false);
          landed = true;
          break;
        }
        const b = this.collision.bounds;
        if (this.collision.solidAt(p.x, p.z, 0.05)) {
          this.fx.sparks(p.x, 0.7, p.z, 3);
          this.land(a, p.x - a.dir.x * 0.15, p.z - a.dir.z * 0.15, true);
          landed = true;
        } else if (a.traveled >= st.range || p.x < b.minX + 0.3 || p.x > b.maxX - 0.3 || p.z < b.minZ + 0.3 || p.z > b.maxZ - 0.3) {
          this.land(a, THREE.MathUtils.clamp(p.x, b.minX + 0.4, b.maxX - 0.4), THREE.MathUtils.clamp(p.z, b.minZ + 0.4, b.maxZ - 0.4), false);
          landed = true;
        }
      }
      if (landed) this.flying.splice(i, 1);
    }

    for (let i = this.ground.length - 1; i >= 0; i--) {
      const a = this.ground[i];
      if (a.returning) {
        a.t += dt / 0.45;
        const k = Math.min(1, a.t);
        a.mesh.position.lerpVectors(a.from, new THREE.Vector3(hp.x, 0.8, hp.z), k);
        a.mesh.position.y += Math.sin(k * Math.PI) * 1.2;
        a.mesh.rotation.y += dt * 12;
        a.ring.visible = false;
        if (k >= 1) this.pickUp(i);
        continue;
      }
      const s = 1 + Math.sin(t * 5 + i) * 0.12;
      a.ring.scale.setScalar(s);
      if (a.floating) a.mesh.position.y = -0.1 + Math.sin(t * 2 + i) * 0.03;
      if (Math.hypot(a.mesh.position.x - hp.x, a.mesh.position.z - hp.z) < 0.75 && this.herman.alive) this.pickUp(i);
    }
  }

  private land(a: FlyingArrow, x: number, z: number, stuck: boolean) {
    const m = a.mesh;
    if (stuck) sfx.arrowThunk();
    if (a.magic) {
      this.fx.sparks(x, 0.4, z, 3);
      this.group.remove(m);
      return;
    }
    const floating = this.collision.waterAt(x, z);
    m.position.set(x, stuck ? 0.62 : floating ? -0.1 : 0.12, z);
    m.rotation.set(stuck ? 0 : floating ? 0 : 0.5, m.rotation.y, 0);
    const ring = new THREE.Mesh(glowRingGeo, this.ringMat);
    ring.position.set(x, floating ? -0.06 : 0.04, z);
    this.group.add(ring);
    this.ground.push({ mesh: m, ring, returning: false, t: 0, from: new THREE.Vector3(), floating });
  }

  private pickUp(i: number) {
    const a = this.ground[i];
    this.group.remove(a.mesh, a.ring);
    this.ground.splice(i, 1);
    this.arrows = Math.min(this.quiverMax, this.arrows + 1);
    sfx.arrowPickup();
    this.onArrowsPicked?.(1);
  }
}
