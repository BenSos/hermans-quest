import * as THREE from 'three';
import { toon, addOutline } from '../core/toon';
import { smooth } from '../core/geo';
import { EnemyBase } from './enemyBase';
import { EnemyContext } from '../game/enemy';
import { Telegraph, Telegraphs } from '../fx/telegraph';
import { sfx } from '../core/sfx';

export type SkeletonKind = 'skelWarrior' | 'skelArcher' | 'skelKing';

const boneGeo = new THREE.CylinderGeometry(0.032, 0.028, 1, 6);
const jointGeo = new THREE.SphereGeometry(0.045, 8, 6);
const skullGeo = (() => {
  const g = new THREE.SphereGeometry(0.17, 16, 12);
  g.scale(1, 1.02, 1.08);
  return g;
})();
const skullOutline = smooth(skullGeo);
const ribGeo = new THREE.TorusGeometry(0.17, 0.028, 6, 16);
const socketGeo = new THREE.SphereGeometry(0.045, 8, 6);
const eyeGeo = new THREE.SphereGeometry(0.022, 6, 4);

/** A bone: a thin cylinder from a to b. */
function bone(mat: THREE.Material, len: number, r = 1): THREE.Mesh {
  const m = new THREE.Mesh(boneGeo, mat);
  m.scale.set(r, len, r);
  m.position.y = -len / 2;
  m.castShadow = true;
  return m;
}

/** Skeletons rise from the ground. Warriors swing rusty swords, archers keep their distance and shoot. */
export class Skeleton extends EnemyBase {
  readonly kind: SkeletonKind;
  override readonly isBoss: boolean;
  override readonly displayName: string;
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private head = new THREE.Group();
  private eyeMat: THREE.MeshBasicMaterial;
  private walkPhase = 0;
  private attackCd = 1;
  private windup: Telegraph | null = null;
  private windupT = 0;
  private drawT = -1;
  private ringCd = 3;
  private summoned = 0;
  private secondRing: { t: number; n: number; off: number } | null = null;
  private speed: number;
  private strafe = 1;
  private scale: number;

  constructor(kind: SkeletonKind, x: number, z: number, rnd: () => number, hpMul = 1) {
    super(x, z, rnd);
    this.kind = kind;
    this.isBoss = kind === 'skelKing';
    this.displayName = this.isBoss ? 'Ossian the Bone King' : '';
    this.spawnStyle = 'rise';
    this.scale = this.isBoss ? 2.1 : 1.15;
    const base = kind === 'skelWarrior' ? 8 : kind === 'skelArcher' ? 6 : 140;
    this.setHealth(Math.round(base * hpMul));
    this.radius = this.isBoss ? 0.75 : 0.32;
    this.contactDamage = this.isBoss ? 3 : 1;
    this.knockResist = this.isBoss ? 6 : 1.3;
    this.speed = kind === 'skelWarrior' ? 2.1 : kind === 'skelArcher' ? 1.8 : 1.7;
    this.barHeight = 1.55 * this.scale;
    this.attackCd = 0.6 + rnd();
    this.strafe = rnd() < 0.5 ? -1 : 1;

    const boneMat = this.flashable(toon(this.isBoss ? 0xe2dccb : 0xece3cc, { emissive: 0x111008 }));
    const dark = toon(0x2a2433);
    const eyeColor = this.isBoss ? new THREE.Color(1.8, 0.6, 3.2) : new THREE.Color(3.2, 0.5, 0.3);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });

    const P = this.pivot;
    // Pelvis + spine + ribs
    const pelvis = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.04, 6, 12), boneMat);
    pelvis.rotation.x = Math.PI / 2;
    pelvis.position.y = 0.56;
    pelvis.scale.set(1.2, 0.8, 1);
    P.add(pelvis);
    const spine = bone(boneMat, 0.42, 1.1);
    spine.position.y = 0.56 + 0.21;
    P.add(spine);
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(ribGeo, boneMat);
      rib.rotation.x = Math.PI / 2;
      rib.position.y = 0.78 + i * 0.09;
      const s = [0.92, 1.02, 0.95][i];
      rib.scale.set(s, s * 0.78, 1);
      rib.castShadow = true;
      P.add(rib);
    }
    // Collar bone
    const collar = bone(boneMat, 0.42);
    collar.rotation.z = Math.PI / 2;
    collar.position.set(0, 1.03, 0);
    P.add(collar);

    // Legs
    for (const [leg, x] of [[this.legL, -0.1], [this.legR, 0.1]] as const) {
      leg.position.set(x, 0.56, 0);
      const thigh = bone(boneMat, 0.26);
      const knee = new THREE.Mesh(jointGeo, boneMat);
      knee.position.y = -0.27;
      const shin = bone(boneMat, 0.25);
      shin.position.y = -0.27 - 0.125;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.16), boneMat);
      foot.position.set(0, -0.53, 0.04);
      leg.add(thigh, knee, shin, foot);
      P.add(leg);
    }
    // Arms
    for (const [arm, x] of [[this.armL, -0.22], [this.armR, 0.22]] as const) {
      arm.position.set(x, 1.0, 0);
      const upper = bone(boneMat, 0.24);
      const elbow = new THREE.Mesh(jointGeo, boneMat);
      elbow.position.y = -0.25;
      const fore = bone(boneMat, 0.22);
      fore.position.y = -0.25 - 0.11;
      const hand = new THREE.Mesh(jointGeo, boneMat);
      hand.position.y = -0.48;
      hand.scale.setScalar(1.2);
      arm.add(upper, elbow, fore, hand);
      P.add(arm);
    }
    this.armL.rotation.z = -0.15;
    this.armR.rotation.z = 0.15;

    // Skull with glowing eyes
    this.head.position.y = 1.22;
    const skull = new THREE.Mesh(skullGeo, boneMat);
    skull.castShadow = true;
    addOutline(skull, 0.02, skullOutline);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.16), boneMat);
    jaw.position.set(0, -0.15, 0.04);
    this.head.add(skull, jaw);
    for (const ex of [-0.065, 0.065]) {
      const socket = new THREE.Mesh(socketGeo, dark);
      socket.position.set(ex, 0.01, 0.14);
      socket.scale.set(1, 1.1, 0.6);
      const eye = new THREE.Mesh(eyeGeo, this.eyeMat);
      eye.position.set(ex, 0.01, 0.17);
      this.head.add(socket, eye);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.04, 3), dark);
    nose.position.set(0, -0.06, 0.18);
    nose.rotation.x = Math.PI;
    this.head.add(nose);
    P.add(this.head);

    if (kind === 'skelArcher') {
      // A rickety bone bow in the left hand
      const bowGeo = new THREE.TorusGeometry(0.26, 0.022, 5, 14, Math.PI * 0.85);
      bowGeo.rotateZ(-Math.PI / 2 - Math.PI * 0.425);
      bowGeo.rotateY(Math.PI / 2);
      bowGeo.translate(0, 0.26, 0);
      const bow = new THREE.Mesh(bowGeo, toon(0x6e4a2f));
      bow.position.y = -0.48;
      bow.castShadow = true;
      this.armL.add(bow);
      // Tattered hood
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(0x4a5a3a));
      hood.position.y = 0.02;
      hood.rotation.x = -0.25;
      this.head.add(hood);
    } else {
      // Rusty sword
      const swordGeo = new THREE.BoxGeometry(0.05, this.isBoss ? 0.75 : 0.55, 0.015);
      swordGeo.translate(0, this.isBoss ? 0.42 : 0.32, 0);
      const sword = new THREE.Mesh(swordGeo, toon(this.isBoss ? 0x9aa3b5 : 0xa0785a, { emissive: this.isBoss ? 0x200a30 : 0x000000 }));
      sword.castShadow = true;
      addOutline(sword, 0.012, smooth(swordGeo));
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), toon(0x5a4a3a));
      guard.position.y = 0.04;
      const grip = new THREE.Group();
      grip.add(sword, guard);
      grip.position.y = -0.48;
      grip.rotation.x = 1.2;
      this.armR.add(grip);
    }
    if (this.isBoss) {
      // Crown and a royal purple cape
      const gold = toon(0xf4c542, { emissive: 0x4a3000 });
      const crown = new THREE.Group();
      crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.07, 12, 1, true), gold));
      for (let i = 0; i < 6; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), gold);
        const a = (i / 6) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15);
        crown.add(spike);
      }
      crown.position.y = 0.16;
      this.head.add(crown);
      const capeGeo = new THREE.PlaneGeometry(0.5, 0.75, 3, 4);
      capeGeo.translate(0, -0.37, 0);
      const cape = new THREE.Mesh(capeGeo, toon(0x5b2a86, { side: THREE.DoubleSide }));
      cape.position.set(0, 1.05, -0.14);
      cape.rotation.x = 0.15;
      cape.castShadow = true;
      P.add(cape);
    }
    P.scale.setScalar(this.scale);
  }

  override dispose(ctx: EnemyContext) {
    if (this.windup) ctx.telegraphs.cancel(this.windup);
  }

  protected act(ctx: EnemyContext) {
    const { dt, t } = ctx;
    this.attackCd -= dt;
    let moving = false;
    const dist = Math.hypot(ctx.player.x - this.root.position.x, ctx.player.z - this.root.position.z);

    if (this.windup) {
      // Winding up a sword swing: stand still, sword raised
      this.windupT += dt;
      this.armR.rotation.x = -2.4 * Math.min(1, this.windupT / 0.25);
      this.turnTo(this.angleToPlayer(ctx), dt, this.isBoss ? 2.5 : 4);
    } else if (this.drawT >= 0) {
      // Archer drawing the bow
      this.drawT += dt;
      this.turnTo(this.angleToPlayer(ctx), dt, 10);
      this.armL.rotation.x = -1.5;
      this.armR.rotation.x = -1.3;
      this.armR.rotation.z = -0.4;
      this.eyeMat.color.setRGB(3.2 + Math.sin(t * 30) * 1.5, 0.8, 0.3);
      if (this.drawT >= 0.6) {
        sfx.shoot();
        ctx.bullets.fire('arrow', this.root.position.x + Math.sin(this.facing) * 0.4, this.root.position.z + Math.cos(this.facing) * 0.4, this.facing, 7.5, 1, 3);
        this.drawT = -1;
        this.attackCd = 1.8 + this.rnd() * 1.2;
        this.eyeMat.color.setRGB(3.2, 0.5, 0.3);
      }
    } else if (ctx.playerAlive) {
      if (this.kind === 'skelArcher') {
        // Keep a safe distance and circle around
        const p = this.root.position;
        if (dist > 7) {
          this.walkToward(ctx, this.speed);
        } else {
          const away = this.angleToPlayer(ctx) + (dist < 4 ? Math.PI : Math.PI / 2 * this.strafe);
          this.turnTo(away, dt, 6);
          p.x += Math.sin(this.facing) * this.speed * 0.6 * dt;
          p.z += Math.cos(this.facing) * this.speed * 0.6 * dt;
          const before = { x: p.x, z: p.z };
          ctx.collision.resolve(p, this.radius);
          if (Math.hypot(before.x - p.x, before.z - p.z) > 0.001) this.strafe *= -1;
        }
        moving = true;
        if (this.attackCd <= 0 && dist < 10) {
          this.drawT = 0;
          moving = false;
        }
      } else {
        const reach = this.isBoss ? 2.6 : 1.25;
        this.walkToward(ctx, this.speed, reach * 0.8);
        moving = dist > reach * 0.8;
        if (dist < reach + 0.3 && this.attackCd <= 0) this.startSwing(ctx);
        if (this.isBoss) this.bossSpecials(ctx);
      }
    }

    // Walk cycle
    if (moving) this.walkPhase += dt * this.speed * 4.5;
    const a = moving ? 1 : 0;
    const s = Math.sin(this.walkPhase);
    this.legL.rotation.x = s * 0.7 * a;
    this.legR.rotation.x = -s * 0.7 * a;
    if (!this.windup && this.drawT < 0) {
      this.armL.rotation.x = -s * 0.5 * a;
      this.armR.rotation.x = s * 0.5 * a - 0.3;
      this.armR.rotation.z = 0.15;
    }
    this.pivot.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.04 * a;
    this.head.rotation.z = Math.sin(t * 3 + this.root.id) * 0.06;
  }

  private startSwing(ctx: EnemyContext) {
    const range = this.isBoss ? 3.0 : 1.55;
    const dur = this.isBoss ? 0.75 : 0.5;
    this.windupT = 0;
    this.windup = ctx.telegraphs.add({
      x: this.root.position.x, z: this.root.position.z, radius: range, duration: dur,
      angle: this.facing, halfAngle: this.isBoss ? 1.15 : 0.95,
      follow: () => (this.state === 'alive' ? { x: this.root.position.x, z: this.root.position.z, angle: this.facing } : null),
      onFire: (tg) => {
        this.windup = null;
        this.armR.rotation.x = 0.6;
        this.attackCd = this.isBoss ? 1.4 : 1.1;
        if (this.state !== 'alive') return;
        if (Telegraphs.contains(tg, ctx.player.x, ctx.player.z, 0.25)) ctx.hurtPlayer(this.contactDamage, tg.x, tg.z);
        ctx.fx.slash(tg.x, tg.z, tg.angle);
        sfx.swing();
      },
    });
  }

  /** The Bone King throws rings of bone shards and calls up his guards when hurt. */
  private bossSpecials(ctx: EnemyContext) {
    this.ringCd -= ctx.dt;
    if (this.secondRing) {
      this.secondRing.t -= ctx.dt;
      if (this.secondRing.t <= 0) {
        const { n, off } = this.secondRing;
        for (let i = 0; i < n; i++) ctx.bullets.fire('shard', this.root.position.x, this.root.position.z, off + ((i + 0.5) / n) * Math.PI * 2, 4.2, 3, 4);
        this.secondRing = null;
      }
    }
    const enraged = this.hp < this.maxHp / 2;
    if (this.ringCd <= 0 && !this.windup) {
      const n = enraged ? 16 : 12;
      const off = this.rnd() * Math.PI;
      for (let i = 0; i < n; i++) {
        ctx.bullets.fire('shard', this.root.position.x, this.root.position.z, off + (i / n) * Math.PI * 2, 5, 3, 4);
      }
      if (enraged) {
        // a second, offset ring a moment later
        this.secondRing = { t: 0.45, n, off };
      }
      this.ringCd = enraged ? 3.4 : 4.5;
      sfx.shoot();
      sfx.rattle();
      ctx.shake(0.1);
    }
    const thresholds = [0.5, 0.25];
    if (this.summoned < thresholds.length && this.hp < this.maxHp * thresholds[this.summoned]) {
      this.summoned++;
      const p = this.root.position;
      ctx.spawn('skelWarrior', p.x + 2, p.z);
      ctx.spawn('skelWarrior', p.x - 2, p.z);
    }
  }
}
