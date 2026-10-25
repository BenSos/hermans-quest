import * as THREE from 'three';
import { Enemy, EnemyContext, EnemyKind, StatusKind, pathTarget } from '../game/enemy';
import { sfx } from '../core/sfx';

const barGeo = new THREE.PlaneGeometry(1, 1);
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x23202e, depthTest: false, transparent: true });
const barFillMat = new THREE.MeshBasicMaterial({ color: 0xff4a4a, depthTest: false, transparent: true });

const STATUS_TINT: Record<StatusKind, THREE.Color> = {
  poison: new THREE.Color(0.25, 0.9, 0.15),
  fire: new THREE.Color(1.4, 0.45, 0.05),
  acid: new THREE.Color(0.8, 1.0, 0.05),
};

/**
 * Shared monster behavior: health, getting hit (flash + knockback), the little health bar,
 * poison / fire / acid, spawning in, and walking toward Herman around the river.
 */
export abstract class EnemyBase implements Enemy {
  readonly root = new THREE.Group();
  protected pivot = new THREE.Group();
  abstract readonly kind: EnemyKind;
  readonly isBoss: boolean = false;
  readonly displayName: string = '';
  radius = 0.4;
  maxHp = 10;
  hp = 10;
  contactDamage = 1;
  state: Enemy['state'] = 'spawning';

  protected knock = new THREE.Vector3();
  protected knockResist = 1;
  protected flash = 0;
  protected flashMats: { mat: THREE.MeshToonMaterial; base: THREE.Color }[] = [];
  protected spawnT = 0;
  protected spawnStyle: 'drop' | 'rise' | 'none' = 'drop';
  protected spawnHeight = 6;
  protected rnd: () => number;
  private bar = new THREE.Group();
  private barFill: THREE.Mesh;
  private barTimer = 0;
  protected barHeight = 1;
  private status = {
    poison: { t: 0, stacks: 0, power: 0 },
    fire: { t: 0, power: 0 },
    acid: { t: 0, power: 0 },
  };
  private dotTimer = 0;
  private dotAccum: Record<StatusKind, number> = { poison: 0, fire: 0, acid: 0 };

  constructor(x: number, z: number, rnd: () => number = Math.random) {
    this.rnd = rnd;
    this.root.position.set(x, 0, z);
    this.root.add(this.pivot);
    const bg = new THREE.Mesh(barGeo, barBgMat);
    bg.scale.set(0.62, 0.11, 1);
    this.barFill = new THREE.Mesh(barGeo, barFillMat);
    this.barFill.scale.set(0.56, 0.06, 1);
    this.barFill.position.z = 0.001;
    bg.renderOrder = 10;
    this.barFill.renderOrder = 11;
    this.bar.add(bg, this.barFill);
    this.bar.visible = false;
    this.root.add(this.bar);
  }

  /** Register a material so it flashes white when hit and tints with status effects. */
  protected flashable<T extends THREE.MeshToonMaterial>(mat: T): T {
    this.flashMats.push({ mat, base: mat.emissive.clone() });
    return mat;
  }

  setHealth(hp: number) {
    this.hp = this.maxHp = hp;
  }

  targetable() {
    return this.state === 'alive';
  }

  harmful() {
    return this.state === 'alive';
  }

  damageTakenMul() {
    return this.status.acid.t > 0 ? 1 + 0.1 + this.status.acid.power * 0.07 : 1;
  }

  hit(damage: number, dirX: number, dirZ: number, knock: number): number {
    if (this.state !== 'alive') return 0;
    const dmg = damage * this.damageTakenMul();
    this.hp -= dmg;
    if (damage > 0) {
      this.flash = 0.12;
      this.barTimer = 3;
      this.onHurt();
    }
    this.knock.x += (dirX * knock) / this.knockResist;
    this.knock.z += (dirZ * knock) / this.knockResist;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
    }
    return dmg;
  }

  applyStatus(kind: StatusKind, power: number) {
    if (this.state !== 'alive' || power <= 0) return;
    if (kind === 'poison') {
      const s = this.status.poison;
      s.t = 5;
      s.stacks = Math.min(5, s.stacks + 1);
      s.power = Math.max(s.power, power);
    } else if (kind === 'fire') {
      this.status.fire.t = 2;
      this.status.fire.power = Math.max(this.status.fire.power, power);
    } else {
      this.status.acid.t = 4;
      this.status.acid.power = Math.max(this.status.acid.power, power);
    }
  }

  burning() {
    return this.status.fire.t > 0;
  }

  /** Optional reaction (squash, flinch) when hurt. */
  protected onHurt() {}

  /** Each kind of monster does its own thing here once it is alive. */
  protected abstract act(ctx: EnemyContext): void;

  dispose(_ctx: EnemyContext) {}

  update(ctx: EnemyContext) {
    const { dt } = ctx;
    const p = this.root.position;

    if (this.state === 'spawning') {
      this.spawnT = Math.min(1, this.spawnT + dt / (this.spawnStyle === 'rise' ? 0.8 : 0.55));
      const k = this.spawnT;
      if (this.spawnStyle === 'drop') p.y = this.spawnHeight * (1 - k * k);
      else if (this.spawnStyle === 'rise') {
        p.y = -1.6 * (1 - k);
        if (Math.random() < 0.3) ctx.fx.puffRing(p.x + (Math.random() - 0.5) * 0.6, p.z + (Math.random() - 0.5) * 0.6, 0x9c7a4f, 2);
      }
      if (k >= 1) {
        p.y = 0;
        if (this.spawnStyle === 'rise') sfx.rattle();
        this.state = 'alive';
        this.onLanded(ctx);
      }
      return;
    }
    if (this.state === 'dead') return;

    // Knockback slide
    if (this.knock.lengthSq() > 0.0001) {
      p.x += this.knock.x * dt;
      p.z += this.knock.z * dt;
      this.knock.multiplyScalar(Math.exp(-dt * 9));
      ctx.collision.resolve(p, this.radius);
    }

    // Poison, fire, acid
    this.tickStatus(ctx);
    if (this.state !== 'alive') return;

    this.act(ctx);

    // Flash white when hit, otherwise tint with the strongest status
    this.flash -= dt;
    let tint: THREE.Color | null = null;
    const pulse = 0.55 + Math.sin(ctx.t * 10) * 0.25;
    if (this.status.fire.t > 0) tint = STATUS_TINT.fire;
    else if (this.status.acid.t > 0) tint = STATUS_TINT.acid;
    else if (this.status.poison.t > 0) tint = STATUS_TINT.poison;
    for (const f of this.flashMats) {
      if (this.flash > 0) f.mat.emissive.setRGB(1, 1, 1);
      else if (tint) f.mat.emissive.copy(f.base).lerp(tint, pulse);
      else f.mat.emissive.copy(f.base);
    }

    if (!this.isBoss) {
      this.barTimer -= dt;
      this.bar.visible = this.barTimer > 0 && this.hp < this.maxHp;
      if (this.bar.visible) {
        const frac = this.hp / this.maxHp;
        this.barFill.scale.x = 0.56 * frac;
        this.barFill.position.x = -0.28 * (1 - frac);
        this.bar.position.set(0, this.barHeight, 0);
        this.bar.quaternion.copy(this.root.quaternion).invert().multiply(ctx.camera.quaternion);
      }
    }
  }

  protected onLanded(ctx: EnemyContext) {
    if (this.spawnStyle === 'drop' && this.spawnHeight > 1) ctx.fx.puffRing(this.root.position.x, this.root.position.z);
  }

  private tickStatus(ctx: EnemyContext) {
    const { dt } = ctx;
    const s = this.status;
    let dps: Record<StatusKind, number> = { poison: 0, fire: 0, acid: 0 };
    if (s.poison.t > 0) {
      s.poison.t -= dt;
      dps.poison = 0.35 * s.poison.stacks * s.poison.power;
      if (s.poison.t <= 0) s.poison.stacks = 0;
    }
    if (s.fire.t > 0) {
      s.fire.t -= dt;
      dps.fire = 1.6 * s.fire.power;
      if (Math.random() < dt * 14) {
        const p = this.root.position;
        ctx.fx.ember(p.x + (Math.random() - 0.5) * this.radius * 1.4, 0.3 + Math.random() * 0.5, p.z + (Math.random() - 0.5) * this.radius * 1.4);
      }
    }
    if (s.acid.t > 0) {
      s.acid.t -= dt;
      dps.acid = 0.4 * s.acid.power;
    }
    const total = dps.poison + dps.fire + dps.acid;
    if (total <= 0) return;
    this.hp -= total * dt;
    for (const k of ['poison', 'fire', 'acid'] as StatusKind[]) this.dotAccum[k] += dps[k] * dt;
    this.dotTimer -= dt;
    if (this.dotTimer <= 0) {
      this.dotTimer = 0.6;
      for (const k of ['poison', 'fire', 'acid'] as StatusKind[]) {
        if (this.dotAccum[k] >= 0.5) {
          ctx.onDot(this, this.dotAccum[k], k);
          this.dotAccum[k] = 0;
        }
      }
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
    }
  }

  /* ---------- Movement helpers ---------- */

  protected facing = 0;

  /** Walk toward Herman (around the river), turning smoothly. Returns distance to him. */
  protected walkToward(ctx: EnemyContext, speed: number, stopAt = 0): number {
    const p = this.root.position;
    const dist = Math.hypot(ctx.player.x - p.x, ctx.player.z - p.z);
    if (dist > stopAt) {
      const tgt = pathTarget(p.x, p.z, ctx.player, ctx.river);
      const ang = Math.atan2(tgt.x - p.x, tgt.z - p.z);
      this.turnTo(ang, ctx.dt, 8);
      p.x += Math.sin(this.facing) * speed * ctx.dt;
      p.z += Math.cos(this.facing) * speed * ctx.dt;
      ctx.collision.resolve(p, this.radius);
    }
    return dist;
  }

  protected turnTo(angle: number, dt: number, rate: number) {
    let d = angle - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * (1 - Math.exp(-dt * rate));
    this.root.rotation.y = this.facing;
  }

  protected angleToPlayer(ctx: EnemyContext) {
    return Math.atan2(ctx.player.x - this.root.position.x, ctx.player.z - this.root.position.z);
  }
}
