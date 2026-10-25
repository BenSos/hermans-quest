import type * as THREE from 'three';
import type { CollisionWorld } from './collision';
import type { Effects } from '../fx/effects';
import type { Telegraphs } from '../fx/telegraph';
import type { Bullets } from './bullets';

export type EnemyKind =
  | 'green' | 'blue' | 'mini' | 'kingSlime'
  | 'skelWarrior' | 'skelArcher' | 'skelKing'
  | 'ogre' | 'ogreKing';

/** Everything a monster needs to know about the world each frame. */
export interface EnemyContext {
  dt: number;
  t: number;
  player: THREE.Vector3;
  playerAlive: boolean;
  collision: CollisionWorld;
  river: { zMin: number; zMax: number; bridgeX: number } | null;
  walkable: (x: number, z: number) => boolean;
  fx: Effects;
  telegraphs: Telegraphs;
  bullets: Bullets;
  camera: THREE.Camera;
  /** Hurt Herman (half hearts). Returns true if it landed (he wasn't dashing or blinking). */
  hurtPlayer: (halves: number, fromX: number, fromZ: number) => boolean;
  /** Bosses can call for help. */
  spawn: (kind: EnemyKind, x: number, z: number) => void;
  shake: (amount: number) => void;
  /** Damage-over-time ticks, so the HUD can show little colored numbers. */
  onDot: (e: Enemy, amount: number, kind: StatusKind) => void;
}

export type StatusKind = 'poison' | 'fire' | 'acid';

export interface Enemy {
  readonly root: THREE.Group;
  readonly radius: number;
  readonly kind: EnemyKind;
  readonly isBoss: boolean;
  readonly displayName: string;
  hp: number;
  readonly maxHp: number;
  /** Half-hearts of damage when it touches Herman. */
  readonly contactDamage: number;
  state: 'spawning' | 'alive' | 'dead';
  targetable(): boolean;
  harmful(): boolean;
  /** Returns the damage actually dealt (after armor/acid). Sets state to dead if it ran out of health. */
  hit(damage: number, dirX: number, dirZ: number, knock: number): number;
  applyStatus(kind: StatusKind, power: number): void;
  update(ctx: EnemyContext): void;
  /** Called when removed early (restart, death) so it can clean up warning zones. */
  dispose(ctx: EnemyContext): void;
}

/**
 * Where should a walking monster head to reach the player? Straight at him,
 * unless the river is in the way, in which case it heads for the bridge first.
 */
export function pathTarget(
  x: number,
  z: number,
  player: THREE.Vector3,
  river: EnemyContext['river'],
): { x: number; z: number } {
  if (!river) return { x: player.x, z: player.z };
  const side = (zz: number) => (zz < river.zMin ? -1 : zz > river.zMax ? 1 : 0);
  const me = side(z);
  const them = side(player.z);
  if (me !== 0 && them !== 0 && me !== them) {
    const onApproach = Math.abs(x - river.bridgeX) < 0.8;
    const bz = me < 0 ? river.zMin - 0.6 : river.zMax + 0.6;
    if (onApproach && Math.abs(z - bz) < 1.2) return { x: river.bridgeX, z: them < 0 ? river.zMin - 1 : river.zMax + 1 };
    return { x: river.bridgeX, z: bz };
  }
  if (me === 0) return { x: river.bridgeX + (player.x - river.bridgeX) * 0.2, z: player.z };
  return { x: player.x, z: player.z };
}
