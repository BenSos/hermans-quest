import * as THREE from 'three';
import { toon, addOutline } from '../core/toon';
import { smooth } from '../core/geo';
import type { EnemyKind } from './enemy';

/**
 * Practice waves in Greenmeadow:
 *   Waves 1-9 slimes,    wave 10 Gloopus the King Slime
 *   Waves 11-19 skeletons, wave 20 Ossian the Bone King
 *   Waves 21-29 ogres,   wave 30 Grumbok the Ogre King
 *   After that: everything mixed together, a little tougher each round, with a boss every 10th wave.
 * Beating a boss drops a key. The key opens the chest, and the chest offers a power-up.
 */

export interface WaveSpec { list: EnemyKind[]; boss: EnemyKind | null; hpMul: number; theme: string }

export const ACTS = [
  { theme: 'Slimes', boss: 'kingSlime' as EnemyKind, bossName: 'Gloopus the King Slime' },
  { theme: 'Skeletons', boss: 'skelKing' as EnemyKind, bossName: 'Ossian the Bone King' },
  { theme: 'Ogres', boss: 'ogreKing' as EnemyKind, bossName: 'Grumbok the Ogre King' },
];

const rep = (kind: EnemyKind, n: number) => Array.from({ length: Math.max(0, n) }, () => kind);

export function waveSpec(n: number): WaveSpec {
  const act = Math.floor((n - 1) / 10);
  const k = ((n - 1) % 10) + 1;
  const hpMul = (1 + Math.max(0, act - 2) * 0.3) * (1 + (k - 1) * 0.03);
  const themeAct = act < 3 ? act : (act - 3) % 3;
  const theme = act < 3 ? ACTS[act].theme : 'Everything';
  if (k === 10) {
    const boss = ACTS[themeAct].boss;
    const escort: EnemyKind[] = boss === 'kingSlime' ? rep('green', 2) : boss === 'ogreKing' ? rep('skelArcher', act >= 3 ? 2 : 0) : [];
    return { list: escort, boss, hpMul, theme };
  }
  let list: EnemyKind[] = [];
  if (act === 0) {
    list = [...rep('green', 2 + k), ...rep('blue', Math.floor((k - 1) / 2))];
  } else if (act === 1) {
    list = [...rep('skelWarrior', 2 + Math.floor(k / 2)), ...rep('skelArcher', Math.floor((k + 1) / 3))];
    if (k <= 3) list.push(...rep('green', 2));
  } else if (act === 2) {
    list = [...rep('ogre', 1 + Math.floor((k - 1) / 3)), ...rep('skelWarrior', Math.floor(k / 3)), ...rep('green', 2), ...rep('blue', k >= 6 ? 1 : 0)];
  } else {
    const all: EnemyKind[] = ['green', 'blue', 'skelWarrior', 'skelArcher', 'ogre'];
    const count = 6 + k;
    for (let i = 0; i < count; i++) {
      const kind = all[Math.floor(Math.random() * all.length)];
      list.push(kind === 'ogre' && list.filter((x) => x === 'ogre').length >= 3 ? 'skelWarrior' : kind);
    }
  }
  // shuffle so mixed waves arrive mixed
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return { list, boss: null, hpMul, theme };
}

export class WaveDirector {
  wave = 0;
  state: 'intro' | 'countdown' | 'fighting' | 'cleared' | 'reward' = 'intro';
  spec: WaveSpec | null = null;
  private timer = 1.2;
  private queue: EnemyKind[] = [];
  private spawnTimer = 0;
  onWaveStart: ((n: number, spec: WaveSpec) => void) | null = null;
  onWaveCleared: ((n: number, spec: WaveSpec) => void) | null = null;

  constructor(private spawn: (kind: EnemyKind, hpMul: number, isBoss: boolean) => void) {}

  /** Start over. `startWave` lets the pause menu jump ahead to a later wave for practice. */
  reset(startWave = 1) {
    this.wave = startWave - 1;
    this.state = 'intro';
    this.timer = 1.2;
    this.queue = [];
    this.spec = null;
  }

  get pending() {
    return this.queue.length;
  }

  get isBossWave() {
    return !!this.spec?.boss;
  }

  /** Called after the chest has been opened, so the next wave can start. */
  resume() {
    if (this.state === 'reward') {
      this.state = 'cleared';
      this.timer = 2;
    }
  }

  update(dt: number, aliveCount: number) {
    this.timer -= dt;
    switch (this.state) {
      case 'intro':
      case 'cleared':
        if (this.timer <= 0) {
          this.wave++;
          this.state = 'countdown';
          this.spec = waveSpec(this.wave);
          this.timer = this.spec.boss ? 2.4 : 1.6;
          this.onWaveStart?.(this.wave, this.spec);
          this.queue = [...this.spec.list];
          if (this.spec.boss) this.queue.unshift(this.spec.boss);
        }
        break;
      case 'countdown':
        if (this.timer <= 0) {
          this.state = 'fighting';
          this.spawnTimer = 0;
        }
        break;
      case 'fighting':
        this.spawnTimer -= dt;
        if (this.queue.length && this.spawnTimer <= 0) {
          const kind = this.queue.shift()!;
          this.spawn(kind, this.spec!.hpMul, kind === this.spec!.boss);
          this.spawnTimer = kind === this.spec!.boss ? 1.5 : 0.4;
          return; // aliveCount is stale this frame
        }
        if (!this.queue.length && aliveCount === 0) {
          this.onWaveCleared?.(this.wave, this.spec!);
          if (this.spec!.boss) {
            this.state = 'reward';
          } else {
            this.state = 'cleared';
            this.timer = 3;
          }
        }
        break;
      case 'reward':
        break;
    }
  }
}

/* ---------- Pickups: hearts and the boss key ---------- */

const heartGeo = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.16);
  sh.bezierCurveTo(-0.05, -0.1, -0.2, -0.02, -0.2, 0.07);
  sh.bezierCurveTo(-0.2, 0.15, -0.12, 0.2, -0.06, 0.18);
  sh.bezierCurveTo(-0.02, 0.17, 0, 0.13, 0, 0.11);
  sh.bezierCurveTo(0, 0.13, 0.02, 0.17, 0.06, 0.18);
  sh.bezierCurveTo(0.12, 0.2, 0.2, 0.15, 0.2, 0.07);
  sh.bezierCurveTo(0.2, -0.02, 0.05, -0.1, 0, -0.16);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.04);
  return g;
})();
const heartOutline = smooth(heartGeo);
const heartMat = toon(0xf0353f, { emissive: 0x4a0408 });

export class HeartPickup {
  readonly mesh: THREE.Mesh;
  life = 12;
  private t = 0;

  constructor(x: number, z: number) {
    this.mesh = new THREE.Mesh(heartGeo, heartMat);
    this.mesh.castShadow = true;
    addOutline(this.mesh, 0.018, heartOutline);
    this.mesh.position.set(x, 0.5, z);
    this.mesh.scale.setScalar(1.4);
  }

  update(dt: number) {
    this.t += dt;
    this.life -= dt;
    const pop = Math.min(1, this.t / 0.35);
    this.mesh.position.y = 0.45 + Math.sin(this.t * 3) * 0.08 + (1 - pop) * 0.6 * Math.sin(pop * Math.PI);
    this.mesh.rotation.y = this.t * 2.2;
    this.mesh.visible = this.life > 3 || Math.floor(this.life * 8) % 2 === 0;
  }
}

/** The golden key a boss drops. It flies up out of the boss, lands, and waits to be picked up. */
export class KeyPickup {
  readonly mesh = new THREE.Group();
  private t = 0;
  private from: THREE.Vector3;
  private to: THREE.Vector3;

  constructor(x: number, z: number, landX: number, landZ: number) {
    const gold = toon(0xf4c542, { emissive: 0x7a5200 });
    const bowGeo = new THREE.TorusGeometry(0.13, 0.045, 8, 16);
    const bow = new THREE.Mesh(bowGeo, gold);
    bow.position.y = 0.2;
    addOutline(bow, 0.015, smooth(bowGeo));
    const shaftGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8);
    const shaft = new THREE.Mesh(shaftGeo, gold);
    shaft.position.y = -0.13;
    addOutline(shaft, 0.015, smooth(shaftGeo));
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.05), gold);
    t1.position.set(0.06, -0.28, 0);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), gold);
    t2.position.set(0.05, -0.18, 0);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.5, 0.6) }));
    gem.position.y = 0.2;
    this.mesh.add(bow, shaft, t1, t2, gem);
    this.mesh.traverse((o) => (o.castShadow = true));
    this.mesh.scale.setScalar(1.6);
    this.from = new THREE.Vector3(x, 1.2, z);
    this.to = new THREE.Vector3(landX, 0.7, landZ);
    this.mesh.position.copy(this.from);
  }

  get landed() {
    return this.t > 0.9;
  }

  update(dt: number) {
    this.t += dt;
    const k = Math.min(1, this.t / 0.9);
    this.mesh.position.lerpVectors(this.from, this.to, k);
    this.mesh.position.y += Math.sin(k * Math.PI) * 3 + (k >= 1 ? Math.sin(this.t * 3) * 0.12 : 0);
    this.mesh.rotation.y = this.t * 2.5;
  }
}

/* ---------- Gold coins (Adventure) ---------- */
const coinGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16);
coinGeo.rotateX(Math.PI / 2);
const coinOutline = smooth(coinGeo);
const coinMat = toon(0xf6c544, { emissive: 0x6a4a00 });

/** A gold coin that pops out of a monster or chest, then zooms to Herman when he gets close. */
export class CoinPickup {
  readonly mesh: THREE.Mesh;
  life = 20;
  private t = 0;
  private vel = new THREE.Vector3();
  private y = 0.4;
  private vy: number;
  magnet = false;

  constructor(x: number, z: number, readonly value: number, spread = 1) {
    this.mesh = new THREE.Mesh(coinGeo, coinMat);
    addOutline(this.mesh, 0.015, coinOutline);
    this.mesh.position.set(x, 0.4, z);
    const a = Math.random() * Math.PI * 2;
    const s = (0.6 + Math.random() * 1.6) * spread;
    this.vel.set(Math.sin(a) * s, 0, Math.cos(a) * s);
    this.vy = 3 + Math.random() * 2;
  }

  /** Returns true when Herman picks it up. */
  update(dt: number, player: THREE.Vector3): boolean {
    this.t += dt;
    this.life -= dt;
    const p = this.mesh.position;
    const dx = player.x - p.x, dz = player.z - p.z;
    const d = Math.hypot(dx, dz);
    if (this.t > 0.45 && d < 2.4) this.magnet = true;
    if (this.magnet) {
      const sp = 9 + this.t * 4;
      p.x += (dx / (d || 1)) * Math.min(d, sp * dt);
      p.z += (dz / (d || 1)) * Math.min(d, sp * dt);
      this.y += (0.7 - this.y) * Math.min(1, dt * 10);
    } else {
      p.x += this.vel.x * dt;
      p.z += this.vel.z * dt;
      this.vel.multiplyScalar(Math.exp(-dt * 3));
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      if (this.y < 0.25) {
        this.y = 0.25;
        this.vy = Math.abs(this.vy) * 0.35;
      }
    }
    p.y = this.y + (this.t > 0.6 ? Math.sin(this.t * 4) * 0.04 : 0);
    this.mesh.rotation.y = this.t * 5;
    this.mesh.visible = this.life > 3 || Math.floor(this.life * 8) % 2 === 0;
    return this.magnet && d < 0.45;
  }
}
