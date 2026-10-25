import * as THREE from 'three';
import { toon, addOutline } from '../core/toon';
import { smooth, blob } from '../core/geo';
import { EnemyBase } from './enemyBase';
import { EnemyContext } from '../game/enemy';
import { Telegraph, Telegraphs } from '../fx/telegraph';
import { sfx } from '../core/sfx';

export type OgreKind = 'ogre' | 'ogreKing';

const boulderGeo = blob(0.45, 31, 0.25, 1);
const boulderOutline = smooth(boulderGeo);

/**
 * Ogres: big, slow and tough. They slam their club down on a red circle.
 * Grumbok the Ogre King does the Big Stomp: a red circle spreads out from him, and when it reaches the edge, everything inside gets hit.
 */
export class Ogre extends EnemyBase {
  readonly kind: OgreKind;
  override readonly isBoss: boolean;
  override readonly displayName: string;
  private body = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private walkPhase = 0;
  private attackCd = 1.5;
  private active: Telegraph[] = [];
  private busy = 0;
  private busyPose: 'slam' | 'stomp' | 'throw' | null = null;
  private nextSpecial = 0;
  private scale: number;
  private speed: number;
  private boulders: { mesh: THREE.Mesh; tg: Telegraph; y0: number }[] = [];

  constructor(kind: OgreKind, x: number, z: number, rnd: () => number, hpMul = 1) {
    super(x, z, rnd);
    this.kind = kind;
    this.isBoss = kind === 'ogreKing';
    this.displayName = this.isBoss ? 'Grumbok the Ogre King' : '';
    this.scale = this.isBoss ? 1.9 : 1;
    this.setHealth(Math.round((this.isBoss ? 220 : 30) * hpMul));
    this.radius = this.isBoss ? 1.15 : 0.6;
    this.contactDamage = this.isBoss ? 3 : 1;
    this.knockResist = this.isBoss ? 10 : 4;
    this.speed = this.isBoss ? 1.25 : 1.35;
    this.spawnStyle = 'drop';
    this.spawnHeight = 7;
    this.barHeight = 2.3 * this.scale;
    this.attackCd = 1 + rnd();

    const skin = this.flashable(toon(this.isBoss ? 0x86a24a : 0x9bb35b, { emissive: 0x101a05 }));
    const belly = this.flashable(toon(0xc2cf86, { emissive: 0x101a05 }));
    const cloth = toon(0x7a4b2a);
    const tusk = toon(0xfff6e0);
    const dark = toon(0x23202e);

    const B = this.body;
    const torsoGeo = new THREE.SphereGeometry(0.55, 18, 14);
    torsoGeo.scale(1, 1.05, 0.85);
    const torso = new THREE.Mesh(torsoGeo, skin);
    torso.position.y = 1.15;
    torso.castShadow = true;
    addOutline(torso, 0.025, smooth(torsoGeo));
    const bellyGeo = new THREE.SphereGeometry(0.42, 14, 10);
    bellyGeo.scale(1, 0.95, 0.6);
    const bellyM = new THREE.Mesh(bellyGeo, belly);
    bellyM.position.set(0, 1.02, 0.2);
    const clothGeo = new THREE.CylinderGeometry(0.5, 0.56, 0.32, 12);
    const loin = new THREE.Mesh(clothGeo, cloth);
    loin.position.y = 0.72;
    loin.castShadow = true;
    addOutline(loin, 0.02, smooth(clothGeo));
    B.add(torso, bellyM, loin);

    // Head with tusks
    const head = new THREE.Group();
    head.position.set(0, 1.78, 0.12);
    const headGeo = new THREE.SphereGeometry(0.26, 14, 10);
    headGeo.scale(1, 0.9, 1);
    const h = new THREE.Mesh(headGeo, skin);
    h.castShadow = true;
    addOutline(h, 0.02, smooth(headGeo));
    head.add(h);
    for (const sx of [-1, 1]) {
      const tk = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 6), tusk);
      tk.position.set(sx * 0.1, -0.1, 0.2);
      tk.rotation.x = -0.3;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), dark);
      eye.position.set(sx * 0.09, 0.04, 0.23);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(sx * 0.27, 0.02, 0);
      head.add(tk, eye, ear);
    }
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.08), toon(0x5c6b30));
    brow.position.set(0, 0.1, 0.21);
    brow.rotation.x = 0.2;
    head.add(brow);
    if (this.isBoss) {
      const iron = toon(0x8a8f99);
      const crown = new THREE.Group();
      crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 10, 1, true), iron));
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), iron);
        const a = (i / 5) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2);
        sp.rotation.z = i === 2 ? 0.5 : 0; // dented
        crown.add(sp);
      }
      crown.position.y = 0.22;
      crown.rotation.z = 0.12;
      head.add(crown);
    }
    B.add(head);

    // Legs
    for (const [leg, x] of [[this.legL, -0.25], [this.legR, 0.25]] as const) {
      leg.position.set(x, 0.62, 0);
      const legGeo = new THREE.CapsuleGeometry(0.16, 0.3, 4, 8);
      const l = new THREE.Mesh(legGeo, skin);
      l.position.y = -0.32;
      l.castShadow = true;
      addOutline(l, 0.02, smooth(legGeo));
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), skin);
      foot.scale.set(1, 0.55, 1.3);
      foot.position.set(0, -0.58, 0.06);
      leg.add(l, foot);
      B.add(leg);
    }
    // Arms
    for (const [arm, x] of [[this.armL, -0.6], [this.armR, 0.6]] as const) {
      arm.position.set(x, 1.42, 0);
      const armGeo = new THREE.CapsuleGeometry(0.14, 0.55, 4, 8);
      const a = new THREE.Mesh(armGeo, skin);
      a.position.y = -0.38;
      a.castShadow = true;
      addOutline(a, 0.02, smooth(armGeo));
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), skin);
      fist.position.y = -0.78;
      arm.add(a, fist);
      B.add(arm);
    }
    this.armL.rotation.z = -0.25;
    this.armR.rotation.z = 0.25;
    // Big spiked club
    const clubGeo = new THREE.CylinderGeometry(0.17, 0.07, 1.1, 8);
    clubGeo.translate(0, 0.5, 0);
    const club = new THREE.Mesh(clubGeo, toon(0x7a5230));
    club.castShadow = true;
    addOutline(club, 0.02, smooth(clubGeo));
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), toon(0xc9ccd4));
      const a = (i / 6) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.16, 0.85 + (i % 2) * 0.12, Math.sin(a) * 0.16);
      spike.rotation.z = -Math.cos(a) * Math.PI / 2;
      spike.rotation.x = Math.sin(a) * Math.PI / 2;
      club.add(spike);
    }
    club.position.y = -0.8;
    club.rotation.x = 1.0;
    this.armR.add(club);

    this.pivot.add(B);
    this.pivot.scale.setScalar(this.scale);
  }

  protected override onLanded(ctx: EnemyContext) {
    ctx.fx.puffRing(this.root.position.x, this.root.position.z, 0xe8d6ae, 12);
    ctx.shake(this.isBoss ? 0.5 : 0.2);
    sfx.grunt();
    if (this.isBoss) sfx.slam();
  }

  override dispose(ctx: EnemyContext) {
    for (const tg of this.active) ctx.telegraphs.cancel(tg);
    for (const b of this.boulders) b.mesh.removeFromParent();
    this.boulders = [];
  }

  protected act(ctx: EnemyContext) {
    const { dt } = ctx;
    this.attackCd -= dt;
    this.active = this.active.filter((tg) => !tg.fired);
    this.updateBoulders(dt);
    let moving = false;
    const dist = Math.hypot(ctx.player.x - this.root.position.x, ctx.player.z - this.root.position.z);

    if (this.busy > 0) {
      this.busy -= dt;
      this.pose(this.busyPose, dt);
      if (this.busy <= 0) this.busyPose = null;
    } else if (ctx.playerAlive) {
      const reach = this.isBoss ? 3.0 : 2.0;
      this.walkToward(ctx, this.speed, reach * 0.7);
      moving = dist > reach * 0.7;
      if (this.attackCd <= 0) {
        if (this.isBoss) this.bossAttack(ctx, dist);
        else if (dist < reach + 0.5) this.slam(ctx);
      }
    }

    if (moving) this.walkPhase += dt * this.speed * 3.2;
    const a = moving ? 1 : 0;
    const s = Math.sin(this.walkPhase);
    this.legL.rotation.x = s * 0.5 * a;
    this.legR.rotation.x = -s * 0.5 * a;
    if (!this.busyPose) {
      this.armL.rotation.x = -s * 0.35 * a;
      this.armR.rotation.x = s * 0.25 * a - 0.2;
    }
    this.body.rotation.z = s * 0.06 * a;
    this.body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.05 * a;
  }

  private pose(p: Ogre['busyPose'], dt: number) {
    const k = 1 - Math.exp(-dt * 10);
    if (p === 'slam') {
      this.armR.rotation.x += (-2.8 - this.armR.rotation.x) * k;
      this.armL.rotation.x += (-2.6 - this.armL.rotation.x) * k;
    } else if (p === 'stomp') {
      this.legR.rotation.x += (-1.2 - this.legR.rotation.x) * k;
      this.armL.rotation.z += (-1.2 - this.armL.rotation.z) * k;
      this.armR.rotation.z += (1.2 - this.armR.rotation.z) * k;
    } else if (p === 'throw') {
      this.armL.rotation.x += (-3.0 - this.armL.rotation.x) * k;
    }
  }

  private smash(ctx: EnemyContext, x: number, z: number, n = 10) {
    ctx.fx.puffRing(x, z, 0xe8d6ae, n);
    ctx.fx.sparks(x, 0.3, z, 6);
  }

  /** Regular ogre: club comes down on a red circle in front of him. */
  private slam(ctx: EnemyContext) {
    const ang = this.angleToPlayer(ctx);
    this.facing = ang;
    this.root.rotation.y = ang;
    const x = this.root.position.x + Math.sin(ang) * 1.3;
    const z = this.root.position.z + Math.cos(ang) * 1.3;
    this.busy = 0.95;
    this.busyPose = 'slam';
    this.attackCd = 1.8;
    this.active.push(ctx.telegraphs.add({
      x, z, radius: 1.35, duration: 0.95,
      onFire: (tg) => {
        if (this.state !== 'alive') return;
        this.armR.rotation.x = 0.9;
        this.armL.rotation.x = 0.6;
        if (Telegraphs.contains(tg, ctx.player.x, ctx.player.z, 0.2)) ctx.hurtPlayer(this.contactDamage, tg.x, tg.z);
        this.smash(ctx, tg.x, tg.z);
        sfx.slam();
        ctx.shake(0.2);
      },
    }));
  }

  /** Grumbok picks between a club swipe (close), the Big Stomp, and throwing boulders. */
  private bossAttack(ctx: EnemyContext, dist: number) {
    const enraged = this.hp < this.maxHp / 2;
    const p = this.root.position;
    if (dist < 3.2 && this.nextSpecial % 3 !== 0) {
      // Club swipe in a wide cone
      const ang = this.angleToPlayer(ctx);
      this.facing = ang;
      this.root.rotation.y = ang;
      this.busy = 0.7;
      this.busyPose = 'slam';
      this.attackCd = 1.3;
      this.nextSpecial++;
      this.active.push(ctx.telegraphs.add({
        x: p.x, z: p.z, radius: 3.4, duration: 0.7, angle: ang, halfAngle: 1.0,
        onFire: (tg) => {
          if (this.state !== 'alive') return;
          this.armR.rotation.x = 0.9;
          if (Telegraphs.contains(tg, ctx.player.x, ctx.player.z, 0.2)) ctx.hurtPlayer(3, tg.x, tg.z);
          ctx.fx.slash(tg.x, tg.z, tg.angle);
          ctx.shake(0.2);
        },
      }));
      return;
    }
    this.nextSpecial++;
    if (this.nextSpecial % 2 === 0) {
      // THE BIG STOMP: red spreads out from Grumbok; when it hits the edge, everything inside is hit.
      this.busy = 1.6;
      this.busyPose = 'stomp';
      this.attackCd = enraged ? 2.2 : 2.8;
      const ring = (radius: number, duration: number) => this.active.push(ctx.telegraphs.add({
        x: p.x, z: p.z, radius, duration,
        onFire: (tg) => {
          if (this.state !== 'alive') return;
          this.legR.rotation.x = 0;
          if (Telegraphs.contains(tg, ctx.player.x, ctx.player.z, 0)) ctx.hurtPlayer(3, tg.x, tg.z);
          ctx.shake(0.55);
          sfx.stomp();
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            ctx.fx.puffRing(tg.x + Math.sin(a) * tg.radius, tg.z + Math.cos(a) * tg.radius, 0xe8d6ae, 3);
          }
        },
      }));
      ring(5, 1.5);
      if (enraged) ring(7, 2.3); // phase 2: a second, bigger ring right after
    } else {
      // Boulder toss: three red X spots around Herman
      this.busy = 0.9;
      this.busyPose = 'throw';
      this.attackCd = 2.4;
      const n = enraged ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const a = this.rnd() * Math.PI * 2;
        const d = i === 0 ? 0 : 1.3 + this.rnd() * 1.8;
        const b = ctx.collision.bounds;
        const x = THREE.MathUtils.clamp(ctx.player.x + Math.sin(a) * d, b.minX + 0.6, b.maxX - 0.6);
        const z = THREE.MathUtils.clamp(ctx.player.z + Math.cos(a) * d, b.minZ + 0.6, b.maxZ - 0.6);
        const tg = ctx.telegraphs.add({
          x, z, radius: 0.95, duration: 1.25,
          onFire: (t2) => {
            if (Telegraphs.contains(t2, ctx.player.x, ctx.player.z, 0.15)) ctx.hurtPlayer(3, t2.x, t2.z);
            this.smash(ctx, t2.x, t2.z, 8);
            sfx.slam();
            ctx.shake(0.15);
          },
        });
        this.active.push(tg);
        const mesh = new THREE.Mesh(boulderGeo, toon(0x8d8a86));
        addOutline(mesh, 0.025, boulderOutline);
        mesh.castShadow = true;
        mesh.position.set(x, 9, z);
        this.root.parent?.add(mesh);
        this.boulders.push({ mesh, tg, y0: 9 });
      }
    }
  }

  private updateBoulders(dt: number) {
    for (let i = this.boulders.length - 1; i >= 0; i--) {
      const b = this.boulders[i];
      const k = Math.min(1, b.tg.t / b.tg.duration);
      b.mesh.position.y = 0.4 + (b.y0 - 0.4) * (1 - k * k);
      b.mesh.rotation.x += dt * 4;
      if (b.tg.fired) {
        b.mesh.removeFromParent();
        this.boulders.splice(i, 1);
      }
    }
  }
}
