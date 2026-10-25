import * as THREE from 'three';
import { toon, addOutline } from '../core/toon';
import { smooth } from '../core/geo';
import { EnemyBase } from './enemyBase';
import { EnemyContext, pathTarget } from '../game/enemy';
import { Telegraph, Telegraphs } from '../fx/telegraph';
import { sfx } from '../core/sfx';

export type SlimeKind = 'green' | 'blue' | 'mini' | 'kingSlime';

const STATS: Record<SlimeKind, {
  hp: number; scale: number; radius: number; hop: number; hopTime: number; rest: [number, number];
  color: number; emissive: number; contact: number;
}> = {
  green: { hp: 4, scale: 1, radius: 0.32, hop: 1.15, hopTime: 0.45, rest: [0.35, 0.95], color: 0x6fd35a, emissive: 0x0b2a06, contact: 1 },
  blue: { hp: 8, scale: 1.3, radius: 0.42, hop: 1.05, hopTime: 0.55, rest: [0.5, 1.1], color: 0x4fb8e6, emissive: 0x06202e, contact: 1 },
  mini: { hp: 2, scale: 0.62, radius: 0.22, hop: 0.95, hopTime: 0.32, rest: [0.2, 0.55], color: 0x86e3cf, emissive: 0x08261f, contact: 1 },
  kingSlime: { hp: 90, scale: 3.2, radius: 1.0, hop: 1.6, hopTime: 0.7, rest: [0.6, 1.0], color: 0x5fcf4a, emissive: 0x0d3008, contact: 3 },
};

const bodyGeo = (() => {
  const geo = new THREE.SphereGeometry(0.34, 20, 14);
  geo.translate(0, 0.3, 0);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.12) pos.setY(i, 0.12 - (0.12 - y) * 0.35); // flat bottom
  }
  geo.computeVertexNormals();
  return geo;
})();
const bodyOutlineGeo = smooth(bodyGeo);
const eyeGeo = new THREE.SphereGeometry(0.065, 10, 8);
const pupilGeo = new THREE.SphereGeometry(0.035, 8, 6);
const shineGeo = new THREE.SphereGeometry(0.07, 8, 6);
const whiteMat = toon(0xffffff);
const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1b1a24 });
const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

/** A slime. Green ones are basic, blue ones are tougher and split into two minis. The King Slime is a boss. */
export class Slime extends EnemyBase {
  readonly kind: SlimeKind;
  override readonly isBoss: boolean;
  override readonly displayName: string;
  private stats: (typeof STATS)[SlimeKind];
  private hopTimer: number;
  private hopT = -1;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private squash = 0;
  private bigJump: Telegraph | null = null;
  private jumps = 0;

  constructor(kind: SlimeKind, x: number, z: number, rnd: () => number, dropIn = true, hpMul = 1) {
    super(x, z, rnd);
    this.kind = kind;
    this.isBoss = kind === 'kingSlime';
    this.displayName = this.isBoss ? 'Gloopus the King Slime' : '';
    this.stats = STATS[kind];
    this.setHealth(Math.round(this.stats.hp * hpMul));
    this.radius = this.stats.radius;
    this.contactDamage = this.stats.contact;
    this.knockResist = this.isBoss ? 6 : 1;
    this.hopTimer = 0.4 + rnd() * 0.8;
    this.spawnStyle = dropIn ? 'drop' : 'none';
    this.spawnHeight = this.isBoss ? 9 : 6;
    if (!dropIn) this.spawnT = 0.99;
    this.barHeight = 0.95 * this.stats.scale;

    const bodyMat = this.flashable(toon(this.stats.color, { emissive: this.stats.emissive }));
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    addOutline(body, this.isBoss ? 0.012 : 0.025, bodyOutlineGeo);
    const shine = new THREE.Mesh(shineGeo, shineMat);
    shine.position.set(-0.13, 0.5, 0.17);
    shine.scale.set(1, 0.6, 0.6);
    this.pivot.add(body, shine);
    for (const ex of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(eyeGeo, whiteMat);
      eye.position.set(ex, 0.38, 0.27);
      eye.scale.set(1, 1.25, 0.6);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(ex, 0.37, 0.31);
      this.pivot.add(eye, pupil);
    }
    if (this.isBoss) {
      // A little gold crown
      const crown = new THREE.Group();
      const gold = toon(0xf4c542, { emissive: 0x5a3c00 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.06, 12, 1, true), gold);
      crown.add(band);
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), gold);
        const a = (i / 5) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.12, 0.06, Math.sin(a) * 0.12);
        crown.add(spike);
      }
      crown.position.set(0.04, 0.63, -0.02);
      crown.rotation.z = -0.15;
      this.pivot.add(crown);
    }
    this.pivot.scale.setScalar(this.stats.scale);
  }

  override harmful() {
    return this.state === 'alive' && this.root.position.y < 0.35 * Math.sqrt(this.stats.scale);
  }

  protected override onHurt() {
    this.squash = Math.max(this.squash, this.isBoss ? 0.25 : 0.8);
  }

  protected override onLanded(ctx: EnemyContext) {
    super.onLanded(ctx);
    this.squash = 1;
    if (this.isBoss) ctx.shake(0.35);
  }

  override dispose(ctx: EnemyContext) {
    if (this.bigJump) ctx.telegraphs.cancel(this.bigJump);
  }

  protected act(ctx: EnemyContext) {
    const { dt, t } = ctx;
    const p = this.root.position;
    const s = this.stats.scale;

    if (this.hopT < 0) {
      this.hopTimer -= dt;
      const w = Math.sin(t * 5 + this.root.id) * 0.04;
      this.pivot.scale.set(s * (1 + w + this.squash * 0.3), s * (1 - w - this.squash * 0.35), s * (1 + w + this.squash * 0.3));
      this.squash *= Math.exp(-dt * 8);
      if (this.hopTimer <= 0) this.startHop(ctx);
    } else {
      const big = !!this.bigJump;
      this.hopT += dt / (big ? 1.0 : this.stats.hopTime);
      const k = Math.min(1, this.hopT);
      p.x = this.from.x + (this.to.x - this.from.x) * k;
      p.z = this.from.z + (this.to.z - this.from.z) * k;
      p.y = Math.sin(k * Math.PI) * (big ? 3.2 : 0.45 * Math.sqrt(s));
      ctx.collision.resolve(p, this.radius);
      const stretch = Math.sin(k * Math.PI) * 0.25;
      this.pivot.scale.set(s * (1 - stretch * 0.4), s * (1 + stretch), s * (1 - stretch * 0.4));
      if (k >= 1) {
        this.hopT = -1;
        p.y = 0;
        this.squash = 1;
        if (this.isBoss) {
          if (big) sfx.slam(); else sfx.slime();
          ctx.shake(big ? 0.4 : 0.15);
          ctx.fx.puffRing(p.x, p.z, 0xf3e6c8, 12);
        }
        this.bigJump = null;
      }
    }
  }

  private startHop(ctx: EnemyContext) {
    const p = this.root.position;
    const st = this.stats;
    const dist = Math.hypot(ctx.player.x - p.x, ctx.player.z - p.z);
    const chasing = ctx.playerAlive;

    // The King Slime: every third hop is a huge leap onto Herman with a warning circle.
    if (this.isBoss && chasing && this.jumps++ % 3 === 2) {
      const tx = THREE.MathUtils.clamp(ctx.player.x, ctx.collision.bounds.minX + 1.5, ctx.collision.bounds.maxX - 1.5);
      const tz = THREE.MathUtils.clamp(ctx.player.z, ctx.collision.bounds.minZ + 1.5, ctx.collision.bounds.maxZ - 1.5);
      if (ctx.walkable(tx, tz) || !ctx.collision.waterAt(tx, tz)) {
        this.from.set(p.x, 0, p.z);
        this.to.set(tx, 0, tz);
        this.hopT = 0;
        this.root.rotation.y = Math.atan2(tx - p.x, tz - p.z);
        this.bigJump = ctx.telegraphs.add({
          x: tx, z: tz, radius: 2.2, duration: 1.0,
          onFire: (tg) => {
            if (Telegraphs.contains(tg, ctx.player.x, ctx.player.z, 0.2)) ctx.hurtPlayer(this.contactDamage, tg.x, tg.z);
            // Two minis splash out
            ctx.spawn('mini', tg.x - 1, tg.z);
            ctx.spawn('mini', tg.x + 1, tg.z);
          },
        });
        this.hopTimer = 1.4;
        return;
      }
    }

    for (let tries = 0; tries < 6; tries++) {
      let a: number;
      let d = st.hop * (0.8 + this.rnd() * 0.35);
      if (chasing) {
        const tgt = pathTarget(p.x, p.z, ctx.player, ctx.river);
        a = Math.atan2(tgt.x - p.x, tgt.z - p.z) + (this.rnd() - 0.5) * (tries === 0 ? 0.6 : 2.5);
        if (dist < 2.2 + this.radius) d = Math.min(st.hop * 1.25, dist + 0.2);
      } else {
        a = this.rnd() * Math.PI * 2;
      }
      const nx = p.x + Math.sin(a) * d;
      const nz = p.z + Math.cos(a) * d;
      const test = { x: nx, z: nz };
      ctx.collision.resolve(test, this.radius);
      if (Math.hypot(test.x - nx, test.z - nz) < 0.3) {
        this.from.set(p.x, 0, p.z);
        this.to.set(test.x, 0, test.z);
        this.root.rotation.y = a;
        this.hopT = 0;
        break;
      }
    }
    this.hopTimer = st.rest[0] + this.rnd() * (st.rest[1] - st.rest[0]);
    if (!chasing) this.hopTimer += 0.6;
  }
}
